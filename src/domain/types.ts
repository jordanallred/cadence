import { z } from "zod";
export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  visibility: z.number().min(0).max(1),
});
export const frameSchema = z.object({
  timeMs: z.number().nonnegative(),
  points: z.array(pointSchema).max(33),
  people: z.number().int().min(0).max(2),
  corrected: z.boolean().optional(),
});
export const viewSchema = z.enum(["left", "right", "front", "rear"]);
export type View = z.infer<typeof viewSchema>;
/** How a view is named to riders: "Left side", "Front". */
export const viewLabel = (v: View) =>
  ({ left: "Left side", right: "Right side", front: "Front", rear: "Rear" })[v];
export type Point = z.infer<typeof pointSchema>;
export type PoseFrame = z.infer<typeof frameSchema>;
/**
 * A body or bike measurement. The inputs only accept values in range, so an
 * out-of-range number here is old or damaged data. It loads and saves as
 * unknown instead of failing the whole fit: one bad field must never stop
 * the rest of the fit from saving.
 */
const measured = (min: number, max: number) =>
  z.number().min(min).max(max).nullable().default(null).catch(null);
/**
 * Places riders feel pain or discomfort on the bike, plus two things they
 * notice rather than feel. The catalogue with wording and fit rules lives in
 * src/fit/symptoms.ts.
 */
export const symptomAreaSchema = z.enum([
  "knee-front",
  "knee-back",
  "knee-inner",
  "knee-outer",
  "it-band",
  "hip-front",
  "hamstring",
  "lower-back",
  "upper-back",
  "neck",
  "hand-numb",
  "wrist",
  "saddle-numb",
  "sit-bones",
  "chafing",
  "foot-numb",
  "achilles",
  "rocking",
  "sliding",
  "other",
]);
export type SymptomArea = z.infer<typeof symptomAreaSchema>;
export const symptomSchema = z.object({
  area: symptomAreaSchema,
  /** Which side. Areas on the midline are always "both". */
  side: z.enum(["left", "right", "both"]),
  /** 1 = barely noticeable, 10 = worst imaginable. */
  severity: z.number().int().min(1).max(10),
  /**
   * Sharp, sudden or worsening pain, swelling, or numbness or weakness that
   * lasts after the ride. Holds back bike changes for this area.
   */
  warning: z.boolean().default(false),
});
export type Symptom = z.infer<typeof symptomSchema>;
const intakeFields = z.object({
  name: z.string().max(120),
  bike: z.string().max(120),
  discipline: z.enum(["road", "gravel", "mountain", "stationary"]),
  goal: z.string().max(1000),
  experience: z.string().max(100),
  saddleHeight: measured(1, 1500),
  saddleSetback: measured(-200, 400),
  saddleTilt: measured(-30, 30),
  crankLength: measured(80, 250),
  // Added in rules 0.3.0. Older profiles load with these unknown.
  riderHeight: measured(100, 230),
  shoulderWidth: measured(250, 600),
  barReach: measured(300, 900),
  barDrop: measured(-200, 300),
  stemLength: measured(20, 160),
  barWidth: measured(300, 900),
  cleatOffset: measured(-40, 60),
  cockpit: z.string().max(1000),
  limitations: z.string().max(1500),
  symptoms: z.array(symptomSchema).max(30).default([]),
  onset: z.string().max(500),
  outsideCycling: z.boolean(),
  trainingChange: z.boolean(),
  equipmentIssue: z.boolean(),
  persistent: z.boolean(),
  screen: z.enum([
    "unknown",
    "none",
    "emergency-back",
    "urgent-back",
    "urgent-knee",
  ]),
  mechanicalLimits: z.boolean(),
  notes: z.string().max(3000),
});
/**
 * Cadence is metric-only: lengths in millimetres, angles in degrees.
 * Older saved profiles carry a `units` field. Their numbers were already
 * stored in millimetres (imperial only changed the input display), so the
 * migration drops the field and rounds imperial-entered lengths to 0.1 mm to
 * clear float noise from the old inch conversion.
 */
export function migrateIntake(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  let rest = raw as Record<string, unknown>;
  if ("units" in rest) {
    const { units, ...others } = rest;
    rest = others;
    if (units === "imperial")
      for (const key of ["saddleHeight", "saddleSetback", "crankLength"])
        if (typeof rest[key] === "number")
          rest[key] = Math.round((rest[key] as number) * 10) / 10;
  }
  if ("symptom" in rest || "severity" in rest) rest = migrateSymptom(rest);
  if (Array.isArray(rest.symptoms)) {
    rest = { ...rest };
    rest.symptoms = migrateEntries(rest.symptoms as unknown[], rest);
  }
  return rest;
}
/**
 * v0.6.2 saved its own symptom entries: other area ids, a "center" side,
 * severity from 0 (unrated), a `sharpSuddenWorsening` flag and an onset per entry.
 * Current entries pass through unchanged.
 */
