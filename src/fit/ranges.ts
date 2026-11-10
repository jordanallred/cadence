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
  basis: string;
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
        basis: "Range from published dynamic-fit studies",
      };
    case "shoulder-angle":
      return {
        scale: [50, 130],
        low: UPPER.shoulderShort,
        high: UPPER.shoulderLong,
        basis: "Common fitting practice, not a research cut-off",
      };
    case "elbow":
      return {
        scale: [0, 50],
        low: UPPER.elbowLocked,
        basis: "Common fitting practice, not a research cut-off",
      };
    case "torso":
      return {
        scale: [0, 80],
        low: UPPER.torsoMin[intake.discipline],
        basis: `Common practice for ${intake.discipline} riding; only acted on with neck, back or hand symptoms`,
      };
  }
}

/** Plain-language position of a value against its range. */
export function describeRange(value: number, r: TargetRange, unit: string) {
  const range =
    r.low !== undefined && r.high !== undefined
      ? `${r.low}–${r.high}${unit}`
      : r.low !== undefined
        ? `${r.low}${unit} or more`
        : `${r.high}${unit} or less`;
  if (r.low !== undefined && value < r.low)
    return {
      inside: false,
      text: `${round(r.low - value)}${unit} below ${range}`,
    };
  if (r.high !== undefined && value > r.high)
    return {
      inside: false,
      text: `${round(value - r.high)}${unit} above ${range}`,
    };
  return { inside: true, text: `Within ${range}` };
}
const round = (n: number) => Math.round(n * 10) / 10;
