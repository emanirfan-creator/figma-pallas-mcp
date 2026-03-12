/**
 * Figma Auto Layout — apply auto layout to any frame, component, or layer
 * Rule: always apply inner (slots) before outer (container) — inside-out
 */

import { getPluginClient } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LayoutDirection = "HORIZONTAL" | "VERTICAL" | "WRAP";
export type AlignmentMode =
    | "MIN"
    | "MAX"
    | "CENTER"
    | "SPACE_BETWEEN"
    | "BASELINE";

export interface AutoLayoutConfig {
    nodeId: string;
    direction?: LayoutDirection;
    gap?: number;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    alignment?: AlignmentMode;
    wrap?: boolean;
    /** Nested children each with their own auto-layout config — applied first */
    children?: AutoLayoutChildConfig[];
}

export interface AutoLayoutChildConfig {
    nodeId: string;
    direction?: LayoutDirection;
    gap?: number;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    alignment?: AlignmentMode;
    wrap?: boolean;
    children?: AutoLayoutChildConfig[];
}

// ---------------------------------------------------------------------------
// Apply auto layout — inside-out recursive
// ---------------------------------------------------------------------------

async function applyToNode(config: AutoLayoutChildConfig): Promise<void> {
    const plugin = getPluginClient();

    // Apply to children first (inside-out)
    if (config.children && config.children.length > 0) {
        for (const child of config.children) {
            await applyToNode(child);
        }
    }

    const res = await plugin.send("setAutoLayout", {
        nodeId: config.nodeId,
        direction: config.direction ?? "HORIZONTAL",
        gap: config.gap ?? 0,
        paddingTop: config.paddingTop ?? 0,
        paddingBottom: config.paddingBottom ?? 0,
        paddingLeft: config.paddingLeft ?? 0,
        paddingRight: config.paddingRight ?? 0,
        alignment: config.alignment ?? "MIN",
        wrap: config.wrap ?? false,
    });

    if (!res.success)
        throw new Error(`setAutoLayout on ${config.nodeId} failed: ${res.error}`);
}

export async function addAutoLayout(config: AutoLayoutConfig): Promise<void> {
    await applyToNode(config);
}