const v062Area: Record<string, SymptomArea> = {
  "front-knee": "knee-front",
  "back-knee": "knee-back",
  "inner-knee": "knee-inner",
  "outer-knee": "knee-outer",
  hip: "hip-front",
  shoulder: "upper-back",
  "hands-numb": "hand-numb",
  "hands-pain": "wrist",
  "hot-foot": "foot-numb",
};
function migrateEntries(list: unknown[], intake: Record<string, unknown>) {
  const out: Record<string, unknown>[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    if (
      !("sharpSuddenWorsening" in e) &&
      !("onset" in e) &&
      e.side !== "center"
    ) {
      out.push(e);
      continue;
    }
    const area =
      typeof e.area === "string" ? (v062Area[e.area] ?? e.area) : e.area;
    // 0 meant "present, not rated" there; use the same 3/10 as the
    // single-symptom migration rather than a 1/10 that looks rated.
    const severity =
      typeof e.severity === "number" && Math.round(e.severity) >= 1
        ? Math.min(10, Math.round(e.severity))
        : 3;
    const entry = {
      area,
      side: e.side === "left" || e.side === "right" ? e.side : "both",
      severity,
      warning: e.sharpSuddenWorsening === true || e.warning === true,
    };
    if (
      typeof e.onset === "string" &&
      e.onset.trim() &&
      !String(intake.onset ?? "").trim()
    )
      intake.onset = e.onset;
    // Two old areas can map to one (shoulder and upper back): keep the worse.
    const same = out.find(
      (x) => x.area === entry.area && x.side === entry.side,
    );
    if (same) {
      same.severity = Math.max(same.severity as number, severity);
      same.warning = same.warning === true || entry.warning;
    } else out.push(entry);
  }
  return out;
}
/**
 * Profiles before rules 0.4.0 (v0.6.1 and earlier) had one broad symptom and one severity. Each
 * maps to the most common specific area for that region; the rider can
 * change it in Your starting point.
 */
