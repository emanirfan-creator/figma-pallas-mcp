# Universal Component Mapping Framework
### A Design-to-Code Synchronization Manifesto for Figma ↔ Panda CSS

**Version:** 2.0  
**Status:** Active  
**Supersedes:** `figma_code_mapping_rules_v1.md`

---

## Preamble

This framework establishes the authoritative, component-agnostic rules governing how any UI component moves from its Figma representation to its code execution form. It applies uniformly to Buttons, Inputs, Selects, Checkboxes, Badges, and any future primitive or composite component.

The document is organized as three artifacts:
1. **The Manifesto** — 9 high-level, universal rules.
2. **The Translation Matrix** — a canonical lookup table mapping designer intent to compiler logic.
3. **The Idempotency Clause** — asset lifecycle management for incremental syncs.

---

## Part I: The Rule-Based Manifesto

---

### Rule 1 — The Authority Partition
> *"Figma governs Visual State. Code governs Structural Integrity."*

Figma is the exclusive authority over: color, opacity, typography weight, icon choice, and interactive state appearance (hover, active, disabled visual).

The code compiler (via Panda CSS recipes) is the exclusive authority over: padding geometry, fixed bounding box dimensions, flex/grid layout axis behavior, and accessibility-mandated sizing constraints.

**Consequence:** No Figma layout property (padding, spacing, width) should be declared absolute if it derives from a code structural variant. If padding changes based on a `size` prop, Figma represents the *appearance* of that size, while code enforces the *math* of that size.

---

### Rule 2 — The Structural Collapse Rule (Implicit → Explicit Mapping)
> *"Never represent in Figma what can be inferred by the compiler."*

A Figma Component Set must not expose explicit child variants for every possible structural combination. Only **base structural axes** (e.g., `size`, `variant`, `styling`) should exist as Component Set variants. All other states are encoded as **Boolean and Instance Swap Component Properties** on the set itself, and *inferred* by the compiler at code-generation time.

**Example — Button:**
- ✅ Expose: `variant=primary, size=md`
- ❌ Do not expose: `variant=primary, size=icon` as a separate Component Set variant
- ✅ Instead: Use `Show Text: false` (Boolean) + `Show Icon: true` (Boolean) → compiler infers `size="icon"` recipe

**Example — Input:**
- ✅ Expose: `styling=outline, size=md`
- ❌ Do not expose: `styling=outline-with-left-icon, size=md` as a variant
- ✅ Instead: Use `Show Left Icon: true` (Boolean) → compiler adds `leftElement` prop

The reduction formula:
```
Figma Variants = Base Structural Axes (n × m)
Code Variants  = Base Structural Axes (n × m) + Modifier Permutations
```

---

### Rule 3 — The Property Taxonomy
> *"Every Figma property type has exactly one code-side semantic."*

| Figma Property Type | Code-Side Semantic | Panda CSS Implication |
|---|---|---|
| **Variant** (Component Set key) | Explicit CSS recipe key | `cva({ variants: { variant: {...} } })` |
| **Boolean** | Conditional prop or inferred structural override | Adds/removes modifying class or triggers recipe branch |
| **Text** | `children` / labeled prop content | No CSS change; content injection only |
| **Instance Swap** | Component injection prop (e.g., `leftIcon`, `suffix`) | No CSS change; slot injection only |

**Critical:** Text and Instance Swap properties NEVER trigger CSS recipe changes on their own. Only Boolean and Variant manipulations drive structural CSS.

---

### Rule 4 — The Collision Rule (Force-Trigger Logic)
> *"When a designer hides a structurally mandatory element, the compiler must force-trigger the corrective recipe."*

A "collision" occurs when a Boolean property conceals an element whose absence is architecturally significant (e.g., hiding the text in a button makes it icon-only—a fundamentally different layout contract).

**Collision detection and resolution algorithm:**

```
FOR each component instance in design export:
  IF (element.isVisible === false) AND (element.isMandatorySlot === true):
    compiler.overrideRecipe(element.collisionVariant)
    compiler.emitWarning("Structural override applied: {element.name} hidden → {collisionVariant} recipe forced")
```

**Collision Table (must be defined per component):**

