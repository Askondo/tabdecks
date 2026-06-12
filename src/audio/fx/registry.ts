import type { FxDescriptor } from './types';

const registry = new Map<string, FxDescriptor>();

export function registerFx(descriptor: FxDescriptor): void {
  if (registry.has(descriptor.id)) {
    throw new Error(`FX id already registered: ${descriptor.id}`);
  }
  registry.set(descriptor.id, descriptor);
}

export function getFxDescriptor(id: string): FxDescriptor | undefined {
  return registry.get(id);
}

export function listFx(): FxDescriptor[] {
  return [...registry.values()];
}

/** Test-only. */
export function clearFxRegistry(): void {
  registry.clear();
}