const legacyArea: Record<string, SymptomArea> = {
  knee: "knee-front",
  back: "lower-back",
  neck: "neck",
  hands: "hand-numb",
  saddle: "sit-bones",
  feet: "foot-numb",
  other: "other",
};
function migrateSymptom(raw: Record<string, unknown>) {
  const { symptom, severity, ...rest } = raw;
  if (Array.isArray(rest.symptoms)) return rest;
  const area = typeof symptom === "string" ? legacyArea[symptom] : undefined;
  const level =
    typeof severity === "number" ? Math.round(severity) : Number.NaN;
  rest.symptoms = area
    ? [
        {
          area,
          side: "both",
          // A severity outside 0–10 is damaged data and fails validation.
          severity: Number.isNaN(level) ? 3 : level === 0 ? 3 : level,
          warning: false,
        },
      ]
    : [];
  return rest;
}
export const intakeSchema = z.preprocess(migrateIntake, intakeFields);
export type Intake = z.infer<typeof intakeFields>;
export const metricSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().finite(),
  unit: z.string(),
  sampleCount: z.number().int().nonnegative(),
  confidence: z.enum(["low", "moderate"]),
  /** Cycle-to-cycle interquartile range, in the metric's unit. */
  spread: z.number().finite().nonnegative().optional(),
  limitations: z.array(z.string()),
});
export type Metric = z.infer<typeof metricSchema>;
export const qualitySchema = z.object({
  code: z.string(),
  severity: z.enum(["warning", "reject"]),
  message: z.string(),
});
export type QualityIssue = z.infer<typeof qualitySchema>;
export const keyMomentSchema = z.object({
  /** Leg most extended, or knee most bent at the top of the stroke. */
  position: z.enum(["extension", "top"]),
  timeMs: z.number().nonnegative(),
  /** JPEG data URL of that video frame, kept small. */
  image: z
    .string()
    .startsWith("data:image/jpeg;base64,")
    .max(300_000)
    .optional(),
});
export type KeyMoment = z.infer<typeof keyMomentSchema>;
export const clipSchema = z.object({
  id: z.string(),
  view: viewSchema,
  name: z.string().max(300),
  size: z.number().nonnegative(),
  duration: z.number().positive(),
  width: z.number().positive().max(16384),
  height: z.number().positive().max(16384),
  frames: z.array(frameSchema).max(2000),
  originalFrames: z.array(frameSchema).max(2000).optional(),
  quality: z.array(qualitySchema),
  metrics: z.array(metricSchema),
  modelVersion: z.string(),
  createdAt: z.string(),
  setupRevision: z.number().int().nonnegative(),
  reviewed: z.boolean(),
  /** Still frames shown in the report (side views). */
  keyframes: z.array(keyMomentSchema).max(4).optional(),
});
export type ClipAnalysis = z.infer<typeof clipSchema>;
export const recommendationSchema = z.object({
  id: z.string(),
  outcome: z.enum([
    "experiment",
    "information",
    "equipment-training",
    "assessment",
    "no-change",
  ]),
  urgency: z.enum(["routine", "urgent", "emergency"]),
  title: z.string(),
  observations: z.string(),
  alternatives: z.string(),
  action: z.string(),
  prerequisites: z.string(),
  recheck: z.string(),
  sources: z.array(z.string()),
  ruleVersion: z.string(),
  /** 1 = do this first. Experiments are applied one at a time. */
  priority: z.number().int().positive().optional(),
  confidence: z.enum(["low", "moderate", "high"]).optional(),
  estimate: z
    .object({
      setting: z.enum([
        "saddleHeight",
        "saddleSetback",
        "stem",
        "spacers",
        "barWidth",
        "cleat",
        "saddleTilt",
        "stance",
        "cleatRotation",
        "crank",
      ]),
      direction: z.enum([
        "raise",
        "lower",
        "forward",
        "back",
        "shorter",
        "longer",
        "wider",
        "narrower",
        "nose-down",
        "nose-up",
        "toe-in",
        "toe-out",
      ]),
      /** Amount, in `unit`. Named for the original millimetre-only field. */
      minMm: z.number().nonnegative(),
      maxMm: z.number().nonnegative(),
      unit: z.enum(["mm", "°"]).optional(),
      /** Left or right only; both sides when absent. */
      side: z.enum(["left", "right"]).optional(),
      basis: z.string(),
    })
    .optional(),
  /** Symptom areas this change is meant to help. */
  targets: z.array(symptomAreaSchema).optional(),
  /** Milder symptoms that pointed the other way and were outweighed. */
  against: z.array(symptomAreaSchema).optional(),
  /** Why they lost: a video measurement, or a worse symptom. */
  againstBy: z.enum(["measurement", "severity"]).optional(),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
export const eventSchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.enum(["adjustment", "revert", "retain", "ride"]),
  detail: z.string().max(3000),
  setting: z
    .enum([
      "saddleHeight",
      "saddleSetback",
      "saddleTilt",
      "barReach",
      "barDrop",
      "stemLength",
      "barWidth",
      "cleatOffset",
      "other",
    ])
    .optional(),
  before: z.number().nullable().optional(),
  after: z.number().nullable().optional(),
  experimentId: z.string().optional(),
  duration: z.number().min(0).max(1440).optional(),
  intensity: z.enum(["easy", "moderate", "hard"]).optional(),
  comfort: z.number().min(0).max(10).optional(),
  response: z.enum(["better", "same", "worse"]).optional(),
});
export type FitEvent = z.infer<typeof eventSchema>;
/**
 * One analysis attempt, kept even if the rider later deletes the clip, so
 * the pilot log can count failed captures (src/fit/pilot.ts). Reason codes
 * only: the quality codes from analysis, or "analysis-error" when analysis
 * failed outright.
 */
export const captureAttemptSchema = z.object({
  at: z.string(),
  view: viewSchema,
  result: z.enum(["accepted", "rejected", "failed"]),
  codes: z.array(z.string().max(40)).max(20),
});
export type CaptureAttempt = z.infer<typeof captureAttemptSchema>;
export const sessionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  intake: intakeSchema,
  baseline: intakeSchema.nullable(),
  clips: z.array(clipSchema).max(40),
  events: z.array(eventSchema).max(2000),
  recommendations: z.array(recommendationSchema),
  setupRevision: z.number().int().nonnegative(),
  /** Added for the rider pilot. Older fits load with an empty log. */
  captureLog: z.array(captureAttemptSchema).max(500).default([]),
  /** Pilot participant code from the pilot lead, e.g. "P07". */
  pilotCode: z
    .string()
    .regex(/^[A-Z]{1,3}[0-9]{1,3}$/)
    .optional()
    .catch(undefined),
});
export type Session = z.infer<typeof sessionSchema>;
export const defaultIntake: Intake = {
  name: "",
  bike: "",
  discipline: "road",
  goal: "Comfort on longer rides",
  experience: "Recreational",
  saddleHeight: null,
  saddleSetback: null,
  saddleTilt: null,
  crankLength: null,
  riderHeight: null,
  shoulderWidth: null,
  barReach: null,
  barDrop: null,
  stemLength: null,
  barWidth: null,
  cleatOffset: null,
  cockpit: "",
  limitations: "",
  symptoms: [],
  onset: "",
  outsideCycling: false,
  trainingChange: false,
  equipmentIssue: false,
  persistent: false,
  screen: "unknown",
  mechanicalLimits: false,
  notes: "",
};
export function newSession(): Session {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    intake: { ...defaultIntake },
    baseline: null,
    clips: [],
    events: [],
    recommendations: [],
    setupRevision: 0,
    captureLog: [],
  };
}
