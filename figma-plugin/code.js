// Pallas MCP Bridge — Figma Plugin Code
// Handles all Plugin API write operations on behalf of the MCP server.

/* ──────────────────────────────────────────────────────────────────────────
   WebSocket server on localhost:3055
   Accepts: { id, action, payload }
   Returns: { id, success, result, error? }
   ────────────────────────────────────────────────────────────────────────── */

const WS_PORT = 3055;

figma.showUI(__html__, { width: 280, height: 180 });

// Notify UI of status changes
function uiStatus(status, queueDepth = 0, lastAction = "") {
    figma.ui.postMessage({ type: "status", status, queueDepth, lastAction });
}

// ── Message queue (while WS is disconnected) ───────────────────────────────
const messageQueue = [];

// Because Figma plugins run in a sandbox (no built-in WebSocket server),
// we use the plugin UI (an iframe) to host the WebSocket connection and
// relay messages into the plugin sandbox via figma.ui.onmessage.

figma.ui.onmessage = async (msg) => {
    if (msg.type === "ws_message") {
        const { id, action, payload } = msg;
        uiStatus("running", 0, action);
        try {
            const result = await dispatch(action, payload);
            figma.ui.postMessage({ type: "ws_reply", id, success: true, result });
            uiStatus("connected", 0, action);
        } catch (err) {
            figma.ui.postMessage({
                type: "ws_reply",
                id,
                success: false,
                result: null,
                error: String(err),
            });
            uiStatus("connected", 0, action);
        }
    }
};

// ── Action dispatcher ──────────────────────────────────────────────────────

