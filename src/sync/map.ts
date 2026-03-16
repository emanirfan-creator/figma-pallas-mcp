import fs from 'fs/promises';

export interface DesignMap {
  tokens: Record<string, any>;
  components: Record<string, any>;
}

export async function readMap(mapFilePath: string): Promise<DesignMap> {
  try {
    const data = await fs.readFile(mapFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { tokens: {}, components: {} };
    throw e;
  }
}

export async function writeMap(mapFilePath: string, entries: Partial<DesignMap>): Promise<void> {
  const currentMap = await readMap(mapFilePath);
  const updated = {
    tokens: { ...currentMap.tokens, ...entries.tokens },
    components: { ...currentMap.components, ...entries.components }
  };
  
  const tempPath = `${mapFilePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(updated, null, 2));
  await fs.rename(tempPath, mapFilePath);
}

export async function diffMap(mapFilePath: string, currentFigmaState: any, currentCodeState: any): Promise<any> {
  // Compare figma, code, and map to produce diffs
  return {
    code_ahead: [],
    figma_ahead: [],
    conflicts: []
  };
}
