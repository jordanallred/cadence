import { describe, it, expect } from "vitest";
import { recommend } from "../src/fit/recommend";
import { holdOf } from "../src/fit/assessment";
import { AREAS } from "../src/fit/symptoms";
import { evidence } from "../src/fit/evidence";
import {
  defaultIntake,
  intakeSchema,
  symptomAreaSchema,
  type ClipAnalysis,
  type Intake,
  type Metric,
  type Symptom,
  type FitEvent,
} from "../src/domain/types";

const m = (id: string, value: number): Metric => ({
  id,
  label: id,
  value,
  unit: "°",
  sampleCount: 6,
  confidence: "moderate",
  limitations: [],
});
const side = (metrics: Metric[]): ClipAnalysis => ({
  id: "left",
  view: "left",
  name: "left",
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
const sym = (
  area: Symptom["area"],
  severity = 5,
  s: Symptom["side"] = "both",
  warning = false,
): Symptom => ({ area, side: s, severity, warning });
const rider: Intake = {
  ...defaultIntake,
  screen: "none",
  riderHeight: 178,
  saddleHeight: 740,
  crankLength: 172.5,
};
const experiments = (r: ReturnType<typeof recommend>) =>
  r.filter((x) => x.outcome === "experiment");

describe("catalogue", () => {
  it("covers every area in the schema, with sources that exist", () => {
    for (const area of symptomAreaSchema.options) {
      const a = AREAS[area];
      expect(a, area).toBeDefined();
      expect(a.also.length).toBeGreaterThan(10);
      for (const s of a.sources)
        expect(evidence[s], `${area}: ${s}`).toBeDefined();
    }
  });
  it("lists the common complaint areas", () =>
    expect(symptomAreaSchema.options.length).toBeGreaterThanOrEqual(19));
});

describe("feedback is not withheld", () => {
  // The case that produced no advice before rules 0.4.0: a symptom, the
  // safety check left unanswered, persistent and severe.
  it("an unanswered check, persistence and 8/10 still give ranked mm changes", () => {
    const r = recommend(
      {
        ...rider,
        screen: "unknown",
        persistent: true,
        symptoms: [sym("knee-front", 8, "left"), sym("lower-back", 4)],
      },
      [side([m("knee-min", 44), m("torso", 26), m("shoulder-angle", 90)])],
      [],
    );
    expect(holdOf(r)).toBeUndefined();
    expect(r[0].id).toBe("screen-check");
    expect(r.some((x) => x.id === "context")).toBe(true);
    const ex = experiments(r);
    expect(ex.length).toBeGreaterThanOrEqual(2);
    expect(ex.every((x) => x.estimate && x.estimate.maxMm > 0)).toBe(true);
    expect(ex[0]).toMatchObject({ id: "saddle", priority: 1 });
  });
  it("a worse ride undoes that change and keeps the rest", () => {
    const events: FitEvent[] = [
      {
        id: "adj",
        at: "now",
        kind: "adjustment",
        detail: "Saddle up 5 mm",
        setting: "saddleHeight",
        before: 740,
        after: 745,
      },
      {
        id: "ride",
        at: "now",
        kind: "ride",
        detail: "",
        experimentId: "adj",
        response: "worse",
      },
    ];
    const r = recommend(
      { ...rider, saddleHeight: 745, symptoms: [sym("knee-front", 5)] },
      [side([m("knee-min", 44)])],
      events,
    );
    expect(r.find((x) => x.priority === 1)?.id).toBe("undo");
    expect(r.find((x) => x.priority === 1)?.action).toContain("back to 740 mm");
    const saddle = r.find((x) => x.id === "saddle")!;
    expect(saddle.outcome).toBe("information");
    expect(saddle.title).toMatch(/^Already tried/);
  });
  it("a warning sign holds only that area", () => {
    const r = recommend(
      {
        ...rider,
        symptoms: [sym("foot-numb", 6, "left", true), sym("neck", 4)],
        cleatOffset: 2,
      },
      [side([m("knee-min", 35), m("torso", 32)])],
      [],
    );
    expect(holdOf(r)).toBeUndefined();
    const hold = r.find((x) => x.id === "hold-foot-numb-left")!;
    expect(hold.outcome).toBe("assessment");
    expect(hold.action).toContain("podiatrist");
    expect(r.some((x) => x.id === "cleat")).toBe(false);
    expect(experiments(r).map((x) => x.id)).toContain("drop");
  });
});

describe("several symptoms", () => {
  const clip = side([m("knee-min", 35)]);
  it("front and back knee pain of similar severity keep the saddle height", () => {
    const r = recommend(
      { ...rider, symptoms: [sym("knee-front", 5), sym("knee-back", 4)] },
      [clip],
      [],
    );
    const s = r.find((x) => x.id === "saddle-ok")!;
    expect(s.outcome).toBe("no-change");
    expect(s.observations).toMatch(/front-of-knee pain.*back-of-knee pain/);
  });
  it("a clearly worse symptom wins the conflict", () => {
    const r = recommend(
      { ...rider, symptoms: [sym("knee-front", 8), sym("knee-back", 3)] },
      [clip],
      [],
    );
    const s = r.find((x) => x.id === "saddle")!;
    expect(s.estimate?.direction).toBe("raise");
    expect(s.observations).toContain("milder");
  });
  it("the video measurement beats a symptom pulling the other way", () => {
    const r = recommend(
      { ...rider, symptoms: [sym("knee-front", 9)] },
      [side([m("knee-min", 22)])],
      [],
    );
    const s = r.find((x) => x.id === "saddle")!;
    expect(s.estimate?.direction).toBe("lower");
    expect(s.observations).toContain("measurement leads");
  });
  it("the worst symptom's change goes first", () => {
    const r = recommend(
      {
        ...rider,
        saddleTilt: 0,
        symptoms: [sym("saddle-numb", 3), sym("hand-numb", 7, "right")],
      },
      [side([m("knee-min", 35), m("torso", 40), m("shoulder-angle", 85)])],
      [],
    );
    const first = r.find((x) => x.priority === 1)!;
    expect(first.targets).toContain("hand-numb");
  });
  it("one-sided knee pain changes only that cleat", () => {
    const r = recommend(
      { ...rider, symptoms: [sym("knee-outer", 5, "right")] },
      [clip],
      [],
    );
    const rot = r.find((x) => x.id === "rotation-right")!;
    expect(rot.estimate).toMatchObject({
      setting: "cleatRotation",
      direction: "toe-out",
      side: "right",
      unit: "°",
    });
    expect(r.some((x) => x.id.endsWith("-left"))).toBe(false);
  });
  it("saddle numbness and sliding forward meet at 1° nose down", () => {
    const r = recommend(
      {
        ...rider,
        saddleTilt: 0,
        symptoms: [sym("saddle-numb", 5), sym("sliding", 5)],
      },
      [clip],
      [],
    );
    const t = r.find((x) => x.id === "tilt")!;
    expect(t.estimate).toMatchObject({ direction: "nose-down", maxMm: 1 });
    expect(t.observations).toContain("compromise");
  });
  it("every reported area is either targeted or explained", () => {
    const all = symptomAreaSchema.options
      .filter((a) => a !== "other")
      .map((a) => sym(a, 4, AREAS[a].sided ? "left" : "both"));
    const r = recommend(
      { ...rider, saddleTilt: 0, cleatOffset: 5, symptoms: all },
      [side([m("knee-min", 35), m("torso", 32), m("shoulder-angle", 90)])],
      [],
    );
    expect(holdOf(r)).toBeUndefined();
    const targeted = new Set(r.flatMap((x) => x.targets ?? []));
    // Sit bones and chafing rely on kit advice when tilt is level and the
    // saddle height is in range; everything else has a bike change.
    for (const a of all)
      if (!["sit-bones", "chafing"].includes(a.area))
        expect(targeted.has(a.area), a.area).toBe(true);
  });
});

describe("old profiles", () => {
  it("map the single symptom to a specific area", () => {
    const old = { ...defaultIntake, symptom: "hands", severity: 6 } as Record<
      string,
      unknown
    >;
    delete old.symptoms;
    const i = intakeSchema.parse(old);
    expect(i.symptoms).toEqual([
      { area: "hand-numb", side: "both", severity: 6, warning: false },
    ]);
  });
  it("no discomfort maps to no symptoms", () => {
    const old = { ...defaultIntake, symptom: "none", severity: 0 } as Record<
      string,
      unknown
    >;
    delete old.symptoms;
    expect(intakeSchema.parse(old).symptoms).toEqual([]);
  });
});

it("a milder symptom that loses a conflict is named as outweighed", () => {
  const r = recommend(
    {
      ...rider,
      symptoms: [sym("knee-front", 8, "left"), sym("knee-back", 3, "right")],
    },
    [side([m("knee-min", 35)])],
    [],
  );
  const s = r.find((x) => x.id === "saddle")!;
  expect(s.targets).toContain("knee-front");
  expect(s.against).toContain("knee-back");
});
