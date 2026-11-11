import type { FitEvent, Session, SymptomRating } from "../domain/types";
import {
  compareSetups,
  headline,
  headlineText,
  revisionAfter,
  type MetricChange,
} from "./compare";
import { symptomName } from "./symptoms";

/**
 * Did one change help? Comfort is the outcome: the rider's own symptom
 * ratings and how rides felt decide it. The video says whether the position
 * actually moved, which is evidence about the change, not about comfort.
 *
 * Cadence says "too early" or "mixed" instead of guessing when the evidence
 * is thin or points both ways.
 */
export type Verdict =
  "helped" | "no-difference" | "worse" | "mixed" | "too-early";

/** Rides needed before a change that did not make things worse is judged. */
export const MIN_RIDES = 2;
/** A rating change this size or larger, out of 10, counts as real. */
export const RATING_STEP = 2;

export type SymptomChange = {
  name: string;
  before: number;
  after: number;
  delta: number;
};

export type Outcome = {
  verdict: Verdict;
  /** Short verdict, e.g. "Helped". */
  title: string;
  /** Why, one sentence each, most important first. */
  reasons: string[];
  rides: { total: number; better: number; same: number; worse: number };
  symptoms: SymptomChange[];
  /** What the next recording showed, when there is one. */
  video?: { text: string; change: MetricChange };
};

const TITLE: Record<Verdict, string> = {
  helped: "Helped",
  "no-difference": "No clear difference",
  worse: "Made it worse",
  mixed: "Mixed signals",
  "too-early": "Too early to tell",
};

const key = (r: { area: string; side: string }) => `${r.area}:${r.side}`;

/** The ratings that applied just before a change. */
export function ratingsBefore(
  session: Session,
  change: FitEvent,
): SymptomRating[] {
  if (change.symptoms) return change.symptoms;
  // Older changes have no snapshot: the latest rated ride before it, then
  // the symptoms from Your starting point.
  const at = session.events.indexOf(change);
  const ride = session.events
    .slice(0, at < 0 ? session.events.length : at)
    .reverse()
    .find((e) => e.kind === "ride" && e.symptoms?.length);
  return (
    ride?.symptoms ??
    session.intake.symptoms.map(({ area, side, severity }) => ({
      area,
      side,
      severity,
    }))
  );
}

/** The ratings to start a new ride form from: the most recent ones. */
export function latestRatings(session: Session): SymptomRating[] {
  const current = session.intake.symptoms;
  const last = [...session.events]
    .reverse()
    .find((e) => e.symptoms?.length)?.symptoms;
  return current.map(({ area, side, severity }) => ({
    area,
    side,
    severity:
      last?.find((r) => key(r) === key({ area, side }))?.severity ?? severity,
  }));
}

export function outcomeOf(session: Session, change: FitEvent): Outcome {
  const rides = session.events.filter(
    (e) => e.kind === "ride" && e.experimentId === change.id,
  );
  const count = (r: FitEvent["response"]) =>
    rides.filter((e) => e.response === r).length;
  const tally = {
    total: rides.length,
    better: count("better"),
    same: count("same"),
    worse: count("worse"),
  };

  const before = ratingsBefore(session, change);
  const lastRated = [...rides].reverse().find((e) => e.symptoms?.length);
  const symptoms: SymptomChange[] = lastRated
    ? before.flatMap((b) => {
        const a = lastRated.symptoms!.find((r) => key(r) === key(b));
        if (!a) return [];
        return [
          {
            name: symptomName({
              ...b,
              severity: Math.max(1, b.severity),
              warning: false,
            }),
            before: b.severity,
            after: a.severity,
            delta: a.severity - b.severity,
          },
        ];
      })
    : [];

  const video = videoAfter(session, change);

  const symptomSignal = !symptoms.length
    ? undefined
    : symptoms.some((s) => s.delta >= RATING_STEP)
      ? "worse"
      : symptoms.some((s) => s.delta <= -RATING_STEP)
        ? "better"
        : "same";
  const rideSignal = !rides.length
    ? undefined
    : tally.worse > tally.better
      ? "worse"
      : tally.better > tally.worse
        ? "better"
        : "same";

  const reasons: string[] = [];
  const worseNames = symptoms.filter((s) => s.delta >= RATING_STEP);
  const betterNames = symptoms.filter((s) => s.delta <= -RATING_STEP);
  const rideLine = () =>
    `${tally.total} ${tally.total === 1 ? "ride" : "rides"} with it: ${[
      tally.better && `${tally.better} better`,
      tally.same && `${tally.same} about the same`,
      tally.worse && `${tally.worse} worse`,
    ]
      .filter(Boolean)
      .join(", ")}.`;
  const symptomLine = (list: SymptomChange[]) =>
    list
      .map(
        (s) =>
          `${s.name[0].toUpperCase() + s.name.slice(1)} ${s.before} → ${s.after}/10`,
      )
      .join("; ") + ".";

  let verdict: Verdict;
  if (!rides.length) {
    verdict = "too-early";
    reasons.push("No ride logged with this change yet.");
  } else if (
    (symptomSignal === "better" && rideSignal === "worse") ||
    (symptomSignal === "worse" && rideSignal === "better") ||
    (worseNames.length && betterNames.length)
  ) {
    verdict = "mixed";
    reasons.push(
      worseNames.length && betterNames.length
        ? "Some symptoms eased and others got worse."
        : "Your rides and your symptom ratings point different ways.",
    );
    if (symptoms.length)
      reasons.push(symptomLine([...worseNames, ...betterNames]));
    reasons.push(rideLine());
  } else if (symptomSignal === "worse" || rideSignal === "worse") {
    // Worse is reported after one ride: no need to keep riding a change that hurts.
    verdict = "worse";
    if (worseNames.length) reasons.push(symptomLine(worseNames));
    reasons.push(rideLine());
  } else if (rides.length < MIN_RIDES) {
    verdict = "too-early";
    reasons.push(
      `One ride is an early sign, not an answer. Ride with it at least ${MIN_RIDES - rides.length} more ${MIN_RIDES - rides.length === 1 ? "time" : "times"}.`,
    );
    if (betterNames.length) reasons.push(symptomLine(betterNames));
  } else if (symptomSignal === "better" || rideSignal === "better") {
    verdict = "helped";
    if (betterNames.length) reasons.push(symptomLine(betterNames));
    reasons.push(rideLine());
  } else {
    verdict = "no-difference";
    reasons.push(
      symptoms.length
        ? `Symptom ratings moved by less than ${RATING_STEP} points out of 10.`
        : "Rides felt about the same.",
    );
    reasons.push(rideLine());
  }

  if (rides.length && !symptoms.length && before.length)
    reasons.push(
      "Rate your symptoms on the next ride to compare them with before the change.",
    );
  if (video?.change.withinNoise && verdict === "helped")
    reasons.push(
      "The video shows no measurable change in position, so how it felt is the only evidence.",
    );

  return {
    verdict,
    title: TITLE[verdict],
    reasons,
    rides: tally,
    symptoms,
    video,
  };
}

/** The first side-view recording after a change, compared with before it. */
function videoAfter(session: Session, change: FitEvent) {
  const rev = revisionAfter(session).get(change.id);
  if (rev === undefined) return;
  const cmp = compareSetups(session, rev);
  const top = cmp && headline(cmp.metrics);
  return top ? { text: headlineText(top), change: top } : undefined;
}
