import { describe, expect, it } from 'vitest';
import { defaultSettings, migrate } from '../../src/settings/storage';

describe('settings migration', () => {
  it('returns defaults for undefined / junk', () => {
    expect(migrate(undefined)).toEqual(defaultSettings());
    expect(migrate(42)).toEqual(defaultSettings());
    expect(migrate({ v: 99 })).toEqual(defaultSettings());
  });

  it('migrates a v1 blob, preserving known fields and adding v2 defaults', () => {
    const v1 = {
      v: 1,
      master: 0.8,
      decks: { A: { trim: 1.5, brakeTime: 1.2, sliceMs: 250 }, B: { trim: 1, brakeTime: 0.8, sliceMs: 125 } },
    };
    const out = migrate(v1);
    expect(out.v).toBe(2);
    expect(out.master).toBe(0.8);
    expect(out.decks.A.trim).toBe(1.5);
    expect(out.decks.A.brakeTime).toBe(1.2);
    expect(out.decks.A.keylock).toBe(false); // new field defaulted
    expect(out.quantize.enabled).toBe(false);
    expect(out.sync.maxDev).toBe(0.08);
    expect(out.link.autoconnect).toBe(false);
  });

  it('deep-merges new fields onto an older v2 blob', () => {
    const partialV2 = {
      v: 2,
      master: 1,
      decks: { A: { trim: 1, brakeTime: 0.8, sliceMs: 125, keylock: true }, B: { trim: 1, brakeTime: 0.8, sliceMs: 125, keylock: false } },
      quantize: { enabled: true, quantumBeats: 4 }, // missing `actions`
      sync: {},
      link: {},
    };
    const out = migrate(partialV2);
    expect(out.quantize.enabled).toBe(true);
    expect(out.quantize.quantumBeats).toBe(4);
    expect(out.quantize.actions).toEqual({ gestures: true, transport: true, fx: true, cuts: true });
    expect(out.decks.A.keylock).toBe(true);
    expect(out.sync.maxDev).toBe(0.08);
  });
});
