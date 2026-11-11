import type { Intake } from "../domain/types";
import { KNEE, UPPER } from "./recommend";

export type TargetRange = {
  /** Axis drawn on the bar. */
  scale: [number, number];
  low?: number;
  high?: number;
  outerLow?: number;
  outerHigh?: number;
  /** Where the range comes from, in words a rider understands. */
  basis: "research" | "practice";
  /** When the recommendations act on this value. */
  note?: string;
};

/**
 * Target ranges for the metrics the recommendations act on. They are the
 * same thresholds recommend() uses, so the bars never disagree with the
 * advice.
 */
export function targetRange(
  id: string,
  intake: Intake,
): TargetRange | undefined {
  switch (id) {
    case "knee-min":
      return {
        scale: [10, 60],
        low: KNEE.low,
        high: KNEE.high,
        outerLow: KNEE.outerLow,
        outerHigh: KNEE.outerHigh,
        basis: "research",
      };
    case "shoulder-angle":
      return {
        scale: [50, 130],
        low: UPPER.shoulderShort,
        high: UPPER.shoulderLong,
        basis: "practice",
      };
    case "elbow":
      return {
        scale: [0, 50],
        low: UPPER.elbowLocked,
        basis: "practice",
      };
    case "torso":
      return {
        scale: [0, 80],
        low: UPPER.torsoMin[intake.discipline],
        // The minimum depends on the riding discipline set in the profile.
        basis: "practice",
        note: "Torso angle is only acted on if you have neck, back or hand symptoms.",
      };
  }
}

/** The target written out, e.g. "30–40°" or "at least 10°". */
export function rangeText(r: TargetRange, unit: string) {
  if (r.low !== undefined && r.high !== undefined)
    return `${r.low}–${r.high}${unit}`;
  return r.low !== undefined
    ? `at least ${r.low}${unit}`
    : `at most ${r.high}${unit}`;
}

/** Plain-language position of a value against its range. */
export function describeRange(
  value: number,
  r: TargetRange,
  unit: string,
): { state: "inside" | "near" | "outside"; text: string } {
  const target = rangeText(r, unit);
  const off = (gap: number, side: string, state: "near" | "outside") => ({
    state,
    text: `${round(gap)}${unit} ${side} the target (${target})`,
  });
  if (r.low !== undefined && value < r.low)
    return off(
      r.low - value,
      "below",
      r.outerLow !== undefined && value >= r.outerLow ? "near" : "outside",
    );
  if (r.high !== undefined && value > r.high)
    return off(
      value - r.high,
      "above",
      r.outerHigh !== undefined && value <= r.outerHigh ? "near" : "outside",
    );
  return { state: "inside", text: `Inside the target (${target})` };
}
const round = (n: number) => Math.round(n * 10) / 10;
