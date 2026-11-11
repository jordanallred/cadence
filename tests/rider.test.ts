import { it, expect } from "vitest";
import { selectRider, type RawFrame } from "../src/analysis/rider";
import { measureClip } from "../src/analysis/metrics";
import type { Point } from "../src/domain/types";
// SYNTHETIC: a pedaling rider (front view) plus other people in the shot.
const pose = (cx: number, scale: number, ankleY: number): Point[] =>
  Array.from({ length: 33 }, (_, j) => ({
    x: cx + scale * (j % 2 ? -0.05 : 0.05),
    y: j >= 27 ? ankleY : 0.5 + scale * (j >= 25 ? 0.1 : j >= 23 ? -0.1 : -0.3),
    visibility: 1,
  }));
const rider = (n: number) =>
  pose(0.5, 1, 0.72 + 0.09 * Math.sin((n * Math.PI) / 5));
const frames = (extra: (n: number) => Point[][]): RawFrame[] =>
  Array.from({ length: 150 }, (_, n) => ({
    timeMs: n * 100,
    poses: [...extra(n), rider(n)],
  }));

it("follows the rider past a life-size poster (#10)", () => {
  // The poster is listed first and is large, as a cut-out can be.
  const out = selectRider(frames(() => [pose(0.15, 1.1, 0.8)]));
  expect(out.every((f) => f.points[0].x > 0.4)).toBe(true);
  expect(out.every((f) => f.people === 2)).toBe(true);
  const r = measureClip(out, "front", 1920, 1080);
  expect(r.quality.some((q) => q.severity === "reject")).toBe(false);
  expect(r.metrics.find((m) => m.id === "cycles")!.value).toBeGreaterThan(10);
});

it("ignores someone walking past", () => {
  const out = selectRider(
    frames((n) =>
      n >= 40 && n < 60
        ? [pose(0.1 + (n - 40) * 0.04, 1, 0.7 + 0.05 * (n % 2))]
        : [],
    ),
  );
  // Even while the walker crosses the rider, the rider's pose is kept.
  expect(out.every((f) => Math.abs(f.points[0].x - 0.55) < 0.01)).toBe(true);
});

it("keeps every frame of a rider alone in the shot", () => {
  const out = selectRider(frames(() => []));
  expect(out.every((f) => f.points.length === 33 && f.people === 1)).toBe(true);
});
