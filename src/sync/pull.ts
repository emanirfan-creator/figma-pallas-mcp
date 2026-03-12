/**
 * Sync Pull — Figma → code
 *
 * Order of operations:
 *  1. Read all Figma variables and resolve alias chains
 *  2. Read all component properties and bindings
 *  3. Update Panda token files
 *  4. Update recipe files
 *  5. Update design-map.json
 */

import { readVariables, resolveAliasChain } from "../figma/variables.js";
import type { VariableNode } from "../figma/variables.js";
import { writeToken } from "../panda/tokens.js";
import { writeMap, readMap } from "./map.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PullResult {
    tokensUpdated: number;
    componentsUpdated: number;
    errors: string[];
}

// ---------------------------------------------------------------------------
// sync_pull
// ---------------------------------------------------------------------------

export async function syncPull(
    figmaFileKey: string,
    mapPath?: string
): Promise<PullResult> {
    const map = await readMap(mapPath);
    const result: PullResult = { tokensUpdated: 0, componentsUpdated: 0, errors: [] };

    // 1. Read Figma variables
    const snapshot = await readVariables(figmaFileKey);
    const variablesById = new Map<string, VariableNode>(
        snapshot.variables.map((v) => [v.id, v])
    );

    // 2. Resolve alias chains and build live token values
    const liveValues: Record<string, unknown> = {};
    for (const variable of snapshot.variables) {
        if (variable.aliasTargetId) {
            const resolved = resolveAliasChain(variable.aliasTargetId, variablesById);
            if (resolved) {
                const defaultMode = Object.keys(resolved.valuesByMode)[0];
                liveValues[variable.name] = defaultMode
                    ? resolved.valuesByMode[defaultMode]
                    : null;
            }
        }
    }

    // 3. Update Panda token files based on mapped tokens
    for (const [key, entry] of Object.entries(map.tokens)) {
        const liveValue = liveValues[entry.semanticPath] ?? liveValues[entry.primitivePath];
        if (!liveValue) continue;

        try {
            if (map._meta.pandaConfigPath) {
                // Derive token file path from config
                const tokenFilePath = map._meta.pandaConfigPath
                    .replace(/panda\.config\.\w+$/, "")
                    + "tokens/index.ts";
                await writeToken(tokenFilePath, key, liveValue as string | number);
                result.tokensUpdated++;
            }
        } catch (e) {
            result.errors.push(`writeToken ${key}: ${String(e)}`);
        }
    }

    // 5. Update design-map
    const now = new Date().toISOString();
    const updatedTokens = { ...map.tokens };
    for (const [key, entry] of Object.entries(map.tokens)) {
        const liveValue = liveValues[entry.semanticPath];
        if (liveValue !== undefined) {
            updatedTokens[key] = { ...entry, value: liveValue, lastSync: now, confidence: 1 };
        }
    }

    await writeMap(
        {
            _meta: { ...map._meta, lastPull: now },
            tokens: updatedTokens,
        },
        mapPath
    );

    return result;
}
