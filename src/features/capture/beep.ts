let ctx: AudioContext | null = null;
/** Short tone so a rider on the bike knows when recording starts and stops. */
export function beep(frequency = 880, ms = 150, volume = 0.25) {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
  } catch {
    // Sound is a convenience; recording works without it.
  }
}