| Component | Hidden Element | Force-Triggered Recipe | Rationale |
|---|---|---|---|
| Button | `children` (text) | `size="icon"` | Perfect square bounding box required |
| Button | Icon only (no text) | `size="icon"` | Same as above |
| Input | All slots (empty) | `variant="ghost"` or error state | Empty inputs must not render with padding slots |
| Select | Label text | Accessibility violation; emit error | Dropdowns require visible or sr-only labels |

---

### Rule 5 — The QA Matrix Rule (Automated Layout Math)
> *"Component staging must be fully deterministic from a mathematical formula, never hand-placed."*

Every component sync operation must programmatically place variants on their dedicated page using the following algorithm:

```
COLUMNS      = 4
SPACING      = 8px   (horizontal and vertical gap)
PADDING      = 24px  (container inset on all sides)
BACKGROUND   = white solid fill (primitive token: colors/white)

position(i):
  col   = i % COLUMNS
  row   = floor(i / COLUMNS)
  x     = PADDING + col * (itemWidth + SPACING)
  y     = PADDING + row * (itemHeight + SPACING)
```

Container dimensions are computed *after* all children are placed:
```
containerWidth  = PADDING + (COLUMNS × maxItemWidth) + ((COLUMNS - 1) × SPACING) + PADDING
containerHeight = PADDING + (ROWS × maxItemHeight)   + ((ROWS - 1) × SPACING) + PADDING
```

**Grid layout applies uniformly to:** Component Sets, Icon Sets, QA Frame contents.

---

### Rule 6 — The Dual-Environment Testing Rule
> *"Every component must be verified in both token contexts before it is considered shipped."*

Two global pages exist: **`Light Mode Testing`** and **`Dark Mode Testing`**. These pages are created once and reused across all components. They are never deleted or recreated.

Each page must have an **explicit variable mode binding** applied at the page-level frame, locking it to the corresponding Semantics collection mode:
- `Light Mode Testing` → Semantics collection → `Light` mode
- `Dark Mode Testing` → Semantics collection → `Dark` mode

When a new component is shipped, its QA frame is appended to both pages—never replacing existing frames. Frame placement follows the horizontal unstacking algorithm (Rule 7).

---

### Rule 7 — The Horizontal Unstacking Rule
> *"No two QA frames may overlap on any testing page."*

QA frames placed on global testing pages must be positioned using a computed horizontal offset. The algorithm is:

```
existingFrames  = count of frames already on the target page
xOffset         = 100 + existingFrames * (frameWidth + 64)
yOffset         = 100   // constant; all QA frames share the same baseline Y
```

The `64px` gap between frames provides visual breathing room on the canvas. Each frame must have its own padded background using a semantic fill token (e.g., `colors/fill/secondary`) so it responds to the bound token mode.

---

### Rule 8 — The Global Icon Registry Rule (Singleton Management)
> *"All icon components live on a single `Icons` page as unique singletons. Never replicate, only reference."*

When any sync script requires an SVG/icon component, it must:
1. **Check Page Existence:** If the `Icons` page does not exist, create it.
2. **Singleton Lookup:** Search the entire document for a component named `icon=X`. If found, use its `nodeId`. 
3. **Idempotent Upsert:** If found, update its SVG vector paths to match the incoming definition (ensures modifications propagate). If not found, create a new icon component.
4. **Component Set Encapsulation:** All icon singletons must be children of a single `Component Set` named `Icon`.
5. **Spatial Determinism:** Arrange icons using the standard grid layout (Rule 5).

Icon instances used inside other components (e.g., Button, Input) must reference these global singletons as their `mainComponent`.

---

### Rule 9 — The Idempotency Mandate (Upsert, Never Duplicate)
> *"A second sync run must produce the exact same Figma state as the first. No duplicates. No orphans."*

See **Part III: The Idempotency Clause** for full specification.

---

### Rule 10 — The Icon Deduplication Audit
> *"Redundant icons are a violation of the design system. The sync script is a corrective auditor."*

