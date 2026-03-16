import fs from 'fs/promises';

export async function readRecipe(recipeFilePath: string): Promise<any> {
  try {
    const data = await fs.readFile(recipeFilePath, 'utf-8');
    // Assuming JSON or AST-parsed map for MCP interaction
    return JSON.parse(data);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

export async function writeRecipe(recipeFilePath: string, patch: any): Promise<void> {
  const recipe = await readRecipe(recipeFilePath);
  const updated = { ...recipe, ...patch };
  
  const tempPath = `${recipeFilePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(updated, null, 2));
  await fs.rename(tempPath, recipeFilePath);
}
