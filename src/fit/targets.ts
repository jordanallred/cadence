import type { ClipAnalysis, Intake } from "../domain/types";
import { UPPER } from "./recommend";

/**
 * Size-specific numbers for each contact point. Every function returns null
 * when the inputs it needs are missing, so callers can ask for the
 * measurement instead of guessing.
 */

/** Segment lengths as a fraction of standing height (Drillis & Contini). */
export const SEGMENT = {
  upperArm: 0.186,
  forearm: 0.146,
  /** Shoulder joint to hip joint: 0.818 H − 0.530 H. */
  torso: 0.288,
  thigh: 0.245,
};
/** Measured road riders (Holliday & Swart 2021), as % of saddle height. */
export const POPULATION = {
  setback: { mean: 10.3, sd: 2.3 },
  /** Saddle top to the centre of the handlebar clamp. */
  drop: { mean: 13.0, sd: 3.6 },
};
/** Half a 31.8 mm bar: the guide measures drop to the top of the bar. */
const BAR_RADIUS = 16;
/** Typical head angle; spacers move the bar along the steerer. */
const HEAD_ANGLE = 73;
/** Pose and camera error on these model-based numbers. */
const SPREAD = 0.4;

const metric = (c: ClipAnalysis | undefined, id: string) =>
  c?.metrics.find((m) => m.id === id)?.value;
const rad = (deg: number) => (deg * Math.PI) / 180;
const round = (n: number, step = 1) => Math.round(n / step) * step;
export type Range = { min: number; max: number };
const spread = (mm: number, step = 1): Range => {
  const min = Math.max(step, round(mm * (1 - SPREAD), step));
  return { min, max: Math.max(min, round(mm * (1 + SPREAD), step)) };
};
/** Population figures come from road riders; gravel shares the position. */
const roadLike = (i: Intake) =>
  i.discipline === "road" || i.discipline === "gravel";

export type BandCheck = {
  /** ±1 SD of measured riders, in mm for this saddle height. */
  typical: Range;
  /** ±2 SD: outside this the setting is unusual. */
  outer: Range;
  current: number | null;
  /** Signed mm to the nearest edge of `typical`; 0 when inside `outer`. */
  move: number;
};
function band(
  i: Intake,
  p: { mean: number; sd: number },
  current: number | null,
): BandCheck | null {
  if (!i.saddleHeight || !roadLike(i)) return null;
  const at = (k: number) =>
    round((i.saddleHeight! * (p.mean + k * p.sd)) / 100);
  const typical = { min: at(-1), max: at(1) },
    outer = { min: at(-2), max: at(2) };
  let move = 0;
  if (current !== null && current < outer.min) move = typical.min - current;
  if (current !== null && current > outer.max) move = typical.max - current;
  return { typical, outer, current, move };
}

/** Saddle setback against measured road riders of the same saddle height. */
export const setbackCheck = (i: Intake) =>
  band(i, POPULATION.setback, i.saddleSetback);

/** Saddle-to-bar drop against measured road riders (to the clamp centre). */
export function dropCheck(i: Intake): BandCheck | null {
  const b = band(
    i,
    POPULATION.drop,
    i.barDrop === null ? null : i.barDrop + BAR_RADIUS,
  );
  if (!b) return null;
  // Report in the guide's convention: top of the bar.
  const shift = (r: Range) => ({
    min: r.min - BAR_RADIUS,
    max: r.max - BAR_RADIUS,
  });
  return {
    ...b,
    typical: shift(b.typical),
    outer: shift(b.outer),
    current: i.barDrop,
  };
}

/** Handlebar width: centre to centre at the hoods ≈ shoulder width (Lin 2025). */
export function barWidthTarget(i: Intake) {
  if (!i.shoulderWidth || !roadLike(i)) return null;
  const typical = {
    min: round(i.shoulderWidth - 20),
    max: round(i.shoulderWidth + 20),
  };
  /** Drop bars are sold in 20 mm steps, usually 360–460 mm. */
  const size = Math.min(460, Math.max(360, round(i.shoulderWidth, 20)));
  const outside =
    i.barWidth !== null &&
    (i.barWidth > typical.max || i.barWidth < typical.min);
  /** Signed mm from the suggested size; 0 when inside the typical range. */
  const off = outside ? i.barWidth! - size : 0;
  return { typical, size, current: i.barWidth, off };
}

/**
 * Cleat fore-aft: pedal axle under the first metatarsal head or up to 15 mm
 * behind it. Shifts of ±15 mm from the ball changed joint angles but not
 * efficiency or sprint power, and a midfoot cleat cost no measurable
 * performance, so the range is wide and comfort decides inside it.
 */
export const CLEAT = { min: 0, max: 15 };
export function cleatCheck(i: Intake) {
  if (i.cleatOffset === null) return null;
  const off = i.cleatOffset;
  return {
    current: off,
    /** Positive: move the cleat back (towards the heel) by this much. */
    back: off < CLEAT.min ? CLEAT.min - off : 0,
    forward: off > 25 ? off - CLEAT.max : 0,
  };
}

