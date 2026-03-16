import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Figma imports
import { createVariable, setVariableValue, createVariableAlias, setBoundVariable } from './figma/variables.js';
import { createComponent, createInstance, createComponentSet, addComponentProperty } from './figma/components.js';
import { addAutoLayout } from './figma/autolayout.js';
import { bindAllVariantTokens } from './figma/variants.js';
import { ensureTokenStructure, resolveRecipeTokenMap, verifyComponentBindings } from './figma/tokens.js';
import { figmaClient } from './figma/client.js';

// Panda imports
import { readTokens, writeToken } from './panda/tokens.js';
import { readRecipe, writeRecipe } from './panda/recipes.js';
import { parseRecipeToFigmaSchema } from './panda/parser.js';

// Sync imports
import { readMap, writeMap, diffMap } from './sync/map.js';
import { syncPush } from './sync/push.js';
import { syncPull } from './sync/pull.js';

const server = new McpServer({
  name: "pallas-mcp",
  version: "1.0.0",
});

// -- Figma Variable Tools --

server.tool("figma_write_variable",
  "Creates or updates a primitive variable",
  {
    collectionId: z.string(),
    group: z.string(),
    name: z.string(),
    type: z.enum(["COLOR", "FLOAT", "STRING"]),
    value: z.any(),
    modeId: z.string()
  },
  async (args) => {
    const v = await createVariable(`${args.group}/${args.name}`, args.collectionId, args.type);
    await setVariableValue(v.id, args.modeId, args.value);
    return { content: [{ type: "text", text: `Created variable ${v.id}` }] };
  }
);

server.tool("figma_write_alias",
  "Sets a semantic variable to alias a primitive variable",
  {
    semanticVariableId: z.string(),
    primitiveVariableId: z.string(),
    modeId: z.string()
  },
  async (args) => {
    const alias = await createVariableAlias(args.primitiveVariableId);
    await setVariableValue(args.semanticVariableId, args.modeId, alias);
    return { content: [{ type: "text", text: `Created alias` }] };
  }
);

// -- Token structure Tools --

server.tool("figma_ensure_token_structure",
  "Reads all token paths referenced in a recipe, checks them in Figma, creates missing.",
  { recipePath: z.string() },
  async (args) => {
    const res = await ensureTokenStructure(args.recipePath);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("figma_resolve_recipe_token_map",
  "Reads a recipe and returns complete token binding map.",
  { recipePath: z.string() },
  async (args) => {
    const res = await resolveRecipeTokenMap(args.recipePath);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("figma_bind_all_variant_tokens",
  "Executes all bindings on correct layers inside variant frames.",
  { componentSetId: z.string(), tokenMap: z.any() },
  async (args) => {
    const res = await bindAllVariantTokens(args.componentSetId, args.tokenMap);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("figma_verify_component_bindings",
  "Audits entire component set after bindings are applied.",
  { componentSetId: z.string() },
  async (args) => {
    const res = await verifyComponentBindings(args.componentSetId);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// -- Figma Component Tools --

server.tool("figma_create_component",
  "Creates single base component with slot layers from recipe",
  { componentName: z.string(), recipePath: z.string() },
  async (args) => {
    const res = await createComponent(args.componentName);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("figma_add_auto_layout",
  "Applies auto layout to any frame, component, or layer",
  { 
    nodeId: z.string(),
    direction: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(),
    gap: z.number().optional(),
    padding: z.object({ top: z.number().optional(), bottom: z.number().optional(), left: z.number().optional(), right: z.number().optional() }).optional(),
    alignment: z.enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN", "BASELINE"]).optional(),
    wrap: z.boolean().optional()
  },
  async (args) => {
    await addAutoLayout(args.nodeId, args);
    return { content: [{ type: "text", text: "Added auto layout" }] };
  }
);

server.tool("figma_bind_variable_to_property",
  "Binds a semantic variable to specific property on layer",
  { nodeId: z.string(), property: z.string(), variableId: z.string() },
  async (args) => {
    await setBoundVariable(args.nodeId, args.property, args.variableId);
    return { content: [{ type: "text", text: "Bound variable" }] };
  }
);

server.tool("figma_create_component_set",
  "Generates full component set from recipe variants",
  { name: z.string(), recipePath: z.string(), componentIds: z.array(z.string()) },
  async (args) => {
    const res = await createComponentSet(args.name, args.componentIds);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("figma_add_component_property",
  "Adds property to component set",
  { setId: z.string(), propertyName: z.string(), type: z.enum(["VARIANT", "BOOLEAN", "TEXT", "INSTANCE_SWAP"]), defaultValue: z.any() },
  async (args) => {
    const res = await addComponentProperty(args.setId, args.propertyName, args.type, args.defaultValue);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// -- Panda Tools --

server.tool("panda_read_tokens",
  "Reads current Panda token definitions",
  { path: z.string() },
  async (args) => {
    const res = await readTokens(args.path);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("panda_write_token",
  "Updates specific token value",
  { path: z.string(), tokenPath: z.string(), value: z.any() },
  async (args) => {
    await writeToken(args.path, args.tokenPath, args.value);
    return { content: [{ type: "text", text: "Wrote token" }] };
  }
);

server.tool("panda_read_recipe",
  "Reads a recipe file and returns full parsed structure",
  { path: z.string() },
  async (args) => {
    const res = await readRecipe(args.path);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("panda_write_recipe",
  "Updates variants or base styles in a recipe",
  { path: z.string(), patch: z.any() },
  async (args) => {
    await writeRecipe(args.path, args.patch);
    return { content: [{ type: "text", text: "Wrote recipe" }] };
  }
);

server.tool("panda_parse_recipe_to_figma_schema",
  "Reads recipe file and returns Figma-ready schema",
  { recipePath: z.string() },
  async (args) => {
    const recipe = await readRecipe(args.recipePath);
    const schema = parseRecipeToFigmaSchema(recipe);
    return { content: [{ type: "text", text: JSON.stringify(schema, null, 2) }] };
  }
);

// -- Sync Tools --

server.tool("map_read",
  "Returns design-map.json",
  { path: z.string() },
  async (args) => {
    const map = await readMap(args.path);
    return { content: [{ type: "text", text: JSON.stringify(map, null, 2) }] };
  }
);

server.tool("map_write",
  "Updates design-map.json",
  { path: z.string(), entries: z.any() },
  async (args) => {
    await writeMap(args.path, args.entries);
    return { content: [{ type: "text", text: "Wrote map" }] };
  }
);

server.tool("map_diff",
  "Diffs current Figma state and codebase against design-map.json",
  { path: z.string(), figmaState: z.any(), codeState: z.any() },
  async (args) => {
    const diff = await diffMap(args.path, args.figmaState, args.codeState);
    return { content: [{ type: "text", text: JSON.stringify(diff, null, 2) }] };
  }
);

server.tool("sync_push",
  "Pushes all code-side changes to Figma",
  { path: z.string(), codeState: z.any() },
  async (args) => {
    const res = await syncPush(args.path, args.codeState);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

server.tool("sync_pull",
  "Pulls all Figma-side changes into Panda",
  { path: z.string(), figmaState: z.any() },
  async (args) => {
    const res = await syncPull(args.path, args.figmaState);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pallas MCP Server running on stdio");
}

main().catch(console.error);
