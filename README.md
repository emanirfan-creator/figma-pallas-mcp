# pallas-mcp

A Node.js MCP server that connects an AI agent to both Figma and a Panda CSS codebase simultaneously. It handles two-way design system sync, full component creation, token structure enforcement, and automatic variable binding across all component variants and slots.

---

## Project structure

```
pallas-mcp/
  src/
    index.ts                  # MCP server entry — registers all tools
    figma/
      client.ts               # Figma REST API + plugin WebSocket client
      variables.ts            # read/write variables and alias chains
      components.ts           # create/update components, bind variables
      variants.ts             # component sets, variant/boolean/text/swap properties
      autolayout.ts           # apply auto layout (inside-out, recursive)
      tokens.ts               # token structure enforcement, binding, verification
    panda/
      tokens.ts               # read/write Panda token files (atomic)
      recipes.ts              # read/write Panda recipe files (atomic)
      parser.ts               # parse recipe → Figma-ready variant/slot schema
    sync/
      map.ts                  # read/write/diff design-map.json (atomic)
      push.ts                 # code → Figma
      pull.ts                 # Figma → code
  figma-plugin/
    manifest.json             # Figma plugin manifest
    code.js                   # Plugin API handler (all write operations)
    ui.html                   # Status panel + WebSocket relay
  design-map.json             # Source of truth for sync state
  package.json
  tsconfig.json
  README.md
```

---

## Installation

```bash
cd /path/to/pallas-mcp
npm install
npm run build
```

Requirements: **Node.js ≥ 20**

---

## Running

**Development (tsx, no build step):**
```bash
FIGMA_ACCESS_TOKEN=your_token npm run dev
```

**Production (compiled):**
```bash
npm run build
FIGMA_ACCESS_TOKEN=your_token npm start
```

**Environment variables:**

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIGMA_ACCESS_TOKEN` | ✅ | — | Personal access token from figma.com/settings |
| `FIGMA_PLUGIN_PORT` | ❌ | `3055` | Port the companion plugin connects on |
| `DESIGN_MAP_PATH` | ❌ | `./design-map.json` | Path to your design-map.json |

---

## Installing the companion Figma plugin

The MCP server needs a companion Figma plugin to perform write operations (variable creation, alias binding, component creation) since the REST API cannot do these.

1. Open Figma desktop app
2. Go to **Plugins → Development → Import plugin from manifest…**
3. Select `/path/to/pallas-mcp/figma-plugin/manifest.json`
4. The plugin **"Pallas MCP Bridge"** will appear in your development plugins
5. Open your design file, then run the plugin: **Plugins → Development → Pallas MCP Bridge**
6. The plugin UI shows connection status. It will connect to the MCP server's WebSocket when both are running.

> **Architecture note:** The Figma plugin sandbox has no direct network access. The plugin `ui.html` opens a WebSocket connection to `ws://localhost:3055` (where the MCP server listens) and relays messages between the sandbox and the server.

---

## Connecting pallas-mcp to Antigravity (Claude/Cursor)