/** Shoulder-to-wrist distance in mm for a given elbow bend. */
function armSpan(heightCm: number, elbowFlex: number) {
  const u = SEGMENT.upperArm * heightCm * 10,
    f = SEGMENT.forearm * heightCm * 10;
  return Math.sqrt(u * u + f * f + 2 * u * f * Math.cos(rad(elbowFlex)));
}

export type ReachChange = {
  direction: "shorter" | "longer";
  /** Horizontal change in hand position, mm. */
  mm: Range;
  /** First stem change, mm. Fitters change stems 10 mm at a time. */
  stemStep: number;
  fromDeg: number;
  toDeg: number;
  basis: string;
};
/**
 * Horizontal bar movement that brings the shoulder angle back inside the
 * practice range, holding the torso still. The hand moves on an arc of
 * radius shoulder-to-wrist; a stem change moves it horizontally, so the
 * needed change is that arc length times the arm's angle below horizontal.
 * The torso also moves on a real bike, so this is an upper estimate.
 */
export function reachChange(
  i: Intake,
  side: ClipAnalysis | undefined,
): ReachChange | null {
  const shoulder = metric(side, "shoulder-angle"),
    torso = metric(side, "torso"),
    elbow = metric(side, "elbow") ?? 15;
  if (!i.riderHeight || shoulder === undefined || torso === undefined)
    return null;
  let toDeg: number | undefined;
  if (shoulder > UPPER.shoulderLong) toDeg = UPPER.shoulderLong - 2;
  else if (shoulder < UPPER.shoulderShort) toDeg = UPPER.shoulderShort + 2;
  const arm = armSpan(i.riderHeight, elbow);
  let mm: number;
  let direction: ReachChange["direction"];
  let basis: string;
  if (toDeg !== undefined) {
    const below = Math.max(15, 180 - torso - shoulder);
    mm = arm * rad(Math.abs(shoulder - toDeg)) * Math.sin(rad(below));
    direction = toDeg < shoulder ? "shorter" : "longer";
    basis = `Shoulder angle ${shoulder}° to ${toDeg}° with a ${Math.round(arm)} mm arm (from your ${i.riderHeight} cm height), holding the torso still. ±40% for camera and landmark error.`;
  } else if (elbow < UPPER.elbowLocked) {
    // Arms in range but nearly straight: soften the elbows to 15°.
    mm =
      (armSpan(i.riderHeight, elbow) - armSpan(i.riderHeight, 15)) *
      Math.cos(rad(Math.max(15, 180 - torso - shoulder)));
    toDeg = shoulder;
    direction = "shorter";
    basis = `Elbow bend ${elbow}° to 15° with a ${Math.round(arm)} mm arm (from your ${i.riderHeight} cm height). ±40% for camera and landmark error.`;
  } else return null;
  const range = spread(mm);
  return {
    direction,
    mm: range,
    stemStep: 10,
    fromDeg: shoulder,
    toDeg,
    basis,
  };
}

export type DropChange = {
  /** Bar rise needed, mm. */
  mm: Range;
  /** Spacer stack to move from above to below the stem, mm, 5 mm steps. */
  spacers: Range;
  fromDeg: number;
  toDeg: number;
  basis: string;
};
/**
 * Bar rise that lifts the torso to the discipline's practice minimum plus
 * 2°, matching the 2° margin used for the saddle. With the hips fixed, raising the shoulders by h tilts the torso by
 * about h / (torso length × cos angle).
 */
export function dropChange(
  i: Intake,
  side: ClipAnalysis | undefined,
): DropChange | null {
  const torso = metric(side, "torso");
  if (!i.riderHeight || torso === undefined) return null;
  const min = UPPER.torsoMin[i.discipline];
  if (torso >= min) return null;
  const toDeg = min + 2,
    length = SEGMENT.torso * i.riderHeight * 10;
  const mm = length * Math.cos(rad(torso)) * rad(toDeg - torso);
  const range = spread(mm);
  const along = (x: number) =>
    Math.max(5, round(x / Math.sin(rad(HEAD_ANGLE)), 5));
  return {
    mm: range,
    spacers: { min: along(range.min), max: along(range.max) },
    fromDeg: torso,
    toDeg,
    basis: `Torso ${torso}° to ${toDeg}° with a ${Math.round(length)} mm torso (from your ${i.riderHeight} cm height), hips fixed. Spacers sit on a ~${HEAD_ANGLE}° steerer. ±40% for camera and landmark error.`,
  };
}

/** Knee centre ahead (+) or behind (−) the ball of the foot, crank forward. */
export function kneeOverBall(i: Intake, side: ClipAnalysis | undefined) {
  const kops = metric(side, "kops");
  if (!i.riderHeight || kops === undefined) return null;
  return round((kops / 100) * SEGMENT.thigh * i.riderHeight * 10);
}

export const rangeText = (r: Range, unit = "mm") =>
  r.min === r.max ? `${r.min} ${unit}` : `${r.min}–${r.max} ${unit}`;
