import { RULE_VERSION } from "./evidence";
import type {
  CaptureAttempt,
  FitEvent,
  Recommendation,
  Session,
  Symptom,
} from "../domain/types";

/**
 * The anonymous pilot log: what a rider sends the pilot lead at the end of
 * the 90-day pilot (docs/pilot/protocol.md). It answers "did this rider get
 * round the loop, and where did capture fail?" without anything that could
 * identify them.
 *
 * Never included: name, bike name, goal, notes, any other free text, body or
 * bike measurements, video, still frames, pose landmarks, clip file names,
 * or calendar times beyond the start date. Times are hours since the fit
 * started.
 *
 * The participant code is the one the pilot lead hands out (e.g. "P07"). It
 * is the only way to join a log to the interview and fitter measurements.
 */
export const PILOT_FORMAT = "cadence-pilot-log";
export const PILOT_VERSION = 1;
export const PILOT_CODE = /^[A-Z]{1,3}[0-9]{1,3}$/;

export type PilotLog = ReturnType<typeof buildPilotLog>;

const hours = (from: string, to: string) =>
  Math.round(((Date.parse(to) - Date.parse(from)) / 3_600_000) * 10) / 10;

const symptoms = (list: Symptom[]) =>
  list.map(({ area, side, severity, warning }) => ({
    area,
    side,
    severity,
    warning,
  }));

/** One adjustment and what followed it, up to the next adjustment. */
function cycles(s: Session) {
  const adjustments = s.events.filter((e) => e.kind === "adjustment");
  return adjustments.map((a, n) => {
    const until = adjustments[n + 1]?.at ?? "9999";
    const rides = s.events.filter(
      (e) => e.kind === "ride" && e.experimentId === a.id,
    );
    const decision = s.events.find(
      (e) =>
        (e.kind === "retain" || e.kind === "revert") && e.experimentId === a.id,
    );
    const reRecorded = s.clips.some(
      (c) =>
        c.createdAt > a.at &&
        c.createdAt < until &&
        !c.quality.some((q) => q.severity === "reject"),
    );
    return {
      adjustment: a,
      rides,
      decision,
      reRecorded,
      // The loop: one change, ridden at least once, re-recorded, kept or
      // reverted.
      complete: rides.length > 0 && reRecorded && !!decision,
    };
  });
}

export function buildPilotLog(
  s: Session,
  results: Recommendation[],
  opts: { code: string | null; appVersion: string; now?: Date },
) {
  const start = s.createdAt;
  const at = (iso: string) => hours(start, iso);
  const first = (list: { at: string }[]) => (list[0] ? at(list[0].at) : null);
  const accepted = s.clips.filter(
    (c) => !c.quality.some((q) => q.severity === "reject"),
  );
  const loops = cycles(s);
  const byTime = <T extends { at: string }>(list: T[]) =>
    [...list].sort((a, b) => a.at.localeCompare(b.at));
  const clipsAt = byTime(accepted.map((c) => ({ at: c.createdAt })));
  const rides = s.events.filter((e) => e.kind === "ride");
  const decisions = s.events.filter(
    (e) => e.kind === "retain" || e.kind === "revert",
  );
  const firstAdjustment = s.events.find((e) => e.kind === "adjustment");
  const reRecord =
    firstAdjustment && clipsAt.find((c) => c.at > firstAdjustment.at);
  const views = ["left", "right", "front", "rear"] as const;
  const code = opts.code && PILOT_CODE.test(opts.code) ? opts.code : null;

  return {
    format: PILOT_FORMAT,
    version: PILOT_VERSION,
    participant: code,
    exportedOn: (opts.now ?? new Date()).toISOString().slice(0, 10),
    startedOn: start.slice(0, 10),
    app: {
      version: opts.appVersion,
      rules: RULE_VERSION,
      poseModel: [...new Set(s.clips.map((c) => c.modelVersion))],
    },
    discipline: s.intake.discipline,
    /** Hours from starting the fit to the first time each step happened. */
    loop: {
      baselineRecorded: clipsAt[0] ? at(clipsAt[0].at) : null,
      firstAdjustment: firstAdjustment ? at(firstAdjustment.at) : null,
      firstRide: first(byTime(rides)),
      reRecorded: reRecord ? at(reRecord.at) : null,
      firstKeepOrRevert: first(byTime(decisions)),
      cyclesStarted: loops.length,
      cyclesComplete: loops.filter((l) => l.complete).length,
    },
    recordings: {
      total: s.clips.length,
      accepted: accepted.length,
      rejected: s.clips.length - accepted.length,
      reviewed: s.clips.filter((c) => c.reviewed).length,
      corrected: s.clips.filter((c) => c.frames.some((f) => f.corrected))
        .length,
      byView: Object.fromEntries(
        views.map((v) => [v, s.clips.filter((c) => c.view === v).length]),
      ),
    },
    /**
     * Every analysis attempt, including clips the rider later deleted and
     * analyses that failed outright. Reason codes, never messages.
     */
    captures: (s.captureLog ?? []).map((c: CaptureAttempt) => ({
      hours: at(c.at),
      view: c.view,
      result: c.result,
      reasons: c.codes,
    })),
    symptoms: {
      atStart: symptoms((s.baseline ?? s.intake).symptoms),
      now: symptoms(s.intake.symptoms),
    },
    cycles: loops.map((l) => ({
      hours: at(l.adjustment.at),
      setting: l.adjustment.setting ?? "other",
      change: change(l.adjustment),
      rides: l.rides.map((r) => ({
        hours: at(r.at),
        minutes: r.duration ?? null,
        intensity: r.intensity ?? null,
        comfort: r.comfort ?? null,
        response: r.response ?? null,
      })),
      reRecorded: l.reRecorded,
      decision: l.decision?.kind ?? null,
      decidedHours: l.decision ? at(l.decision.at) : null,
      complete: l.complete,
    })),
    /** Rides logged with no change under test. */
    otherRides: rides
      .filter((r) => !r.experimentId)
      .map((r) => ({
        hours: at(r.at),
        minutes: r.duration ?? null,
        comfort: r.comfort ?? null,
        response: r.response ?? null,
      })),
    advice: results.map((r) => ({
      rule: r.id,
      outcome: r.outcome,
      urgency: r.urgency,
      priority: r.priority ?? null,
      ruleStrength: r.confidence ?? null,
      setting: r.estimate?.setting ?? null,
      direction: r.estimate?.direction ?? null,
    })),
  };
}

/** Signed change in mm, when both settings were measured. */
function change(e: FitEvent) {
  return typeof e.before === "number" && typeof e.after === "number"
    ? Math.round((e.after - e.before) * 10) / 10
    : null;
}

/** Plain-language list of what the file holds, shown before download. */
export const PILOT_INCLUDES = [
  "When you recorded, changed something, rode, re-recorded, and kept or reverted, as hours since you started",
  "How many recordings you made per view, and the reason code for each one Cadence rejected",
  "Your symptom areas and 1–10 ratings at the start and now, and your ride ratings",
  "Which setting you changed and by how much (mm or degrees)",
  "Which advice Cadence gave, and the app, rule and pose-model versions",
];
export const PILOT_EXCLUDES =
  "No name, bike, notes or other text you typed, no body or bike measurements, no video, still frames or joint positions, and no clip file names.";
