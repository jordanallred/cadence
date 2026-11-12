import type { FitEvent, Session } from "../domain/types";
import {
  compareSetups,
  headline,
  headlineText,
  revisionAfter,
  type MetricChange,
} from "./compare";
import { symptomName } from "./symptoms";
import {
  RATING_STEP,
  ratingChanges,
  latestRatings as latest,
  ratingsBefore as before,
} from "./ratings";

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
export { RATING_STEP };

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

/** The ratings that applied just before a change. */
export const ratingsBefore = (session: Session, change: FitEvent) =>
  before(session.events, session.intake, change);

/** The ratings to start a new ride form from: the most recent ones. */
export const latestRatings = (session: Session) =>
  latest(session.events, session.intake);

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

  const symptoms: SymptomChange[] = ratingChanges(
    session.events,
    session.intake,
    change,
  ).map((c) => ({
    name: symptomName({ ...c.rating, severity: 1, warning: false }),
    before: c.before,
    after: c.after,
    delta: c.after - c.before,
  }));
  const hadRatings = ratingsBefore(session, change).length > 0;

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

  if (rides.length && !symptoms.length && hadRatings)
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
