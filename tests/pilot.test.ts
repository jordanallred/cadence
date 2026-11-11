import { it, expect } from "vitest";
import { buildPilotLog, PILOT_FORMAT } from "../src/fit/pilot";
import {
  newSession,
  sessionSchema,
  type ClipAnalysis,
  type Session,
} from "../src/domain/types";

const clip = (
  id: string,
  at: string,
  reject = false,
  name = "Jane-Doe-garage.mp4",
): ClipAnalysis => ({
  id,
  view: "left",
  name,
  size: 1,
  duration: 10,
  width: 1920,
  height: 1080,
  frames: [
    {
      timeMs: 0,
      points: [{ x: 0.123456, y: 0.654321, visibility: 1 }],
      people: 1,
      corrected: true,
    },
  ],
  quality: reject
    ? [{ code: "visibility", severity: "reject", message: "Hips hidden" }]
    : [],
  metrics: [],
  modelVersion: "pose-test-1",
  createdAt: at,
  setupRevision: 0,
  reviewed: true,
  keyframes: [
    {
      position: "extension",
      timeMs: 0,
      image: "data:image/jpeg;base64,SECRETPIXELS",
    },
  ],
});

/** A rider who does one full cycle: baseline, change, ride, re-record, keep. */
function fullCycle(): Session {
  const s = newSession();
  s.createdAt = "2026-11-01T08:00:00.000Z";
  s.intake = {
    ...s.intake,
    name: "Jane Doe",
    bike: "Jane's red Canyon",
    notes: "Lives on Elm Street",
    goal: "Ride to work at Acme Corp",
    saddleHeight: 731,
    riderHeight: 172,
    symptoms: [
      { area: "knee-front", side: "left", severity: 5, warning: false },
    ],
  };
  s.baseline = structuredClone(s.intake);
  s.intake.saddleHeight = 736;
  s.intake.symptoms = [
    { area: "knee-front", side: "left", severity: 2, warning: false },
  ];
  s.clips = [
    clip("a", "2026-11-01T09:00:00.000Z", true),
    clip("b", "2026-11-01T10:00:00.000Z"),
    clip("c", "2026-11-04T10:00:00.000Z"),
  ];
  s.captureLog = [
    {
      at: "2026-11-01T08:30:00.000Z",
      view: "left",
      result: "failed",
      codes: ["analysis-error"],
    },
    {
      at: "2026-11-01T09:00:00.000Z",
      view: "left",
      result: "rejected",
      codes: ["visibility"],
    },
    {
      at: "2026-11-01T10:00:00.000Z",
      view: "left",
      result: "accepted",
      codes: [],
    },
  ];
  s.events = [
    {
      id: "adj",
      at: "2026-11-01T11:00:00.000Z",
      kind: "adjustment",
      detail: "Raised it at Bob's shop",
      setting: "saddleHeight",
      before: 731,
      after: 736,
    },
    {
      id: "ride",
      at: "2026-11-03T18:00:00.000Z",
      kind: "ride",
      detail: "Commute past the hospital",
      duration: 45,
      intensity: "moderate",
      comfort: 7,
      response: "better",
      experimentId: "adj",
    },
    {
      id: "keep",
      at: "2026-11-04T11:00:00.000Z",
      kind: "retain",
      detail: "Felt good",
      experimentId: "adj",
    },
  ];
  return s;
}

const opts = {
  code: "P07",
  appVersion: "v0.9.0",
  now: new Date("2026-11-20T00:00:00Z"),
};

it("contains no name, free text, measurements, landmarks, stills or file names", () => {
  const text = JSON.stringify(buildPilotLog(fullCycle(), [], opts));
  for (const secret of [
    "Jane",
    "Canyon",
    "Elm",
    "Acme",
    "Bob",
    "hospital",
    "Felt good",
    "garage",
    "SECRETPIXELS",
    "0.123456",
    "731",
    "736",
    "172",
    "Hips hidden",
    "08:00",
  ])
    expect(text).not.toContain(secret);
});

it("times each loop stage in hours since the fit started", () => {
  const log = buildPilotLog(fullCycle(), [], opts);
  expect(log.format).toBe(PILOT_FORMAT);
  expect(log.participant).toBe("P07");
  expect(log.startedOn).toBe("2026-11-01");
  expect(log.loop).toEqual({
    baselineRecorded: 2,
    firstAdjustment: 3,
    firstRide: 58,
    reRecorded: 74,
    firstKeepOrRevert: 75,
    cyclesStarted: 1,
    cyclesComplete: 1,
  });
  expect(log.cycles[0]).toMatchObject({
    setting: "saddleHeight",
    change: 5,
    reRecorded: true,
    decision: "retain",
    complete: true,
  });
  expect(log.cycles[0].rides[0]).toEqual({
    hours: 58,
    minutes: 45,
    intensity: "moderate",
    comfort: 7,
    response: "better",
  });
});

it("counts rejected and failed captures with reason codes", () => {
  const log = buildPilotLog(fullCycle(), [], opts);
  expect(log.recordings).toMatchObject({
    total: 3,
    accepted: 2,
    rejected: 1,
    corrected: 3,
  });
  expect(log.captures.map((c) => c.result)).toEqual([
    "failed",
    "rejected",
    "accepted",
  ]);
  expect(log.captures[1].reasons).toEqual(["visibility"]);
});

it("keeps symptom ratings from the start and now", () => {
  const log = buildPilotLog(fullCycle(), [], opts);
  expect(log.symptoms.atStart[0].severity).toBe(5);
  expect(log.symptoms.now[0].severity).toBe(2);
});

it("does not count a cycle without a re-record or a decision", () => {
  const s = fullCycle();
  s.clips = s.clips.slice(0, 2);
  s.events = s.events.filter((e) => e.kind !== "retain");
  const log = buildPilotLog(s, [], opts);
  expect(log.loop.cyclesStarted).toBe(1);
  expect(log.loop.cyclesComplete).toBe(0);
  expect(log.loop.reRecorded).toBeNull();
  expect(log.cycles[0].decision).toBeNull();
});

it("drops a participant code that is not letters then digits", () => {
  expect(
    buildPilotLog(fullCycle(), [], { ...opts, code: "Jane" }).participant,
  ).toBeNull();
});

it("loads fits saved before the capture log existed", () => {
  const { captureLog, ...old } = newSession();
  void captureLog;
  const s = sessionSchema.parse({ ...old, pilotCode: "not a code" });
  expect(s.captureLog).toEqual([]);
  expect(s.pilotCode).toBeUndefined();
});

it("counts a symptom re-rating on a ride instead of a re-record", () => {
  const s = fullCycle();
  s.clips = s.clips.slice(0, 2);
  (s.events[1] as Record<string, unknown>).symptoms = [
    { area: "knee-front", side: "left", severity: 2 },
  ];
  const log = buildPilotLog(s, [], opts);
  expect(log.cycles[0]).toMatchObject({
    reRecorded: false,
    reRated: true,
    complete: true,
  });
  expect(log.loop.cyclesComplete).toBe(1);
});
