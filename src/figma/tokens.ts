/**
 * Figma Tokens — token structure enforcement, recipe token map, binding, verification
 *
 * Hard rules:
 * - figma_ensure_token_structure must always run before figma_create_component
 * - All bindings via setBoundVariable — never raw values
 * - Per-slot first, then per-variant-combination
 */

import { getPluginClient } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenStructureReport {
    existed: string[];
    created: string[];
    flaggedForReview: string[];
    errors: string[];
}

export interface SlotBinding {
    property: string;
    semanticPath: string;
}

export interface VariantSlotTokenEntry {
    variantKey: string;
    slot: string;
    layerName: string;
    bindings: SlotBinding[];
}

export type RecipeTokenMap = VariantSlotTokenEntry[];

export interface BindingResult {
    nodeId: string;
    slot: string;
    property: string;
    semanticPath: string;
    status: "bound" | "failed";
    error?: string;
}

export interface VerifyBindingsReport {
    bound: Array<{ layer: string; property: string; semanticPath: string }>;
    unbound: Array<{ layer: string; property: string; rawValue: unknown }>;
    missing: Array<{ layer: string; property: string }>;
    autoRetried: boolean;
}

// ---------------------------------------------------------------------------
// Ensure token structure
// ---------------------------------------------------------------------------

export async function ensureTokenStructure(
    recipePath: string
): Promise<TokenStructureReport> {
    const plugin = getPluginClient();
    const res = await plugin.send("ensureTokenStructure", { recipePath });
    if (!res.success) throw new Error(`ensureTokenStructure failed: ${res.error}`);
    return res.result as TokenStructureReport;
}

// ---------------------------------------------------------------------------
// Resolve recipe token map
// ---------------------------------------------------------------------------

export async function resolveRecipeTokenMap(
    recipePath: string
): Promise<RecipeTokenMap> {
    const plugin = getPluginClient();
    const res = await plugin.send("resolveRecipeTokenMap", { recipePath });
    if (!res.success)
        throw new Error(`resolveRecipeTokenMap failed: ${res.error}`);
    return res.result as RecipeTokenMap;
}

// ---------------------------------------------------------------------------
// Bind all variant tokens
// ---------------------------------------------------------------------------

export interface BindAllVariantTokensArgs {
    componentSetId: string;
    tokenMap: RecipeTokenMap;
}

export async function bindAllVariantTokens(
    args: BindAllVariantTokensArgs
): Promise<BindingResult[]> {
    const plugin = getPluginClient();
    const res = await plugin.send("bindAllVariantTokens", {
        componentSetId: args.componentSetId,
        tokenMap: args.tokenMap,
    });
    if (!res.success)
        throw new Error(`bindAllVariantTokens failed: ${res.error}`);
    return res.result as BindingResult[];
}

// ---------------------------------------------------------------------------
// Verify component bindings (audit + auto-retry)
// ---------------------------------------------------------------------------

const MUST_BE_BOUND_FRAME = [
    "fills",
    "strokes",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "itemSpacing",
    "cornerRadius",
];

const MUST_BE_BOUND_TEXT = ["fontSize", "letterSpacing", "lineHeight"];

export { MUST_BE_BOUND_FRAME, MUST_BE_BOUND_TEXT };

export async function verifyComponentBindings(
    componentSetId: string
): Promise<VerifyBindingsReport> {
    const plugin = getPluginClient();
    const res = await plugin.send("verifyComponentBindings", { componentSetId });
    if (!res.success)
        throw new Error(`verifyComponentBindings failed: ${res.error}`);
    return res.result as VerifyBindingsReport;
}
