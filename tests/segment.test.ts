import { it, expect } from "vitest";
import { pickSegment, SCAN_HZ } from "../src/analysis/segment";
import type { PoseFrame } from "../src/domain/types";
// SYNTHETIC: a rider who is off the bike (hidden), then mounts (erratic
// legs), pedals steadily, then stops and dismounts.
function session(
  phases: { seconds: number; kind: "away" | "mount" | "pedal" | "still" }[],
) {
  const frames: PoseFrame[] = [];
  let t = 0;
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const p of phases)
    for (let n = 0; n < p.seconds * SCAN_HZ; n++, t += 1000 / SCAN_HZ) {
      const vis = p.kind === "away" ? 0.1 : 0.9;
      const ankleY =
        p.kind === "pedal"
          ? 0.75 + 0.08 * Math.sin((2 * Math.PI * 1.45 * t) / 1000)
          : p.kind === "mount"
            ? 0.6 + 0.3 * rand()
            : 0.8;
      frames.push({
        timeMs: Math.round(t),
        people: 1,
        points: Array.from({ length: 33 }, (_, j) => ({
          x: 0.5,
          y: j === 27 || j === 28 ? ankleY : 0.4,
          visibility: vis,
        })),
      });
    }
  return { frames, duration: t / 1000 };
}
it("finds the steady pedaling between getting on and off", () => {
  const { frames, duration } = session([
    { seconds: 4, kind: "away" },
    { seconds: 5, kind: "mount" },
    { seconds: 25, kind: "pedal" },
    { seconds: 3, kind: "still" },
    { seconds: 5, kind: "mount" },
  ]);
  const s = pickSegment(frames, "left", duration)!;
  expect(s).not.toBeNull();
  expect(s.start).toBeGreaterThanOrEqual(9);
  expect(s.end).toBeLessThanOrEqual(34);
  expect(s.end - s.start).toBe(20);
});
it("uses a shorter window when pedaling is brief", () => {
  const { frames, duration } = session([
    { seconds: 5, kind: "mount" },
    { seconds: 11, kind: "pedal" },
    { seconds: 5, kind: "mount" },
  ]);
  const s = pickSegment(frames, "front", duration)!;
  expect(s.end - s.start).toBeGreaterThanOrEqual(8);
  expect(s.start).toBeGreaterThanOrEqual(4);
  expect(s.end).toBeLessThanOrEqual(17);
});
it("returns nothing when there is no steady pedaling", () => {
  const { frames, duration } = session([
    { seconds: 10, kind: "mount" },
    { seconds: 10, kind: "still" },
  ]);
  expect(pickSegment(frames, "left", duration)).toBeNull();
});
it("leaves out sitting still before pedaling (#14)", () => {
  // Hands-free recording: the rider sits on the bike, still, then pedals.
  const { frames, duration } = session([
    { seconds: 6, kind: "still" },
    { seconds: 15, kind: "pedal" },
  ]);
  const s = pickSegment(frames, "left", duration)!;
  expect(s).not.toBeNull();
  expect(s.start).toBeGreaterThanOrEqual(5.6);
  expect(s.start).toBeLessThanOrEqual(6.2);
  expect(s.end).toBeGreaterThan(19.5);
});
it("leaves out stopping at the end", () => {
  const { frames, duration } = session([
    { seconds: 14, kind: "pedal" },
    { seconds: 6, kind: "still" },
  ]);
  const s = pickSegment(frames, "left", duration)!;
  expect(s.start).toBeLessThanOrEqual(0.5);
  expect(s.end).toBeLessThanOrEqual(14.4);
  expect(s.end).toBeGreaterThanOrEqual(13);
});
