import { it, expect } from "vitest";
import { measureClip } from "../src/analysis/metrics";
import type { PoseFrame } from "../src/domain/types";
// SYNTHETIC FIXTURE: a planar two-link leg pedaling a crank with known
// geometry. It checks the measurement pipeline against exact ground truth;
// it says nothing about pose-model accuracy on real riders.
const W = 1000,
  H = 1000;
function rider(opts: {
  hip?: [number, number];
  thigh?: number;
  noise?: number;
  rpm?: number;
  seconds?: number;
}) {
  const [hx, hy] = opts.hip ?? [0.42, 0.36],
    L = opts.thigh ?? 0.248,
    bb = [0.5, 0.74],
    crank = 0.085,
    rpm = opts.rpm ?? 85,
    hz = 30,
    seconds = opts.seconds ?? 12;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  const jitter = () => (opts.noise ?? 0) * rand() * 2;
  let truthMin = 180;
  const frames: PoseFrame[] = [];
  for (let n = 0; n < seconds * hz; n++) {
    const t = n / hz,
      phi = (2 * Math.PI * rpm * t) / 60;
    const ax = bb[0] + crank * Math.cos(phi),
      ay = bb[1] + crank * Math.sin(phi);
    const dx = ax - hx,
      dy = ay - hy,
      d = Math.hypot(dx, dy);
    // Knee sits forward (+x) of the hip-ankle line.
    const a = Math.acos(Math.min(1, d / 2 / L)),
      base = Math.atan2(dy, dx),
      kx = hx + L * Math.cos(base - a),
      ky = hy + L * Math.sin(base - a);
    const interior = Math.acos(
      Math.max(-1, Math.min(1, (2 * L * L - d * d) / (2 * L * L))),
    );
    truthMin = Math.min(truthMin, 180 - (interior * 180) / Math.PI);
    const pts = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 0.4,
    }));
    const set = (j: number, x: number, y: number) =>
      (pts[j] = { x: x + jitter(), y: y + jitter(), visibility: 0.95 });
    set(11, hx + 0.2, hy - 0.16);
    set(13, hx + 0.3, hy - 0.04);
    set(15, hx + 0.4, hy - 0.02);
    set(23, hx, hy);
    set(25, kx, ky);
    set(27, ax, ay);
    set(31, ax + 0.05, ay + 0.01);
    frames.push({ timeMs: Math.round(t * 1000), people: 1, points: pts });
  }
  return { frames, truthMin };
}
const metric = (f: PoseFrame[], id: string) =>
  measureClip(f, "left", W, H).metrics.find((m) => m.id === id);
it("recovers knee extension from an exact synthetic pedal stroke", () => {
  const { frames, truthMin } = rider({});
  const m = metric(frames, "knee-min");
  expect(m).toBeDefined();
  expect(truthMin).toBeGreaterThan(20);
  expect(Math.abs(m!.value - truthMin)).toBeLessThan(1);
});
it("stays within 1.5° under landmark jitter", () => {
  const { frames, truthMin } = rider({ noise: 0.004 });
  expect(Math.abs(metric(frames, "knee-min")!.value - truthMin)).toBeLessThan(
    1.5,
  );
});
it("tracks a saddle height change in the right direction", () => {
  const low = metric(rider({ hip: [0.42, 0.37] }).frames, "knee-min")!.value,
    high = metric(rider({ hip: [0.42, 0.35] }).frames, "knee-min")!.value;
  expect(high).toBeLessThan(low);
});
it("estimates cadence", () =>
  expect(metric(rider({ rpm: 90 }).frames, "cadence")!.value).toBeCloseTo(
    90,
    -1,
  ));
it("adds ankle, elbow and shoulder measurements when visible", () => {
  const ids = measureClip(rider({}).frames, "left", W, H).metrics.map(
    (m) => m.id,
  );
  for (const id of [
    "ankle-bdc",
    "ankle-rom",
    "elbow",
    "shoulder-angle",
    "kops",
  ])
    expect(ids).toContain(id);
});
const flexAt = (f: PoseFrame) => {
  const [h, k, a] = [23, 25, 27].map((j) => f.points[j]);
  const v1 = [(h.x - k.x) * W, (h.y - k.y) * H],
    v2 = [(a.x - k.x) * W, (a.y - k.y) * H];
  const inside =
    (Math.acos(
      (v1[0] * v2[0] + v1[1] * v2[1]) / Math.hypot(...v1) / Math.hypot(...v2),
    ) *
      180) /
    Math.PI;
  return 180 - inside;
};
it("picks report frames at full extension and at the top of the stroke", () => {
  const { frames, truthMin } = rider({});
  const { keyframes, metrics } = measureClip(frames, "left", W, H);
  const at = (p: string) =>
    frames.find(
      (x) => x.timeMs === keyframes!.find((k) => k.position === p)!.timeMs,
    )!;
  // Sampled at 30 Hz, so within a frame of the true extremes.
  expect(Math.abs(flexAt(at("extension")) - truthMin)).toBeLessThan(2);
  const top = metrics.find((m) => m.id === "knee-max")!.value;
  expect(Math.abs(flexAt(at("top")) - top)).toBeLessThan(2);
});
it("saves no report frames when a clip is rejected", () => {
  const { frames } = rider({ seconds: 2 });
  expect(measureClip(frames, "left", W, H).keyframes).toBeUndefined();
});
