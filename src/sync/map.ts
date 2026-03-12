/**
 * Sync Map — read/write/diff design-map.json
 * All writes are atomic.
 */

import { readFile, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DesignMapMeta {
    version: string;
    lastPush: string | null;
    lastPull: string | null;
    figmaFileKey: string;
    pandaConfigPath: string;
}

export interface TokenEntry {
    primitiveCollection: string;
    primitivePath: string;
    semanticCollection: string;
    semanticPath: string;
    type: string;
    value: unknown;
    lastSync: string | null;
    confidence: number;
}

export interface ComponentEntry {
    figmaComponentSetId: string;
    recipePath: string;
    slots: string[];
    variants: Record<string, string[]>;
    lastSync: string | null;
}

export interface DesignMap {
    _meta: DesignMapMeta;
    tokens: Record<string, TokenEntry>;
    components: Record<string, ComponentEntry>;
}

export interface DiffResult {
    code_ahead: Array<{
        key: string;
        type: "token" | "component";
        detail: string;
        confidence: number;
    }>;
    figma_ahead: Array<{
        key: string;
        type: "token" | "component";
        detail: string;
        confidence: number;
    }>;
    conflicts: Array<{
        key: string;
        type: "token" | "component";
        codeValue: unknown;
        figmaValue: unknown;
        confidence: number;
    }>;
}

// ---------------------------------------------------------------------------
// Default map path
// ---------------------------------------------------------------------------

const DEFAULT_MAP_PATH = process.env["DESIGN_MAP_PATH"] ?? "./design-map.json";

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function readMap(mapPath = DEFAULT_MAP_PATH): Promise<DesignMap> {
    const raw = await readFile(mapPath, "utf8");
    return JSON.parse(raw) as DesignMap;
}

// ---------------------------------------------------------------------------
// Write (atomic)
// ---------------------------------------------------------------------------

export async function writeMap(
    updates: Partial<DesignMap>,
    mapPath = DEFAULT_MAP_PATH
): Promise<void> {
    const existing = await readMap(mapPath).catch(() => emptyMap());
    const merged: DesignMap = {
        _meta: { ...existing._meta, ...(updates._meta ?? {}) },
        tokens: { ...existing.tokens, ...(updates.tokens ?? {}) },
        components: { ...existing.components, ...(updates.components ?? {}) },
    };
    await atomicWrite(mapPath, JSON.stringify(merged, null, 2));
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export async function diffMap(
    liveTokens: Record<string, { value: unknown; type: string }>,
    liveComponents: Record<string, { slots: string[]; variants: Record<string, string[]> }>,
    mapPath = DEFAULT_MAP_PATH
): Promise<DiffResult> {
    const map = await readMap(mapPath).catch(() => emptyMap());

    const result: DiffResult = { code_ahead: [], figma_ahead: [], conflicts: [] };

    // ---- Tokens ----
    const allTokenKeys = new Set([
        ...Object.keys(map.tokens),
        ...Object.keys(liveTokens),
    ]);

    for (const key of allTokenKeys) {
        const mapped = map.tokens[key];
        const live = liveTokens[key];

        if (!mapped && live) {
            result.code_ahead.push({ key, type: "token", detail: "new in code", confidence: 1 });
        } else if (mapped && !live) {
            result.figma_ahead.push({ key, type: "token", detail: "missing in code", confidence: 0.5 });
        } else if (mapped && live) {
            const confidence = valuesMatch(mapped.value, live.value) ? 1 : calcConfidence(mapped.value, live.value);
            if (confidence < 1) {
                result.conflicts.push({
                    key,
                    type: "token",
                    codeValue: live.value,
                    figmaValue: mapped.value,
                    confidence,
                });
            }
        }
    }

    // ---- Components ----
    const allComponentKeys = new Set([
        ...Object.keys(map.components),
        ...Object.keys(liveComponents),
    ]);

    for (const key of allComponentKeys) {
        const mapped = map.components[key];
        const live = liveComponents[key];

        if (!mapped && live) {
            result.code_ahead.push({ key, type: "component", detail: "new in code", confidence: 1 });
        } else if (mapped && !live) {
            result.figma_ahead.push({ key, type: "component", detail: "missing in code", confidence: 0.5 });
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyMap(): DesignMap {
    return {
        _meta: {
            version: "1",
            lastPush: null,
            lastPull: null,
            figmaFileKey: "",
            pandaConfigPath: "",
        },
        tokens: {},
        components: {},
    };
}

function valuesMatch(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function calcConfidence(mapped: unknown, live: unknown): number {
    if (typeof mapped === "number" && typeof live === "number") {
        const max = Math.max(Math.abs(mapped), Math.abs(live), 1);
        return Math.max(0, 1 - Math.abs(mapped - live) / max);
    }
    if (typeof mapped === "string" && typeof live === "string") {
        // Simple similarity: shared chars / total
        const shared = [...mapped].filter((c) => live.includes(c)).length;
        return shared / Math.max(mapped.length, live.length, 1);
    }
    return 0;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
    const tmp = join(tmpdir(), `pallas-map-${randomBytes(6).toString("hex")}.tmp`);
    await writeFile(tmp, content, "utf8");
    await rename(tmp, filePath);
}
