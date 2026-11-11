import type { Symptom, SymptomArea } from "../domain/types";

/**
 * A bike setting a symptom pushes on, and which way. "level" asks for the
 * saddle to be brought back to level from either side.
 */
export type Lever =
  | { setting: "saddleHeight"; dir: "raise" | "lower" }
  | { setting: "setback"; dir: "back" | "forward" }
  | { setting: "tilt"; dir: "nose-down" | "level" }
  | { setting: "reach"; dir: "shorter" }
  | { setting: "barHeight"; dir: "raise" }
  | { setting: "cleat"; dir: "back" }
  | { setting: "stance"; dir: "wider" | "narrower" }
  | { setting: "rotation"; dir: "toe-in" | "toe-out" }
  | { setting: "crank"; dir: "shorter" }
  | { setting: "barWidth"; dir: "match" };

export type AreaInfo = {
  label: string;
  /** Short form used inside sentences: "front-of-knee pain". */
  noun: string;
  group: string;
  /** Has a left and a right. */
  sided: boolean;
  /** Numbness rather than pain: changes the warning wording. */
  numb?: boolean;
  /** Not a pain: something the rider notices. No severity warning. */
  sign?: boolean;
  /** What the fitting literature links it to, in one or two sentences. */
  cause: string;
  /** Bike settings, most likely first. */
  levers: Lever[];
  /** Things off the bike or in kit that help, always shown. */
  also: string;
  sources: string[];
  /** Who to see if it is held back for safety. */
  clinician: string;
};

/**
 * Common bike-fit complaints and what fitters and clinicians link them to.
 * Drawn from reviews of cycling overuse injury (Wanich 2007, Mellion 1991,
 * Asplund 2004, Kotler 2023), hand-nerve (Patterson 2003) and saddle
 * (Bressel 2003, saddle-pressure review 2023) studies. These are the usual
 * suspects, not diagnoses: each change is an experiment.
 */
