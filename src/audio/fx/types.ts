// FX plugin contract. Every insert FX implements FxDescriptor + FxInstance;
// see docs/architecture.md and src/audio/fx/wrapper.ts for the standard shell.

export interface FxParamSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  unit?: string; // 'ms' | '%' | 'Hz' | …
  scale?: 'linear' | 'log';
  /** momentary = press-and-hold; enum = discrete choices */
  kind?: 'continuous' | 'momentary' | 'enum';
  enumValues?: Array<{ value: number; label: string }>;
}

export interface FxDescriptor {
  id: string;
  name: string;
  params: FxParamSpec[];
  /** Extension-relative worklet URLs; the engine addModule()s these (deduped) before create(). */
  workletModules?: string[];
  /** Must be synchronous once workletModules are loaded. */
  create(ctx: BaseAudioContext): FxInstance;
}

export interface FxInstance {
  /** Connect upstream here. */
  readonly input: GainNode;
  /** Connect this downstream. */
  readonly output: GainNode;
  setParam(id: string, value: number): void;
  /** mix ∈ [0,1], equal-power dry/wet. */
  setWet(mix: number): void;
  /** Click-free; the wet path keeps processing so tails survive re-enable.
   *  atTime: optional AudioContext time for quantized toggles. */
  setBypass(bypassed: boolean, atTime?: number): void;
  /** Hard disconnect of internals — instance is dead afterwards. */
  dispose(): void;
}
