/**
 * Sync Push — code → Figma
 *
 * Order of operations:
 *  1. Update primitive variables
 *  2. Update semantic aliases
 *  3. Update component variant structures
 *  4. Rebind all variable-to-property bindings
 *  5. Run figma_verify_component_bindings on all affected components
 *  6. Update design-map.json
 */

import { writeVariable, writeAlias } from "../figma/variables.js";
import { bindAllVariantTokens, verifyComponentBindings } from "../figma/tokens.js";
import { writeMap, readMap } from "./map.js";
import type { DesignMap, TokenEntry } from "./map.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushResult {
    primitivesUpdated: number;
    aliasesUpdated: number;
    componentsUpdated: number;
    bindingsApplied: number;
    verificationPassed: boolean;
    errors: string[];
}

// ---------------------------------------------------------------------------
// sync_push
// ---------------------------------------------------------------------------

export async function syncPush(mapPath?: string): Promise<PushResult> {
    const map: DesignMap = await readMap(mapPath);
    const result: PushResult = {
        primitivesUpdated: 0,
        aliasesUpdated: 0,
        componentsUpdated: 0,
        bindingsApplied: 0,
        verificationPassed: true,
        errors: [],
    };

    // 1. Update primitive variables
    for (const [key, entry] of Object.entries(map.tokens)) {
        try {
            await writeVariable({
                collection: entry.primitiveCollection,
                group: entry.primitivePath.split("/").slice(0, -1).join("/"),
                name: entry.primitivePath.split("/").pop() ?? key,
                type: entry.type as "COLOR" | "FLOAT" | "STRING" | "BOOLEAN",
                value: entry.value,
                mode: "default",
            });
            result.primitivesUpdated++;
        } catch (e) {
            result.errors.push(`primitive ${key}: ${String(e)}`);
        }
    }

    // 2. Update semantic aliases
    for (const [key, entry] of Object.entries(map.tokens)) {
        try {
            await writeAlias({
                semanticCollection: entry.semanticCollection,
                semanticPath: entry.semanticPath,
                primitiveCollection: entry.primitiveCollection,
                primitivePath: entry.primitivePath,
                mode: "default",
            });
            result.aliasesUpdated++;
        } catch (e) {
            result.errors.push(`alias ${key}: ${String(e)}`);
        }
    }

    // 3–5. Update components, rebind, verify
    for (const [componentName, comp] of Object.entries(map.components)) {
        try {
            // Re-apply all token bindings
            const bindResults = await bindAllVariantTokens({
                componentSetId: comp.figmaComponentSetId,
                tokenMap: [], // token map is regenerated in-plugin from the recipe
            });
            result.bindingsApplied += bindResults.length;
            result.componentsUpdated++;

            // Verify
            const report = await verifyComponentBindings(comp.figmaComponentSetId);
            if (report.unbound.length > 0) {
                result.verificationPassed = false;
                result.errors.push(
                    `${componentName}: ${report.unbound.length} unbound properties after push`
                );
            }
        } catch (e) {
            result.errors.push(`component ${componentName}: ${String(e)}`);
        }
    }

    // 6. Update design-map
    const now = new Date().toISOString();
    await writeMap(
        {
            _meta: {
                ...map._meta,
                lastPush: now,
            },
        },
        mapPath
    );

    return result;
}
