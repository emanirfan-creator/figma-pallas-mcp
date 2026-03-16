import { figmaClient } from './client.js';

export async function createVariable(name: string, collectionId: string, type: 'COLOR' | 'FLOAT' | 'STRING'): Promise<{ id: string, key: string }> {
  return figmaClient.requestFigmaAction('createVariable', { name, collectionId, type });
}

export async function setVariableValue(variableId: string, modeId: string, value: any): Promise<void> {
  await figmaClient.requestFigmaAction('setVariableValue', { variableId, modeId, value });
}

export async function createVariableAlias(variableId: string): Promise<any> {
  return figmaClient.requestFigmaAction('createVariableAlias', { variableId });
}

export async function setBoundVariable(nodeId: string, property: string, variableId: string): Promise<void> {
  await figmaClient.requestFigmaAction('setBoundVariable', { nodeId, property, variableId });
}
