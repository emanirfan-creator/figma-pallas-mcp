import fs from 'fs/promises';

export async function readTokens(tokensFilePath: string): Promise<any> {
  try {
    const data = await fs.readFile(tokensFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

export async function writeToken(tokensFilePath: string, tokenPath: string, value: any): Promise<void> {
  const tokens = await readTokens(tokensFilePath);

  const keys = tokenPath.split('.');
  let current = tokens;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;

  const tempPath = `${tokensFilePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(tokens, null, 2));
  await fs.rename(tempPath, tokensFilePath);
}
