import type {
  Intake,
  ClipAnalysis,
  FitEvent,
  Recommendation,
} from "../domain/types";
import { assessContext, advice } from "./assessment";
/**
 * Dynamic knee flexion at maximum extension. The 30–40° band follows the
 * dynamic convention reported in the "dynamic" source; 25–45° is the outer
 * band beyond which the finding is treated as clear.
 */
export const KNEE = { low: 30, high: 40, outerLow: 25, outerHigh: 45 };
/** Product heuristics from common fitting practice, not research cut-offs. */
export const UPPER = {
  elbowLocked: 10,
  shoulderLong: 100,
  shoulderShort: 70,
  torsoMin: {
    road: 30,
    gravel: 35,
    mountain: 40,
    stationary: 35,
  } as Record<Intake["discipline"], number>,
};
const DEFAULT_CRANK = 172.5;
const metric = (c: ClipAnalysis | undefined, id: string) =>
  c?.metrics.find((m) => m.id === id);
/** Hip-to-ankle distance for a two-link leg at a given knee flexion. */
const legSpan = (flexDeg: number, ratio: number) => {
  const t = ratio,
    s = 1,
    th = (flexDeg * Math.PI) / 180;
  return Math.sqrt(t * t + s * s + 2 * t * s * Math.cos(th));
};
/**
 * Estimate the saddle-height change that moves knee extension from
 * `current` to `target` degrees. The hip-to-pedal distance at the bottom of
 * the stroke is approximated by saddle height plus crank length, and the
 * relative leg-span change from the two-link model is applied to it.
 */
