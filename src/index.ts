#!/usr/bin/env node
/**
 * Pallas MCP Server — entry point
 * Registers all tools and starts the MCP stdio transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Figma modules
import { readVariables, writeVariable, writeAlias, bindTokenChain } from "./figma/variables.js";
import { createComponent, readComponent, bindVariableToProperty } from "./figma/components.js";
import {
    createComponentSet,
    addComponentProperty,
    createSlotComponent,
} from "./figma/variants.js";
import { addAutoLayout } from "./figma/autolayout.js";
import {
    ensureTokenStructure,
    resolveRecipeTokenMap,
    bindAllVariantTokens,
    verifyComponentBindings,
} from "./figma/tokens.js";
import { getSelection } from "./figma/selection.js";
import { lintNode } from "./figma/linting.js";
import { readComments, writeComment, resolveComment } from "./figma/comments.js";
import { getVersions, getBranches, createBranch } from "./figma/versions.js";

// Panda modules
import { readTokens, writeToken } from "./panda/tokens.js";
import { readRecipe, writeRecipe } from "./panda/recipes.js";
import { parseRecipeToFigmaSchema } from "./panda/parser.js";

// Sync modules
import { readMap, writeMap, diffMap } from "./sync/map.js";
import { syncPush } from "./sync/push.js";
import { syncPull } from "./sync/pull.js";

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
    name: "pallas-mcp",
    version: "0.1.0",
});

// ---------------------------------------------------------------------------
// ── VARIABLE TOOLS ──────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "figma_read_variables",
    "Returns all collections, variables, modes, and alias chains in the Figma file",
    {
        fileKey: z.string().describe("Figma file key (from the file URL)"),
    },
    async ({ fileKey }) => {
        const snapshot = await readVariables(fileKey);
        return {
            content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }],
        };
    }
);

server.tool(
    "figma_write_variable",
    "Creates or updates a primitive variable with a raw value",
    {
        collection: z.string().describe("Variable collection name"),
        group: z.string().describe("Variable group/folder path"),
        name: z.string().describe("Variable name"),
        type: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]).describe("Variable type"),
        value: z.unknown().describe("The raw value to set"),
        mode: z.string().describe("Mode name (e.g. 'default', 'dark')"),
    },
    async ({ collection, group, name, type, value, mode }) => {
        const id = await writeVariable({ collection, group, name, type, value, mode });
        return {
            content: [{ type: "text", text: JSON.stringify({ id }, null, 2) }],
        };
    }
);

server.tool(
    "figma_write_alias",
    "Sets a semantic variable to alias a primitive variable — always uses createVariableAlias()",
    {
        semanticCollection: z.string(),
        semanticPath: z.string().describe("Full path of the semantic variable"),
        primitiveCollection: z.string(),
        primitivePath: z.string().describe("Full path of the primitive variable"),
        mode: z.string(),
    },
    async ({ semanticCollection, semanticPath, primitiveCollection, primitivePath, mode }) => {
        await writeAlias({ semanticCollection, semanticPath, primitiveCollection, primitivePath, mode });
        return {
            content: [{ type: "text", text: "Alias created successfully" }],
        };
    }
);

server.tool(
    "figma_bind_token_chain",
    "Traces a semantic token path to its primitive and ensures the full alias chain exists",
    {
        semanticPath: z.string(),
        primitiveValue: z.unknown(),
        modes: z.array(z.string()).describe("Mode names to apply the chain to"),
    },
    async ({ semanticPath, primitiveValue, modes }) => {
        const report = await bindTokenChain({ semanticPath, primitiveValue, modes });
        return {
            content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        };
    }
);

// ---------------------------------------------------------------------------
// ── TOKEN STRUCTURE AND ATTACHMENT TOOLS ──────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "figma_ensure_token_structure",
    [
        "MUST run before any component is created.",
        "Reads all token paths from a recipe, checks each as a Figma variable (primitive + semantic),",
        "creates any that are missing including the full alias chain.",
        "Returns a report of what existed, what was created, and what was flagged for review.",
    ].join(" "),
    {
        recipePath: z.string().describe("Absolute path to the Panda recipe file"),
    },
    async ({ recipePath }) => {
        const report = await ensureTokenStructure(recipePath);
        return {
            content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        };
    }
);

server.tool(
    "figma_resolve_recipe_token_map",
    [
        "Reads a recipe and returns a complete token binding map.",
        "Describes which semantic variable should be bound to which visual property",
        "on which layer, for every variant combination and every slot.",
    ].join(" "),
    {
        recipePath: z.string(),
    },
    async ({ recipePath }) => {
        const tokenMap = await resolveRecipeTokenMap(recipePath);
        return {
            content: [{ type: "text", text: JSON.stringify(tokenMap, null, 2) }],
        };
    }
);

server.tool(
    "figma_bind_all_variant_tokens",
    [
        "Executes all bindings from figma_resolve_recipe_token_map on the correct layers",
        "inside the correct variant frames. Uses setBoundVariable() exclusively — never raw values.",
        "Auto-retries with figma_ensure_token_structure if a variable is missing.",
        "Returns a per-binding report.",
    ].join(" "),
    {
        componentSetId: z.string(),
        tokenMap: z.array(
            z.object({
                variantKey: z.string(),
                slot: z.string(),
                layerName: z.string(),
                bindings: z.array(
                    z.object({ property: z.string(), semanticPath: z.string() })
                ),
            })
        ),
    },
    async ({ componentSetId, tokenMap }) => {
        const results = await bindAllVariantTokens({ componentSetId, tokenMap });
        return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
    }
);

server.tool(
    "figma_verify_component_bindings",
    [
        "Audits the entire component set after all bindings are applied.",
        "Returns three lists — bound (correct), unbound (errors with raw values), missing (warnings).",
        "If unbound list is non-empty, automatically retries binding for affected layers.",
    ].join(" "),
    {
        componentSetId: z.string(),
    },
    async ({ componentSetId }) => {
        const report = await verifyComponentBindings(componentSetId);
        return {
            content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        };
    }
);

// ---------------------------------------------------------------------------
// ── CONTEXT & SELECTION TOOLS ──────────────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "figma_get_selection",
    "Returns the current selection in the open Figma file",
    {},
    async () => {
        const selection = await getSelection();
        return {
            content: [{ type: "text", text: JSON.stringify(selection, null, 2) }],
        };
    }
);

// ---------------------------------------------------------------------------
// ── LINTING TOOLS ──────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "figma_lint_node",
    "Runs design linter on specific nodes or the current selection. Checks WCAG contrast, missing auto-layout, and hardcoded colors.",
    {
        nodeId: z.string().optional().describe("Node ID to lint. Omit to lint current selection."),
        rules: z.array(
            z.enum(["wcag", "no-autolayout", "hardcoded-color", "all"])
        ).default(["all"]),
    },
    async ({ nodeId, rules }) => {
        const results = await lintNode({ nodeId, rules });
        return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
    }
);

// ---------------------------------------------------------------------------
// ── COMMENTS TOOLS ─────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "figma_read_comments",
    "Reads all comments from a Figma file",
    {
        fileKey: z.string().describe("Figma file key"),
    },
    async ({ fileKey }) => {
        const comments = await readComments(fileKey);
        return {
            content: [{ type: "text", text: JSON.stringify(comments, null, 2) }],
        };
    }
);

server.tool(
    "figma_write_comment",
    "Posts a new comment to a Figma file, optionally attaching to a specific node",
    {
        fileKey: z.string().describe("Figma file key"),
        message: z.string().describe("Comment text"),
        nodeId: z.string().optional().describe("Optional node ID to attach comment to"),
    },
    async ({ fileKey, message, nodeId }) => {
        const comment = await writeComment(fileKey, message, nodeId);
        return {
            content: [{ type: "text", text: JSON.stringify(comment, null, 2) }],
        };
    }
);

server.tool(
    "figma_resolve_comment",
    "Resolves/deletes a comment in a Figma file",
    {
        fileKey: z.string().describe("Figma file key"),
        commentId: z.string().describe("Comment ID to resolve"),
    },
    async ({ fileKey, commentId }) => {
        await resolveComment(fileKey, commentId);
        return {
            content: [{ type: "text", text: "Comment resolved successfully" }],
        };
    }
);

// ---------------------------------------------------------------------------
// ── VERSION HISTORY TOOLS ──────────────────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "figma_get_versions",
    "Gets the version history of a Figma file",
    {
        fileKey: z.string().describe("Figma file key"),
    },
    async ({ fileKey }) => {
        const versions = await getVersions(fileKey);
        return {
            content: [{ type: "text", text: JSON.stringify(versions, null, 2) }],
        };
    }
);

server.tool(
    "figma_get_branches",
    "List all branches of a Figma file (requires Enterprise plan)",
    {
        fileKey: z.string().describe("Figma file key"),
    },
    async ({ fileKey }) => {
        const branches = await getBranches(fileKey);
        return {
            content: [{ type: "text", text: JSON.stringify(branches, null, 2) }],
        };
    }
);

server.tool(
    "figma_create_branch",
    "Creates a new branch from a main Figma file (requires Enterprise plan)",
    {
        fileKey: z.string().describe("Figma file key"),
        name: z.string().describe("Name of the new branch"),
    },
    async ({ fileKey, name }) => {
        const branch = await createBranch(fileKey, name);
        return {
            content: [{ type: "text", text: JSON.stringify(branch, null, 2) }],
        };
    }
);

// ---------------------------------------------------------------------------
// ── COMPONENT TOOLS ────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "figma_create_component",
    [
        "Creates a single base component with named layers derived from the recipe.",
        "Reads the Panda recipe first to derive base styles and slot names.",
        "Applies auto layout to the component and all slot layers.",
        "IMPORTANT: Call figma_ensure_token_structure before this tool.",
    ].join(" "),
    {
        componentName: z.string(),
        recipePath: z.string(),
        parentId: z.string().optional().describe("Parent frame node ID"),
    },
    async ({ componentName, recipePath, parentId }) => {
        const result = await createComponent({ componentName, recipePath, parentId });
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
);

server.tool(
    "figma_add_auto_layout",
    [
        "Applies auto layout to any frame, component, or layer.",
        "For nested auto layout, pass a children[] array — inner layout is always applied before outer (inside-out).",
    ].join(" "),
    {
        nodeId: z.string(),
        direction: z.enum(["HORIZONTAL", "VERTICAL", "WRAP"]).optional(),
        gap: z.number().optional(),
        paddingTop: z.number().optional(),
        paddingBottom: z.number().optional(),
        paddingLeft: z.number().optional(),
        paddingRight: z.number().optional(),
        alignment: z
            .enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN", "BASELINE"])
            .optional(),
        wrap: z.boolean().optional(),
        children: z
            .array(
                z.object({
                    nodeId: z.string(),
                    direction: z.enum(["HORIZONTAL", "VERTICAL", "WRAP"]).optional(),
                    gap: z.number().optional(),
                    paddingTop: z.number().optional(),
                    paddingBottom: z.number().optional(),
                    paddingLeft: z.number().optional(),
                    paddingRight: z.number().optional(),
                    alignment: z
                        .enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN", "BASELINE"])
                        .optional(),
                    wrap: z.boolean().optional(),
                })
            )
            .optional(),
    },
    async (args) => {
        await addAutoLayout(args);
        return {
            content: [{ type: "text", text: `Auto layout applied to ${args.nodeId}` }],
        };
    }
);

server.tool(
    "figma_bind_variable_to_property",
    [
        "Binds a semantic variable to a specific visual property on a layer.",
        "Always uses setBoundVariable() — never sets raw values.",
        "Supports: fills, strokes, paddingLeft, paddingRight, paddingTop, paddingBottom,",
        "itemSpacing, cornerRadius, fontSize, letterSpacing, lineHeight, opacity.",
    ].join(" "),
    {
        nodeId: z.string(),
        property: z.enum([
            "fills",
            "strokes",
            "paddingLeft",
            "paddingRight",
            "paddingTop",
            "paddingBottom",
            "itemSpacing",
            "cornerRadius",
            "fontSize",
            "letterSpacing",
            "lineHeight",
            "opacity",
        ]),
        semanticVariablePath: z.string(),
    },
    async ({ nodeId, property, semanticVariablePath }) => {
        await bindVariableToProperty({ nodeId, property, semanticVariablePath });
        return {
            content: [
                {
                    type: "text",
                    text: `Bound ${property} on ${nodeId} → ${semanticVariablePath}`,
                },
            ],
        };
    }
);

server.tool(
    "figma_create_component_set",
    [
        "Generates the full component set from the recipe's variants.",
        "Reads the recipe file via panda_parse_recipe_to_figma_schema to derive all variant",
        "combinations automatically — never hardcodes variants.",
    ].join(" "),
    {
        componentName: z.string(),
        recipePath: z.string(),
        parentId: z.string().optional(),
    },
    async ({ componentName, recipePath, parentId }) => {
        // First parse recipe into Figma schema
        const recipe = await readRecipe(recipePath);
        const figmaSchema = parseRecipeToFigmaSchema(recipe);
        const result = await createComponentSet({
            componentName,
            recipePath,
            figmaSchema,
            parentId,
        });
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
);

server.tool(
    "figma_add_component_property",
    "Adds a VARIANT, BOOLEAN, TEXT, or INSTANCE_SWAP property to a component set",
    {
        componentSetId: z.string(),
        propertyName: z.string(),
        propertyType: z.enum(["VARIANT", "BOOLEAN", "TEXT", "INSTANCE_SWAP"]),
        defaultValue: z.union([z.string(), z.boolean()]),
        options: z.array(z.string()).optional().describe("Required for VARIANT type"),
        layerId: z.string().optional().describe("Required for BOOLEAN/TEXT/INSTANCE_SWAP"),
    },
    async ({ componentSetId, propertyName, propertyType, defaultValue, options, layerId }) => {
        await addComponentProperty({
            componentSetId,
            propertyName,
            propertyType,
            defaultValue,
            options,
            layerId,
        });
        return {
            content: [
                {
                    type: "text",
                    text: `Property '${propertyName}' (${propertyType}) added to ${componentSetId}`,
                },
            ],
        };
    }
);

server.tool(
    "figma_create_slot_component",
    [
        "For slotRecipe components (Accordion, Card etc), creates each slot as a separate",
        "nested component and assembles them using instance swap properties.",
    ].join(" "),
    {
        componentName: z.string(),
        recipePath: z.string(),
        parentId: z.string().optional(),
    },
    async ({ componentName, recipePath, parentId }) => {
        const result = await createSlotComponent({ componentName, recipePath, parentId });
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
);

server.tool(
    "figma_read_component",
    "Returns a component's full structure: layers, properties, variable bindings",
    {
        fileKey: z.string(),
        nodeId: z.string(),
    },
    async ({ fileKey, nodeId }) => {
        const component = await readComponent(fileKey, nodeId);
        return {
            content: [{ type: "text", text: JSON.stringify(component, null, 2) }],
        };
    }
);

// ---------------------------------------------------------------------------
// ── EXPORT TOOLS ───────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "figma_export_node",
    "Exports a node (frame, component, etc.) to an image URL",
    {
        fileKey: z.string(),
        nodeId: z.string(),
        format: z.enum(["png", "svg", "jpg", "pdf"]).optional().default("png"),
        scale: z.number().optional().default(1),
    },
    async ({ fileKey, nodeId, format, scale }) => {
        const client = await import("./figma/client.js").then(m => m.getRestClient());
        const response = await client.getImage(fileKey, nodeId, format, scale);

        let url = response.images[nodeId];
        // Handle node ID format variations in the images response (sometimes they use ':' vs '-')
        if (!url) {
            const normalizedId = nodeId.replace(/:/g, "-");
            url = response.images[normalizedId];
        }

        if (!url) {
            throw new Error(`Export failed: ${response.err || "Unknown error"}`);
        }

        return {
            content: [{ type: "text", text: JSON.stringify({ url }, null, 2) }],
        };
    }
);

// ---------------------------------------------------------------------------
// ── PANDA TOOLS ─────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "panda_read_tokens",
    "Reads and returns current Panda token definitions from a token file",
    {
        tokenFilePath: z.string().describe("Absolute path to the Panda token file"),
    },
    async ({ tokenFilePath }) => {
        const tokens = await readTokens(tokenFilePath);
        return {
            content: [{ type: "text", text: JSON.stringify(tokens, null, 2) }],
        };
    }
);

server.tool(
    "panda_write_token",
    "Updates a specific token value in the Panda token file. Write is atomic.",
    {
        tokenFilePath: z.string(),
        tokenPath: z.string().describe("Dot-separated path, e.g. 'colors.primary.500'"),
        value: z.union([z.string(), z.number()]),
    },
    async ({ tokenFilePath, tokenPath, value }) => {
        await writeToken(tokenFilePath, tokenPath, value);
        return {
            content: [
                { type: "text", text: `Token '${tokenPath}' updated to '${value}'` },
            ],
        };
    }
);

server.tool(
    "panda_read_recipe",
    "Reads a recipe file and returns its full parsed structure: base, variants, defaultVariants, compoundVariants, slots",
    {
        recipePath: z.string(),
    },
    async ({ recipePath }) => {
        const recipe = await readRecipe(recipePath);
        const { _raw, ...displayable } = recipe;
        return {
            content: [{ type: "text", text: JSON.stringify(displayable, null, 2) }],
        };
    }
);

server.tool(
    "panda_write_recipe",
    "Updates variants or base styles in a recipe file. Write is atomic.",
    {
        recipePath: z.string(),
        patch: z
            .object({
                base: z.record(z.unknown()).optional(),
                variants: z.record(z.unknown()).optional(),
                defaultVariants: z.record(z.string()).optional(),
                slots: z.array(z.string()).optional(),
            })
            .describe("Partial recipe object to merge into the existing recipe"),
    },
    async ({ recipePath, patch }) => {
        await writeRecipe(recipePath, patch as Parameters<typeof writeRecipe>[1]);
        return {
            content: [{ type: "text", text: `Recipe at ${recipePath} updated` }],
        };
    }
);

server.tool(
    "panda_parse_recipe_to_figma_schema",
    [
        "Reads a recipe and returns a Figma-ready schema:",
        "component properties mapped to Figma property types,",
        "variant combinations as named frames (Property=Value format),",
        "slot structure as nested component/instance-swap properties,",
        "and token paths for every style in every variant ready for variable binding.",
    ].join(" "),
    {
        recipePath: z.string(),
    },
    async ({ recipePath }) => {
        const recipe = await readRecipe(recipePath);
        const schema = parseRecipeToFigmaSchema(recipe);
        return {
            content: [{ type: "text", text: JSON.stringify(schema, null, 2) }],
        };
    }
);

// ---------------------------------------------------------------------------
// ── SYNC TOOLS ──────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

server.tool(
    "map_read",
    "Returns the current design-map.json",
    {
        mapPath: z.string().optional().describe("Path to design-map.json (defaults to ./design-map.json)"),
    },
    async ({ mapPath }) => {
        const map = await readMap(mapPath);
        return {
            content: [{ type: "text", text: JSON.stringify(map, null, 2) }],
        };
    }
);

server.tool(
    "map_write",
    "Updates design-map.json with a new token or component entry. Must be called before any figma or panda write in a sync operation.",
    {
        mapPath: z.string().optional(),
        updates: z.object({
            _meta: z
                .object({
                    figmaFileKey: z.string().optional(),
                    pandaConfigPath: z.string().optional(),
                })
                .optional(),
            tokens: z.record(z.unknown()).optional(),
            components: z.record(z.unknown()).optional(),
        }),
    },
    async ({ mapPath, updates }) => {
        await writeMap(updates as Parameters<typeof writeMap>[0], mapPath);
        return {
            content: [{ type: "text", text: "design-map.json updated" }],
        };
    }
);

server.tool(
    "map_diff",
    [
        "Diffs the current Figma state and codebase against design-map.json.",
        "Returns code_ahead, figma_ahead, and conflicts with a confidence score (0–1) per token.",
    ].join(" "),
    {
        mapPath: z.string().optional(),
        liveTokens: z
            .record(
                z.object({ value: z.unknown().refine((v) => v !== undefined), type: z.string() })
            )
            .describe("Live token snapshot from Panda or Figma"),
        liveComponents: z
            .record(
                z.object({
                    slots: z.array(z.string()),
                    variants: z.record(z.array(z.string())),
                })
            )
            .describe("Live component snapshot"),
    },
    async ({ mapPath, liveTokens, liveComponents }) => {
        const diff = await diffMap(
            liveTokens as Record<string, { value: unknown; type: string }>,
            liveComponents,
            mapPath
        );
        return {
            content: [{ type: "text", text: JSON.stringify(diff, null, 2) }],
        };
    }
);

server.tool(
    "sync_push",
    [
        "Pushes all code-side changes to Figma using the design-map.",
        "Order: primitives → aliases → component variant structures → rebind all → verify → update map.",
    ].join(" "),
    {
        mapPath: z.string().optional(),
    },
    async ({ mapPath }) => {
        const result = await syncPush(mapPath);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
);

server.tool(
    "sync_pull",
    [
        "Pulls all Figma-side changes into Panda token and recipe files.",
        "Order: read Figma variables → resolve alias chains → read component bindings → write Panda tokens → write recipes → update map.",
    ].join(" "),
    {
        figmaFileKey: z.string(),
        mapPath: z.string().optional(),
    },
    async ({ figmaFileKey, mapPath }) => {
        const result = await syncPull(figmaFileKey, mapPath);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Pallas MCP server listening on stdio");
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
