/**
 * Figma Client — REST API reader + WebSocket plugin bridge
 *
 * REST: used for all read operations (figma.com/api/v1/...)
 * WebSocket: connects to the companion plugin on localhost:3055
 *   for all write operations that require the Plugin API.
 */

import fetch from "node-fetch";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PluginMessage {
    action: string;
    payload: Record<string, unknown>;
}

export interface PluginResponse {
    success: boolean;
    result: unknown;
    error?: string;
}

// ---------------------------------------------------------------------------
// Figma REST Client
// ---------------------------------------------------------------------------

export class FigmaRestClient {
    private baseUrl = "https://api.figma.com/v1";
    private token: string;

    constructor(token?: string) {
        const t = token ?? process.env["FIGMA_ACCESS_TOKEN"];
        if (!t) throw new Error("FIGMA_ACCESS_TOKEN is not set");
        this.token = t;
    }

    private async request<T>(path: string): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const res = await fetch(url, {
            headers: { "X-Figma-Token": this.token },
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Figma REST ${res.status}: ${body}`);
        }
        return res.json() as Promise<T>;
    }

    async getFileVariables(fileKey: string) {
        return this.request<FigmaVariablesResponse>(
            `/files/${fileKey}/variables/local`
        );
    }

    async getFileNodes(fileKey: string, nodeIds: string[]) {
        const ids = nodeIds.join(",");
        return this.request<FigmaNodesResponse>(
            `/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`
        );
    }

    async getFile(fileKey: string) {
        return this.request<FigmaFileResponse>(`/files/${fileKey}`);
    }

    async getComponents(fileKey: string) {
        return this.request<unknown>(`/files/${fileKey}/components`);
    }
}

// ---------------------------------------------------------------------------
// Figma Plugin WebSocket Client
// ---------------------------------------------------------------------------

const WS_URL = `ws://localhost:${process.env["FIGMA_PLUGIN_PORT"] ?? "3055"}`;
const MAX_QUEUE = 200;
const RECONNECT_DELAY_MS = 2000;
const ACK_TIMEOUT_MS = 30_000;

interface QueuedMessage {
    message: PluginMessage;
    resolve: (value: PluginResponse) => void;
    reject: (reason: Error) => void;
}

export class FigmaPluginClient {
    private ws: WebSocket | null = null;
    private queue: QueuedMessage[] = [];
    private pendingMap = new Map<
        string,
        { resolve: (v: PluginResponse) => void; reject: (e: Error) => void }
    >();
    private msgCounter = 0;
    private reconnecting = false;
    private closed = false;

    constructor() {
        this.connect();
    }

    private connect() {
        if (this.closed) return;
        const ws = new WebSocket(WS_URL);
        this.ws = ws;

        ws.on("open", () => {
            this.reconnecting = false;
            this.flushQueue();
        });

        ws.on("message", (raw) => {
            try {
                const data = JSON.parse(String(raw)) as {
                    id: string;
                    success: boolean;
                    result: unknown;
                    error?: string;
                };
                const pending = this.pendingMap.get(data.id);
                if (pending) {
                    this.pendingMap.delete(data.id);
                    pending.resolve({
                        success: data.success,
                        result: data.result,
                        error: data.error,
                    });
                }
            } catch {
                // ignore malformed messages
            }
        });

        ws.on("close", () => this.scheduleReconnect());
        ws.on("error", () => ws.terminate());
    }

    private scheduleReconnect() {
        if (this.closed || this.reconnecting) return;
        this.reconnecting = true;
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
    }

    private flushQueue() {
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (item) this.sendRaw(item);
        }
    }

    private sendRaw(item: QueuedMessage) {
        const id = String(++this.msgCounter);
        this.pendingMap.set(id, { resolve: item.resolve, reject: item.reject });

        const timer = setTimeout(() => {
            this.pendingMap.delete(id);
            item.reject(new Error(`Plugin action timed out: ${item.message.action}`));
        }, ACK_TIMEOUT_MS);

        // clear timer on resolve/reject
        const origResolve = item.resolve;
        item.resolve = (v) => {
            clearTimeout(timer);
            origResolve(v);
        };

        this.ws!.send(JSON.stringify({ id, ...item.message }));
    }

    send(action: string, payload: Record<string, unknown>): Promise<PluginResponse> {
        return new Promise<PluginResponse>((resolve, reject) => {
            if (this.queue.length >= MAX_QUEUE) {
                return reject(new Error("Plugin message queue is full"));
            }
            const item: QueuedMessage = {
                message: { action, payload },
                resolve,
                reject,
            };
            const isOpen = this.ws?.readyState === WebSocket.OPEN;
            if (isOpen) {
                this.sendRaw(item);
            } else {
                this.queue.push(item);
            }
        });
    }

    destroy() {
        this.closed = true;
        this.ws?.terminate();
    }
}

// ---------------------------------------------------------------------------
// Singleton helpers
// ---------------------------------------------------------------------------

let _restClient: FigmaRestClient | null = null;
let _pluginClient: FigmaPluginClient | null = null;

export function getRestClient(): FigmaRestClient {
    if (!_restClient) _restClient = new FigmaRestClient();
    return _restClient;
}

export function getPluginClient(): FigmaPluginClient {
    if (!_pluginClient) _pluginClient = new FigmaPluginClient();
    return _pluginClient;
}

// ---------------------------------------------------------------------------
// Partial Figma REST response shapes (enough for our purposes)
// ---------------------------------------------------------------------------

export interface FigmaVariableValue {
    r?: number;
    g?: number;
    b?: number;
    a?: number;
    type?: string;
    id?: string;
}

export interface FigmaVariable {
    id: string;
    name: string;
    key: string;
    variableCollectionId: string;
    resolvedType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
    valuesByMode: Record<string, FigmaVariableValue | number | string | boolean>;
    scopes: string[];
}

export interface FigmaVariableCollection {
    id: string;
    name: string;
    key: string;
    modes: Array<{ modeId: string; name: string }>;
    defaultModeId: string;
    variableIds: string[];
}

export interface FigmaVariablesResponse {
    status: number;
    error: boolean;
    meta: {
        variables: Record<string, FigmaVariable>;
        variableCollections: Record<string, FigmaVariableCollection>;
    };
}

export interface FigmaNodesResponse {
    nodes: Record<string, { document: unknown }>;
}

export interface FigmaFileResponse {
    name: string;
    document: unknown;
    components: Record<string, unknown>;
    styles: Record<string, unknown>;
}