export function saddleChangeMm(
  current: number,
  target: number,
  saddleHeight: number,
  crankLength: number | null,
  legRatio = 1,
): number {
  const ratio = Math.min(1.4, Math.max(0.7, legRatio));
  const rel = legSpan(target, ratio) / legSpan(current, ratio) - 1;
  return rel * (saddleHeight + (crankLength ?? DEFAULT_CRANK));
}
export function recommend(
  i: Intake,
  clips: ClipAnalysis[],
  events: FitEvent[],
): Recommendation[] {
  const context = assessContext(i, events);
  if (context.some((r) => r.outcome === "assessment" || r.id === "screen"))
    return context;
  const usable = clips.filter(
    (c) => !c.quality.some((q) => q.severity === "reject") && c.metrics.length,
  );
  const reviewed = usable.filter((c) => c.reviewed);
  const sides = reviewed.filter((c) => c.view === "left" || c.view === "right");
  const has = (v: string) => reviewed.some((c) => c.view === v);
  const out: Recommendation[] = [];
  const later: Recommendation[] = [];
  if (!sides.length) {
    const unreviewed = usable.some((c) => !c.reviewed);
    return [
      ...context,
      unreviewed
        ? advice(
            "review",
            "information",
            "Review the tracking overlays",
            "Joint tracking has not been checked for every view.",
            "Open each recording and check the skeleton throughout the clip. Correct misplaced joints or re-record if tracking is unreliable.",
          )
        : advice(
            "coverage",
            "information",
            "Start with a side view",
            "Saddle height, reach and posture come from a reviewed side view, and none is available yet.",
            "Record 10–20 seconds of steady pedaling from the side, camera level with the bottom bracket, then review the overlay.",
          ),
    ];
  }
  const kneeValues = sides
    .map((c) => metric(c, "knee-min")?.value)
    .filter((v): v is number => v !== undefined);
  if (
    kneeValues.length > 1 &&
    Math.max(...kneeValues) - Math.min(...kneeValues) > 8
  )
    return [
      ...context,
      advice(
        "disagreement",
        "information",
        "Check the difference between side views",
        `Left and right extension measurements differ by ${Math.round(Math.max(...kneeValues) - Math.min(...kneeValues))}°.`,
        "Check camera alignment and tracking, then repeat both views. These videos cannot establish a structural asymmetry.",
      ),
    ];
  const side = sides[0];
  const knee = kneeValues.length
    ? kneeValues.reduce((a, b) => a + b, 0) / kneeValues.length
    : undefined;
  const kneeMetric = metric(side, "knee-min");
  const lowConfidence = kneeMetric?.confidence === "low";
  const comfortable = i.symptom === "none";
  const pelvic = metric(
    reviewed.find((c) => c.view === "rear" || c.view === "front"),
    "pelvic-rock",
  );
  // 1. Saddle height
  if (knee !== undefined) {
    const k = Math.round(knee * 10) / 10;
    const inside = knee >= KNEE.low && knee <= KNEE.high;
    const clear = knee < KNEE.outerLow || knee > KNEE.outerHigh;
    if (inside)
      out.push(
        advice(
          "saddle-ok",
          "no-change",
          "Saddle height looks right",
          `Your knee bends ${k}° at full extension, inside the typical 30–40° range for dynamic video measurement.`,
          "Keep your saddle height. Re-check after any change to shoes, pedals, cleats or saddle.",
          {
            sources: ["dynamic", "bini"],
            confidence: lowConfidence ? "low" : "moderate",
          },
        ),
      );
    else if (comfortable && !clear)
      out.push(
        advice(
          "saddle-ok",
          "no-change",
          "Saddle height is close to typical",
          `Your knee bends ${k}° at full extension, just outside the typical 30–40° range. You report no discomfort.`,
          "No change needed while you are comfortable. If you develop knee discomfort, start here.",
          { sources: ["dynamic", "bini"], confidence: "low" },
        ),
      );
    else {
      const lower = knee < KNEE.low;
      const target = lower ? KNEE.low + 2 : KNEE.high - 2;
      const corroboration: string[] = [];
      if (lower && pelvic && pelvic.value > 8)
        corroboration.push(
          `Your pelvis rocks ${pelvic.value}° side to side from the rear, which often accompanies a high saddle.`,
        );
      const ankle = metric(side, "ankle-rom");
      if (lower && ankle && ankle.value > 35)
        corroboration.push(
          `Your ankle moves through ${ankle.value}°, which can mean reaching for the pedal.`,
        );
      let estimate: Recommendation["estimate"];
      let amount = "a small measured amount (3–5 mm)";
      if (i.saddleHeight) {
        const mm = Math.abs(
          saddleChangeMm(
            knee,
            target,
            i.saddleHeight,
            i.crankLength,
            metric(side, "leg-ratio")?.value,
          ),
        );
        const lo = Math.max(2, Math.round(mm * 0.7)),
          hi = Math.max(lo + 1, Math.round(mm * 1.3));
        estimate = {
          setting: "saddleHeight",
          direction: lower ? "lower" : "raise",
          minMm: lo,
          maxMm: hi,
          basis: `Two-link leg model from ${k}° to ${target}°, scaled by your ${i.saddleHeight} mm saddle height. ±30% for camera and landmark error.`,
        };
        amount =
          hi > 10
            ? `about ${lo}–${hi} mm in total. Start with 5 mm, ride, then re-record before going further`
            : `about ${lo}–${hi} mm`;
      }
      const suffix = comfortable
        ? " This is optional while you are comfortable."
        : "";
      out.push(
        advice(
          "saddle",
          "experiment",
          lower ? "Lower your saddle" : "Raise your saddle",
          `Your knee bends ${k}° at full extension. The typical range for dynamic video measurement is 30–40°.${corroboration.length ? " " + corroboration.join(" ") : ""}${suffix}`,
          `${lower ? "Lower" : "Raise"} the saddle by ${amount}. Mark the seatpost first, keep the saddle angle and setback the same, and change nothing else.${i.saddleHeight ? "" : " Enter your saddle height in your profile to get a millimetre estimate."}`,
          {
            alternatives:
              "Camera angle, landmark placement, ankle style, shoe or cleat stack, and training load can all affect this. The range comes from research on trained riders and is a guide, not a rule.",
            prerequisites: i.mechanicalLimits
              ? "Stay within the seatpost's minimum insertion mark and torque specification. Stop if symptoms worsen."
              : "First confirm the seatpost minimum-insertion mark and torque specification, then tick 'limits confirmed' in your profile. Stop if symptoms worsen.",
            recheck:
              "Ride 2–3 times at your usual effort, then re-record the side view. Keep the change if it feels better or the same and the angle moved toward 30–40°; otherwise revert.",
            sources: ["dynamic", "bini", "review", "product"],
            confidence: lowConfidence || !clear ? "low" : "moderate",
            ...(estimate ? { estimate } : {}),
          },
        ),
      );
    }
  }
  // 2. Reach and drop
  const elbow = metric(side, "elbow"),
    shoulder = metric(side, "shoulder-angle"),
    torso = metric(side, "torso");
  const upperSymptom = ["hands", "neck", "back"].includes(i.symptom);
  const reachSigns: string[] = [];
  let reachDir: "shorter" | "longer" | undefined;
  if (shoulder && shoulder.value > UPPER.shoulderLong) {
    reachDir = "shorter";
    reachSigns.push(
      `your arms reach ${shoulder.value}° forward from your torso`,
    );
  }
  if (elbow && elbow.value < UPPER.elbowLocked) {
    reachDir ??= "shorter";
    reachSigns.push(
      `your elbows are nearly straight (${elbow.value}° of bend)`,
    );
  }
  if (!reachDir && shoulder && shoulder.value < UPPER.shoulderShort) {
    reachDir = "longer";
    reachSigns.push(`your arms are tucked at ${shoulder.value}° to your torso`);
  }
  const lowTorso =
    torso && torso.value < UPPER.torsoMin[i.discipline] ? torso.value : null;
  if (reachDir || (lowTorso !== null && upperSymptom)) {
    const symptomText =
      i.symptom === "hands"
        ? "hand"
        : i.symptom === "neck"
          ? "neck"
          : i.symptom === "back"
            ? "back"
            : "";
    const parts = [...reachSigns];
    if (lowTorso !== null)
      parts.push(
        `your torso is ${lowTorso}° from horizontal, a low position for ${i.discipline} riding`,
      );
    const action =
      reachDir === "longer"
        ? "Try a stem 10 mm longer, or move the hoods slightly forward. Change one thing only."
        : lowTorso !== null && reachDir !== "shorter"
          ? "Raise the handlebar by moving one 5 mm spacer from above the stem to below it. Change one thing only."
          : "Try a stem 10 mm shorter, or raise the handlebar with one 5 mm spacer. Pick one; change nothing else.";
    const rec = advice(
      "reach",
      upperSymptom || !comfortable ? "experiment" : "no-change",
      reachDir === "longer"
        ? "Your cockpit may be short"
        : "Your handlebar reach may be long or low",
      `From the side view, ${parts.join(" and ")}.${symptomText ? ` This can add load to the ${symptomText}.` : ""}${upperSymptom || !comfortable ? "" : " You report no discomfort, so this is for information."}`,
      upperSymptom || !comfortable
        ? action
        : "No change needed while you are comfortable. If you develop hand, neck or back discomfort, start here.",
      {
        alternatives:
          "Hand position on the bar, core strength, flexibility and riding posture affect these angles as much as the bike does. These ranges are common fitting practice, not research thresholds.",
        prerequisites:
          "Check steerer spacer limits and stem torque. Make sure the saddle height is settled first, because it changes your reach.",
        recheck:
          "Ride 2–3 times, then re-record the side view with hands on the hoods.",
        sources: ["product"],
        confidence: "low",
        estimate:
          reachDir === "longer"
            ? {
                setting: "stem",
                direction: "longer",
                minMm: 10,
                maxMm: 10,
                basis: "Typical stem increment.",
              }
            : {
                setting: "spacers",
                direction: "raise",
                minMm: 5,
                maxMm: 10,
                basis: "Typical spacer increment.",
              },
      },
    );
    (out.some((r) => r.outcome === "experiment") ? later : out).push(rec);
  }
  // 3. Knee tracking from front/rear
  const fr =
    reviewed.find((c) => c.view === "front") ??
    reviewed.find((c) => c.view === "rear");
  const lk = metric(fr, "left-knee"),
    rk = metric(fr, "right-knee");
  if (lk && rk) {
    const big = Math.max(lk.value, rk.value),
      small = Math.min(lk.value, rk.value);
    if (big > 20 && big > 1.5 * small)
      later.push(
        advice(
          "knee-track",
          "equipment-training",
          "One knee moves sideways more than the other",
          `Your ${lk.value > rk.value ? "left" : "right"} knee moves ${big}% of hip width side to side, against ${small}% for the other.`,
          "Check that both cleats are set up the same way and that your shoes and insoles support your feet. A fitter or physiotherapist can assess cleat rotation, wedges or foot support. Do not change cleats from this video alone.",
          {
            alternatives:
              "Camera alignment, clothing and natural asymmetry can all produce this. A 2D view cannot measure rotation.",
            sources: ["product"],
            confidence: "low",
          },
        ),
      );
  }
  // 4. Missing views
  if (!has("front") && !has("rear"))
    later.push(
      advice(
        "coverage",
        "information",
        "Add a front or rear view",
        "Your side view is reviewed. A front or rear view adds knee tracking and pelvic stability.",
        "Record 10–20 seconds from directly behind or in front, camera at hip height.",
      ),
    );
  if (usable.some((c) => !c.reviewed))
    later.push(
      advice(
        "review",
        "information",
        "Review the remaining overlays",
        "Some recordings have not been checked yet, so they are not used.",
        "Open each recording and check the skeleton before relying on it.",
      ),
    );
  const ranked = [...context, ...out, ...later];
  let p = 1;
  return ranked.map((r) =>
    r.outcome === "experiment" ? { ...r, priority: p++ } : r,
  );
}
