# Pallas MCP Server

A Node.js MCP (Model Context Protocol) server that connects an AI agent to both Figma and a Panda CSS codebase simultaneously to handle two-way design system sync, component creation, and variable binding.

## Features
- **Figma Variable Management:** Read/write primitives and aliases.
- **Auto Layout & Component Creation:** Construct full variant sets systematically.
- **Panda CSS Syncing:** Push recipes/tokens to Figma & pull updates to Code.
- **Token Structure Enforcer:** Validate semantic-to-primitive maps across states.

## Installation

1. Install dependencies for the MCP Server:
```bash
cd pallas-mcp
npm install
npm run build
```

2. Open Figma, load your design file.
3. Import the Companion Plugin into Figma:
   - Go to Plugins -> Development -> Import plugin from manifest...
   - Choose `pallas-mcp/figma-plugin/manifest.json`.

## Usage

1. **Start the MCP Server:**
Typically, this process is spawned by the MCP host (like the AI agent). Provide its path in the MCP configuration:
```json
{
  "mcpServers": {
    "pallas-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/pallas-mcp/dist/index.js"]
    }
  }
}
```

2. **Run the Companion Plugin:**
In Figma, launch the `Pallas MCP Companion` plugin. It opens a WebSocket listener on `ws://localhost:3055`. The plugin must be active for the MCP Server to modify the Figma document.

3. **Initialize Design System Map:**
To establish a baseline mapping and track syncs, ensure `/design-map.json` is created:
```json
{
  "tokens": {},
  "components": {}
}
```

## Workflows

### Add a Component End-To-End
The AI Agent operates these MCP tools to establish a structured component:
1. `figma_ensure_token_structure` (Validate Recipe dependencies)
2. `panda_parse_recipe_to_figma_schema` (Map structure)
3. `figma_create_component` (Base Setup)
4. `figma_add_auto_layout` (Layers Configuration)
5. `figma_create_component_set` (Generate variants)
6. `figma_add_component_property` (Wire props)
7. `figma_resolve_recipe_token_map`
8. `figma_bind_all_variant_tokens`
9. `figma_verify_component_bindings`
10. `map_write` (Commit map)

### Change a Token
Ask the Agent to:
1. `panda_write_token` / `figma_write_variable`
2. `sync_push` & `sync_pull` for parity testing.

## Troubleshooting

- **Connection Error / Timeouts**: Ensure the Figma Plugin panel is open. The plugin communicates via WebSockets locally.
- **Unbound Properties (figma_verify_component_bindings fails)**: Do not use raw colors. Update the target layer styles using `figma_bind_variable_to_property`.
