# Walkthrough: Syncing Pallas UI to Figma

We successfully implemented the Pallas UI to Figma sync plan using the `pallas-mcp` infrastructure!

## Changes Made
- Modified the Figma `pallas-mcp` companion plugin to support dynamic **Variable Collection** creation (`createVariableCollection`).
- Upgraded the plugin's `createVariable` operation to gracefully handle matching pre-existing tokens instead of failing with duplicates.
- Refactored the `setBoundVariable` operation to securely wrap the target paint properties inside a `SolidPaint` object when binding variables to `fills` or `strokes`.
- Developed an end-to-end node script `scripts/sync-button.ts` that:
  - Connects to the active Figma Plugin via WebSockets.
  - Automatically loads Primitive variable constraints directly mapped from Panda CSS.
  - Wires Figma's Semantic variables (aliases) back to the Primitive colors mathematically.
  - Iterates over the Panda CSS `button.ts` recipe to loop through structural variants.
  - Spawns auto-layout container frames and applies bidirectional centering (`primaryAxisAlignItems` & `counterAxisAlignItems`) and spacing dimension variables.
  - Implements the strict **18-Variant Hybrid Mapping logic** (discarding explicit `"icon"` sizes).
  - Generates SVG vector components dynamically from the `lucide-static` library and instances them automatically inside all 18 buttons alongside tokenized text.
  - Embodies native Figma Component Properties by creating a `TEXT` property named "Label", an `INSTANCE_SWAP` property named "Icon", and boolean properties named "Show Text" and "Show Icon", mapping them directly to internal nested hierarchies.
  - Combines **all 18 unique generated visual base variants** into a Figma `ComponentSet`.
  - Dynamically builds a perfect mathematical variant grid inside the set (4 columns max, 8px row/col spacing) with 24px container padding.
  - Developed an end-to-end node script `src/scripts/sync-input.ts` that:
  - Connects to the active Figma Plugin via WebSockets.
  - Implements a **Slotted Slot Architecture** for Input fields (Left Icon + TextField + Right Icon).
  - Maps 12 unique Input variants (styling: outline, underlined, filled, borderless) x (size: sm, md, lg).
  - Automatically bounds Text Field font sizes and Input heights to primitive tokens.
  - Correctly sets the Text Field to `FILL` horizontal sizing to accommodate dynamic icon visibility.
  - Generates `Input QA` frames on the global `Light Mode Testing` and `Dark Mode Testing` pages, successfully proving the **Global Testing Architecture** and **Rule 6-9 idempotency** logic.
  - Automatically identifies existing components for **idempotent true-upserting**; avoiding instance breaking by clearing old visual children while maintaining the `ComponentID`.
- Routed all generated vector graphics into a dedicated `Icons` page, mathematically arranged into an `Icon` Component Set.
- Generated global testing pages explicitly bound to token modes and verified them with both Button and Input QA frames.
- Spawns testing panels within those global pages, applying a horizontal spatial unstacking offset (rule 7) so elements never overlap geometrically on the testing canvas.

## Tested Behaviors
- The execution of `npx tsx scripts/sync-button.ts` correctly spawned the local HTTP client.
- The WebSocket tunneled all UI requests efficiently into the Figma file without locking execution.
- It created two active Variable Collections inside Figma: **Primitives** and **Semantics**.
- It correctly resolved a massive generated Figma Component Set (`nodeId: 11:342`) encompassing the entire Pallas UI Button design matrix.

You should now see the synced variables and Button component matrix inside your active Figma file block!