Add to your MCP config (e.g. `~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pallas-mcp": {
      "command": "node",
      "args": ["/path/to/pallas-mcp/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your_token_here",
        "DESIGN_MAP_PATH": "/path/to/your/project/design-map.json"
      }
    }
  }
}
```

Or using the dev server (no build required):

```json
{
  "mcpServers": {
    "pallas-mcp": {
      "command": "npx",
      "args": ["tsx", "/path/to/pallas-mcp/src/index.ts"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

---

## Initializing design-map.json for an existing Panda project

Edit `design-map.json` at the project root (or at `DESIGN_MAP_PATH`) to point to your project:

```json
{
  "_meta": {
    "version": "1",
    "lastPush": null,
    "lastPull": null,
    "figmaFileKey": "PASTE_YOUR_FIGMA_FILE_KEY_HERE",
    "pandaConfigPath": "/absolute/path/to/your/panda.config.ts"
  },
  "tokens": {},
  "components": {}
}
```

The Figma file key is the string in the file URL:  
`https://www.figma.com/file/`**`ABC123fileKey`**`/My-Design`

Then call `map_write` from your AI agent to set these values programmatically, or edit the file directly.

---

## Running the first full sync

### From code → Figma

```
1. open the Pallas MCP Bridge plugin in Figma
2. call map_write to set figmaFileKey + pandaConfigPath
3. call sync_push
4. call sync_pull to verify parity
5. call map_diff to confirm zero conflicts
```

### From Figma → code

```
1. call sync_pull { figmaFileKey: "..." }
2. inspect the updated token files in your Panda project
3. call map_diff to confirm parity
```

---

## Adding a new component from scratch

Every component must follow this exact order:

```
1. figma_ensure_token_structure   { recipePath }
2. panda_parse_recipe_to_figma_schema { recipePath }
3. figma_create_component         { componentName, recipePath }
4. figma_add_auto_layout          { nodeId, direction, gap, padding... }
5. figma_create_component_set     { componentName, recipePath }
6. figma_add_component_property   × N  (VARIANT, BOOLEAN, TEXT, INSTANCE_SWAP)
7. figma_resolve_recipe_token_map { recipePath }
8. figma_bind_all_variant_tokens  { componentSetId, tokenMap }
9. figma_verify_component_bindings { componentSetId }
10. map_write                     (record the completed component)
```

For slot-based components (Accordion, Card, etc.), replace step 3 with `figma_create_slot_component`.

---

## Changing a token value

**Code-first (Panda → Figma):**
```
1. map_write    ← record the intent before any write
2. panda_write_token { tokenFilePath, tokenPath, value }
3. sync_push    ← propagates to Figma
4. sync_pull    ← verify round-trip
5. map_diff     ← confirm zero conflicts
```

**Figma-first:**
```
1. Change the variable value manually in Figma
2. sync_pull { figmaFileKey }   ← pulls to Panda
3. map_diff                     ← confirm parity
```

---

## Troubleshooting

### `figma_verify_component_bindings` returns unbound properties

`verifyComponentBindings` automatically retries binding for any unbound layer. If it still fails:

1. Check that `figma_ensure_token_structure` was called first — the semantic variable may not exist yet.
2. Call `figma_read_variables` to confirm the variable exists in the file.
3. Manually call `figma_bind_variable_to_property` for the specific layer + property.
4. If the variable path is wrong, check `figma_resolve_recipe_token_map` output for the correct `semanticPath`.

### Plugin shows "Disconnected — retrying…"

- Confirm the MCP server is running (`npm run dev` or `npm start`)
- Check the port is not blocked: `lsof -i :3055`
- Check `FIGMA_PLUGIN_PORT` matches the port in `ui.html`

### `FIGMA_ACCESS_TOKEN` errors

- Generate a token at **figma.com → Settings → Security → Personal Access Tokens**
- Scope required: **File content** (read)

### TypeScript errors during build

```bash
npm run typecheck
```
All strict checks are enabled. Run this before submitting any code.

### MCP inspector

```bash
npm run build
npm run inspector
```
All 25 tools should appear in the tools list with correct schemas.

---

## Available tools

### Variable tools
| Tool | Description |
|---|---|
| `figma_read_variables` | Read all collections, variables, modes, alias chains |
| `figma_write_variable` | Create/update a primitive variable with a raw value |
| `figma_write_alias` | Set a semantic variable to alias a primitive (always via `createVariableAlias`) |
| `figma_bind_token_chain` | Ensure full alias chain (primitive + semantic) exists |

### Token structure tools
| Tool | Description |
|---|---|
| `figma_ensure_token_structure` | Verify/create all token paths from a recipe |
| `figma_resolve_recipe_token_map` | Build per-variant per-slot binding map |
| `figma_bind_all_variant_tokens` | Execute all bindings via `setBoundVariable` |
| `figma_verify_component_bindings` | Audit all layers; auto-retry unbound; report |

### Component tools
| Tool | Description |
|---|---|
| `figma_create_component` | Create base component from recipe |
| `figma_add_auto_layout` | Apply auto layout (inside-out, recursive) |
| `figma_bind_variable_to_property` | Bind a semantic variable to a visual property |
| `figma_create_component_set` | Generate all variant frames from recipe |
| `figma_add_component_property` | Add VARIANT/BOOLEAN/TEXT/INSTANCE_SWAP property |
| `figma_create_slot_component` | Create slot-based nested component |
| `figma_read_component` | Read component structure + bindings |

### Panda tools
| Tool | Description |
|---|---|
| `panda_read_tokens` | Read Panda token definitions |
| `panda_write_token` | Update a token value (atomic write) |
| `panda_read_recipe` | Read a recipe structure |
| `panda_write_recipe` | Update a recipe (atomic write) |
| `panda_parse_recipe_to_figma_schema` | Convert recipe to Figma-ready schema |

### Sync tools
| Tool | Description |
|---|---|
| `map_read` | Return design-map.json |
| `map_write` | Update design-map.json |
| `map_diff` | Diff live state vs design-map; returns confidence scores |
| `sync_push` | Push all code changes to Figma |
| `sync_pull` | Pull all Figma changes to Panda |

---

## Hard rules (enforced by server)

- `figma_write_alias` always uses `createVariableAlias()` — never raw values on semantic variables  
- `figma_bind_variable_to_property` always uses `setBoundVariable()` — never raw visual values  
- `figma_ensure_token_structure` must run before `figma_create_component`  
- `figma_create_component_set` derives variants from `panda_parse_recipe_to_figma_schema` — never hardcoded  
- `figma_add_auto_layout` is called on every component and slot layer after creation  
- `figma_verify_component_bindings` must return zero unbound properties  
- `map_write` is called before any figma or panda write in every sync operation  
- All file writes are atomic (temp file + rename)  