export const AREAS: Record<SymptomArea, AreaInfo> = {
  "knee-front": {
    label: "Front of the knee or kneecap",
    noun: "front-of-knee pain",
    group: "Knees",
    sided: true,
    cause:
      "Most often a saddle that is too low or too far forward, which loads the kneecap and quadriceps tendon. Big gears at low cadence add to it.",
    levers: [
      { setting: "saddleHeight", dir: "raise" },
      { setting: "setback", dir: "back" },
      { setting: "crank", dir: "shorter" },
    ],
    also: "Spin lighter gears at 80–90 rpm on climbs for a few weeks.",
    sources: ["wanich", "asplund", "kotler"],
    clinician: "a sports physiotherapist",
  },
  "knee-back": {
    label: "Back of the knee",
    noun: "back-of-knee pain",
    group: "Knees",
    sided: true,
    cause:
      "Most often a saddle that is too high or too far back, which over-straightens the knee and strains the hamstring tendons behind it.",
    levers: [
      { setting: "saddleHeight", dir: "lower" },
      { setting: "setback", dir: "forward" },
    ],
    also: "Hamstring flexibility matters here; gentle stretching helps.",
    sources: ["wanich", "asplund"],
    clinician: "a sports physiotherapist",
  },
  "knee-inner": {
    label: "Inside of the knee",
    noun: "inner-knee pain",
    group: "Knees",
    sided: true,
    cause:
      "Usually the foot: a cleat that turns the toes further out than they sit naturally, a stance that is too wide, or a flat foot that lets the knee drop inward.",
    levers: [
      { setting: "rotation", dir: "toe-in" },
      { setting: "stance", dir: "narrower" },
    ],
    also: "An insole with arch support often helps if your arch collapses under load.",
    sources: ["wanich", "asplund", "kotler"],
    clinician: "a sports physiotherapist or podiatrist",
  },
  "knee-outer": {
    label: "Outside of the knee",
    noun: "outer-knee pain",
    group: "Knees",
    sided: true,
    cause:
      "Often the iliotibial band rubbing at the knee: cleats that turn the toes in, a stance that is too narrow, or a saddle that is too high or too far back.",
    levers: [
      { setting: "rotation", dir: "toe-out" },
      { setting: "stance", dir: "wider" },
      { setting: "saddleHeight", dir: "lower" },
      { setting: "setback", dir: "forward" },
    ],
    also: "Foam-rolling and stretching the outer thigh and glutes helps.",
    sources: ["wanich", "asplund"],
    clinician: "a sports physiotherapist",
  },
  "it-band": {
    label: "Outside of the thigh or hip (IT band)",
    noun: "IT band pain",
    group: "Hips & legs",
    sided: true,
    cause:
      "The iliotibial band is under tension when the saddle is too high or too far back, the cleats turn the toes in, or the feet sit too close together.",
    levers: [
      { setting: "saddleHeight", dir: "lower" },
      { setting: "rotation", dir: "toe-out" },
      { setting: "stance", dir: "wider" },
      { setting: "setback", dir: "forward" },
    ],
    also: "Stretch the glutes and outer thigh; ease volume until it settles.",
    sources: ["wanich", "asplund", "kotler"],
    clinician: "a sports physiotherapist",
  },
  "hip-front": {
    label: "Front of the hip or a pinch in the groin",
    noun: "front-of-hip pain",
    group: "Hips & legs",
    sided: true,
    cause:
      "The hip closes too far at the top of the stroke: a low saddle, a low or distant handlebar, or long cranks.",
    levers: [
      { setting: "saddleHeight", dir: "raise" },
      { setting: "barHeight", dir: "raise" },
      { setting: "crank", dir: "shorter" },
    ],
    also: "Pedals with float let the foot turn out, which some hips need.",
    sources: ["kotler"],
    clinician: "a sports physiotherapist",
  },
  hamstring: {
    label: "Hamstring or back of the thigh",
    noun: "hamstring pain",
    group: "Hips & legs",
    sided: true,
    cause:
      "The hamstrings are stretched at the bottom of the stroke when the saddle is too high or too far back.",
    levers: [
      { setting: "saddleHeight", dir: "lower" },
      { setting: "setback", dir: "forward" },
    ],
    also: "Tight hamstrings make a given saddle height feel higher; stretching helps.",
    sources: ["kotler", "wanich"],
    clinician: "a sports physiotherapist",
  },
  "lower-back": {
    label: "Lower back",
    noun: "lower-back pain",
    group: "Back, neck & shoulders",
    sided: false,
    cause:
      "A handlebar that is too low or too far away bends the lower back. A saddle nose tilted up or a saddle that is too high adds to it.",
    levers: [
      { setting: "barHeight", dir: "raise" },
      { setting: "reach", dir: "shorter" },
      { setting: "tilt", dir: "level" },
    ],
    also: "Core and hip mobility work help more than any single setting.",
    sources: ["kotler", "mellion"],
    clinician: "a physiotherapist",
  },
  "upper-back": {
    label: "Shoulders or upper back",
    noun: "shoulder and upper-back pain",
    group: "Back, neck & shoulders",
    sided: false,
    cause:
      "Reaching too far, locked elbows, or a handlebar much wider or narrower than your shoulders.",
    levers: [
      { setting: "reach", dir: "shorter" },
      { setting: "barWidth", dir: "match" },
      { setting: "barHeight", dir: "raise" },
    ],
    also: "Ride with soft elbows and relaxed shoulders, away from your ears.",
    sources: ["kotler", "bar-width"],
    clinician: "a physiotherapist",
  },
  neck: {
    label: "Neck",
    noun: "neck pain",
    group: "Back, neck & shoulders",
    sided: false,
    cause:
      "A low or distant handlebar makes you tip your head back to see the road.",
    levers: [
      { setting: "barHeight", dir: "raise" },
      { setting: "reach", dir: "shorter" },
    ],
    also: "Check your helmet and glasses do not force your head back.",
    sources: ["kotler", "mellion"],
    clinician: "a physiotherapist",
  },
  "hand-numb": {
    label: "Numb or tingling hands",
    noun: "hand numbness",
    group: "Hands & arms",
    sided: true,
    numb: true,
    cause:
      "Too much weight on the hands pressing on the ulnar or median nerve: a low or distant bar, a saddle tipped nose-down so you slide forward, or a long ride in one hand position.",
    levers: [
      { setting: "barHeight", dir: "raise" },
      { setting: "reach", dir: "shorter" },
      { setting: "tilt", dir: "level" },
    ],
    also: "Change hand position every 10–15 minutes, keep wrists straight, and use padded gloves or thicker bar tape.",
    sources: ["patterson", "kotler"],
    clinician: "a doctor",
  },
  wrist: {
    label: "Wrist or palm pain",
    noun: "wrist pain",
    group: "Hands & arms",
    sided: true,
    cause:
      "The wrist bends back when the hoods sit too low on the bar or the reach is long, and the palm takes the load.",
    levers: [
      { setting: "reach", dir: "shorter" },
      { setting: "barHeight", dir: "raise" },
    ],
    also: "Roll the hoods up the bar a few millimetres so your wrist stays straight on them.",
    sources: ["patterson", "kotler"],
    clinician: "a physiotherapist",
  },
  "saddle-numb": {
    label: "Numbness or pressure in the groin or genitals",
    noun: "saddle numbness",
    group: "Saddle",
    sided: false,
    numb: true,
    cause:
      "Pressure on the soft tissue between the sit bones. A saddle nose tilted up, a handlebar well below the saddle, or a saddle that is too high all push weight forward onto it.",
    levers: [
      { setting: "tilt", dir: "nose-down" },
      { setting: "barHeight", dir: "raise" },
      { setting: "saddleHeight", dir: "lower" },
    ],
    also: "A saddle with a cut-out or a shorter nose spreads pressure for many riders; stand up for a few pedal strokes every 10 minutes.",
    sources: ["saddle-pressure", "kotler", "bressel"],
    clinician: "a doctor",
  },
  "sit-bones": {
    label: "Sore sit bones",
    noun: "sit-bone soreness",
    group: "Saddle",
    sided: false,
    cause:
      "A saddle narrower than your sit bones, or one tilted so you are not sitting on its widest part. Usually also just time in the saddle.",
    levers: [{ setting: "tilt", dir: "level" }],
    also: "Saddle makers size saddles from sit-bone width: sit on corrugated card, measure between the two deepest dents, and match their chart. Use well-fitted padded shorts.",
    sources: ["saddle-pressure", "kotler"],
    clinician: "a doctor",
  },
  chafing: {
    label: "Chafing or saddle sores",
    noun: "chafing",
    group: "Saddle",
    sided: false,
    cause:
      "Friction from the hips rocking on a saddle that is too high, a saddle too wide at the nose, or shorts that move.",
    levers: [{ setting: "saddleHeight", dir: "lower" }],
    also: "Wear clean, well-fitted bib shorts with no underwear, use chamois cream, and get out of wet shorts soon after riding.",
    sources: ["kotler"],
    clinician: "a doctor",
  },
  "foot-numb": {
    label: "Numb toes or burning feet (hot foot)",
    noun: "foot numbness",
    group: "Feet & lower legs",
    sided: true,
    numb: true,
    cause:
      "Pressure on the nerves under the ball of the foot: a cleat too far forward, shoes too narrow or too tight, or a soft sole.",
    levers: [{ setting: "cleat", dir: "back" }],
    also: "Loosen the forefoot strap, try a wider shoe, and add a metatarsal pad or insole that lifts behind the ball of the foot.",
    sources: ["wanich", "cleat-midfoot", "cleat-15"],
    clinician: "a podiatrist",
  },
  achilles: {
    label: "Achilles or calf",
    noun: "Achilles and calf pain",
    group: "Feet & lower legs",
    sided: true,
    cause:
      "The calf works harder with a cleat far forward or a saddle so high you point your toes to reach the bottom of the stroke.",
    levers: [
      { setting: "cleat", dir: "back" },
      { setting: "saddleHeight", dir: "lower" },
    ],
    also: "Ease off hard climbing until it settles; calf stretches help.",
    sources: ["wanich", "mellion"],
    clinician: "a sports physiotherapist",
  },
  rocking: {
    label: "Hips rock side to side",
    noun: "hip rocking",
    group: "Things you notice",
    sided: false,
    sign: true,
    cause:
      "The classic sign of a saddle that is too high: the hips drop to let each leg reach the bottom of the stroke.",
    levers: [{ setting: "saddleHeight", dir: "lower" }],
    also: "A leg-length difference can cause one-sided rocking; a fitter can check with a shim.",
    sources: ["wanich", "mellion"],
    clinician: "a bike fitter",
  },
  sliding: {
    label: "Sliding forward on the saddle",
    noun: "sliding forward",
    group: "Things you notice",
    sided: false,
    sign: true,
    cause:
      "A saddle nose tilted down, or a reach so long you are pulled forward to the bar.",
    levers: [
      { setting: "tilt", dir: "level" },
      { setting: "reach", dir: "shorter" },
    ],
    also: "If sliding started when you tilted the nose down for comfort, a cut-out saddle may let you ride it level.",
    sources: ["bressel"],
    clinician: "a bike fitter",
  },
  other: {
    label: "Somewhere else",
    noun: "discomfort",
    group: "Elsewhere",
    sided: true,
    cause:
      "Not one of the common fit complaints, so no setting is linked to it. Describe it in your notes.",
    levers: [],
    also: "A professional fitter can look at anything this list does not cover.",
    sources: ["product"],
    clinician: "a doctor or physiotherapist",
  },
};

export const GROUPS = [...new Set(Object.values(AREAS).map((a) => a.group))];

/** "Front of the left knee" style wording for one symptom. */
export function symptomName(s: Symptom) {
  const a = AREAS[s.area];
  const side = a.sided && s.side !== "both" ? ` (${s.side})` : "";
  return a.noun + side;
}