The sync script must perform a **Document-wide Icon Audit** before execution:
1. **Detection:** Identify any component nodes with the `icon=` prefix that share identical geometry or source names outside the official `Icon` Component Set.
2. **Consolidation:** If duplicates are found:
   - Identify the "Authoritative Singleton" (the one inside the `Icon` Component Set).
   - Update all instances on all pages to point their `mainComponent` to this singleton.
   - **Delete** the redundant duplicates.
3. **Modification Sensitivity:** If an icon is modified in code, the auditor ensures the single existing component in Figma receives the update, rather than spawning a "Modified_Icon" copy.

---

### Rule 11 — The Component Slot Integrity Rule
> *"Icon instances inside complex components (slots) must be verified for singleton adherence during every sync."*

Every true-up of a composite component (e.g., Button, Input) must ensure its internal icon instances are bound to the authoritative singleton from Rule 8/10.

1. **Strict Re-instancing:** If a composite component's variants are refreshed, they must consume the singleton instance directly from the Icon Registry.
2. **Instance Propagation:** In cases where a singleton is merged or deleted (during Rule 10 audit), any instance of the deleted component *found inside another component's variants* must be re-homed to the survivor before the duplicate is purged.
3. **Visual In-Place Updates:** Because Figma instances are live, modifying the singleton icon's vector data is the only sanctioned way to update icons across the system. Replacing an instance with a new component should be avoided unless the icon identity itself has changed (e.g., swapping `star` for `check`).

---

## Part II: The Translation Matrix

This table is the canonical reference for how designer intent maps to compiler execution logic. Every sync script and code generator must implement this mapping.

| # | Designer Action (Figma) | Property Type | Code-Side Output | Panda CSS Recipe Impact | Notes |
|---|---|---|---|---|---|
| 1 | Sets `variant=primary` on Component Set | **Variant** | `variant="primary"` prop | Activates the `primary` recipe branch (bg, text, border tokens) | Direct 1:1 mapping |
| 2 | Sets `size=lg` on Component Set | **Variant** | `size="lg"` prop | Activates `lg` recipe branch (height, padding, font size tokens) | Direct 1:1 mapping |
| 3 | Sets `Show Text: true` | **Boolean** | Renders `children` slot | No recipe change | Content injection only |
| 4 | Sets `Show Text: false` | **Boolean** | Triggers **Collision Rule (Rule 4)** → `size="icon"` forced | Overrides size recipe to `icon` branch | Structural override |
| 5 | Sets `Label: "Submit"` | **Text** | `children="Submit"` | No recipe change | Content injection only |
| 6 | Sets `Show Icon: true` | **Boolean** | Adds `leftIcon={<Icon />}` prop | May add `.hasIcon` CSS modifier | Conditional prop |
| 7 | Swaps `Icon: SearchIcon` | **Instance Swap** | `leftIcon={<SearchIcon />}` | No recipe change | Slot injection only |
| 8 | Sets `Show Left Icon: false` (Input) | **Boolean** | Removes `leftElement` prop | Removes `.hasLeftElement` padding modifier | Conditional prop |
| 9 | Sets `Show Right Icon: true` (Input) | **Boolean** | Adds `rightElement={<Icon />}` | Adds `.hasRightElement` padding modifier | Conditional prop |
| 10 | Hides a component on canvas | **Layer visibility** | Emits linting warning; no code change | No impact | Designer-only state |
| 11 | Sets `styling=underlined` (Input) | **Variant** | `styling="underlined"` prop | Applies underline border, zero corner radius | Direct 1:1 mapping |
| 12 | Changes `Value: "Enter email..."` (Input) | **Text** | `placeholder="Enter email..."` | No recipe change | Content injection only |

---

## Part III: The Idempotency Clause

