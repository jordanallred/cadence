import type { PoseFrame, View } from "../domain/types";
import { quantile } from "./geometry";

/** Sampling rate for the quick scan that finds steady pedaling. */
export const SCAN_HZ = 5;
export const SCAN_MAX_SECONDS = 180;

export interface Segment {
  start: number;
  end: number;
}

/**
 * Find the best stretch of steady pedaling in a quick, low-rate pose scan,
 * so riders can start recording, get on the bike, pedal, and get off
 * without trimming by hand.
 *
 * A window qualifies when the rider's joints are visible and the ankle keeps
 * moving through a similar range in every 2-second slice: getting on or off
 * the bike, coasting and standing still all break that pattern. Longer
 * windows win (up to `maxLength`), then steadier ones. The ankle must also
 * move periodically (pedaling repeats every 0.4–2.5 s), which random leg
 * movement does not.
 */
export function pickSegment(
  frames: PoseFrame[],
  view: View,
  duration: number,
  maxLength = 20,
  minLength = 8,
): Segment | null {
  if (!frames.length || duration < minLength) return null;
  const off = view === "right" ? 1 : 0;
  const required =
    view === "left" || view === "right"
      ? [11 + off, 23 + off, 25 + off, 27 + off]
      : [23, 24, 25, 26, 27, 28];
  const ankle = 27 + off;
  const visible = (f: PoseFrame) =>
    f.people === 1 &&
    required.every((j) => (f.points[j]?.visibility ?? 0) >= 0.5);
  const within = (a: number, b: number) =>
    frames.filter((f) => f.timeMs >= a * 1000 && f.timeMs < b * 1000);
  let best: (Segment & { score: number }) | null = null;
  for (
    let length = Math.min(maxLength, Math.floor(duration));
    length >= minLength;
    length -= 2
  ) {
    for (let s = 0; s + length <= duration + 1e-6; s += 0.5) {
      const win = within(s, s + length);
      if (win.length < length * SCAN_HZ * 0.6) continue;
      const vis = win.filter(visible).length / win.length;
      if (vis < 0.85) continue;
      const ranges: number[] = [];
      for (let c = s; c + 2 <= s + length + 1e-6; c += 2) {
        const ys = within(c, c + 2)
          .filter(visible)
          .map((f) => f.points[ankle].y);
        ranges.push(
          ys.length >= 4 ? quantile(ys, 0.95) - quantile(ys, 0.05) : 0,
        );
      }
      const mid = quantile(ranges, 0.5);
      if (mid < 0.02 || ranges.some((r) => r < 0.75 * mid || r > 1.33 * mid))
        continue;
      // Both halves must repeat, so a window cannot straddle mounting.
      const ys = win.filter(visible).map((f) => f.points[ankle].y);
      const half = Math.floor(ys.length / 2);
      if (
        periodicity(ys) < 0.6 ||
        periodicity(ys.slice(0, half)) < 0.45 ||
        periodicity(ys.slice(half)) < 0.45
      )
        continue;
      const mean = ranges.reduce((a, b) => a + b, 0) / ranges.length;
      const cv =
        Math.sqrt(
          ranges.reduce((a, b) => a + (b - mean) ** 2, 0) / ranges.length,
        ) / mean;
      const score = vis - cv;
      if (!best || score > best.score)
        best = { start: s, end: Math.min(duration, s + length), score };
    }
    if (best) return { start: best.start, end: best.end };
  }
  return null;
}

/** Highest autocorrelation for lags of 0.4–2.5 s: near 1 for pedaling. */
export function periodicity(ys: number[]): number {
  const n = ys.length;
  if (n < 10) return 0;
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  const d = ys.map((y) => y - mean);
  const energy = d.reduce((a, b) => a + b * b, 0);
  if (energy <= 0) return 0;
  let best = 0;
  const lo = Math.max(2, Math.round(0.4 * SCAN_HZ)),
    hi = Math.min(Math.floor(n / 2), Math.round(2.5 * SCAN_HZ));
  for (let lag = lo; lag <= hi; lag++) {
    let sum = 0;
    for (let k = 0; k + lag < n; k++) sum += d[k] * d[k + lag];
    best = Math.max(best, sum / energy);
  }
  return best;
}
