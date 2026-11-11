import { it, expect } from "vitest";
import { recommend, saddleChangeMm } from "../src/fit/recommend";
import {
  defaultIntake,
  type ClipAnalysis,
  type Metric,
} from "../src/domain/types";
const intake = { ...defaultIntake, screen: "none" as const };
const m = (id: string, value: number): Metric => ({
  id,
  label: id,
  value,
  unit: "°",
  sampleCount: 6,
  confidence: "moderate",
  limitations: [],
});
const clip = (view: ClipAnalysis["view"], metrics: Metric[]): ClipAnalysis => ({
  id: view,
  view,
  name: view,
  size: 1,
  duration: 10,
  width: 100,
  height: 100,
  frames: [],
  metrics,
  quality: [],
  modelVersion: "test",
  createdAt: "now",
  setupRevision: 0,
  reviewed: true,
});
export const clips = (knee = 20, extra: Metric[] = []): ClipAnalysis[] => [
  clip("left", [m("knee-min", knee), ...extra]),
  clip("front", [m("pelvic-rock", 4)]),
  clip("rear", [m("pelvic-rock", 4)]),
];
const experiment = (r: ReturnType<typeof recommend>) =>
  r.find((x) => x.outcome === "experiment");
it("a reviewed side view alone supports a saddle experiment", () => {
  const r = recommend({ ...intake, symptom: "knee" }, clips().slice(0, 1), []);
  expect(experiment(r)?.id).toBe("saddle");
  expect(r.some((x) => x.id === "coverage")).toBe(true);
});
it("no side view yields no adjustment", () => {
  const r = recommend({ ...intake, symptom: "knee" }, clips().slice(1), []);
  expect(experiment(r)).toBeUndefined();
});
it("urgent symptoms override apparently good clips", () =>
  expect(
    recommend({ ...intake, screen: "urgent-knee" }, clips(), [])[0]?.urgency,
  ).toBe("urgent"));
it("an unanswered screen and follow-up cautions retain measured advice", () => {
  const r = recommend({ ...defaultIntake, symptom: "knee", saddleHeight: 740 }, clips(20), [
    { id: "w", at: "now", kind: "ride", detail: "", response: "worse" },
  ]);
  expect(r.some((x) => x.id === "screen")).toBe(true);
  expect(r.find((x) => x.id === "saddle")?.estimate?.minMm).toBeGreaterThan(0);
});
it("multiple symptoms preserve the most severe complaint and report conflicts", () => {
  const r = recommend({ ...intake, saddleHeight: 740, symptoms: [
    { area: "front-knee", side: "left", severity: 5, onset: "", sharpSuddenWorsening: false },
    { area: "back-knee", side: "right", severity: 7, onset: "", sharpSuddenWorsening: false },
  ] }, clips(20), []);
  expect(r.some((x) => x.id === "symptom-conflict")).toBe(true);
});
it("rejected clips cannot support an adjustment", () =>
  expect(
    experiment(
      recommend(
        { ...intake, symptom: "knee" },
        clips().map((c) => ({
          ...c,
          quality: [
            { code: "visibility", severity: "reject" as const, message: "" },
          ],
        })),
        [],
      ),
    ),
  ).toBeUndefined());
it("comfortable riders near the range are not pushed to change", () => {
  const r = recommend(intake, clips(28), []);
  expect(r.some((x) => x.outcome === "no-change")).toBe(true);
  expect(experiment(r)).toBeUndefined();
});
it("an in-range saddle is confirmed rather than changed", () =>
  expect(
    recommend({ ...intake, symptom: "knee" }, clips(35), []).find(
      (x) => x.id === "saddle-ok",
    ),
  ).toBeDefined());
it("unreviewed overlay blocks prescriptions", () =>
  expect(
    experiment(
      recommend(
        { ...intake, symptom: "knee" },
        clips().map((c) => ({ ...c, reviewed: false })),
        [],
      ),
    ),
  ).toBeUndefined());
it("a low knee angle means lowering the saddle", () =>
  expect(
    experiment(recommend({ ...intake, symptom: "knee" }, clips(20), []))?.title,
  ).toMatch(/Lower/));
it("a high knee angle means raising the saddle", () =>
  expect(
    experiment(recommend({ ...intake, symptom: "knee" }, clips(50), []))?.title,
  ).toMatch(/Raise/));
it("a conservative millimetre step is given without saddle height", () => {
  const without = experiment(
    recommend({ ...intake, symptom: "knee" }, clips(20), []),
  );
  expect(without?.estimate?.minMm).toBe(3);
  const withHeight = experiment(
    recommend(
      { ...intake, symptom: "knee", saddleHeight: 740, crankLength: 172.5 },
      clips(20),
      [],
    ),
  );
  expect(withHeight?.estimate?.direction).toBe("lower");
  expect(withHeight!.estimate!.minMm).toBeGreaterThan(5);
  expect(withHeight!.estimate!.maxMm).toBeLessThan(40);
});
it("saddle change estimate matches known leg geometry", () => {
  // 10° less flexion near 30° is roughly 1.7% of leg span (≈ 15 mm on 900 mm).
  const mm = saddleChangeMm(25, 32, 727.5, 172.5);
  expect(mm).toBeLessThan(-8);
  expect(mm).toBeGreaterThan(-20);
});
it("only one experiment is first; others wait", () => {
  const r = recommend(
    { ...intake, symptom: "hands" },
    clips(20, [m("shoulder-angle", 105), m("elbow", 5)]),
    [],
  );
  const ex = r.filter((x) => x.outcome === "experiment");
  expect(ex[0].id).toBe("saddle");
  expect(ex[0].priority).toBe(1);
  expect(ex.find((x) => x.id === "reach")?.priority).toBe(2);
});
it("long reach with hand symptoms suggests a shorter or higher cockpit", () => {
  const r = recommend(
    { ...intake, symptom: "hands" },
    clips(35, [m("shoulder-angle", 105)]),
    [],
  );
  expect(experiment(r)?.id).toBe("reach");
});
it("side views that disagree block changes", () => {
  const r = recommend(
    { ...intake, symptom: "knee" },
    [...clips(20), clip("right", [m("knee-min", 32)])],
    [],
  );
  expect(r.some((x) => x.id === "disagreement")).toBe(true);
  expect(experiment(r)).toBeUndefined();
});
