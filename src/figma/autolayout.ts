import { figmaClient } from './client.js';

export interface AutoLayoutOptions {
  direction?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  gap?: number;
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  alignment?: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN' | 'BASELINE';
  wrap?: boolean;
}

export async function addAutoLayout(nodeId: string, options: AutoLayoutOptions): Promise<void> {
  await figmaClient.requestFigmaAction('setAutoLayout', {
    nodeId,
    direction: options.direction,
    gap: options.gap,
    padding: options.padding,
    alignment: options.alignment,
    wrap: options.wrap
  });
}
