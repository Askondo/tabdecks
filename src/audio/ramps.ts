// Click-free parameter changes. ALL audible param writes go through here —
// raw `param.value =` causes zipper noise. See docs/api/webaudio_notes.md.

/** Time constants (seconds) per control class. ~3τ ≈ settle time. */
export const RAMP = {
  /** faders, crossfader, trim */
  fader: 0.008,
  /** EQ band gains / kills */
  eq: 0.015,
  /** FX wet/dry and bypass crossfades */
  fx: 0.02,
} as const;

export function rampTo(
  ctx: BaseAudioContext,
  param: AudioParam,
  value: number,
  tau: number = RAMP.fader,
): void {
  param.setTargetAtTime(value, ctx.currentTime, tau);
}
