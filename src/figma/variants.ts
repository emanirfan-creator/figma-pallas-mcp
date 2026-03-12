/**
 * Figma Variants — component sets, variant/boolean/text/swap properties
 */

import { getPluginClient } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentPropertyType = "VARIANT" | "BOOLEAN" | "TEXT" | "INSTANCE_SWAP";

export interface CreateComponentSetArgs {
    componentName: string;
    /** Absolute path to the Panda recipe */
    recipePath: string;
    /** Figma-ready schema from panda_parse_recipe_to_figma_schema */
    figmaSchema: FigmaComponentSchema;
    /** Parent frame/page node ID */
    parentId?: string;
}

export interface FigmaComponentSchema {
    componentName: string;
    slots: string[];
    variantCombinations: Array<{
        /** Figma "Prop=Value,Prop=Value" name */
        variantKey: string;
        properties: Record<string, string>;
    }>;
    variantProperties: Array<{
        name: string;
        options: string[];
        defaultValue: string;
    }>;
    booleanProperties: Array<{ name: string; defaultValue: boolean; layerId?: string }>;
    textProperties: Array<{ name: string; defaultValue: string; layerId?: string }>;
    instanceSwapProperties: Array<{ name: string; defaultValue: string; layerId?: string }>;
}

export interface AddComponentPropertyArgs {
    componentSetId: string;
    propertyName: string;
    propertyType: ComponentPropertyType;
    defaultValue: string | boolean;
    options?: string[];
    layerId?: string;
}

export interface CreateSlotComponentArgs {
    componentName: string;
    recipePath: string;
    parentId?: string;
}

// ---------------------------------------------------------------------------
// Create component set
// ---------------------------------------------------------------------------

export async function createComponentSet(
    args: CreateComponentSetArgs
): Promise<{ id: string; name: string }> {
    const plugin = getPluginClient();
    const res = await plugin.send("createComponentSet", {
        name: args.componentName,
        recipePath: args.recipePath,
        figmaSchema: args.figmaSchema,
        parentId: args.parentId ?? null,
    });
    if (!res.success)
        throw new Error(`createComponentSet failed: ${res.error}`);
    return res.result as { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Add component property
// ---------------------------------------------------------------------------

export async function addComponentProperty(
    args: AddComponentPropertyArgs
): Promise<void> {
    const plugin = getPluginClient();
    const res = await plugin.send("addComponentProperty", {
        componentSetId: args.componentSetId,
        propertyName: args.propertyName,
        propertyType: args.propertyType,
        defaultValue: args.defaultValue,
        options: args.options ?? [],
        layerId: args.layerId ?? null,
    });
    if (!res.success)
        throw new Error(`addComponentProperty failed: ${res.error}`);
}

// ---------------------------------------------------------------------------
// Create slot component
// ---------------------------------------------------------------------------

export async function createSlotComponent(
    args: CreateSlotComponentArgs
): Promise<{ id: string; name: string }> {
    const plugin = getPluginClient();
    const res = await plugin.send("createSlotComponent", {
        name: args.componentName,
        recipePath: args.recipePath,
        parentId: args.parentId ?? null,
    });
    if (!res.success)
        throw new Error(`createSlotComponent failed: ${res.error}`);
    return res.result as { id: string; name: string };
}
