figma.showUI(__html__, { width: 300, height: 400 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'action') {
    const { id, action, payload } = msg.request;
    try {
      const result = await handleAction(action, payload);
      figma.ui.postMessage({ type: 'action-result', result: { id, success: true, result } });
    } catch (e: any) {
      figma.ui.postMessage({ type: 'action-result', result: { id, success: false, error: e.message } });
    }
  }
};

async function handleAction(action: string, payload: any): Promise<any> {
  switch (action) {
    case 'createVariableCollection': {
      const { name, modes } = payload;
      let c = figma.variables.getLocalVariableCollections().find(c => c.name === name);
      if (!c) {
        c = figma.variables.createVariableCollection(name);
      }
      if (modes && modes.length > 0) {
         if (c.modes[0].name !== modes[0]) {
            c.renameMode(c.modes[0].modeId, modes[0]);
         }
         for (let i = 1; i < modes.length; i++) {
            if (!c.modes.find(m => m.name === modes[i])) {
               c.addMode(modes[i]);
            }
         }
      }
      return { id: c.id, modes: c.modes.map(m => ({ modeId: m.modeId, name: m.name })) };
    }

    case 'createVariable': {
      const { collectionId, name, type } = payload;
      const existing = figma.variables.getLocalVariables().find(v => v.variableCollectionId === collectionId && v.name === name);
      if (existing) {
        return { id: existing.id, key: existing.key };
      }
      const v = figma.variables.createVariable(name, collectionId, type);
      return { id: v.id, key: v.key };
    }
    
    case 'setVariableValue': {
      const { variableId, modeId, value } = payload;
      const v = await figma.variables.getVariableByIdAsync(variableId);
      if (!v) throw new Error(`Variable ${variableId} not found`);
      v.setValueForMode(modeId, value);
      return { success: true };
    }

    case 'setExplicitVariableMode': {
      const { nodeId, collectionId, modeId } = payload;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node && 'setExplicitVariableModeForCollection' in node) {
        node.setExplicitVariableModeForCollection(collectionId, modeId);
      }
      return { success: true };
    }

    case 'createVariableAlias': {
      const { variableId } = payload;
      const v = await figma.variables.getVariableByIdAsync(variableId);
      if (!v) throw new Error(`Variable ${variableId} not found`);
      return figma.variables.createVariableAlias(v);
    }

    case 'setBoundVariable': {
      const { nodeId, property, variableId } = payload;
      if (!variableId) throw new Error(`Cannot bind property ${property} to undefined variableId`);
      const node = await figma.getNodeByIdAsync(nodeId);
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      
      if (!node) throw new Error(`Node ${nodeId} not found`);
      if (!variable) throw new Error(`Variable ${variableId} not found`);

      if (property === 'fills' || property === 'strokes') {
        const solidPaint: SolidPaint = { type: 'SOLID', color: { r: 1, g: 1, b: 1 } };
        const boundPaint = figma.variables.setBoundVariableForPaint(solidPaint, 'color', variable);
        
        if (node.type === 'INSTANCE') {
          const traverse = (n: SceneNode) => {
             // Vector and Text nodes are safe to override paint on
             if (n.type === 'VECTOR' || n.type === 'TEXT' || n.type === 'BOOLEAN_OPERATION' || n.type === 'STAR' || n.type === 'LINE' || n.type === 'ELLIPSE' || n.type === 'POLYGON' || n.type === 'RECTANGLE') {
                if (property in n) (n as any)[property] = [boundPaint];
             }
             if ('children' in n) {
               for (const child of (n as any).children) traverse(child as SceneNode);
             }
          }
          traverse(node);
        } else {
          (node as any)[property] = [boundPaint];
        }
      } else if (property === 'fontSize') {
        if (node.type === 'TEXT') {
          await figma.loadFontAsync(node.fontName as FontName);
          node.setBoundVariable('fontSize', variable.id);
        }
      } else if ('setBoundVariable' in node) {
        (node as any).setBoundVariable(property, variable.id);
      }
      return { success: true };
    }

    case 'createSvg': {
      const { svg, parentId } = payload;
      const node = figma.createNodeFromSvg(svg);
      node.name = "Icon";
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && 'appendChild' in parent) {
          (parent as any).appendChild(node);
        }
      }
      return { id: node.id };
    }

    case 'assignComponentProperty': {
      const { nodeId, propertyName, targetField } = payload;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node && 'componentPropertyReferences' in node) {
          node.componentPropertyReferences = {
             ...node.componentPropertyReferences,
             [targetField]: propertyName
          };
      }
      return { success: true };
    }

    case 'assignMultipleComponentProperties': {
      const { nodeId, properties } = payload;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node && 'componentPropertyReferences' in node) {
          const newRefs = { ...node.componentPropertyReferences };
          for (const prop of properties) {
             newRefs[prop.targetField as "characters" | "visible" | "mainComponent"] = prop.propertyName;
          }
          node.componentPropertyReferences = newRefs;
      }
      return { success: true };
    }

    case 'createPage': {
      const { name } = payload;
      let page = figma.root.children.find(p => p.name === name);
      if (!page) {
        page = figma.createPage();
        page.name = name;
      }
      figma.currentPage = page as PageNode;
      return { id: page.id };
    }

    case 'createFrame': {
      const { name, parentId, layoutMode } = payload;
      let parentNode: BaseNode | null = null;
      if (parentId) {
        parentNode = await figma.getNodeByIdAsync(parentId);
      }
      let frame: FrameNode | undefined = undefined;
      if (name && parentNode && 'children' in parentNode) {
         frame = (parentNode as any).children.find((c: any) => c.name === name && c.type === 'FRAME');
      }
      if (!frame) {
        frame = figma.createFrame();
        if (name) frame.name = name;
        if (parentNode && 'appendChild' in parentNode) {
          (parentNode as any).appendChild(frame);
        }
      }
      if (layoutMode) frame.layoutMode = layoutMode;
      return { id: frame.id };
    }

    case 'moveToPage': {
      const { nodeId, pageId } = payload;
      const node = await figma.getNodeByIdAsync(nodeId);
      const page = await figma.getNodeByIdAsync(pageId);
      if (node && page && page.type === 'PAGE') {
        page.appendChild(node as SceneNode);
      }
      return { success: true };
    }

    case 'createComponent': {
      const { name, parentId } = payload;
      let parentNode = parentId ? await figma.getNodeByIdAsync(parentId) : figma.currentPage;
      let comp: ComponentNode | undefined;
      
      if (parentNode && 'children' in parentNode) {
         comp = (parentNode as any).children.find((c: any) => c.name === name && c.type === 'COMPONENT');
      }
      
      if (!comp) {
        comp = figma.createComponent();
        comp.name = name;
        if (parentNode && 'appendChild' in parentNode && parentNode.type !== 'PAGE') {
          (parentNode as any).appendChild(comp);
        }
      } else {
        for (const child of comp.children) {
           child.remove();
        }
      }
      return { id: comp.id };
    }

    case 'createText': {
      const { text, parentId } = payload;
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      const textNode = figma.createText();
      textNode.characters = text;
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && 'appendChild' in parent) {
          (parent as any).appendChild(textNode);
        }
      }
      return { id: textNode.id };
    }

    case 'findNode': {
      const { name, type } = payload;
      const node = figma.root.findOne(n => n.name === name && n.type === type);
      return { id: node ? node.id : null };
    }

    case 'createComponentSet': {
      const { name, componentIds } = payload;
      const components = await Promise.all(componentIds.map((id: string) => figma.getNodeByIdAsync(id)));
      
      const validComponents = components.filter((node): node is ComponentNode => node !== null && node.type === 'COMPONENT');
      
      if (validComponents.length > 0) {
        let componentSet: ComponentSetNode;
        if (validComponents[0].parent && validComponents[0].parent.type === 'COMPONENT_SET') {
           componentSet = validComponents[0].parent as ComponentSetNode;
        } else {
           componentSet = figma.combineAsVariants(validComponents, figma.currentPage);
        }
        componentSet.name = name;

        componentSet.layoutMode = 'NONE';
        
        let currentX = 24;
        let currentY = 24;
        let maxRowHeight = 0;
        let col = 0;
        const spacing = 8;
        const columns = 4;
        
        for (const child of validComponents) {
          child.x = currentX;
          child.y = currentY;
          maxRowHeight = Math.max(maxRowHeight, child.height);
          
          currentX += child.width + spacing;
          col++;
          if (col >= columns) {
            col = 0;
            currentX = 24;
            currentY += maxRowHeight + spacing;
            maxRowHeight = 0;
          }
        }
        
        // Final bounds padding
        let setWidth = 0;
        let setHeight = currentY + maxRowHeight + (maxRowHeight > 0 ? 24 : 0) - spacing; // -spacing avoids extra padding for last row
        if (col === 0 && maxRowHeight === 0) setHeight = currentY + 24 - spacing; 
        
        for (const child of validComponents) {
           setWidth = Math.max(setWidth, child.x + child.width);
        }
        componentSet.resize(setWidth + 24, setHeight);

        // White background
        componentSet.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        // Border radius to make it look nice (optional padding display)
        componentSet.cornerRadius = 8;

        return { id: componentSet.id };
      }
      return { id: null };
    }
    case 'addComponentProperty': {
      const { setId, propertyName, type, defaultValue } = payload;
      const set = await figma.getNodeByIdAsync(setId);
      if (!set || set.type !== 'COMPONENT_SET') throw new Error(`ComponentSet ${setId} not found`);
      
      // Check for existing property to avoid throwing
      const existing = Object.entries(set.componentPropertyDefinitions).find(([name, def]) => {
         return (name === propertyName || name.split('#')[0] === propertyName) && def.type === type;
      });
      if (existing) {
        return { propertyName: existing[0] };
      }

      // Coerce defaultValue to the correct JS type Figma expects
      let coercedDefault: any;
      if (type === 'BOOLEAN') {
        coercedDefault = defaultValue === true || defaultValue === 'true';
      } else if (type === 'INSTANCE_SWAP') {
        // INSTANCE_SWAP requires a component ID string or null; empty string causes error
        coercedDefault = (defaultValue && defaultValue !== '') ? defaultValue : null;
      } else {
        coercedDefault = defaultValue ?? '';
      }

      try {
        const propName = set.addComponentProperty(propertyName, type, coercedDefault);
        return { propertyName: propName };
      } catch (e: any) {
        const secondTry = Object.keys(set.componentPropertyDefinitions).find(n => n.split('#')[0] === propertyName);
        if (secondTry) return { propertyName: secondTry };
        throw e;
      }
    }

    case 'getComponentProperties': {
      const { setId } = payload;
      const set = await figma.getNodeByIdAsync(setId);
      if (!set || set.type !== 'COMPONENT_SET') throw new Error(`ComponentSet ${setId} not found`);
      // Return map of baseName -> hashedName for each property
      const props: Record<string, string> = {};
      for (const [hashedName] of Object.entries(set.componentPropertyDefinitions)) {
        const baseName = hashedName.split('#')[0];
        props[baseName] = hashedName;
      }
      return { properties: props };
    }

    case 'setAutoLayout': {
      const { nodeId, direction, gap, padding, alignment, counterAlignment, wrap, layoutSizingHorizontal, layoutSizingVertical } = payload;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error(`Node ${nodeId} not found`);
      
      if ('layoutMode' in node) {
        const n = node as FrameNode | ComponentNode | InstanceNode;
        if (direction) n.parent && (n.layoutMode = direction);
        else if (gap || padding || alignment || counterAlignment || wrap) {
           // If any layout props are provided but no direction, default to VERTICAL if it's currently NONE
           if (n.layoutMode === 'NONE') n.layoutMode = 'VERTICAL';
        }

        if (direction) n.layoutMode = direction;
        if (typeof gap !== 'undefined') n.itemSpacing = gap;
        if (padding) {
          if (typeof padding.top !== 'undefined') n.paddingTop = padding.top;
          if (typeof padding.bottom !== 'undefined') n.paddingBottom = padding.bottom;
          if (typeof padding.left !== 'undefined') n.paddingLeft = padding.left;
          if (typeof padding.right !== 'undefined') n.paddingRight = padding.right;
        }
        if (alignment) n.primaryAxisAlignItems = alignment;
        if (counterAlignment) n.counterAxisAlignItems = counterAlignment;
        if (typeof wrap !== 'undefined') n.layoutWrap = wrap ? 'WRAP' : 'NO_WRAP';
      }

      if (layoutSizingHorizontal && 'layoutSizingHorizontal' in node) {
        (node as any).layoutSizingHorizontal = layoutSizingHorizontal;
      }
      if (layoutSizingVertical && 'layoutSizingVertical' in node) {
        (node as any).layoutSizingVertical = layoutSizingVertical;
      }
      
      return { success: true };
    }

    case 'createSvgComponent': {
      const { name, svg } = payload;
      // Search entire document for a singleton named exactly 'name'
      let comp = figma.root.findAll(c => c.name === name && c.type === 'COMPONENT')[0] as ComponentNode;
      
      if (comp) {
        // Clear existing children
        for (const child of comp.children) child.remove();
      } else {
        comp = figma.createComponent();
        comp.name = name;
      }
      const node = figma.createNodeFromSvg(svg);
      comp.resize(node.width, node.height);
      for (const child of node.children) {
        comp.appendChild(child);
      }
      node.remove();
      return { id: comp.id };
    }

    case 'setNodePosition': {
      const { nodeId, x, y } = payload;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node && 'x' in node && 'y' in node) {
        node.x = x;
        node.y = y;
      }
      return { success: true };
    }

    case 'createInstance': {
      const { componentId, parentId } = payload;
      const comp = await figma.getNodeByIdAsync(componentId);
      if (!comp || comp.type !== 'COMPONENT') throw new Error(`Component ${componentId} not found`);
      const inst = (comp as ComponentNode).createInstance();
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && 'appendChild' in parent) {
          (parent as any).appendChild(inst);
        }
      }
      return { id: inst.id };
    }

    case 'deduplicateIcons': {
      console.log('Running Global Icon Deduplication Audit...');
      const iconComponents = figma.root.findAll(n => n.type === 'COMPONENT' && n.name.startsWith('icon=')) as ComponentNode[];
      const groups: Record<string, ComponentNode[]> = {};
      
      for (const comp of iconComponents) {
        if (!groups[comp.name]) groups[comp.name] = [];
        groups[comp.name].push(comp);
      }

      let iconSet = figma.root.findAll(n => n.type === 'COMPONENT_SET' && n.name === 'Icon')[0] as ComponentSetNode;
      let rewiredCount = 0;
      let deletedCount = 0;

      for (const [name, comps] of Object.entries(groups)) {
        if (comps.length <= 1) continue;

        // Determine Authority: preference for child of 'Icon' set, or first created
        let authority = comps.find(c => c.parent && c.parent.type === 'COMPONENT_SET' && c.parent.name === 'Icon');
        if (!authority) authority = comps[0];

        const nonAuthorities = comps.filter(c => c.id !== authority!.id);
        
        for (const na of nonAuthorities) {
          // Find all instances of this non-authority across document
          const instances = figma.root.findAll(n => n.type === 'INSTANCE' && n.mainComponent?.id === na.id) as InstanceNode[];
          for (const inst of instances) {
            inst.mainComponent = authority!;
            rewiredCount++;
          }
          na.remove();
          deletedCount++;
        }
      }

      return { rewiredCount, deletedCount };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
