import type { FitEvent, Intake, SymptomRating } from "../domain/types";

/** A rating change this size or larger, out of 10, counts as real. */
export const RATING_STEP = 2;

const key = (r: { area: string; side: string }) => `${r.area}:${r.side}`;

/** The ratings that applied just before a change. */
export function ratingsBefore(
  events: FitEvent[],
  intake: Intake,
  change: FitEvent,
): SymptomRating[] {
  if (change.symptoms) return change.symptoms;
  // Older changes have no snapshot: the latest rated ride before it, then
  // the symptoms from Your starting point.
  const at = events.indexOf(change);
  const ride = events
    .slice(0, at < 0 ? events.length : at)
    .reverse()
    .find((e) => e.kind === "ride" && e.symptoms?.length);
  return (
    ride?.symptoms ??
    intake.symptoms.map(({ area, side, severity }) => ({
      area,
      side,
      severity,
    }))
  );
}

/** Each symptom's rating before a change and on the latest rated ride with it. */
export function ratingChanges(
  events: FitEvent[],
  intake: Intake,
  change: FitEvent,
) {
  const last = [...events]
    .reverse()
    .find(
      (e) =>
        e.kind === "ride" && e.experimentId === change.id && e.symptoms?.length,
    );
  if (!last) return [];
  return ratingsBefore(events, intake, change).flatMap((b) => {
    const a = last.symptoms!.find((r) => key(r) === key(b));
    return a ? [{ rating: b, before: b.severity, after: a.severity }] : [];
  });
}

/** A symptom rated at least RATING_STEP worse since the change. */
export const ratedWorse = (
  events: FitEvent[],
  intake: Intake,
  change: FitEvent,
) =>
  ratingChanges(events, intake, change).some(
    (c) => c.after - c.before >= RATING_STEP,
  );

/** The ratings to start a new ride form from: the most recent ones. */
export function latestRatings(
  events: FitEvent[],
  intake: Intake,
): SymptomRating[] {
  const last = [...events].reverse().find((e) => e.symptoms?.length)?.symptoms;
  return intake.symptoms.map(({ area, side, severity }) => ({
    area,
    side,
    severity:
      last?.find((r) => key(r) === key({ area, side }))?.severity ?? severity,
  }));
}
