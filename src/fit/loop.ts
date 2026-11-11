import type { Recommendation, Session } from "../domain/types";
import type { LoggedSetting } from "./measurements";
import { activeExperiment } from "./history";
import { holdOf } from "./assessment";
import { sideClipAt } from "./compare";
import { outcomeOf } from "./outcome";

/**
 * Where a rider is in the repeat loop: record a baseline, change one thing,
 * ride with it, record again, then keep or revert it.
 */
export const STAGES = [
  { id: "baseline", label: "Baseline" },
  { id: "change", label: "Change one thing" },
  { id: "ride", label: "Ride with it" },
  { id: "recheck", label: "Record again" },
  { id: "decide", label: "Keep or revert" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

/** The app's steps, by name. */
export type Place = "start" | "record" | "report" | "refine";

export type NextStep = {
  stage: StageId;
  title: string;
  detail: string;
  action: string;
  place: Place;
};

const hasMeasuredSide = (s: Session) =>
  s.clips.some(
    (c) =>
      (c.view === "left" || c.view === "right") &&
      c.metrics.length > 0 &&
      !c.quality.some((q) => q.severity === "reject"),
  );

/** A fit that has started: there is something to come back to. */
export const hasStarted = (s: Session) =>
  s.baseline !== null || s.events.length > 0 || s.clips.length > 0;

export function nextStep(
  session: Session,
  results: Recommendation[],
): NextStep {
  const active = activeExperiment(session);
  if (active) {
    const rides = session.events.filter(
      (e) => e.kind === "ride" && e.experimentId === active.id,
    ).length;
    const outcome = outcomeOf(session, active);
    if (!rides)
      return {
        stage: "ride",
        title: "Ride with the change",
        detail:
          "Ride as you normally do, then log how it felt and rate each symptom. Change nothing else meanwhile.",
        action: "Log a ride",
        place: "refine",
      };
    if (outcome.verdict === "worse")
      return {
        stage: "decide",
        title: "This change made riding worse",
        detail:
          "Put the setting back and log the revert. Cadence will not suggest it again.",
        action: "Revert the change",
        place: "refine",
      };
    if (!sideClipAt(session, session.setupRevision))
      return {
        stage: "recheck",
        title: "Record your position with the change",
        detail:
          "A side view is enough. Cadence compares it with your last recording before the change.",
        action: "Record a side view",
        place: "record",
      };
    if (outcome.verdict === "too-early")
      return {
        stage: "ride",
        title: "Ride with it once more",
        detail: outcome.reasons[0],
        action: "Log a ride",
        place: "refine",
      };
    return {
      stage: "decide",
      title: "Decide whether to keep it",
      detail: `${outcome.title}. ${outcome.reasons[0]}`,
      action: "Keep or revert",
      place: "refine",
    };
  }
  if (!hasMeasuredSide(session)) {
    const i = session.intake;
    const blank =
      !i.bike.trim() && !i.symptoms.length && i.saddleHeight === null;
    return blank
      ? {
          stage: "baseline",
          title: "Tell Cadence about you and your bike",
          detail:
            "What hurts and your current saddle height are enough to start. Leave anything you don't know blank.",
          action: "Your starting point",
          place: "start",
        }
      : {
          stage: "baseline",
          title: "Record your baseline",
          detail:
            "Film one side of the bike while you pedal for 10–30 seconds. Every later change is compared with this.",
          action: "Record a side view",
          place: "record",
        };
  }
  const hold = holdOf(results);
  if (hold)
    return {
      stage: "change",
      title: "Changes are on hold",
      detail: `${hold.title}. ${hold.action}`,
      action: "See why",
      place: "report",
    };
  const next = results.find((r) => r.outcome === "experiment");
  if (next)
    return {
      stage: "change",
      title: next.title,
      detail:
        "Make this one change, measure the new setting, and log it before your next ride.",
      action: "Log the change",
      place: "refine",
    };
  return {
    stage: "change",
    title: "Nothing to change right now",
    detail:
      "Keep logging rides. If a symptom comes back, update Your starting point and the report will suggest a change.",
    action: "Log a ride",
    place: "refine",
  };
}

/** Settings whose first step the report states in millimetres. */
const FIRST_STEP: Partial<
  Record<
    NonNullable<Recommendation["estimate"]>["setting"],
    { logged: LoggedSetting; step: (max: number, min: number) => number }
  >
> = {
  // "Start with 5 mm" when the total is more than 10 mm.
  saddleHeight: {
    logged: "saddleHeight",
    step: (max, min) => (max > 10 ? 5 : Math.round(min)),
  },
  // Stems come in 10 mm steps.
  stem: { logged: "stemLength", step: () => 10 },
};

const SIGN: Partial<
  Record<NonNullable<Recommendation["estimate"]>["direction"], number>
> = {
  raise: 1,
  lower: -1,
  longer: 1,
  shorter: -1,
};

/**
 * The new setting after the first step of a suggested change, so the rider
 * does not do the arithmetic. Only for settings measured in millimetres
 * whose first step the report names.
 */
export function firstStep(
  rec: Recommendation | undefined,
  session: Session,
): { setting: LoggedSetting; after: number } | undefined {
  const e = rec?.estimate;
  if (!e || (e.unit && e.unit !== "mm")) return;
  const rule = FIRST_STEP[e.setting],
    sign = SIGN[e.direction];
  if (!rule || !sign) return;
  const now = session.intake[rule.logged];
  const step = rule.step(e.maxMm, e.minMm);
  if (now === null || !(step > 0)) return;
  return {
    setting: rule.logged,
    after: Math.round((now + sign * step) * 10) / 10,
  };
}

/**
 * A calendar file with one all-day reminder. It is made on this computer
 * and saved like any download; nothing is sent anywhere.
 */
export function reminderFile(date: string, title: string, detail: string) {
  const day = date.replaceAll("-", "");
  const next = new Date(date + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replaceAll("-", "");
  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const esc = (s: string) =>
    s.replace(/([\\,;])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cadence//Fit reminder//EN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@cadence.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(detail)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Today plus `days`, as YYYY-MM-DD in local time. */
export function dayFromNow(days: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
