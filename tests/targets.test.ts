import { it, expect, describe } from "vitest";
import {
  reachChange,
  dropChange,
  setbackCheck,
  dropCheck,
  barWidthTarget,
  cleatCheck,
  kneeOverBall,
} from "../src/fit/targets";
import { recommend } from "../src/fit/recommend";
import { fitRows } from "../src/features/report/FitNumbers";
import {
  defaultIntake,
  intakeSchema,
  type ClipAnalysis,
  type Intake,
  type Metric,
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
const rider: Intake = {
  ...defaultIntake,
  screen: "none",
  riderHeight: 178,
  saddleHeight: 740,
  crankLength: 172.5,
};

describe("reach", () => {
  it("long reach gives a shorter stem, sized by height", () => {
    const r = reachChange(
      rider,
      side([m("shoulder-angle", 106), m("torso", 40), m("elbow", 15)]),
    )!;
    expect(r.direction).toBe("shorter");
    expect(r.toDeg).toBe(98);
    // 586 mm arm × 8° × sin(34°) ≈ 46 mm, ±40%.
    expect(r.mm.min).toBeGreaterThanOrEqual(25);
    expect(r.mm.max).toBeLessThanOrEqual(70);
    expect(r.stemStep).toBe(10);
  });
  it("a taller rider needs more millimetres for the same angle", () => {
    const clip = side([m("shoulder-angle", 106), m("torso", 40)]);
    const short = reachChange({ ...rider, riderHeight: 160 }, clip)!;
    const tall = reachChange({ ...rider, riderHeight: 195 }, clip)!;
    expect(tall.mm.max).toBeGreaterThan(short.mm.max);
  });
  it("needs height and a side view", () => {
    const clip = side([m("shoulder-angle", 106), m("torso", 40)]);
    expect(reachChange({ ...rider, riderHeight: null }, clip)).toBeNull();
    expect(reachChange(rider, undefined)).toBeNull();
  });
  it("in-range arms give no change", () =>
    expect(
      reachChange(rider, side([m("shoulder-angle", 85), m("torso", 40)])),
    ).toBeNull());
  it("short reach gives a longer stem", () =>
    expect(
      reachChange(rider, side([m("shoulder-angle", 62), m("torso", 40)]))
        ?.direction,
    ).toBe("longer"));
});

describe("drop", () => {
  it("a low torso gives a spacer change in 5 mm steps", () => {
    const d = dropChange(rider, side([m("torso", 25)]))!;
    expect(d.toDeg).toBe(32);
    expect(d.spacers.min % 5).toBe(0);
    expect(d.spacers.max % 5).toBe(0);
    expect(d.mm.min).toBeGreaterThan(20);
    expect(d.mm.max).toBeLessThan(110);
  });
  it("uses the discipline's minimum", () =>
    expect(
      dropChange({ ...rider, discipline: "mountain" }, side([m("torso", 35)])),
    ).not.toBeNull());
  it("compares bar drop with measured riders", () => {
    const c = dropCheck({ ...rider, barDrop: 200 })!;
    // 740 × (13.0 + 2 × 3.6)% − 16 = 133 mm
    expect(c.outer.max).toBe(133);
    expect(c.move).toBeLessThan(0);
  });
});

describe("saddle setback", () => {
  it("inside the measured spread is left alone", () =>
    expect(setbackCheck({ ...rider, saddleSetback: 75 })!.move).toBe(0));
  it("far forward suggests moving back to the typical edge", () => {
    const c = setbackCheck({ ...rider, saddleSetback: 30 })!;
    // typical min 740 × 8% = 59 mm
    expect(c.typical.min).toBe(59);
    expect(c.move).toBe(29);
  });
  it("is not applied to mountain bikes", () =>
    expect(
      setbackCheck({ ...rider, discipline: "mountain", saddleSetback: 30 }),
    ).toBeNull());
  it("becomes an experiment only with a related symptom", () => {
    const clip = side([m("knee-min", 35)]);
    const info = recommend({ ...rider, saddleSetback: 30 }, [clip], []);
    expect(info.find((r) => r.id === "setback")?.outcome).toBe("information");
    const exp = recommend(
      { ...rider, saddleSetback: 30, symptom: "saddle" },
      [clip],
      [],
    ).find((r) => r.id === "setback")!;
    expect(exp.outcome).toBe("experiment");
    expect(exp.estimate).toMatchObject({
      setting: "saddleSetback",
      direction: "back",
      minMm: 5,
      maxMm: 29,
    });
  });
});

describe("bar width", () => {
  it("rounds shoulder width to a 20 mm bar size", () =>
    expect(barWidthTarget({ ...rider, shoulderWidth: 392 })!.size).toBe(400));
  it("flags a bar more than 20 mm off", () => {
    const r = recommend(
      { ...rider, shoulderWidth: 380, barWidth: 440 },
      [side([m("knee-min", 35)])],
      [],
    ).find((x) => x.id === "bar-width")!;
    expect(r.outcome).toBe("equipment-training");
    expect(r.estimate).toMatchObject({ direction: "narrower", minMm: 60 });
  });
  it("is not applied to mountain bikes", () =>
    expect(
      barWidthTarget({ ...rider, discipline: "mountain", shoulderWidth: 400 }),
    ).toBeNull());
});

describe("cleats", () => {
  it("an axle ahead of the ball suggests moving the cleat back", () => {
    expect(cleatCheck({ ...rider, cleatOffset: -6 })!.back).toBe(6);
    const r = recommend(
      { ...rider, cleatOffset: -6 },
      [side([m("knee-min", 35)])],
      [],
    ).find((x) => x.id === "cleat")!;
    expect(r.outcome).toBe("information");
    expect(r.estimate).toMatchObject({ direction: "back", minMm: 6, maxMm: 6 });
  });
  it("foot symptoms make the cleat the first experiment", () => {
    const r = recommend(
      { ...rider, cleatOffset: 2, symptom: "feet", mechanicalLimits: true },
      [side([m("knee-min", 20)])],
      [],
    );
    const first = r.find((x) => x.priority === 1)!;
    expect(first.id).toBe("cleat");
    expect(first.estimate).toMatchObject({ minMm: 3, maxMm: 5 });
    expect(r.find((x) => x.id === "saddle")?.priority).toBe(2);
  });
  it("a cleat already well back is left alone", () =>
    expect(
      recommend(
        { ...rider, cleatOffset: 10 },
        [side([m("knee-min", 35)])],
        [],
      ).some((x) => x.id === "cleat"),
    ).toBe(false));
});

it("knee over the ball of the foot converts to mm with height", () =>
  // 20% of a 436 mm thigh
  expect(kneeOverBall(rider, side([m("kops", 20)]))).toBe(87));

describe("recommendation", () => {
  it("reach advice names the stem change and resulting reach", () => {
    const r = recommend(
      {
        ...rider,
        symptom: "hands",
        stemLength: 110,
        barReach: 560,
      },
      [
        side([
          m("knee-min", 35),
          m("shoulder-angle", 106),
          m("torso", 40),
          m("elbow", 15),
        ]),
      ],
      [],
    ).find((x) => x.id === "reach")!;
    expect(r.action).toContain("stem 10 mm shorter (110 → 100 mm)");
    expect(r.action).toContain("from 560 to about 550 mm");
    expect(r.sources).toContain("anthropometry");
  });
  it("without height the advice asks for it", () => {
    const r = recommend(
      { ...rider, riderHeight: null, symptom: "hands" },
      [side([m("knee-min", 35), m("shoulder-angle", 106), m("torso", 40)])],
      [],
    ).find((x) => x.id === "reach")!;
    expect(r.action).toContain("Add your height");
  });
  it("a low torso with neck pain gives a spacer range", () => {
    const r = recommend(
      { ...rider, symptom: "neck", barDrop: 90 },
      [side([m("knee-min", 35), m("shoulder-angle", 85), m("torso", 24)])],
      [],
    ).find((x) => x.id === "reach")!;
    expect(r.estimate?.setting).toBe("spacers");
    expect(r.action).toMatch(/moving \d+–\d+ mm of spacers/);
    expect(r.action).toContain("drop would go from 90");
  });
});

describe("numbers table", () => {
  it("has a row for every contact point", () => {
    const rows = fitRows(rider, [], undefined);
    expect(rows.map((r) => r.name)).toEqual([
      "Saddle height",
      "Saddle setback",
      "Reach (stem)",
      "Drop (spacers)",
      "Handlebar width",
      "Cleat fore-aft",
    ]);
    expect(rows.find((r) => r.name === "Cleat fore-aft")!.tone).toBe("missing");
  });
  it("shows the saddle change and the resulting height", () => {
    const clip = side([m("knee-min", 20)]);
    const i = { ...rider, symptom: "knee" as const };
    const rows = fitRows(i, recommend(i, [clip], []), clip);
    const saddle = rows[0];
    expect(saddle.tone).toBe("change");
    expect(saddle.next).toMatch(
      /^Lower \d+–\d+ mm, to \d+–\d+ mm(; start with 5 mm)?$/,
    );
  });
});

it("older saved profiles load with the new measurements unknown", () => {
  const { riderHeight, cleatOffset, ...old } = defaultIntake;
  void riderHeight;
  void cleatOffset;
  const parsed = intakeSchema.parse(old);
  expect(parsed.riderHeight).toBeNull();
  expect(parsed.cleatOffset).toBeNull();
});

it("new cockpit settings can be logged as experiments and undone", async () => {
  const { appendEvent } = await import("../src/fit/history");
  const { newSession } = await import("../src/domain/types");
  const s = { ...newSession(), intake: { ...rider, stemLength: 110 } };
  const changed = appendEvent(s, {
    id: "a",
    at: "now",
    kind: "adjustment",
    detail: "Stem 110 to 90",
    setting: "stemLength",
    before: 110,
    after: 90,
  });
  expect(changed.intake.stemLength).toBe(90);
  const undone = appendEvent(changed, {
    id: "b",
    at: "now",
    kind: "revert",
    detail: "",
    experimentId: "a",
  });
  expect(undone.intake.stemLength).toBe(110);
  expect(() =>
    appendEvent(s, {
      id: "c",
      at: "now",
      kind: "adjustment",
      detail: "x",
      setting: "stemLength",
      before: 110,
      after: 400,
    }),
  ).toThrow();
});
