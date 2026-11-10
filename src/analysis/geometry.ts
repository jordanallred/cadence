import type { Point } from "../domain/types";
export function angle(
  a: Point,
  b: Point,
  c: Point,
  w: number,
  h: number,
): number | null {
  const u = [(a.x - b.x) * w, (a.y - b.y) * h],
    v = [(c.x - b.x) * w, (c.y - b.y) * h];
  const d = Math.hypot(...u) * Math.hypot(...v);
  if (d < 1e-8 || !Number.isFinite(d)) return null;
  return (
    (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / d))) *
      180) /
    Math.PI
  );
}
export function quantile(values: number[], q: number) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length
    ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * q))]
    : 0;
}
/**
 * Removes landmark jitter: a 3-sample running median (drops single-frame
 * spikes) followed by a 3-sample [1,2,1] average. NaN samples are skipped.
 */
export function smoothSeries(values: number[], average = true): number[] {
  const med = values.map((v, n) => {
    const w = values.slice(Math.max(0, n - 1), n + 2).filter(Number.isFinite);
    if (!w.length) return v;
    w.sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
  if (!average) return med;
  const weights = [1, 2, 1];
  return med.map((v, n) => {
    let sum = 0,
      total = 0;
    for (let k = -1; k <= 1; k++) {
      const x = med[n + k];
      if (x === undefined || !Number.isFinite(x)) continue;
      sum += x * weights[k + 1];
      total += weights[k + 1];
    }
    return total ? sum / total : v;
  });
}