### Purpose
A sync script may be run multiple times against the same Figma file (e.g., after a design token change, after adding a new icon, or after a recipe update). The script must behave correctly in all execution contexts: **first run**, **re-run**, and **partial-state run** (e.g., tokens exist but components don't).

### Asset Lifecycle Rules

#### 3.1 Variable Collections & Variables
```
IF collection with name X exists:
  → REUSE its ID and modes
  → Do NOT re-create it
IF variable with name X exists in collection C:
  → UPDATE its value for each mode
  → Do NOT re-create it
IF variable does NOT exist:
  → CREATE it
```

#### 3.2 Component Sets & Components
```
IF ComponentSet with name X exists:
  → REUSE its ID
  → For each child Component variant:
      IF variant with same name exists inside the set:
        → CLEAR its existing children (visual layer wipe)
        → RE-ADD new visual children (icon instances, text nodes)
        → RE-BIND all variables (fills, strokes, paddings)
      IF variant does NOT exist:
        → CREATE it inside the existing set
  → DO NOT delete and recreate the set (preserves instance overrides)
IF ComponentSet does NOT exist:
  → CREATE the full set from scratch
```

#### 3.3 Pages
```
IF page with name X exists:
  → REUSE its ID
  → DO NOT recreate it
  → Append new frames to it (do not wipe existing content)
IF page does NOT exist:
  → CREATE it
```

#### 3.4 Component Properties on a Set
```
IF component property with name P (of type T) exists on ComponentSet C:
  → REUSE the property (including its Figma-assigned hash suffix in the name)
  → DO NOT call addComponentProperty again (Figma will throw)
  → Return the existing property name for reference assignment
IF property does NOT exist:
  → CREATE it via addComponentProperty
```

#### 3.5 Property-to-Node Bindings (componentPropertyReferences)
```
Property references (linking a Text node to a 'characters' property, etc.) are
always OVERWRITTEN on each sync, as they are positional and non-destructive.
This is safe because references do not cascade to instances; they are set at
the component definition level only.
```

### Upsert vs. Overwrite Decision Table

| Asset Type | Strategy | Reason |
|---|---|---|
| Variable Collection | **Upsert** | Deleting breaks all existing variable bindings across the document |
| Variable | **Upsert** | Deleting breaks all existing variable bindings |
| Component Set | **Upsert (shell preserved)** | Deleting breaks all existing instances on canvases |
| Component variant (child) | **Overwrite children only** | Safe; children are implementation details |
| Page | **Upsert** | Deleting loses all designer work on that page |
| QA Frame | **Append** | Previous QA results are historical record |
| Component Property | **Upsert** | Re-adding throws; must check for existence first |
| Property-to-Node binding | **Overwrite** | Non-destructive; always re-sync |

---

## Appendix A: Adding a New Component (Standardized Checklist)

When syncing a new component that doesn't yet exist in Figma:

- [ ] **Analyze Recipe**: Read the Panda CSS recipe file to identify `base`, `variants`, and `compoundVariants`.
- [ ] **Define Structural Axes**: Identify which variant keys map to Component Set variants (e.g., `variant`, `size`, `styling`).
- [ ] **Define Boolean Axes**: Identify which props map to Boolean Component Properties (e.g., `Show Icon`, `Show Placeholder`).
- [ ] **Define Collision Rules**: Document which Boolean combinations should force a specific recipe output.
- [ ] **Build the Matrix**: `Structural Axis A` × `Structural Axis B` = number of Component blocks to generate.
- [ ] **Apply Token Bindings**: Bind all fills, strokes, paddings, heights, and font sizes to primitive or semantic variables.
- [ ] **Create Component Page**: One dedicated page per component (e.g., `Input`, `Button`, `Checkbox`).
- [ ] **Run QA Frames**: Append at least one light and one dark QA frame to global testing pages.
- [ ] **Verify Idempotency**: Run the script a second time and confirm zero duplicates, zero errors.

---

## Appendix B: Panda CSS Recipe Integration Notes

Panda CSS uses the `cva()` (Class Variance Authority) pattern internally. When reading a recipe to build the sync matrix, the following fields are relevant:

```typescript
// From a Panda CSS recipe definition
const componentRecipe = defineRecipe({
  base: { /* always-on styles */ },
  variants: {
    // These keys become Component Set variant axes
    size: { sm: {...}, md: {...}, lg: {...} },
    variant: { primary: {...}, outlined: {...} }
  },
  compoundVariants: [
    // These are collision outcomes — map to Rule 4 force-trigger logic
    { size: 'md', variant: 'primary', css: {...} }
  ]
});
```

**Key mapping:**
- `variants` keys → Component Set variant axes (Rule 2)
- `compoundVariants` → Collision rule definitions (Rule 4)
- `base` styles → Always applied via semantic token bindings (not variant-specific)
