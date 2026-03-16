import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

export class FigmaClient {
  private wss: WebSocketServer;
  private connections: Set<WebSocket> = new Set();
  private pendingRequests: Map<string, { resolve: (val: any) => void, reject: (err: any) => void }> = new Map();

  constructor(port: number = 3055) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      this.connections.add(ws);
      console.error('Figma companion plugin connected');

      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          if (data && data.id) {
            const req = this.pendingRequests.get(data.id);
            if (req) {
              if (data.success) {
                req.resolve(data.result);
              } else {
                req.reject(new Error(data.error || 'Unknown error from Figma plugin'));
              }
              this.pendingRequests.delete(data.id);
            }
          }
        } catch (e) {
          console.error('Failed to parse message from Figma plugin', e);
        }
      });

      ws.on('close', () => {
        this.connections.delete(ws);
        console.error('Figma companion plugin disconnected');
      });
    });

    console.error(`Figma WebSocket server listening on ws://localhost:${port}`);
  }

  public async requestFigmaAction(action: string, payload: any): Promise<any> {
    if (this.connections.size === 0) {
      throw new Error("No Figma plugin connected. Please open the companion plugin in Figma.");
    }

    const id = crypto.randomUUID();
    const message = JSON.stringify({ id, action, payload });

    return new Promise((resolve, reject) => {
      // Add a 30-second timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Figma action ${action} timed out after 30s`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      // Send to the first connection (assuming only 1 active Figma instance)
      const ws = Array.from(this.connections)[0];
      ws.send(message);
    });
  }
}

export const figmaClient = new FigmaClient();
