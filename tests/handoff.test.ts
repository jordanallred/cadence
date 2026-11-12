import { it, expect, describe } from "vitest";
import { appendEvent } from "../src/fit/history";
import {
  buildHandoff,
  defaultHandoff,
  handoffFileName,
} from "../src/fit/handoff";
import {
  newSession,
  sessionSchema,
  type ClipAnalysis,
  type FitEvent,
  type Session,
} from "../src/domain/types";

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

/** 33 landmarks of a rider seen from the left, roughly on a bike. */
const points = Array.from({ length: 33 }, (_, j) => {
  const at: Record<number, [number, number]> = {
    11: [0.45, 0.3],
    13: [0.6, 0.42],
    15: [0.72, 0.45],
    23: [0.35, 0.55],
    25: [0.5, 0.7],
    27: [0.45, 0.9],
  };
  const [x, y] = at[j] ?? [0.5, 0.5];
  return { x, y, visibility: at[j] ? 0.99 : 0.1 };
});

const clip = (
  id: string,
  rev: number,
  knee: number,
  extra: Partial<ClipAnalysis> = {},
): ClipAnalysis => ({
  id,
  view: "left",
  name: id,
  size: 1,
  duration: 10,
  width: 640,
  height: 360,
  frames: [{ timeMs: 1000, points, people: 1 }],
  quality: [],
  metrics: [
    {
      id: "knee-min",
      label: "Knee flexion · extension",
      value: knee,
      unit: "°",
      sampleCount: 10,
      confidence: "moderate",
      spread: 1,
      limitations: [],
    },
  ],
  modelVersion: "test",
  createdAt: `2026-11-0${rev + 1}T10:00:00Z`,
  setupRevision: rev,
  reviewed: true,
  keyframes: [{ position: "extension", timeMs: 1000, image: JPEG }],
  ...extra,
});

let n = 0;
const add = (s: Session, e: Partial<FitEvent> & Pick<FitEvent, "kind">) =>
  appendEvent(s, {
    detail: "",
    ...e,
    id: `e${++n}`,
    at: `2026-11-10T0${n % 10}:00:00Z`,
  });

/** Knee pain, one saddle change ridden twice with ratings, re-recorded. */
function history(): Session {
  let s = newSession();
  s.intake.name = "Sam Rider";
  s.intake.bike = "Steel commuter";
  s.intake.saddleHeight = 720;
  s.intake.mechanicalLimits = true;
  s.intake.notes = "PRIVATE-NOTE knee surgery 2019";
  s.intake.symptoms = [
    { area: "knee-front", side: "left", severity: 6, warning: false },
  ];
  s.clips.push(clip("c0", 0, 24));
  s = add(s, {
    kind: "adjustment",
    detail: "Raise the saddle",
    setting: "saddleHeight",
    before: 720,
    after: 725,
  });
  const id = s.events[s.events.length - 1].id;
  for (const r of [3, 2])
    s = add(s, {
      kind: "ride",
      detail: "PRIVATE-RIDE felt smoother on climbs",
      experimentId: id,
      duration: 60,
      intensity: "moderate",
      comfort: 7,
      response: "better",
      symptoms: [{ area: "knee-front", side: "left", severity: r }],
    });
  s.clips.push(clip("c1", 1, 31));
  return s;
}

describe("share with a fitter", () => {
  it("is one self-contained page with no script and no video", () => {
    const html = buildHandoff(history(), [], defaultHandoff);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<video/i);
    expect(html).not.toMatch(/src="http|href="http/i);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("No video is included");
  });

  it("leaves the name and written notes out by default", () => {
    const html = buildHandoff(history(), [], defaultHandoff);
    expect(html).not.toContain("Sam Rider");
    expect(html).toContain("name not shared");
    expect(html).not.toContain("PRIVATE-NOTE");
    expect(html).not.toContain("PRIVATE-RIDE");
  });

  it("includes them when the rider chooses", () => {
    const html = buildHandoff(history(), [], {
      ...defaultHandoff,
      name: true,
      notes: true,
    });
    expect(html).toContain("Fit history: Sam Rider");
    expect(html).toContain("PRIVATE-NOTE");
    expect(html).toContain("PRIVATE-RIDE");
  });

  it("shows the question, setup, verdict and ratings", () => {
    const html = buildHandoff(history(), [], {
      ...defaultHandoff,
      question: "Is 725 too high?",
    });
    expect(html).toContain("Is 725 too high?");
    expect(html).toContain("Saddle height 720 → 725 mm");
    expect(html).toMatch(/<strong>Helped<\/strong>/);
    expect(html).toContain("6/10");
    expect(html).toContain("2/10");
    // Current setup, and the value at the first recording.
    expect(html).toMatch(/Saddle height<\/th><td class="num">725 mm/);
    expect(html).toContain("720 mm");
  });

  it("draws first and latest side stills with angles, or leaves them out", () => {
    const html = buildHandoff(history(), [], defaultHandoff);
    expect(html.match(/<svg /g)?.length).toBe(2);
    expect(html).toContain(JPEG);
    expect(html).toContain("First recording");
    expect(html).toContain("Latest recording");
    expect(html).toMatch(/24\.0°/);
    expect(html).toMatch(/31\.0°/);
    const without = buildHandoff(history(), [], {
      ...defaultHandoff,
      stills: false,
    });
    expect(without).not.toContain(JPEG);
    expect(without).toContain("chose not to include still frames");
    expect(without).toMatch(/31\.0°/);
  });

  it("escapes everything the rider typed", () => {
    const s = history();
    s.intake.bike = "<img src=x onerror=alert(1)>";
    const html = buildHandoff(s, [], {
      ...defaultHandoff,
      question: "</style><script>alert(1)</script>",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("says what Cadence couldn't tell", () => {
    let s = history();
    s.clips.push(
      clip("bad", 1, 0, {
        metrics: [],
        quality: [
          { code: "short", severity: "reject", message: "Video too short." },
        ],
      }),
    );
    s = add(s, {
      kind: "retain",
      experimentId: s.events.find((e) => e.kind === "adjustment")!.id,
    });
    s = add(s, {
      kind: "adjustment",
      detail: "Stem",
      setting: "stemLength",
      before: null,
      after: 90,
    });
    const html = buildHandoff(s, [], defaultHandoff);
    expect(html).toContain("Stem length unknown → 90 mm: too early to tell");
    expect(html).toContain("could not be measured");
    expect(html).toContain("video too short");
    expect(html).toContain("No front or rear view");
    expect(html).toContain("Not measured by the rider:");
    expect(html).toContain("Kept");
    expect(html).toContain("Still being tried.");
  });

  it("works for a fit with nothing recorded yet", () => {
    const html = buildHandoff(newSession(), [], defaultHandoff);
    expect(html).toContain("No changes logged yet");
    expect(html).toContain("No usable side view");
    expect(html).not.toContain("<svg");
  });

  it("puts the warning first when the safety screen stopped advice", () => {
    const s = history();
    s.intake.screen = "urgent-knee";
    const html = buildHandoff(s, [], defaultHandoff);
    expect(html).toContain('role="alert"');
    expect(html.indexOf("Seek urgent medical advice")).toBeLessThan(
      html.indexOf("Handoff"),
    );
  });

  it("does not change the fit", () => {
    const s = history();
    const before = JSON.stringify(sessionSchema.parse(s));
    buildHandoff(s, [], { ...defaultHandoff, notes: true, name: true });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("names the file by date", () => {
    expect(handoffFileName(new Date("2026-11-11T12:00:00Z"))).toBe(
      "cadence-fit-history-2026-11-11.html",
    );
  });
});
