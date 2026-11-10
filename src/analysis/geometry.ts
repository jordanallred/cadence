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
