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
// Figma REST Client
// ---------------------------------------------------------------------------
export class FigmaRestClient {
    baseUrl = "https://api.figma.com/v1";
    token;
    constructor(token) {
        const t = token ?? process.env["FIGMA_ACCESS_TOKEN"];
        if (!t)
            throw new Error("FIGMA_ACCESS_TOKEN is not set");
        this.token = t;
    }
    async request(path, options) {
        const url = `${this.baseUrl}${path}`;
        const res = await fetch(url, {
            ...options,
            body: options?.body, // Pass body explicitly since it's restricted to string
            headers: {
                "X-Figma-Token": this.token,
                ...(options?.body ? { "Content-Type": "application/json" } : {}),
                ...options?.headers
            },
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Figma REST ${res.status}: ${body}`);
        }
        return res.json();
    }
    async getFileVariables(fileKey) {
        return this.request(`/files/${fileKey}/variables/local`);
    }
    async getFileNodes(fileKey, nodeIds) {
        const ids = nodeIds.join(",");
        return this.request(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`);
    }
    async getFile(fileKey) {
        return this.request(`/files/${fileKey}`);
    }
    async getImage(fileKey, nodeId, format = "png", scale = 1) {
        const query = `ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`;
        return this.request(`/images/${fileKey}?${query}`);
    }
    async getComponents(fileKey) {
        return this.request(`/files/${fileKey}/components`);
    }
}
// ---------------------------------------------------------------------------
// Figma Plugin WebSocket Client/Server
// ---------------------------------------------------------------------------
import { WebSocketServer } from "ws";
const LOCAL_PORT = parseInt(process.env["FIGMA_PLUGIN_PORT"] ?? "3055", 10);
const RELAY_URL = process.env["FIGMA_RELAY_URL"]; // e.g. wss://pallas-relay.example.com?channel=xyz
const MAX_QUEUE = 200;
const RECONNECT_DELAY_MS = 2000;
const ACK_TIMEOUT_MS = 30_000;
export class FigmaPluginClient {
    wss = null;
    ws = null;
    queue = [];
    pendingMap = new Map();
    msgCounter = 0;
    reconnecting = false;
    closed = false;
    constructor() {
        this.initConnection();
    }
    initConnection() {
        if (this.closed)
            return;
        if (RELAY_URL) {
            // Act as a client to a remote relay
            this.connectToRelay();
        }
        else {
            // Host locally
            this.startLocalServer();
        }
    }
    startLocalServer() {
        this.wss = new WebSocketServer({ port: LOCAL_PORT });
        this.wss.on("connection", (socket) => {
            // Disconnect old socket if a new one connects (e.g. plugin reloaded)
            if (this.ws) {
                this.ws.terminate();
            }
            this.ws = socket;
            this.setupSocket(socket);
            this.flushQueue();
        });
        this.wss.on("error", (err) => {
            console.error("Local WebSocket Server Error:", err);
            setTimeout(() => {
                if (!this.closed) {
                    this.wss?.close();
                    this.startLocalServer();
                }
            }, RECONNECT_DELAY_MS);
        });
    }
    connectToRelay() {
        if (this.closed)
            return;
        const ws = new WebSocket(RELAY_URL);
        this.ws = ws;
        ws.on("open", () => {
            this.reconnecting = false;
            this.flushQueue();
        });
        this.setupSocket(ws);
        ws.on("close", () => this.scheduleReconnect());
        ws.on("error", () => ws.terminate());
    }
    setupSocket(ws) {
        ws.on("message", (raw) => {
            try {
                const data = JSON.parse(String(raw));
                const pending = this.pendingMap.get(data.id);
                if (pending) {
                    this.pendingMap.delete(data.id);
                    pending.resolve({
                        success: data.success,
                        result: data.result,
                        error: data.error,
                    });
                }
            }
            catch {
                // ignore malformed messages
            }
        });
    }
    scheduleReconnect() {
        if (this.closed || this.reconnecting || !RELAY_URL)
            return;
        this.reconnecting = true;
        setTimeout(() => this.initConnection(), RECONNECT_DELAY_MS);
    }
    flushQueue() {
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (item)
                this.sendRaw(item);
        }
    }
    sendRaw(item) {
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
        this.ws.send(JSON.stringify({ id, ...item.message }));
    }
    send(action, payload) {
        return new Promise((resolve, reject) => {
            if (this.queue.length >= MAX_QUEUE) {
                return reject(new Error("Plugin message queue is full"));
            }
            const item = {
                message: { action, payload },
                resolve,
                reject,
            };
            const isOpen = this.ws?.readyState === WebSocket.OPEN;
            if (isOpen) {
                this.sendRaw(item);
            }
            else {
                this.queue.push(item);
            }
        });
    }
    destroy() {
        this.closed = true;
        this.ws?.terminate();
        this.wss?.close();
    }
}
// ---------------------------------------------------------------------------
// Singleton helpers
// ---------------------------------------------------------------------------
let _restClient = null;
let _pluginClient = null;
export function getRestClient() {
    if (!_restClient)
        _restClient = new FigmaRestClient();
    return _restClient;
}
export function getPluginClient() {
    if (!_pluginClient)
        _pluginClient = new FigmaPluginClient();
    return _pluginClient;
}
