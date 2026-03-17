import { figmaClient } from '../figma/client.js';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('Waiting for Figma plugin to connect...');
  await new Promise(r => setTimeout(r, 5000));
  try {
    const primitivesCollection = await figmaClient.requestFigmaAction('createVariableCollection', { name: "Primitives", modes: ['Base'] });
    const semanticsCollection = await figmaClient.requestFigmaAction('createVariableCollection', { name: "Semantics", modes: ['Light', 'Dark'] });

    const primModeId = primitivesCollection.modes[0].modeId;
    const lightModeId = semanticsCollection.modes.find((m: any) => m.name === 'Light').modeId;
    const darkModeId = semanticsCollection.modes.find((m: any) => m.name === 'Dark').modeId;

    const primitiveVars: Record<string, any> = {};
    const semanticVars: Record<string, any> = {};

    async function createPrim(group: string, name: string, type: 'COLOR'|'FLOAT'|'STRING', val: any) {
      const figmaName = `${group}/${name}`.replace(/\./g, '/');
      const { id } = await figmaClient.requestFigmaAction('createVariable', { collectionId: primitivesCollection.id, name: figmaName, type });
      await figmaClient.requestFigmaAction('setVariableValue', { variableId: id, modeId: primModeId, value: val });
      primitiveVars[`${group}.${name}`] = id;
      return id;
    }

    async function createSem(group: string, name: string, primitiveIdLight: string, primitiveIdDark?: string) {
      const figmaName = `${group}/${name}`.replace(/\./g, '/');
      const { id } = await figmaClient.requestFigmaAction('createVariable', { collectionId: semanticsCollection.id, name: figmaName, type: 'COLOR' });
      
      const aliasLight = await figmaClient.requestFigmaAction('createVariableAlias', { variableId: primitiveIdLight });
      await figmaClient.requestFigmaAction('setVariableValue', { variableId: id, modeId: lightModeId, value: aliasLight });
      
      const darkId = primitiveIdDark || primitiveIdLight;
      const aliasDark = await figmaClient.requestFigmaAction('createVariableAlias', { variableId: darkId });
      await figmaClient.requestFigmaAction('setVariableValue', { variableId: id, modeId: darkModeId, value: aliasDark });
      
      semanticVars[`${group}.${name}`] = id;
      return id;
    }

    function hexToRgba(hex: string, alpha: number = 1) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return { r, g, b, a: alpha };
    }

    console.log('Creating Primitive Variables...');
    await createPrim('radii', 'sm', 'FLOAT', 4);
    await createPrim('radii', 'md', 'FLOAT', 6);
    await createPrim('radii', 'lg', 'FLOAT', 8);
    await createPrim('radii', 'xl', 'FLOAT', 12);
    await createPrim('radii', '2xl', 'FLOAT', 16);
    await createPrim('radii', '4xl', 'FLOAT', 32);
    await createPrim('radii', 'full', 'FLOAT', 9999);
    
    await createPrim('sizes', 'controlHeight.sm', 'FLOAT', 28);
    await createPrim('sizes', 'controlHeight.md', 'FLOAT', 32);
    await createPrim('sizes', 'controlHeight.lg', 'FLOAT', 40);
    await createPrim('sizes', 'icon', 'FLOAT', 32);

    await createPrim('spacing', 'padding.inline.sm', 'FLOAT', 8);
    await createPrim('spacing', 'padding.inline.md', 'FLOAT', 12);
    await createPrim('spacing', 'padding.inline.lg', 'FLOAT', 16);
    await createPrim('spacing', 'padding.block.sm', 'FLOAT', 4);
    await createPrim('spacing', 'padding.block.md', 'FLOAT', 8);
    await createPrim('spacing', 'padding.block.lg', 'FLOAT', 12);
    await createPrim('spacing', 'zero', 'FLOAT', 0);
    await createPrim('radii', 'zero', 'FLOAT', 0);

    const colors = {
      blue500: '#1677ff', blue400: '#4096ff', blue600: '#0958d9',
      blue100: '#e6f4ff', blue200: '#bae0ff', blue300: '#91caff',
      white: '#ffffff', transparent: '#000000'
    };

    const neutralBase = '#000000';
    const alpha = {
      text: 0.88,
      textSecondary: 0.65,
      textTertiary: 0.45,
      textQuaternary: 0.25,
      fill: 0.15,
      fillSecondary: 0.06,
      border: 0.15,
      borderSecondary: 0.06,
      surfaceElevatedLight: 0.02, // Estimated for surface.elevated in Pallas
      surfaceElevatedDark: 0.08
    };

    await createPrim('colors', 'blue.500', 'COLOR', hexToRgba(colors.blue500));
    await createPrim('colors', 'blue.400', 'COLOR', hexToRgba(colors.blue400));
    await createPrim('colors', 'blue.600', 'COLOR', hexToRgba(colors.blue600));
    await createPrim('colors', 'blue.100', 'COLOR', hexToRgba(colors.blue100));
    await createPrim('colors', 'blue.200', 'COLOR', hexToRgba(colors.blue200));
    await createPrim('colors', 'blue.300', 'COLOR', hexToRgba(colors.blue300));
    await createPrim('colors', 'white', 'COLOR', hexToRgba(colors.white));
    await createPrim('colors', 'transparent', 'COLOR', hexToRgba(colors.transparent, 0));

    console.log('Creating Semantic Variables...');
    await createSem('colors', 'primary.DEFAULT', primitiveVars['colors.blue.500']);
    await createSem('colors', 'primary.hover', primitiveVars['colors.blue.400']);
    await createSem('colors', 'primary.active', primitiveVars['colors.blue.600']);
    await createSem('colors', 'primary.borderHover', primitiveVars['colors.blue.400']);
    await createSem('colors', 'primary.borderActive', primitiveVars['colors.blue.600']);
    await createSem('colors', 'primary.bg', primitiveVars['colors.blue.100']);
    await createSem('colors', 'primary.text', primitiveVars['colors.blue.500']);
    await createSem('colors', 'primary.bgHover', primitiveVars['colors.blue.200']);
    await createSem('colors', 'primary.textHover', primitiveVars['colors.blue.400']);
    await createSem('colors', 'primary.bgActive', primitiveVars['colors.blue.300']);
    await createSem('colors', 'primary.textActive', primitiveVars['colors.blue.600']);

    await createSem('colors', 'bgSolid.text', primitiveVars['colors.white']);
    
    // Alpha calculated neutrals
    await createPrim('colors', 'neutral.text', 'COLOR', hexToRgba(neutralBase, alpha.text));
    await createPrim('colors', 'neutral.textSecondary', 'COLOR', hexToRgba(neutralBase, alpha.textSecondary));
    await createPrim('colors', 'neutral.textTertiary', 'COLOR', hexToRgba(neutralBase, alpha.textTertiary));
    await createPrim('colors', 'neutral.border', 'COLOR', hexToRgba(neutralBase, alpha.border));
    await createPrim('colors', 'neutral.fillSecondary', 'COLOR', hexToRgba(neutralBase, alpha.fillSecondary));
    await createPrim('colors', 'neutral.surfaceElevated', 'COLOR', hexToRgba(neutralBase, alpha.surfaceElevatedLight));

    await createSem('colors', 'text.DEFAULT', primitiveVars['colors.neutral.text']);
    await createSem('colors', 'text.secondary', primitiveVars['colors.neutral.textSecondary']);
    await createSem('colors', 'text.tertiary', primitiveVars['colors.neutral.textTertiary']);
    await createSem('colors', 'border.DEFAULT', primitiveVars['colors.neutral.border']);
    await createSem('colors', 'fill.secondary', primitiveVars['colors.neutral.fillSecondary']);
    await createSem('colors', 'surface.elevated', primitiveVars['colors.neutral.surfaceElevated']);

    await createPrim('typography', 'fontSize.sm', 'FLOAT', 14);
    await createPrim('typography', 'fontSize.md', 'FLOAT', 16);

    console.log('Generating Icon component from lucide-static...');
    const { id: iconsPageId } = await figmaClient.requestFigmaAction('createPage', { name: 'Icons' });
    const svgPath = path.resolve(process.cwd(), 'node_modules/lucide-static/icons/star.svg');
    const svgIconCode = fs.readFileSync(svgPath, 'utf8');
    const { id: baseIconCompId } = await figmaClient.requestFigmaAction('createSvgComponent', { name: "icon=Star", svg: svgIconCode });
    
    // Convert to Icon Set to apply the 4-column matrix grid spacing
    const { id: iconSetId } = await figmaClient.requestFigmaAction('createComponentSet', { name: "Icon", componentIds: [baseIconCompId] });
    await figmaClient.requestFigmaAction('moveToPage', { nodeId: iconSetId, pageId: iconsPageId });

    console.log('Generating Input Component Matrix...');
    const stylings = ['outline', 'underlined', 'filled', 'borderless'];
    const sizes = ['sm', 'md', 'lg'];
    
    const componentIds: string[] = [];
    const allTextIds: string[] = [];
    const allIconInstIds: string[] = [];
    
    // Check if the Input component set already exists anywhere
    const { id: existingSetId } = await figmaClient.requestFigmaAction('findNode', { name: 'Input', type: 'COMPONENT_SET' });
    if (existingSetId) {
      console.log('Idempotent Execution: Using existing Input Component Set:', existingSetId);
    }

    for (const styling of stylings) {
      for (const size of sizes) {
        const { id: compId } = await figmaClient.requestFigmaAction('createComponent', { 
          name: `styling=${styling}, size=${size}`,
          parentId: existingSetId || undefined
        });
        
        // Input has Left Icon, Text Field, Right Icon
        const leftInstRes = await figmaClient.requestFigmaAction('createInstance', { componentId: baseIconCompId, parentId: compId });
        const leftIconInstId = leftInstRes.id;
        allIconInstIds.push(leftIconInstId);
        
        const res = await figmaClient.requestFigmaAction('createText', { text: 'Placeholder...', parentId: compId });
        const textNodeId = res.id;
        allTextIds.push(textNodeId);

        const rightInstRes = await figmaClient.requestFigmaAction('createInstance', { componentId: baseIconCompId, parentId: compId });
        const rightIconInstId = rightInstRes.id;
        allIconInstIds.push(rightIconInstId);

        const fontVarId = size === 'lg' ? primitiveVars['typography.fontSize.md'] : primitiveVars['typography.fontSize.sm'];
        await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: textNodeId, property: 'fontSize', variableId: fontVarId });

        await figmaClient.requestFigmaAction('setAutoLayout', {
          nodeId: compId,
          direction: 'HORIZONTAL',
          gap: 8, // {spacing.2}
          alignment: 'MIN',
          counterAlignment: 'CENTER'
        });
        
        // Let the text node fill the remaining horizontal space
        await figmaClient.requestFigmaAction('setAutoLayout', {
           nodeId: textNodeId,
           layoutSizingHorizontal: 'FILL'
        });

        // Size Dimensions
        const pYId = primitiveVars[`spacing.padding.block.${size}`];
        const pXId = primitiveVars[`spacing.padding.inline.${size}`];
        const heightId = primitiveVars[`sizes.controlHeight.${size}`];
        
        await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: compId, property: 'paddingTop', variableId: pYId });
        await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: compId, property: 'paddingBottom', variableId: pYId });
        await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: compId, property: 'paddingLeft', variableId: pXId });
        await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: compId, property: 'paddingRight', variableId: pXId });
        await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: compId, property: 'height', variableId: heightId });

        // Shape Dimensions (Defaulting to md radii)
        await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: compId, property: 'cornerRadius', variableId: primitiveVars['radii.md'] });

        // Apply Variants per Pallas UI Input Recipe
        let bgSemId, textSemId, borderSemId;
        textSemId = semanticVars['colors.text.secondary']; // Base color for all inputs

        if (styling === 'outline') {
          bgSemId = semanticVars['colors.surface.elevated'];
          borderSemId = semanticVars['colors.border.DEFAULT'];
        } else if (styling === 'filled') {
          bgSemId = semanticVars['colors.fill.secondary'];
          borderSemId = primitiveVars['colors.transparent'];
        } else if (styling === 'borderless') {
          bgSemId = primitiveVars['colors.transparent'];
          borderSemId = primitiveVars['colors.transparent'];
        } else if (styling === 'underlined') {
          bgSemId = primitiveVars['colors.transparent'];
          borderSemId = semanticVars['colors.border.DEFAULT'];
          await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: compId, property: 'cornerRadius', variableId: primitiveVars['radii.zero'] });
        }

        if (bgSemId) await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: compId, property: 'fills', variableId: bgSemId });
        if (textSemId) {
           await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: textNodeId, property: 'fills', variableId: textSemId });
           await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: leftIconInstId, property: 'fills', variableId: textSemId });
           await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: rightIconInstId, property: 'fills', variableId: textSemId });
        }

        if (borderSemId) {
          await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: compId, property: 'strokes', variableId: borderSemId });
        }

        componentIds.push(compId);
      }
    }

    console.log('Combining 12 components into ComponentSet...');
    
    // Find or create the set
    let setId = existingSetId;
    if (!setId) {
        const setRes = await figmaClient.requestFigmaAction('createComponentSet', { name: "Input", componentIds });
        setId = setRes.id;
    }
    
    await figmaClient.requestFigmaAction('setAutoLayout', {
      nodeId: setId, direction: 'HORIZONTAL', gap: 8, counterGap: 8, padding: { top: 24, bottom: 24, left: 24, right: 24 }, wrap: true, width: 900
    });
    const whiteBgId = primitiveVars['colors.white'];
    if (whiteBgId) {
      await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: setId, property: 'fills', variableId: whiteBgId });
    }

    console.log('Applying Component Properties...');

    // Always add/fetch properties using the idempotent addComponentProperty action,
    // which returns the real hashed name (e.g. "Show Left Icon#abc12"). We then
    // use those exact names for componentPropertyReferences assignment.
    const valueRes        = await figmaClient.requestFigmaAction('addComponentProperty', { setId, type: 'TEXT',          propertyName: 'Value',           defaultValue: 'Placeholder...' });
    const leftIconSwap    = await figmaClient.requestFigmaAction('addComponentProperty', { setId, type: 'INSTANCE_SWAP', propertyName: 'Left Icon',  defaultValue: baseIconCompId });
    const rightIconSwap   = await figmaClient.requestFigmaAction('addComponentProperty', { setId, type: 'INSTANCE_SWAP', propertyName: 'Right Icon', defaultValue: baseIconCompId });
    const showLeftIconRes = await figmaClient.requestFigmaAction('addComponentProperty', { setId, type: 'BOOLEAN',       propertyName: 'Show Left Icon',  defaultValue: 'false' });
    const showRightIconRes= await figmaClient.requestFigmaAction('addComponentProperty', { setId, type: 'BOOLEAN',       propertyName: 'Show Right Icon', defaultValue: 'false' });
    const showTextRes     = await figmaClient.requestFigmaAction('addComponentProperty', { setId, type: 'BOOLEAN',       propertyName: 'Show Text',       defaultValue: 'true' });

    console.log('Resolved property names:', {
      value: valueRes.propertyName,
      leftIconSwap: leftIconSwap.propertyName,
      rightIconSwap: rightIconSwap.propertyName,
      showLeftIcon: showLeftIconRes.propertyName,
      showRightIcon: showRightIconRes.propertyName,
      showText: showTextRes.propertyName
    });

    for (const textId of allTextIds) {
      try {
        await figmaClient.requestFigmaAction('assignMultipleComponentProperties', { 
          nodeId: textId, 
          properties: [
            { propertyName: valueRes.propertyName, targetField: 'characters' },
            { propertyName: showTextRes.propertyName, targetField: 'visible' }
          ] 
        });
      } catch (e: any) {
        console.error(`Failed to assign Text properties to text node: ${e.message}`);
      }
    }
    
    // Icon instances need to be batch assigned to avoid Component Property assignment collision.
    for (let i = 0; i < allIconInstIds.length; i += 2) {
      const leftId = allIconInstIds[i];
      const rightId = allIconInstIds[i+1];
      try {
        await figmaClient.requestFigmaAction('assignMultipleComponentProperties', {
          nodeId: leftId,
          properties: [
            { propertyName: leftIconSwap.propertyName, targetField: 'mainComponent' },
            { propertyName: showLeftIconRes.propertyName, targetField: 'visible' }
          ]
        });
        await figmaClient.requestFigmaAction('assignMultipleComponentProperties', {
          nodeId: rightId,
          properties: [
            { propertyName: rightIconSwap.propertyName, targetField: 'mainComponent' },
            { propertyName: showRightIconRes.propertyName, targetField: 'visible' }
          ]
        });
      } catch (e: any) {
        console.error(`Failed to assign Icon properties: ${e.message}`);
      }
    }
    
    console.log('Orchestrating Page Architecture...');
    const { id: pageId } = await figmaClient.requestFigmaAction('createPage', { name: 'Input' });
    const { id: lightTestPageId } = await figmaClient.requestFigmaAction('createPage', { name: 'Light Mode Testing' });
    const { id: darkTestPageId } = await figmaClient.requestFigmaAction('createPage', { name: 'Dark Mode Testing' });

    await figmaClient.requestFigmaAction('moveToPage', { nodeId: setId, pageId });

    console.log('Applying Explicit Variable Modes to Global Testing Pages...');
    await figmaClient.requestFigmaAction('setExplicitVariableMode', { nodeId: lightTestPageId, collectionId: semanticsCollection.id, modeId: lightModeId });
    await figmaClient.requestFigmaAction('setExplicitVariableMode', { nodeId: darkTestPageId, collectionId: semanticsCollection.id, modeId: darkModeId });

    console.log('Generating Quality Assurance Frames...');
    const { id: lightFrameId } = await figmaClient.requestFigmaAction('createFrame', { name: 'Input QA', parentId: lightTestPageId, layoutMode: 'HORIZONTAL' });
    const { id: darkFrameId } = await figmaClient.requestFigmaAction('createFrame', { name: 'Input QA', parentId: darkTestPageId, layoutMode: 'HORIZONTAL' });

    await figmaClient.requestFigmaAction('setNodePosition', { nodeId: lightFrameId, x: 100, y: 100 });
    await figmaClient.requestFigmaAction('setNodePosition', { nodeId: darkFrameId, x: 100, y: 100 });

    for (const frameId of [lightFrameId, darkFrameId]) {
      await figmaClient.requestFigmaAction('setAutoLayout', { nodeId: frameId, direction: 'HORIZONTAL', gap: 16, padding: { top: 32, bottom: 32, left: 32, right: 32 } });
    }
    
    // Testing Backgrounds should pull from semantic colors to properly simulate Token Mode flipping
    const bgTokenId = semanticVars['colors.fill.secondary'];
    
    if (bgTokenId) { 
       await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: lightFrameId, property: 'fills', variableId: bgTokenId });
       await figmaClient.requestFigmaAction('setBoundVariable', { nodeId: darkFrameId, property: 'fills', variableId: bgTokenId });
    }

    for (const frameId of [lightFrameId, darkFrameId]) {
      // Outline input
      await figmaClient.requestFigmaAction('createInstance', { componentId: componentIds[1], parentId: frameId });
      // Filled input
      await figmaClient.requestFigmaAction('createInstance', { componentId: componentIds[7], parentId: frameId });
    }
    
    console.log('Successfully configured Pallas UI Input at node id:', setId);

    process.exit(0);
  } catch (err) {
    console.error('Failed to sync Input:', err);
  }
}

main();
