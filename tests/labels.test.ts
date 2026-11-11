import { it, expect } from "vitest";
import {
  overlapping,
  placeLabels,
  traceFrame,
} from "../src/features/report/labels";
import type { Point } from "../src/domain/types";

// REAL: landmarks of a forward-leaning rider at full leg extension, from
// tests/e2e/videos/side-trainer.mp4 (360 × 254), and that clip's metrics.
// On this frame the shoulder and torso labels used to land on each other.
const real: Record<number, [number, number]> = {
  11: [0.2589, 0.2421],
  13: [0.2109, 0.3908],
  15: [0.1589, 0.4855],
  23: [0.3844, 0.4508],
  25: [0.3279, 0.6555],
  27: [0.3339, 0.8664],
};
const metrics: Record<string, number> = {
  "knee-min": 23.7,
  "knee-max": 104,
  torso: 48.2,
  hip: 69.3,
  elbow: 16.2,
  "shoulder-angle": 67,
};
const points: Point[] = Array.from({ length: 33 }, (_, j) => ({
  x: real[j]?.[0] ?? 0,
  y: real[j]?.[1] ?? 0,
  visibility: real[j] ? 0.99 : 0,
}));

for (const [W, H] of [
  [360, 254],
  [1920, 1355],
]) {
  // Smallest text (large screen), and 13 px text on a 358 px wide phone.
  for (const font of [W * 0.022, (13 * W) / 358]) {
    it(`no labels overlap at ${W}px wide, ${Math.round(font)}px text`, () => {
      const t = traceFrame(
        points,
        "left",
        "extension",
        (id) => metrics[id],
        W,
        H,
      );
      expect(t.angles.map((a) => a.name)).toEqual([
        "Knee",
        "Elbow",
        "Torso",
        "Shoulder",
      ]);
      const labels = placeLabels(t.angles, t.limbs, W, H, font);
      expect(overlapping(labels)).toEqual([]);
      for (const l of labels) {
        // Inside the frame, and close enough to read as its own angle.
        expect(l.x - l.half).toBeGreaterThanOrEqual(0);
        expect(l.x + l.half).toBeLessThanOrEqual(W);
        expect(l.y - l.halfHeight).toBeGreaterThanOrEqual(0);
        expect(l.y + l.halfHeight).toBeLessThanOrEqual(H);
        expect(Math.hypot(l.x - l.a.at.x, l.y - l.a.at.y)).toBeLessThan(
          Math.max(W, H) * 0.35,
        );
      }
    });
  }
}
