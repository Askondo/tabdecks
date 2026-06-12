import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearFxRegistry,
  getFxDescriptor,
  listFx,
  registerFx,
} from '../../src/audio/fx/registry';
import type { FxDescriptor } from '../../src/audio/fx/types';

function fakeFx(id: string): FxDescriptor {
  return { id, name: id.toUpperCase(), params: [], create: () => ({}) as never };
}

beforeEach(() => clearFxRegistry());

describe('fx registry', () => {
  it('registers and resolves descriptors', () => {
    registerFx(fakeFx('echo'));
    expect(getFxDescriptor('echo')?.name).toBe('ECHO');
    expect(getFxDescriptor('nope')).toBeUndefined();
  });

  it('lists in registration order', () => {
    registerFx(fakeFx('echo'));
    registerFx(fakeFx('flanger'));
    expect(listFx().map((f) => f.id)).toEqual(['echo', 'flanger']);
  });

  it('rejects duplicate ids', () => {
    registerFx(fakeFx('echo'));
    expect(() => registerFx(fakeFx('echo'))).toThrow(/already registered/);
  });
});
