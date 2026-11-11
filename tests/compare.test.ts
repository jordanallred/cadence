import { it, expect } from "vitest";
import {
  compareMetric,
  compareSetups,
  describeChange,
  headline,
  headlineText,
} from "../src/fit/compare";
import { appendEvent } from "../src/fit/history";
import {
  defaultIntake,
  newSession,
  type ClipAnalysis,
  type Metric,
} from "../src/domain/types";

const metric = (id: string, value: number, spread = 1): Metric => ({
  id,
  label: id === "knee-min" ? "Knee flexion · extension" : id,
  value,
  unit: "°",
  sampleCount: 10,
  confidence: "moderate",
  spread,
  limitations: [],
});
const clip = (
  id: string,
  rev: number,
  metrics: Metric[],
  view: ClipAnalysis["view"] = "left",
): ClipAnalysis => ({
  id,
  view,
  name: id,
  size: 1,
  duration: 10,
  width: 640,
  height: 360,
  frames: [],
  quality: [],
  metrics,
  modelVersion: "test",
  createdAt: `2026-11-0${rev + 1}T10:00:00Z`,
  setupRevision: rev,
  reviewed: true,
});

it("says when a change brings the knee into its target", () => {
  const c = compareMetric(
    metric("knee-min", 28),
    metric("knee-min", 35),
    defaultIntake,
  );
  expect(c.trend).toBe("into");
  expect(headlineText(c)).toBe(
    "Knee flexion · extension 28° → 35°, now inside the target (30–40°).",
  );
});

it("does not claim an effect smaller than stroke-to-stroke variation", () => {
  const c = compareMetric(
    metric("knee-min", 29, 4),
    metric("knee-min", 30.5, 4),
    defaultIntake,
  );
  expect(c.withinNoise).toBe(true);
  expect(c.trend).toBe("inside");
  expect(c.verdict).toMatch(/^About the same/);
});

it("words moves that stay outside the target", () => {
  const closer = compareMetric(
    metric("knee-min", 20),
    metric("knee-min", 26),
    defaultIntake,
  );
  expect(closer.trend).toBe("closer");
  expect(closer.verdict).toBe("Closer, 4° below the target (30–40°).");
  const out = compareMetric(
    metric("knee-min", 35),
    metric("knee-min", 44),
    defaultIntake,
  );
  expect(out.trend).toBe("out");
  // Leaving the target is the headline even when the knee is not first.
  expect(
    headline([
      compareMetric(metric("hip", 60), metric("hip", 64), defaultIntake),
      out,
    ]),
  ).toBe(out);
});

it("compares the new setup with the last recorded one and names the change", () => {
  let s = newSession();
  s.intake.saddleHeight = 720;
  s.intake.mechanicalLimits = true;
  s.clips.push(clip("a", 0, [metric("knee-min", 28), metric("hip", 60)]));
  s = appendEvent(s, {
    id: "raise",
    at: "2026-11-02T09:00:00Z",
    kind: "adjustment",
    detail: "Raise saddle",
    setting: "saddleHeight",
    before: 720,
    after: 725,
  });
  // No recording at the new setup yet.
  expect(compareSetups(s, s.setupRevision)).toBeUndefined();
  s.clips.push(clip("b", 1, [metric("knee-min", 35), metric("hip", 66)]));
  const cmp = compareSetups(s, s.setupRevision)!;
  expect(cmp.before.id).toBe("a");
  expect(cmp.after.id).toBe("b");
  expect(cmp.changes.map((e) => describeChange(e, s))).toEqual([
    "Saddle height 720 → 725 mm",
  ]);
  expect(cmp.metrics.map((m) => m.id)).toEqual(["knee-min", "hip"]);
  expect(cmp.metrics[1].verdict).toBe("Changed by +6°.");
});

it("can compare against the starting setup after a revert", () => {
  let s = newSession();
  s.intake.saddleHeight = 720;
  s.clips.push(clip("a", 0, [metric("knee-min", 28)]));
  s = appendEvent(s, {
    id: "raise",
    at: "t",
    kind: "adjustment",
    detail: "Raise saddle",
    setting: "saddleHeight",
    before: 720,
    after: 740,
  });
  s.clips.push(clip("b", 1, [metric("knee-min", 45)]));
  s = appendEvent(s, {
    id: "undo",
    at: "t",
    kind: "revert",
    detail: "",
    experimentId: "raise",
  });
  s.clips.push(clip("c", 2, [metric("knee-min", 29)], "right"));
  s.clips.push(clip("d", 2, [], "front"));
  const last = compareSetups(s, 2)!;
  expect(last.from).toBe(1);
  expect(describeChange(last.changes[0], s)).toBe(
    "Undid saddle height 720 → 740 mm",
  );
  const start = compareSetups(s, 2, 0)!;
  expect(start.before.id).toBe("a");
  expect(start.after.id).toBe("c");
  expect(start.changes).toHaveLength(2);
});