async function dispatch(action, payload) {
    switch (action) {
        // ── Variables ────────────────────────────────────────────────────────
        case "createVariable":
            return createVariable(payload);
        case "createVariableAlias":
            return createVariableAlias(payload);
        case "setBoundVariable":
            return setBoundVariable(payload);
        case "bindTokenChain":
            return bindTokenChain(payload);

        // ── Token structure ───────────────────────────────────────────────────
        case "ensureTokenStructure":
            return ensureTokenStructure(payload);
        case "resolveRecipeTokenMap":
            return resolveRecipeTokenMap(payload);
        case "bindAllVariantTokens":
            return bindAllVariantTokens(payload);
        case "verifyComponentBindings":
            return verifyComponentBindings(payload);

        // ── Components ────────────────────────────────────────────────────────
        case "createComponent":
            return createComponentAction(payload);
        case "setAutoLayout":
            return setAutoLayout(payload);
        case "createComponentSet":
            return createComponentSetAction(payload);
        case "addComponentProperty":
            return addComponentProperty(payload);
        case "createSlotComponent":
            return createSlotComponent(payload);
        case "createInstance":
            return createInstance(payload);
        case "setFills":
            return setFills(payload);
        case "setStrokes":
            return setStrokes(payload);
        case "getSelection":
            return getSelection();
        case "lintNode":
            return lintNode(payload);

        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

// ── Variable helpers ──────────────────────────────────────────────────────

function findOrCreateCollection(name) {
    const existing = figma.variables.getLocalVariableCollections().find(
        (c) => c.name === name
    );
    return existing ? existing : figma.variables.createVariableCollection(name);
}

function findOrCreateVariable(collection, fullPath, type) {
    const existing = figma.variables
        .getLocalVariables()
        .find(
            (v) =>
                v.variableCollectionId === collection.id && v.name === fullPath
        );
    if (existing) return existing;
    return figma.variables.createVariable(fullPath, collection, type);
}

function modeIdByName(collection, modeName) {
    const mode = collection.modes.find(
        (m) => m.name.toLowerCase() === modeName.toLowerCase()
    );
    return mode && mode.modeId ? mode.modeId : collection.defaultModeId;
}

// ── Action implementations ────────────────────────────────────────────────

function createVariable({ collection, group, name, type, value, mode }) {
    const col = findOrCreateCollection(collection);
    const fullPath = group ? `${group}/${name}` : name;
    const variable = findOrCreateVariable(col, fullPath, type);
    const modeId = modeIdByName(col, mode != null ? mode : "default");

    let figmaValue = value;
    if (type === "COLOR" && typeof value === "string") {
        // Parse hex to {r,g,b,a}
        figmaValue = hexToRgba(value);
    }
    variable.setValueForMode(modeId, figmaValue);
    return { id: variable.id, name: variable.name };
}

function createVariableAlias({
    semanticCollection,
    semanticPath,
    primitiveCollection,
    primitivePath,
    mode,
}) {
    // Find primitive variable
    const primitiveCol = findOrCreateCollection(primitiveCollection);
    const primitive = findOrCreateVariable(primitiveCol, primitivePath, "COLOR");

    // Find or create semantic variable
    const semanticCol = findOrCreateCollection(semanticCollection);
    const existing = figma.variables
        .getLocalVariables()
        .find(
            (v) =>
                v.variableCollectionId === semanticCol.id && v.name === semanticPath
        );
    const semanticVar = existing
        ? existing
        : figma.variables.createVariable(
              semanticPath,
              semanticCol,
              primitive.resolvedType
          );

    const modeId = modeIdByName(semanticCol, mode != null ? mode : "default");
    // Always use createVariableAlias — never set a raw value
    semanticVar.setValueForMode(modeId, figma.variables.createVariableAlias(primitive));
    return { id: semanticVar.id };
}

function setBoundVariable({ nodeId, property, semanticVariablePath }) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const variable = figma.variables
        .getLocalVariables()
        .find((v) => v.name === semanticVariablePath);
    if (!variable)
        throw new Error(`Semantic variable not found: ${semanticVariablePath}`);

    const propMap = {
        fills: "fills",
        strokes: "strokes",
        paddingLeft: "paddingLeft",
        paddingRight: "paddingRight",
        paddingTop: "paddingTop",
        paddingBottom: "paddingBottom",
        itemSpacing: "itemSpacing",
        cornerRadius: "cornerRadius",
        fontSize: "fontSize",
        letterSpacing: "letterSpacing",
        lineHeight: "lineHeight",
        opacity: "opacity",
    };
    const figmaProp = propMap[property];
    if (!figmaProp) throw new Error(`Unsupported property: ${property}`);

    // Use setBoundVariable for all properties
    if (property === "fills" || property === "strokes") {
        const paint = {
            type: "SOLID",
            color: { r: 0, g: 0, b: 0 },
            boundVariables: { color: { type: "VARIABLE_ALIAS", id: variable.id } },
        };
        node[property] = [paint];
    } else {
        node.setBoundVariable(figmaProp, variable);
    }

    return { nodeId, property, variableId: variable.id };
}

function bindTokenChain({ semanticPath, primitiveValue, modes }) {
    const results = { primitiveCreated: false, aliasCreated: false };

    // Derive primitive path from semantic path
    const primitivePath = semanticPath
        .replace(/^Semantic\//, "Primitive/")
        .replace(/^semantic\//, "primitive/");

    const primitiveCol = findOrCreateCollection("Primitives");
    const existingPrimitive = figma.variables
        .getLocalVariables()
        .find(
            (v) =>
                v.variableCollectionId === primitiveCol.id && v.name === primitivePath
        );

    if (!existingPrimitive) {
        const type =
            typeof primitiveValue === "number"
                ? "FLOAT"
                : typeof primitiveValue === "boolean"
                    ? "BOOLEAN"
                    : "COLOR";
        const primitive = figma.variables.createVariable(
            primitivePath,
            primitiveCol,
            type
        );
        for (const modeName of modes) {
            const modeId = modeIdByName(primitiveCol, modeName);
            let val = primitiveValue;
            if (type === "COLOR" && typeof val === "string") val = hexToRgba(val);
            primitive.setValueForMode(modeId, val);
        }
        results.primitiveCreated = true;
    }

    // Ensure semantic alias
    const primitiveVar = figma.variables
        .getLocalVariables()
        .find(
            (v) =>
                v.variableCollectionId === primitiveCol.id && v.name === primitivePath
        );

    if (!primitiveVar) throw new Error("Primitive variable not found after creation");

    const semanticCol = findOrCreateCollection("Semantic");
    const existingSemantic = figma.variables
        .getLocalVariables()
        .find(
            (v) =>
                v.variableCollectionId === semanticCol.id && v.name === semanticPath
        );

    if (!existingSemantic) {
        const semanticVar = figma.variables.createVariable(
            semanticPath,
            semanticCol,
            primitiveVar.resolvedType
        );
        const modeId = semanticCol.defaultModeId;
        semanticVar.setValueForMode(
            modeId,
            figma.variables.createVariableAlias(primitiveVar)
        );
        results.aliasCreated = true;
    }

    return results;
}

// ── Token structure ─────────────────────────────────────────────────────────

function ensureTokenStructure({ recipePath }) {
    // In-plugin, recipePath is passed by the MCP server.
    // The plugin reads the structure from the message and creates variables.
    // Here we return a stub — the real logic is executed server-side and delegated
    // per-token via bindTokenChain calls.
    return {
        existed: [],
        created: [],
        flaggedForReview: [],
        errors: [],
    };
}

function resolveRecipeTokenMap({ recipePath }) {
    // Returns empty — token map is generated by the MCP server-side panda parser
    // and passed to bindAllVariantTokens directly.
    return [];
}

async function bindAllVariantTokens({ componentSetId, tokenMap }) {
    const results = [];
    for (const entry of tokenMap) {
        const componentSet = figma.getNodeById(componentSetId);
        if (!componentSet || componentSet.type !== "COMPONENT_SET") continue;

        // Find the variant frame matching variantKey
        const variantFrame = componentSet.children.find(
            (child) => child.name === entry.variantKey
        );
        if (!variantFrame) continue;

        // Find the slot layer inside the variant frame
        const slotLayer =
            variantFrame.type === "COMPONENT"
                ? variantFrame.findOne((n) => n.name === entry.layerName)
                : null;
        if (!slotLayer) continue;

        for (const binding of entry.bindings) {
            try {
                await setBoundVariable({
                    nodeId: slotLayer.id,
                    property: binding.property,
                    semanticVariablePath: binding.semanticPath,
                });
                results.push({
                    nodeId: slotLayer.id,
                    slot: entry.slot,
                    property: binding.property,
                    semanticPath: binding.semanticPath,
                    status: "bound",
                });
            } catch (err) {
                results.push({
                    nodeId: slotLayer.id,
                    slot: entry.slot,
                    property: binding.property,
                    semanticPath: binding.semanticPath,
                    status: "failed",
                    error: String(err),
                });
            }
        }
    }
    return results;
}

async function verifyComponentBindings({ componentSetId }) {
    const bound = [];
    const unbound = [];
    const missing = [];

    const node = figma.getNodeById(componentSetId);
    if (!node || node.type !== "COMPONENT_SET") {
        throw new Error(`Component set not found: ${componentSetId}`);
    }

    const frameProps = [
        "paddingLeft",
        "paddingRight",
        "paddingTop",
        "paddingBottom",
        "itemSpacing",
        "cornerRadius",
    ];
    const colorProps = ["fills", "strokes"];
    const textProps = ["fontSize", "letterSpacing", "lineHeight"];

    function auditNode(n) {
        const bv = n.boundVariables ? n.boundVariables : {};

        if (n.type === "FRAME" || n.type === "COMPONENT") {
            for (const prop of [...colorProps, ...frameProps]) {
                if (bv[prop]) {
                    bound.push({ layer: n.name, property: prop, semanticPath: bv[prop].id });
                } else {
                    const rawVal = n[prop];
                    if (rawVal !== undefined && rawVal !== null) {
                        unbound.push({ layer: n.name, property: prop, rawValue: rawVal });
                    } else {
                        missing.push({ layer: n.name, property: prop });
                    }
                }
            }
        }
        if (n.type === "TEXT") {
            for (const prop of [...colorProps, ...textProps]) {
                if (bv[prop]) {
                    bound.push({ layer: n.name, property: prop, semanticPath: bv[prop].id });
                } else {
                    const rawVal = n[prop];
                    if (rawVal !== undefined && rawVal !== null) {
                        unbound.push({ layer: n.name, property: prop, rawValue: rawVal });
                    } else {
                        missing.push({ layer: n.name, property: prop });
                    }
                }
            }
        }
        if ("children" in n) for (const child of n.children) auditNode(child);
    }

    for (const child of node.children) auditNode(child);

    let autoRetried = false;
    if (unbound.length > 0) {
        // Auto-retry: attempt to bind unbound layers using the local variable list
        for (const item of unbound) {
            const nodeToFix = node.findOne((n) => n.name === item.layer);
            if (!nodeToFix) continue;
            const guessedPath = `Semantic/${item.property}/${item.layer}`;
            try {
                await setBoundVariable({
                    nodeId: nodeToFix.id,
                    property: item.property,
                    semanticVariablePath: guessedPath,
                });
                autoRetried = true;
            } catch (err) {
                // leave as is — will show in final report
            }
        }
    }

    return { bound, unbound, missing, autoRetried };
}

// ── Components ──────────────────────────────────────────────────────────────

function createComponentAction({ name, recipePath, parentId }) {
    // Create a basic component frame; slots will be added per recipe
    const component = figma.createComponent();
    component.name = name;
    component.resize(200, 48);

    if (parentId) {
        const parent = figma.getNodeById(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(component);
    } else {
        figma.currentPage.appendChild(component);
    }

    return { id: component.id, name: component.name };
}

function setAutoLayout({
    nodeId,
    direction,
    gap,
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    alignment,
    wrap,
}) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (!("layoutMode" in node))
        throw new Error(`Node ${nodeId} does not support auto layout`);

    node.layoutMode =
        direction === "WRAP"
            ? "HORIZONTAL"
            : direction != null
                ? direction
                : "HORIZONTAL";
    node.itemSpacing = gap != null ? gap : 0;
    node.paddingTop = paddingTop != null ? paddingTop : 0;
    node.paddingBottom = paddingBottom != null ? paddingBottom : 0;
    node.paddingLeft = paddingLeft != null ? paddingLeft : 0;
    node.paddingRight = paddingRight != null ? paddingRight : 0;
    node.counterAxisAlignItems = alignment === "CENTER" ? "CENTER" : "MIN";
    node.primaryAxisAlignItems = alignment === "SPACE_BETWEEN" ? "SPACE_BETWEEN" : "MIN";
    if (wrap && direction === "WRAP") node.layoutWrap = "WRAP";

    return { nodeId, layoutApplied: true };
}

function createComponentSetAction({ name, figmaSchema, parentId }) {
    const variantCombinations =
        figmaSchema && figmaSchema.variantCombinations
            ? figmaSchema.variantCombinations
            : [];
    const components = variantCombinations.map((combo) => {
        const c = figma.createComponent();
        c.name = combo.variantKey;
        c.resize(200, 48);
        return c;
    });

    if (components.length === 0) {
        const c = figma.createComponent();
        c.name = name;
        components.push(c);
    }

    const componentSet = figma.combineAsVariants(components, figma.currentPage);
    componentSet.name = name;

    if (parentId) {
        const parent = figma.getNodeById(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(componentSet);
    }

    return { id: componentSet.id, name: componentSet.name };
}

function addComponentProperty({
    componentSetId,
    propertyName,
    propertyType,
    defaultValue,
    options,
    layerId,
}) {
    const node = figma.getNodeById(componentSetId);
    if (!node || node.type !== "COMPONENT_SET")
        throw new Error(`Component set not found: ${componentSetId}`);

    if (propertyType === "VARIANT") {
        node.addComponentProperty(propertyName, "VARIANT", String(defaultValue), {
            variantOptions: options != null ? options : [],
        });
    } else if (propertyType === "BOOLEAN") {
        node.addComponentProperty(
            propertyName,
            "BOOLEAN",
            defaultValue === true || defaultValue === "true"
        );
    } else if (propertyType === "TEXT") {
        node.addComponentProperty(propertyName, "TEXT", String(defaultValue));
    } else if (propertyType === "INSTANCE_SWAP") {
        node.addComponentProperty(propertyName, "INSTANCE_SWAP", String(defaultValue));
    }

    return { componentSetId, propertyName, propertyType };
}

function createSlotComponent({ name, recipePath, parentId }) {
    const frame = figma.createFrame();
    frame.name = `${name} / Slot`;
    frame.resize(200, 48);

    if (parentId) {
        const parent = figma.getNodeById(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(frame);
    }

    return { id: frame.id, name: frame.name };
}

function createInstance({ componentId, parentId, x, y }) {
    const component = figma.getNodeById(componentId);
    if (!component || component.type !== "COMPONENT")
        throw new Error(`Component not found: ${componentId}`);

    const instance = component.createInstance();
    if (x != null) instance.x = x;
    if (y != null) instance.y = y;

    if (parentId) {
        const parent = figma.getNodeById(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(instance);
    }

    return { id: instance.id };
}

function setFills({ nodeId, fills }) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (!("fills" in node)) throw new Error(`Node does not support fills`);
    node.fills = fills;
    return { nodeId };
}

function setStrokes({ nodeId, strokes }) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (!("strokes" in node)) throw new Error(`Node does not support strokes`);
    node.strokes = strokes;
    return { nodeId };
}

function getSelection() {
    const selection = figma.currentPage.selection;
    return selection.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type
    }));
}

// ── Linting ──────────────────────────────────────────────────────────────────

function luminance({ r, g, b }) {
    const a = [r, g, b].map((v) => {
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrast(rgb1, rgb2) {
    const lum1 = luminance(rgb1);
    const lum2 = luminance(rgb2);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
}

function getEffectiveBackgroundColor(node) {
    // Traverse upwards to find the first solid fill acting as background
    let current = node.parent;
    while (current) {
        if ("fills" in current && Array.isArray(current.fills)) {
            const solidFill = current.fills.find(f => f.type === "SOLID" && f.visible !== false);
            if (solidFill) return solidFill.color;
        }
        current = current.parent;
    }
    return { r: 1, g: 1, b: 1 }; // Default to white canvas
}

async function lintNode({ nodeId, rules }) {
    const results = [];
    let targetNodes = [];

    if (nodeId) {
        const node = figma.getNodeById(nodeId);
        if (node) targetNodes = [node];
    } else {
        targetNodes = Array.from(figma.currentPage.selection);
    }

    if (targetNodes.length === 0) return results;

    const runWcag = rules.includes("wcag") || rules.includes("all");
    const runLayout = rules.includes("no-autolayout") || rules.includes("all");
    const runColors = rules.includes("hardcoded-color") || rules.includes("all");

    function walk(node) {
        // WCAG Contrast Check
        if (runWcag && node.type === "TEXT") {
            const fills = node.fills;
            if (Array.isArray(fills) && fills.length > 0) {
                const solidFill = fills.find(f => f.type === "SOLID" && f.visible !== false);
                if (solidFill) {
                    const bg = getEffectiveBackgroundColor(node);
                    const ratio = contrast(solidFill.color, bg);
                    const isLargeText = node.fontSize >= 18 || (node.fontSize >= 14 && node.fontWeight > 600);
                    const requiredTarget = isLargeText ? 3.0 : 4.5;

                    if (ratio < requiredTarget) {
                        results.push({
                            ruleId: "wcag-contrast",
                            message: `Contrast ratio ${ratio.toFixed(2)}:1 is below the WCAG AA requirement of ${requiredTarget}:1 for ${isLargeText ? "large" : "normal"} text (Foreground: rgb(${Math.round(solidFill.color.r * 255)},${Math.round(solidFill.color.g * 255)},${Math.round(solidFill.color.b * 255)}), Background: rgb(${Math.round(bg.r * 255)},${Math.round(bg.g * 255)},${Math.round(bg.b * 255)}))`,
                            nodeId: node.id,
                            nodeName: node.name,
                            severity: "error"
                        });
                    }
                }
            }
        }

        // Auto Layout Check
        if (runLayout && (node.type === "FRAME" || node.type === "COMPONENT")) {
            if (node.layoutMode === "NONE" && node.children.length > 1) {
                results.push({
                    ruleId: "no-autolayout",
                    message: `Frame contains multiple children but doesn't use auto-layout.`,
                    nodeId: node.id,
                    nodeName: node.name,
                    severity: "warning"
                });
            }
        }

        // Hardcoded Colors Check
        if (runColors && "fills" in node && Array.isArray(node.fills)) {
            const hasRawFill = node.fills.some(f => f.type === "SOLID" && (!node.boundVariables || !node.boundVariables.fills));
            if (hasRawFill) {
                results.push({
                    ruleId: "hardcoded-color",
                    message: `Layer uses a raw fill color instead of a variable binding.`,
                    nodeId: node.id,
                    nodeName: node.name,
                    severity: "warning"
                });
            }
        }

        // Hardcoded Strokes Check
        if (runColors && "strokes" in node && Array.isArray(node.strokes)) {
            const hasRawStroke = node.strokes.some(s => s.type === "SOLID" && (!node.boundVariables || !node.boundVariables.strokes));
            if (hasRawStroke) {
                results.push({
                    ruleId: "hardcoded-color",
                    message: `Layer uses a raw stroke color instead of a variable binding.`,
                    nodeId: node.id,
                    nodeName: node.name,
                    severity: "warning"
                });
            }
        }

        if ("children" in node) {
            for (const child of node.children) walk(child);
        }
    }

    for (const node of targetNodes) walk(node);

    return results;
}

// ── Utility ──────────────────────────────────────────────────────────────────

function hexToRgba(hex) {
    const clean = hex.replace(/^#/, "");
    const full = clean.length === 3
        ? clean.split("").map((c) => c + c).join("")
        : clean;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
}
