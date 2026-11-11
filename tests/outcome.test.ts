import { it, expect, describe } from "vitest";
import { appendEvent } from "../src/fit/history";
import { latestRatings, outcomeOf, ratingsBefore } from "../src/fit/outcome";
import {
  dayFromNow,
  firstStep,
  hasStarted,
  nextStep,
  reminderFile,
} from "../src/fit/loop";
import {
  newSession,
  type ClipAnalysis,
  type FitEvent,
  type Metric,
  type Recommendation,
  type Session,
} from "../src/domain/types";

const metric = (value: number): Metric => ({
  id: "knee-min",
  label: "Knee flexion · extension",
  value,
  unit: "°",
  sampleCount: 10,
  confidence: "moderate",
  spread: 1,
  limitations: [],
});
const clip = (id: string, rev: number, knee: number): ClipAnalysis => ({
  id,
  view: "left",
  name: id,
  size: 1,
  duration: 10,
  width: 640,
  height: 360,
  frames: [],
  quality: [],
  metrics: [metric(knee)],
  modelVersion: "test",
  createdAt: `2026-11-0${rev + 1}T10:00:00Z`,
  setupRevision: rev,
  reviewed: true,
});

let n = 0;
const add = (s: Session, e: Partial<FitEvent> & Pick<FitEvent, "kind">) =>
  appendEvent(s, {
    detail: "",
    ...e,
    id: `e${++n}`,
    at: `2026-11-10T0${n % 10}:00:00Z`,
  });

/** A rider with front-of-knee pain 6/10, saddle 720 mm, one side clip. */
function base(): Session {
  const s = newSession();
  s.intake.saddleHeight = 720;
  s.intake.mechanicalLimits = true;
  s.intake.symptoms = [
    { area: "knee-front", side: "left", severity: 6, warning: false },
  ];
  s.clips.push(clip("c0", 0, 24));
  return s;
}
const change = (s: Session) =>
  add(s, {
    kind: "adjustment",
    detail: "Raised saddle 5 mm",
    setting: "saddleHeight",
    before: 720,
    after: 725,
    symptoms: latestRatings(s),
  });
const ride = (
  s: Session,
  response: FitEvent["response"],
  knee?: number,
): Session => {
  const exp = [...s.events].reverse().find((e) => e.kind === "adjustment")!;
  return add(s, {
    kind: "ride",
    duration: 45,
    intensity: "easy",
    comfort: 6,
    response,
    experimentId: exp.id,
    ...(knee !== undefined
      ? { symptoms: [{ area: "knee-front", side: "left", severity: knee }] }
      : {}),
  });
};
const active = (s: Session) =>
  [...s.events].reverse().find((e) => e.kind === "adjustment")!;

describe("outcome of one change", () => {
  it("is too early with no ride", () => {
    const s = change(base());
    const o = outcomeOf(s, active(s));
    expect(o.verdict).toBe("too-early");
    expect(o.reasons[0]).toMatch(/No ride/);
  });

  it("is too early after one good ride", () => {
    const s = ride(change(base()), "better", 3);
    expect(outcomeOf(s, active(s)).verdict).toBe("too-early");
  });

  it("helped when symptoms drop over two rides", () => {
    const s = ride(ride(change(base()), "same", 5), "same", 3);
    const o = outcomeOf(s, active(s));
    expect(o.verdict).toBe("helped");
    expect(o.symptoms[0]).toMatchObject({ before: 6, after: 3, delta: -3 });
    expect(o.reasons[0]).toContain("6 → 3/10");
  });

  it("calls a one-point change no clear difference", () => {
    const s = ride(ride(change(base()), "same", 6), "same", 5);
    expect(outcomeOf(s, active(s)).verdict).toBe("no-difference");
  });

  it("reports worse after a single ride", () => {
    const s = ride(change(base()), "same", 8);
    expect(outcomeOf(s, active(s)).verdict).toBe("worse");
  });

  it("is mixed when rides and symptoms disagree", () => {
    const s = ride(ride(change(base()), "better", 8), "better", 8);
    const o = outcomeOf(s, active(s));
    expect(o.verdict).toBe("mixed");
    expect(o.reasons[0]).toMatch(/different ways/);
  });

  it("uses rides alone for a rider with no symptoms", () => {
    const s0 = base();
    s0.intake.symptoms = [];
    const s = ride(ride(change(s0), "better"), "same");
    const o = outcomeOf(s, active(s));
    expect(o.verdict).toBe("helped");
    expect(o.symptoms).toEqual([]);
  });

  it("asks for ratings when rides were saved without them", () => {
    const s = ride(ride(change(base()), "same"), "same");
    const o = outcomeOf(s, active(s));
    expect(o.verdict).toBe("no-difference");
    expect(o.reasons.at(-1)).toMatch(/Rate your symptoms/);
  });

  it("notes when the video shows no change but riding improved", () => {
    let s = ride(ride(change(base()), "better", 3), "better", 3);
    s = { ...s, clips: [...s.clips, clip("c1", 1, 24.5)] };
    const o = outcomeOf(s, active(s));
    expect(o.verdict).toBe("helped");
    expect(o.video?.change.withinNoise).toBe(true);
    expect(o.reasons.at(-1)).toMatch(/only evidence/);
  });

  it("falls back to Your starting point for changes saved before ratings", () => {
    const s = add(base(), {
      kind: "adjustment",
      detail: "old",
      setting: "saddleHeight",
      before: 720,
      after: 725,
    });
    expect(ratingsBefore(s, active(s))).toEqual([
      { area: "knee-front", side: "left", severity: 6 },
    ]);
  });

  it("starts the next ride form from the last ratings", () => {
    const s = ride(change(base()), "same", 4);
    expect(latestRatings(s)[0].severity).toBe(4);
  });
});

