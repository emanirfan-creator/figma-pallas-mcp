/**
 * Panda Recipe Parser — converts a Panda recipe into a Figma-ready schema
 *
 * Output:
 *  - All variant combinations as "Prop=Value,Prop=Value" named frames
 *  - Slot structure as nested components / instance-swap properties
 *  - Token paths per variant × slot for variable binding
 */

import type { ParsedRecipe, RecipeVariant } from "./recipes.js";
import type { FigmaComponentSchema } from "../figma/variants.js";

// ---------------------------------------------------------------------------
// Token path conventions
// ---------------------------------------------------------------------------

const TOKEN_PROPERTY_MAP: Record<string, string[]> = {
    bg: ["fills"],
    color: ["fills"],
    borderColor: ["strokes"],
    px: ["paddingLeft", "paddingRight"],
    py: ["paddingTop", "paddingBottom"],
    paddingLeft: ["paddingLeft"],
    paddingRight: ["paddingRight"],
    paddingTop: ["paddingTop"],
    paddingBottom: ["paddingBottom"],
    gap: ["itemSpacing"],
    rounded: ["cornerRadius"],
    borderRadius: ["cornerRadius"],
    fontSize: ["fontSize"],
    letterSpacing: ["letterSpacing"],
    lineHeight: ["lineHeight"],
    opacity: ["opacity"],
    border: ["strokes"],
};

// ---------------------------------------------------------------------------
// Build Figma-ready schema from parsed recipe
// ---------------------------------------------------------------------------

export interface FigmaReadySchema extends FigmaComponentSchema {
    /** Full per-variant × per-slot token map (used for figma_resolve_recipe_token_map) */
    tokenMap: VariantSlotTokenEntry[];
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

export function parseRecipeToFigmaSchema(recipe: ParsedRecipe): FigmaReadySchema {
    // 1. Enumerate all variant combinations
    const variantCombinations = buildVariantCombinations(recipe.variants);

    // 2. Determine slots
    const slots = recipe.isSlotRecipe && recipe.slots.length > 0
        ? recipe.slots
        : ["root"];

    // 3. Build variant properties for Figma
    const variantProperties = Object.entries(recipe.variants).map(
        ([key, values]) => ({
            name: key,
            options: Object.keys(values),
            defaultValue:
                recipe.defaultVariants[key] ?? Object.keys(values)[0] ?? "",
        })
    );

    // 4. Token map: per variant × slot
    const tokenMap: VariantSlotTokenEntry[] = [];

    for (const combo of variantCombinations) {
        for (const slot of slots) {
            const bindings = buildBindingsForCombo(combo, slot, recipe);
            tokenMap.push({
                variantKey: comboToFigmaKey(combo),
                slot,
                layerName: slot,
                bindings,
            });
        }
    }

    return {
        componentName: recipe.name,
        slots,
        variantCombinations: variantCombinations.map((combo) => ({
            variantKey: comboToFigmaKey(combo),
            properties: combo,
        })),
        variantProperties,
        booleanProperties: [],
        textProperties: [],
        instanceSwapProperties: [],
        tokenMap,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type VariantCombo = Record<string, string>;

function buildVariantCombinations(variants: RecipeVariant): VariantCombo[] {
    const keys = Object.keys(variants);
    if (keys.length === 0) return [{}];

    const result: VariantCombo[] = [{}];

    for (const key of keys) {
        const values = Object.keys(variants[key] ?? {});
        const expanded: VariantCombo[] = [];
        for (const existing of result) {
            for (const value of values) {
                expanded.push({ ...existing, [key]: value });
            }
        }
        result.splice(0, result.length, ...expanded);
    }

    return result;
}

function comboToFigmaKey(combo: VariantCombo): string {
    return Object.entries(combo)
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
}

function buildBindingsForCombo(
    combo: VariantCombo,
    slot: string,
    recipe: ParsedRecipe
): SlotBinding[] {
    const bindings: SlotBinding[] = [];

    // Build a semantic path prefix based on variant combo
    // Convention: Semantic/<Category>/<Component>/<VariantValue>/<State>
    const variantString = Object.entries(combo)
        .map(([k, v]) => `${v}`)
        .join("/");

    const componentName = recipe.name;

    // Map common CSS properties to Figma properties and semantic paths
    const cssProps = getBaseCssForComboAndSlot(combo, slot, recipe);

    for (const [cssProp, cssValue] of Object.entries(cssProps)) {
        const figmaProps = TOKEN_PROPERTY_MAP[cssProp];
        if (!figmaProps) continue;

        // Build semantic path from the CSS value (which is typically a token reference)
        const semanticPath = cssValueToSemanticPath(
            cssValue,
            cssProp,
            componentName,
            variantString
        );

        for (const figmaProp of figmaProps) {
            // Avoid duplicate bindings for the same property
            if (!bindings.find((b) => b.property === figmaProp)) {
                bindings.push({ property: figmaProp, semanticPath });
            }
        }
    }

    return bindings;
}

function getBaseCssForComboAndSlot(
    combo: VariantCombo,
    slot: string,
    recipe: ParsedRecipe
): Record<string, string> {
    // Merge base + variant-specific styles for this combo + slot
    const combined: Record<string, string> = {};

    // Base styles
    const base = recipe.isSlotRecipe
        ? (recipe.base as Record<string, Record<string, unknown>>)[slot] ?? recipe.base
        : recipe.base;
    Object.assign(combined, flattenCss(base as Record<string, unknown>));

    // Variant-specific overrides
    for (const [variantKey, variantValue] of Object.entries(combo)) {
        const variantDef = recipe.variants[variantKey];
        if (!variantDef) continue;
        const valueDef = variantDef[variantValue];
        if (!valueDef) continue;

        const slotDef = recipe.isSlotRecipe
            ? (valueDef as Record<string, Record<string, unknown>>)[slot]
            : valueDef;
        if (slotDef) {
            Object.assign(combined, flattenCss(slotDef as Record<string, unknown>));
        }
    }

    return combined;
}

function flattenCss(css: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(css)) {
        if (typeof v === "string" || typeof v === "number") {
            result[k] = String(v);
        }
    }
    return result;
}

function cssValueToSemanticPath(
    cssValue: string,
    cssProp: string,
    componentName: string,
    variantString: string
): string {
    // If the value looks like a token reference "{colors.action.primary.default}",
    // convert it to "Semantic/Colors/action/primary/default"
    const tokenRef = cssValue.match(/^\{([^}]+)\}$/);
    if (tokenRef?.[1]) {
        const parts = tokenRef[1].split(".");
        const [category, ...rest] = parts;
        const capitalised =
            (category ?? "").charAt(0).toUpperCase() + (category ?? "").slice(1);
        return `Semantic/${capitalised}/${rest.join("/")}`;
    }

    // Otherwise build a conventional path
    const propCategory = propToCategory(cssProp);
    return `Semantic/${propCategory}/${componentName}/${variantString}`;
}

function propToCategory(cssProp: string): string {
    if (["bg", "color", "borderColor", "border"].includes(cssProp)) return "Colors";
    if (["px", "py", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom"].includes(cssProp))
        return "Spacing";
    if (["gap", "itemSpacing"].includes(cssProp)) return "Spacing/Gap";
    if (["rounded", "borderRadius", "cornerRadius"].includes(cssProp)) return "Radius";
    if (cssProp === "fontSize") return "FontSize";
    if (cssProp === "letterSpacing") return "LetterSpacing";
    if (cssProp === "lineHeight") return "LineHeight";
    if (cssProp === "opacity") return "Opacity";
    return "Misc";
}
