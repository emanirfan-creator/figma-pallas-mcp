/**
 * Figma Components — create/update components and bind variables
 */

import { getPluginClient, getRestClient } from "./client.js";
import type { FigmaNodesResponse } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateComponentArgs {
    componentName: string;
    /** Absolute path to the Panda recipe file */
    recipePath: string;
    /** Parent frame/page node ID */
    parentId?: string;
}

export interface ComponentInfo {
    id: string;
    name: string;
    type: string;
    children: ComponentLayerInfo[];
    properties: Record<string, unknown>;
    boundVariables: Record<string, unknown>;
}

export interface ComponentLayerInfo {
    id: string;
    name: string;
    type: string;
    children?: ComponentLayerInfo[];
}

export interface BindVariableArgs {
    nodeId: string;
    property: string;
    semanticVariablePath: string;
}

// ---------------------------------------------------------------------------
// Create base component
// ---------------------------------------------------------------------------

export async function createComponent(
    args: CreateComponentArgs
): Promise<{ id: string; name: string }> {
    const plugin = getPluginClient();
    const res = await plugin.send("createComponent", {
        name: args.componentName,
        recipePath: args.recipePath,
        parentId: args.parentId ?? null,
    });
    if (!res.success) throw new Error(`createComponent failed: ${res.error}`);
    return res.result as { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Read component
// ---------------------------------------------------------------------------

export async function readComponent(
    fileKey: string,
    nodeId: string
): Promise<ComponentInfo> {
    const rest = getRestClient();
    const nodes = await rest.getFileNodes(fileKey, [nodeId]) as FigmaNodesResponse;
    const doc = nodes.nodes[nodeId]?.document as ComponentInfo;
    if (!doc) throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
    return doc;
}

// ---------------------------------------------------------------------------
// Bind a variable to a visual property
// ---------------------------------------------------------------------------

export async function bindVariableToProperty(
    args: BindVariableArgs
): Promise<void> {
    const plugin = getPluginClient();
    const res = await plugin.send("setBoundVariable", {
        nodeId: args.nodeId,
        property: args.property,
        semanticVariablePath: args.semanticVariablePath,
    });
    if (!res.success)
        throw new Error(
            `bindVariableToProperty(${args.property} on ${args.nodeId}) failed: ${res.error}`
        );
}