describe("next step", () => {
  const exp: Recommendation = {
    id: "saddle-low",
    outcome: "experiment",
    urgency: "routine",
    title: "Lower your saddle",
    observations: "",
    alternatives: "",
    action: "",
    prerequisites: "",
    recheck: "",
    sources: [],
    ruleVersion: "test",
    estimate: {
      setting: "saddleHeight",
      direction: "lower",
      minMm: 11,
      maxMm: 21,
      basis: "",
    },
  };

  it("starts a blank fit at Your starting point", () => {
    const s = newSession();
    expect(hasStarted(s)).toBe(false);
    expect(nextStep(s, []).place).toBe("start");
  });

  it("asks for a baseline recording once the profile has something", () => {
    const s = newSession();
    s.intake.saddleHeight = 720;
    expect(nextStep(s, [])).toMatchObject({
      stage: "baseline",
      place: "record",
    });
  });

  it("walks the loop: change, ride, record again, ride, decide", () => {
    let s = base();
    expect(nextStep(s, [exp])).toMatchObject({
      stage: "change",
      title: "Lower your saddle",
    });
    s = change(s);
    expect(nextStep(s, [])).toMatchObject({ stage: "ride", place: "refine" });
    s = ride(s, "same", 4);
    expect(nextStep(s, [])).toMatchObject({
      stage: "recheck",
      place: "record",
    });
    s = { ...s, clips: [...s.clips, clip("c1", 1, 30)] };
    expect(nextStep(s, [])).toMatchObject({
      stage: "ride",
      title: "Ride with it once more",
    });
    s = ride(s, "same", 3);
    expect(nextStep(s, [])).toMatchObject({ stage: "decide" });
    expect(nextStep(s, []).detail).toMatch(/^Helped\./);
  });

  it("sends a change that made riding worse straight to revert", () => {
    const s = ride(change(base()), "worse");
    expect(nextStep(s, [])).toMatchObject({
      stage: "decide",
      action: "Revert the change",
    });
  });

  it("prefills the first 5 mm of a saddle change", () => {
    expect(firstStep(exp, base())).toEqual({
      setting: "saddleHeight",
      after: 715,
    });
    const small = {
      ...exp,
      estimate: { ...exp.estimate!, minMm: 3, maxMm: 8 },
    };
    expect(firstStep(small, base())?.after).toBe(717);
    const unknown = base();
    unknown.intake.saddleHeight = null;
    expect(firstStep(exp, unknown)).toBeUndefined();
  });
});

it("writes an all-day calendar reminder", () => {
  const ics = reminderFile(
    "2026-11-18",
    "Cadence: check in",
    "Saddle, 720 → 715 mm; ride",
  );
  expect(ics).toContain("DTSTART;VALUE=DATE:20261118");
  expect(ics).toContain("DTEND;VALUE=DATE:20261119");
  expect(ics).toContain("DESCRIPTION:Saddle\\, 720 → 715 mm\\; ride");
  expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  expect(dayFromNow(7, new Date(2026, 10, 28))).toBe("2026-12-05");
});
