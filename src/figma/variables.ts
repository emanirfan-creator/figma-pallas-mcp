/**
 * Figma Variables — read/write variables and alias chains via REST + Plugin WS
 */

import type {
    FigmaVariable,
    FigmaVariableCollection,
    FigmaVariableValue,
} from "./client.js";
import { getPluginClient, getRestClient } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VariableType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";

export interface VariableNode {
    id: string;
    name: string;
    collectionId: string;
    collectionName: string;
    type: VariableType;
    valuesByMode: Record<string, FigmaVariableValue | number | string | boolean>;
    /** If this variable is an alias, this is the id of the resolved target */
    aliasTargetId?: string;
}

export interface VariablesSnapshot {
    collections: FigmaVariableCollection[];
    variables: VariableNode[];
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function readVariables(fileKey: string): Promise<VariablesSnapshot> {
    const rest = getRestClient();
    const res = await rest.getFileVariables(fileKey);
    const { variables, variableCollections } = res.meta;

    const collections = Object.values(variableCollections);
    const variableNodes: VariableNode[] = Object.values(variables).map((v: FigmaVariable) => {
        const collection = variableCollections[v.variableCollectionId];
        // Detect alias by checking if any mode value has a type field of "VARIABLE_ALIAS"
        let aliasTargetId: string | undefined;
        for (const val of Object.values(v.valuesByMode)) {
            const asObj = val as FigmaVariableValue;
            if (asObj && typeof asObj === "object" && asObj.type === "VARIABLE_ALIAS") {
                aliasTargetId = asObj.id;
                break;
            }
        }
        return {
            id: v.id,
            name: v.name,
            collectionId: v.variableCollectionId,
            collectionName: collection?.name ?? "Unknown",
            type: v.resolvedType,
            valuesByMode: v.valuesByMode,
            aliasTargetId,
        };
    });

    return { collections, variables: variableNodes };
}

// ---------------------------------------------------------------------------
// Write primitive
// ---------------------------------------------------------------------------

export interface WriteVariableArgs {
    collection: string;
    group: string;
    name: string;
    type: VariableType;
    value: unknown;
    mode: string;
}

export async function writeVariable(args: WriteVariableArgs): Promise<string> {
    const plugin = getPluginClient();
    const res = await plugin.send("createVariable", {
        collection: args.collection,
        group: args.group,
        name: args.name,
        type: args.type,
        value: args.value,
        mode: args.mode,
    });
    if (!res.success) throw new Error(`writeVariable failed: ${res.error}`);
    return (res.result as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Write alias (semantic → primitive)
// ---------------------------------------------------------------------------

export interface WriteAliasArgs {
    semanticCollection: string;
    semanticPath: string;
    primitiveCollection: string;
    primitivePath: string;
    mode: string;
}

export async function writeAlias(args: WriteAliasArgs): Promise<void> {
    const plugin = getPluginClient();
    const res = await plugin.send("createVariableAlias", {
        semanticCollection: args.semanticCollection,
        semanticPath: args.semanticPath,
        primitiveCollection: args.primitiveCollection,
        primitivePath: args.primitivePath,
        mode: args.mode,
    });
    if (!res.success) throw new Error(`writeAlias failed: ${res.error}`);
}

// ---------------------------------------------------------------------------
// Bind full token chain (ensure primitive + alias exist)
// ---------------------------------------------------------------------------

export interface BindTokenChainArgs {
    semanticPath: string;
    primitiveValue: unknown;
    modes: string[];
}

export interface BindTokenChainReport {
    semanticPath: string;
    primitiveCreated: boolean;
    aliasCreated: boolean;
}

export async function bindTokenChain(
    args: BindTokenChainArgs
): Promise<BindTokenChainReport> {
    const plugin = getPluginClient();

    const res = await plugin.send("bindTokenChain", {
        semanticPath: args.semanticPath,
        primitiveValue: args.primitiveValue,
        modes: args.modes,
    });

    if (!res.success) throw new Error(`bindTokenChain failed: ${res.error}`);

    const result = res.result as {
        primitiveCreated: boolean;
        aliasCreated: boolean;
    };

    return {
        semanticPath: args.semanticPath,
        primitiveCreated: result.primitiveCreated,
        aliasCreated: result.aliasCreated,
    };
}

// ---------------------------------------------------------------------------
// Resolve alias chain (depth-limited)
// ---------------------------------------------------------------------------

export function resolveAliasChain(
    variableId: string,
    variablesById: Map<string, VariableNode>,
    depth = 0
): VariableNode | null {
    if (depth > 10) return null; // guard against circular refs
    const v = variablesById.get(variableId);
    if (!v) return null;
    if (v.aliasTargetId) return resolveAliasChain(v.aliasTargetId, variablesById, depth + 1);
    return v;
}
