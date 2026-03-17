# Pallas UI: Figma to Code Mapping Rules

This document outlines the architectural mapping rules for bridging the dynamic capabilities of **Figma Component Properties** (like Booleans) with the rigid structural constraints of **Panda CSS Code Recipes** (like explicit `size="icon"` variants).

## 1. The Core Problem
*   **Figma Designer Experience (The "Visual" Goal)**: A designer expects a single `Button` component where they can simply toggle toggles (e.g., `Show Icon` / `Show Text`) to create states.
*   **Code Developer Experience (The "Structural" Goal)**: Code (especially Panda CSS) relies on strict variant classes (e.g., `size: "sm" | "md" | "lg" | "icon"`) because changing a state involves altering padding, widths, and structural CSS properties precisely. 

If a designer turns off the `Show Text` boolean in Figma on a standard `size="md"` button:
*   Figma will "hug" the remaining icon, resulting in a button that is **padded on the X-axis** (e.g., resulting in a 36x40px shape).
*   However, the developer's expectation for an "icon-only" button via code (`size="icon"`) is an explicit **fixed 40x40px perfect square bounding box** with no padding.

## 2. The Golden Rule of Hybrid Mapping
**"Figma governs Visual Logic; Code governs Structural Logic."**

We map implicit combinations of Figma's Boolean properties to explicit structural properties in Code through a strict abstraction layer, rather than trying to force Figma to mathematically derive a fixed square layout when a text layer is hidden.

---

## 3. The Implementation Rules

To successfully deploy a design system that works flawlessly in Figma without redundant variants, while exporting perfectly to Panda CSS code, use the following rules during synchronization:

### Rule 1: Collapse Structural Variants via "Combination Overrides"
Instead of syncing every possible structural permutation as a unique variant (e.g., Button `icon` size, or Input `withLeftIcon`), the Figma sync script should output only the **base structural sizes** (e.g., `sm`, `md`, `lg`). Specific sub-variants are functionally swallowed into Figma boolean combinations.

**Example 1: Button**
| Figma State (Designer Output) | Evaluated React/Code Component Prop (Developer Input) | Evaluation Logic |
| :--- | :--- | :--- |
| `Size: "md"` + `Show Text: True` + `Show Icon: False` | `<Button size="md">Label</Button>` | Standard text button. |
| `Size: "md"` + `Show Text: True` + `Show Icon: True` | `<Button size="md" leftIcon={<Icon />}>Label</Button>` | Button with leading icon. |
| `Size: "md"` + `Show Text: False` + `Show Icon: True` | **`<Button size="icon" aria-label="Label"><Icon /></Button>`** | The mapping compiler catches that Text is hidden, and overrides the explicit HTML output to `size="icon"`. |

**Example 2: Input Field**
| Figma State (Designer Output) | Evaluated React/Code Component Prop (Developer Input) | Evaluation Logic |
| :--- | :--- | :--- |
| `Size: "md"` + `Show Left Icon: False` | `<Input size="md" />` | Standard text input. |
| `Size: "md"` + `Show Left Icon: True` | `<Input size="md" leftElement={<Icon />} />` | Input with a leading icon. The CSS handles the extra internal padding. |

### Rule 2: Component Sets Define CSS Structure, Properties Define Props
*   **Component Set Variants** map 1:1 to CSS classes that deeply alter architecture.
    *   `Variant` (`primary`, `outlined`, `dashed`, etc.) -> Backgrounds, Fills, Borders
    *   `Size` (`sm`, `md`, `lg`) -> Height, Minimum Width, Vertical Padding
*   **Component Properties** map 1:1 to React/Vue framework component arguments.
    *   `Show Icon` (Boolean) -> mapped to `leftIcon` prop condition.
    *   `Label` (Text) -> mapped to `children` content injected.
    *   `IconType` (Swap) -> mapped to `<ComponentName />` JSX injection.

### Rule 4: The 1-Way Handoff Constraint
Figma allows designers to hide properties dynamically via Booleans. Our React/Code library should enforce that if a critical layer is hidden in Figma (e.g., `children` Text in a Button, or a `leftIcon` in an Input), the code compiler forcibly renders the explicit CSS recipe from Panda that matches that state. 
*   **Button Example:** Hiding text on a Button forces the `size="icon"` CSS recipe output. This ensures the 40x40 perfectly squared border-radius is respected visually on the web regardless of what horizontal padding Figma applies visually.
*   **Input Example:** Toggling off a `Left Icon` Boolean in Figma simply hides the layer, but the code compiler translates this to removing the `leftElement` prop and stripping the `.hasLeftElement` CSS class modifier, adjusting the text padding.

### Rule 5: Page Architecture and Automated QA
Whenever a Component Set is generated, it must be staged under a strict, standardized architecture:
1. **Component Set Page**: Each component (e.g., `Button`) resides on its own dedicated page.
2. **Matrix Grid Layout**: The Component Set must be organized into a strict visual grid: exactly 4 variations per row, with 8px horizontal and vertical spacing. The Component Set container itself must possess a solid white background and standard structural padding (top, bottom, left, right offsets).
3. **Global Testing Pages**: Instead of component-specific testing pages, two global pages named `Light Mode Testing` and `Dark Mode Testing` must be instantiated to test instances of all generated components.
4. **Environment Simulator**: Instances of the components must be populated inside padded Testing Frames on these global testing pages.
5. **Accessibility Linting**: The output matrix and testing frames must be programmatically run against WCAG compliance checks via design linter tools.

### Rule 6: Strict Idempotency (Tokens, Components, Pages)
If a Token, Component, Component Set, or Page already exists within the target Figma file, sync scripts must perform a surgical "upsert" (replace contents and properties) rather than deleting and recreating the node or throwing an error. This preserves existing collections, references, and Instance overrides on designers' canvases.

### Rule 7: Horizontal Unstacking
When rendering testing nodes or QA Frames, coordinates (x, y) must be mathematically offset so that no frames visually stack or overlap in the Figma editor.

### Rule 8: Global Icon Sets
All vector/SVG icon components generated (e.g., from `lucide-static`) must be collected and moved to a single global page named `Icons`. Their arrangement must follow the identical 4-column matrix grid layout spacing (8px) as defined for standard Component Sets.

### Rule 9: Explicit Token Mode Selection
When configuring the `Light Mode Testing` and `Dark Mode Testing` pages (or their corresponding frames), the Figma API must explicitly bind the testing container to the corresponding Token Set collection mode (e.g., forcing a frame to resolve variables in "Dark" mode).

## 4. Summary for the Button Matrix Generation
With these mapping rules enacted, your Sync Script complexity reduces!

1.  We iterate: `Variants (6)` x `Sizes (3)` = **18 Component Blocks**.
2.  We apply `TEXT: "Label"` and `INSTANCE_SWAP: "Icon"`.
3.  We apply `BOOLEAN: "Show Text"` and `BOOLEAN: "Show Icon"`.
4.  The dedicated `"icon"` size from Panda is abstracted entirely from Figma. It exists only as a *CSS execution output* when the exported JSON design map parses a button that has `Show Text: False` and `Show Icon: True`.

This guarantees a fully flexible design canvas in Figma (only 18 highly reusable blocks) rather than an explicit table of 24, while mathematically matching the 24 possible structural outputs in Panda CSS perfectly.
