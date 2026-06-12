// Pure gain/curve math — no Web Audio types (unit-tested in node).

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Equal-power crossfade pair for position x ∈ [0,1].
 * x=0 → full A, x=1 → full B. Invariant: a² + b² = 1 (no center dip).
 */
export function equalPowerPair(x: number): [a: number, b: number] {
  const t = (clamp01(x) * Math.PI) / 2;
  return [Math.cos(t), Math.sin(t)];
}

/**
 * Deck fader law: quadratic taper — fine control near the bottom,
 * unity at the top. x ∈ [0,1] → gain ∈ [0,1].
 */
export function faderGain(x: number): number {
  const c = clamp01(x);
  return c * c;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(gain);
}
