import type { Intake } from "../domain/types";

export type MeasureKey =
  | "riderHeight"
  | "shoulderWidth"
  | "saddleHeight"
  | "saddleSetback"
  | "saddleTilt"
  | "crankLength"
  | "barReach"
  | "barDrop"
  | "stemLength"
  | "barWidth"
  | "cleatOffset";

export type Measurement = {
  key: MeasureKey;
  label: string;
  unit: "mm" | "cm" | "°";
  min: number;
  max: number;
  /** One line shown under the input. */
  hint: string;
  /** Step-by-step method for the measuring guide. */
  steps: string[];
  /** What the app uses this number for. */
  usedFor: string;
};

/**
 * Every setup measurement the app accepts, in the order a rider takes them.
 * The limits match the profile schema.
 */
export const measurements: Measurement[] = [
  {
    key: "riderHeight",
    label: "Your height",
    unit: "cm",
    min: 100,
    max: 230,
    hint: "Standing barefoot against a wall.",
    steps: [
      "Stand barefoot with your heels, back and head against a wall.",
      "Rest a book flat on your head, square to the wall, and mark the wall under it.",
      "Measure from the floor to the mark.",
    ],
    usedFor:
      "Scales the video to millimetres, so reach, drop and knee position can be given as lengths.",
  },
  {
    key: "shoulderWidth",
    label: "Shoulder width",
    unit: "mm",
    min: 250,
    max: 600,
    hint: "Between the bony points on top of each shoulder.",
    steps: [
      "Stand relaxed. Find the bony point at the outer tip of each shoulder (the acromion), where the collarbone ends.",
      "Have someone measure straight across between the two points with a rigid ruler or calipers, not around the back.",
      "Measure twice and use the average.",
    ],
    usedFor: "Suggested road and gravel handlebar width.",
  },
  {
    key: "saddleHeight",
    label: "Saddle height",
    unit: "mm",
    min: 1,
    max: 1500,
    hint: "Centre of the crank axle to the top of the saddle, along the seat tube.",
    steps: [
      "Put the bike on level ground or a trainer and turn a crank so it lines up with the seat tube.",
      "Measure from the centre of the crank axle, along the seat tube line, to the top of the saddle where you sit.",
      "Mark that point on the saddle with tape so later measurements use the same spot.",
    ],
    usedFor:
      "Turns the knee-angle result into millimetres, and scales the setback and drop checks.",
  },
  {
    key: "saddleSetback",
    label: "Saddle setback",
    unit: "mm",
    min: -200,
    max: 400,
    hint: "Horizontal distance from the crank axle back to the saddle nose. Negative if the nose is ahead.",
    steps: [
      "Level the bike front to back; check with a spirit level on the top tube or a phone level app on the wheel axles.",
      "Hang a plumb line (a string with a small weight) from the tip of the saddle nose.",
      "Measure horizontally along the floor from the string to the centre of the crank axle.",
    ],
    usedFor: "Saddle fore-aft check against measured riders.",
  },
  {
    key: "saddleTilt",
    label: "Saddle tilt",
    unit: "°",
    min: -30,
    max: 30,
    hint: "Negative means nose down. Note what you measured against.",
    steps: [
      "Level the bike as above.",
      "Lay a straight ruler along the saddle from nose to tail and put a level or phone level app on it.",
      "Record the angle. Negative means the nose points down.",
    ],
    usedFor: "Recorded so changes can be compared and undone.",
  },
  {
    key: "crankLength",
    label: "Crank length",
    unit: "mm",
    min: 80,
    max: 250,
    hint: "Stamped on the inside of the crank arm, e.g. 172.5.",
    steps: [
      "Look on the inside face of the crank arm near the pedal. The length is stamped there, usually 165 to 175.",
    ],
    usedFor: "Refines the saddle height estimate.",
  },
  {
    key: "barReach",
    label: "Saddle to bar reach",
    unit: "mm",
    min: 300,
    max: 900,
    hint: "Horizontal, from the saddle nose to the centre of the handlebar clamp.",
    steps: [
      "Level the bike and hang the plumb line from the saddle nose again.",
      "Hang a second plumb line from the centre of the handlebar where the stem clamps it.",
      "Measure along the floor between the two strings.",
    ],
    usedFor:
      "Shows your current reach next to the suggested change, so you can confirm it after a stem swap.",
  },
  {
    key: "barDrop",
    label: "Saddle to bar drop",
    unit: "mm",
    min: -200,
    max: 300,
    hint: "Vertical, from the top of the saddle down to the top of the bar at the stem. Negative if the bar is higher.",
    steps: [
      "Level the bike.",
      "Rest a long straight edge on the saddle at your height mark and hold it level with a spirit level, reaching past the handlebar.",
      "Measure straight down from the straight edge to the top of the handlebar beside the stem.",
    ],
    usedFor:
      "Drop check against measured riders, and the spacer suggestion when your torso is low.",
  },
  {
    key: "stemLength",
    label: "Stem length",
    unit: "mm",
    min: 20,
    max: 160,
    hint: "Usually printed on the stem, e.g. 100.",
    steps: [
      "Look for a number printed on the stem, often with its angle (for example 100 mm, −6°).",
      "If there is none, measure from the centre of the steerer clamp to the centre of the handlebar clamp.",
    ],
    usedFor: "Names the stem to try, e.g. 100 mm to 90 mm.",
  },
  {
    key: "barWidth",
    label: "Handlebar width",
    unit: "mm",
    min: 300,
    max: 900,
    hint: "Drop bars: centre to centre at the hoods. Flat bars: end to end.",
    steps: [
      "Drop bars: measure across the bar at the hoods, from the centre of one bar tube to the centre of the other. Brands label width differently, so measure rather than trusting the sticker.",
      "Flat bars: measure from end to end.",
    ],
    usedFor: "Compared with your shoulder width.",
  },
  {
    key: "cleatOffset",
    label: "Cleat position",
    unit: "mm",
    min: -40,
    max: 60,
    hint: "How far the pedal axle sits behind the ball of your foot. Negative if it is ahead.",
    steps: [
      "Sit with your shoe on. Feel for the bony bump on the inside of your foot behind the big toe (the first metatarsal head) and mark the shoe upper beside it with tape.",
      "Take the shoe off. Most cleats have a centre mark or line that sits over the pedal axle; if not, use the middle of the cleat's front-to-back length.",
      "Measure along the length of the sole from the tape mark to the cleat centre. Positive means the cleat centre is behind the mark, towards the heel.",
    ],
    usedFor: "Cleat fore-aft check, especially for foot or calf symptoms.",
  },
];

export const measurement = (key: MeasureKey) =>
  measurements.find((m) => m.key === key)!;

/** Settings an adjustment can be logged against, with their schema limits. */
export type LoggedSetting = Extract<
  MeasureKey,
  | "saddleHeight"
  | "saddleSetback"
  | "saddleTilt"
  | "barReach"
  | "barDrop"
  | "stemLength"
  | "barWidth"
  | "cleatOffset"
>;
export const loggedSettings: LoggedSetting[] = [
  "saddleHeight",
  "saddleSetback",
  "saddleTilt",
  "barReach",
  "barDrop",
  "stemLength",
  "barWidth",
  "cleatOffset",
];
export const isMeasured = (i: Intake, key: MeasureKey) => i[key] !== null;
