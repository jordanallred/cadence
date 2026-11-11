import { it, expect } from "vitest";
import { measureClip } from "../src/analysis/metrics";
it("flags compressed portrait footage without discarding otherwise usable motion", () => {
  const result = measureClip(syntheticFrames(), "front", 320, 568);
  expect(
    result.quality.some(
      (q) => q.code === "resolution" && q.severity === "warning",
    ),
  ).toBe(true);
  expect(result.metrics.length).toBeGreaterThan(0);
});
import type { PoseFrame } from "../src/domain/types";
export function syntheticFrames(): PoseFrame[] {
  return Array.from({ length: 150 }, (_, n) => ({
    timeMs: n * 100,
    people: 1,
    points: Array.from({ length: 33 }, (_, j) => ({
      x: j % 2 ? 0.45 : 0.55,
      y:
        j >= 27
          ? 0.72 + 0.09 * Math.sin((n * Math.PI) / 5)
          : j >= 25
            ? 0.6
            : j >= 23
              ? 0.4
              : 0.2,
      visibility: 1,
    })),
  }));
}
it("rejects an empty recording", () =>
  expect(
    measureClip([], "left", 1920, 1080).quality.some(
      (x) => x.severity === "reject",
    ),
  ).toBe(true));
it("measures the rider when someone else is in the shot, with a note", () => {
  const q = measureClip(
    syntheticFrames().map((f) => ({ ...f, people: 2 })),
    "front",
    1920,
    1080,
  ).quality;
  expect(q.some((x) => x.severity === "reject")).toBe(false);
  expect(q.find((x) => x.code === "people")?.severity).toBe("warning");
});
it("rejects hidden required joints", () =>
  expect(
    measureClip(
      syntheticFrames().map((f) => ({
        ...f,
        points: f.points.map((p) => ({ ...p, visibility: 0.1 })),
      })),
      "left",
      1920,
      1080,
    ).metrics,
  ).toEqual([]));
it("static posture cannot supply repeated cycling metrics", () =>
  expect(
    measureClip(
      syntheticFrames().map((f) => ({
        ...f,
        points: syntheticFrames()[0].points,
      })),
      "left",
      1920,
      1080,
    ).quality.some((x) => x.code === "cycles"),
  ).toBe(true));
it("summarizes repeated projected front motion", () =>
  expect(
    measureClip(syntheticFrames(), "front", 1920, 1080).metrics.some(
      (x) => x.id === "pelvic-rock",
    ),
  ).toBe(true));
