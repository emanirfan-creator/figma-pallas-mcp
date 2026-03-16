import { figmaClient } from './client.js';

export async function createComponent(name: string): Promise<{ id: string }> {
  return figmaClient.requestFigmaAction('createComponent', { name });
}

export async function createInstance(componentId: string): Promise<{ id: string }> {
  return figmaClient.requestFigmaAction('createInstance', { componentId });
}

export async function createComponentSet(name: string, componentIds: string[]): Promise<{ id: string }> {
  return figmaClient.requestFigmaAction('createComponentSet', { name, componentIds });
}

export async function addComponentProperty(setId: string, propertyName: string, type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP', defaultValue: any): Promise<{ propertyName: string }> {
  return figmaClient.requestFigmaAction('addComponentProperty', { setId, propertyName, type, defaultValue });
}
