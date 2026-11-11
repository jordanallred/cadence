import type {
  Intake,
  ClipAnalysis,
  FitEvent,
  Recommendation,
} from "../domain/types";
import { assessContext, advice } from "./assessment";
import { symptoms, symptomGroup } from "./symptoms";
import {
  reachChange,
  dropChange,
  setbackCheck,
  barWidthTarget,
  cleatCheck,
  CLEAT,
  POPULATION,
  rangeText,
} from "./targets";
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
  if (context.some((r) => r.urgency !== "routine"))
    return context;
  const complaints = symptoms(i);
  const groups = new Set<string>(complaints.map(s => symptomGroup(s.area)));
  const top = [...complaints].sort((a,b) => b.severity - a.severity)[0];
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
  const comfortable = !complaints.length;
  const pelvic = metric(
    reviewed.find((c) => c.view === "rear" || c.view === "front"),
    "pelvic-rock",
  );
  // 0. Cleat fore-aft. The foot is the base of the fit, so a cleat
  // experiment comes before the saddle: moving a cleat changes extension.
  const cleat = cleatCheck(i);
  const feet = groups.has("feet");
  if (cleat && (cleat.back > 0 || (feet && cleat.current < CLEAT.max - 2))) {
    const mm =
      cleat.back > 0 ? cleat.back : Math.min(5, CLEAT.max - cleat.current);
    const lo = cleat.back > 0 ? mm : Math.min(3, mm);
    (feet ? out : later).push(
      advice(
        "cleat",
        feet ? "experiment" : "information",
        "Move your cleats back",
        cleat.back > 0
          ? `The pedal axle sits ${-cleat.current} mm ahead of the ball of your foot. Most riders use the ball of the foot or up to ${CLEAT.max} mm behind it.`
          : `The pedal axle sits ${cleat.current} mm behind the ball of your foot and you report foot discomfort. A slightly more rearward cleat moves load off the forefoot and calf.`,
        feet || cleat.back > 0
          ? `Move both cleats ${rangeText({ min: lo, max: mm })} towards the heel, so the axle sits ${rangeText({ min: cleat.current + lo, max: cleat.current + mm })} behind the ball of your foot. Trace around the cleats first, keep the rotation the same, and tighten the bolts to the shoe maker's torque.${feet ? "" : " Optional while you are comfortable."}`
          : "",
        {
          alternatives:
            "Foot discomfort also comes from shoe size and width, insoles, and how tight the straps are. These studies looked at efficiency and joint angles, not comfort or injury.",
          prerequisites:
            "Make sure the cleat bolts have room to move in the shoe's slots.",
          recheck:
            "Ride 2–3 times, then re-record the side view: a cleat move changes knee extension slightly, so check saddle height again.",
          sources: ["cleat-15", "cleat-midfoot"],
          confidence: "low",
          estimate: {
            setting: "cleat",
            direction: "back",
            minMm: lo,
            maxMm: mm,
            basis: `To ${CLEAT.min}–${CLEAT.max} mm behind the ball of the foot, the range studied without loss of efficiency.`,
          },
        },
      ),
    );
  }
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
      } else {
        estimate = { setting: "saddleHeight", direction: lower ? "lower" : "raise", minMm: 3, maxMm: 5, basis: "Conservative first adjustment without a recorded saddle height; remeasure the knee angle before any further change." };
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
          `${lower ? "Lower" : "Raise"} the saddle by ${amount}. Mark the seatpost first, keep the saddle angle and setback the same, and change nothing else.${i.saddleHeight ? "" : " Enter your saddle height in your profile for a model-based total range."}`,
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
  const upperSymptom = ["hands", "neck", "back"].some(g => groups.has(g));
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
      groups.has("hands")
        ? "hand"
        : groups.has("neck")
          ? "neck"
          : groups.has("back")
            ? "back"
            : "";
    const parts = [...reachSigns];
    if (lowTorso !== null)
      parts.push(
        `your torso is ${lowTorso}° from horizontal, a low position for ${i.discipline} riding`,
      );
    const reach = reachChange(i, side),
      drop = dropChange(i, side);
    const needHeight = i.riderHeight
      ? ""
      : " Add your height in your profile for a size-specific number.";
    const stemTo = (step: number) =>
      i.stemLength ? ` (${i.stemLength} → ${i.stemLength + step} mm)` : "";
    const reachTo = (step: number) =>
      i.barReach
        ? ` Your saddle-to-bar reach would go from ${i.barReach} to about ${i.barReach + step} mm.`
        : "";
    let action: string;
    let estimate: NonNullable<Recommendation["estimate"]>;
    if (reachDir === "longer") {
      const step = reach?.stemStep ?? 10;
      action = reach
        ? `Try a stem ${step} mm longer${stemTo(step)}.${reachTo(step)} The full change to bring your shoulder angle to ${reach.toDeg}° is about ${rangeText(reach.mm)}; go in 10 mm steps and re-record between them. Change one thing only.`
        : `Try a stem 10 mm longer${stemTo(10)}, or move the hoods slightly forward. Change one thing only.${needHeight}`;
      estimate = {
        setting: "stem",
        direction: "longer",
        minMm: reach ? reach.mm.min : 10,
        maxMm: reach ? reach.mm.max : 10,
        basis: reach?.basis ?? "Typical stem increment.",
      };
    } else if (lowTorso !== null && reachDir !== "shorter") {
      const first = drop ? Math.min(10, drop.spacers.min) : 5;
      action = drop
        ? `Raise the handlebar by moving ${rangeText(drop.spacers)} of spacers from above the stem to below it, ${first} mm at a time. That lifts your torso toward ${drop.toDeg}°.${i.barDrop !== null ? ` Your saddle-to-bar drop would go from ${i.barDrop} to about ${i.barDrop - drop.mm.max}–${i.barDrop - drop.mm.min} mm.` : ""} Change one thing only.`
        : `Raise the handlebar by moving one 5 mm spacer from above the stem to below it. Change one thing only.${needHeight}`;
      estimate = {
        setting: "spacers",
        direction: "raise",
        minMm: drop ? drop.spacers.min : 5,
        maxMm: drop ? drop.spacers.max : 10,
        basis: drop?.basis ?? "One or two 5 mm spacers.",
      };
    } else {
      const step = reach?.stemStep ?? 10;
      action = reach
        ? `Try a stem ${step} mm shorter${stemTo(-step)}.${reachTo(-step)} The full change to bring your arms to ${reach.toDeg === reach.fromDeg ? "a softer elbow" : `a ${reach.toDeg}° shoulder angle`} is about ${rangeText(reach.mm)}; go in 10 mm steps and re-record between them. Or raise the handlebar one 5 mm spacer instead. Pick one; change nothing else.`
        : `Try a stem 10 mm shorter${stemTo(-10)}, or raise the handlebar with one 5 mm spacer. Pick one; change nothing else.${needHeight}`;
      estimate = {
        setting: "stem",
        direction: "shorter",
        minMm: reach ? reach.mm.min : 10,
        maxMm: reach ? reach.mm.max : 10,
        basis:
          reach?.basis ??
          "Typical stem increment, or one or two 5 mm spacers instead.",
      };
    }
    const rec = advice(
      "reach",
      upperSymptom || !comfortable ? "experiment" : "no-change",
      reachDir === "longer"
        ? "Your cockpit may be short"
        : reachDir
          ? "Your handlebar reach may be long"
          : "Your handlebar may be low",
      `From the side view, ${parts.join(" and ")}.${symptomText ? ` This can add load to the ${symptomText}.` : ""}${upperSymptom || !comfortable ? "" : " You report no discomfort, so this is for information."}`,
      upperSymptom || !comfortable
        ? action
        : "No change needed while you are comfortable. If you develop hand, neck or back discomfort, start here.",
      {
        alternatives:
          "Hand position on the bar, core strength, flexibility and riding posture affect these angles as much as the bike does. Your torso also moves when the bar moves, so the full change is an upper estimate. These ranges are common fitting practice, not research thresholds.",
        prerequisites:
          "Check steerer spacer limits and stem torque. Make sure the saddle height is settled first, because it changes your reach.",
        recheck:
          "Ride 2–3 times, then re-record the side view with hands on the hoods.",
        sources: i.riderHeight ? ["product", "anthropometry"] : ["product"],
        confidence: "low",
        estimate,
      },
    );
    (out.some((r) => r.outcome === "experiment") ? later : out).push(rec);
  }
  // 3. Saddle setback against measured riders
  const setback = setbackCheck(i);
  if (setback && setback.move !== 0 && i.saddleHeight) {
    const back = setback.move > 0,
      mm = Math.abs(setback.move),
      first = Math.min(5, mm);
    const pct = Math.round((setback.current! / i.saddleHeight) * 1000) / 10;
    const relevant = ["knee", "saddle", "back"].some(g => groups.has(g));
    later.push(
      advice(
        "setback",
        relevant ? "experiment" : "information",
        back
          ? "Your saddle is further forward than most riders'"
          : "Your saddle is further back than most riders'",
        `Your setback is ${setback.current} mm, ${pct}% of your saddle height. Measured road riders with your saddle height mostly sit at ${rangeText(setback.typical)}, and nearly all at ${rangeText(setback.outer)}.`,
        relevant
          ? `Move the saddle ${first} mm ${back ? "back" : "forward"} on its rails, toward ${back ? setback.typical.min : setback.typical.max} mm. Moving the saddle ${back ? "back raises" : "forward lowers"} it relative to the pedals by about 3 mm per 10 mm, so re-check saddle height afterwards.`
          : "No change needed while you are comfortable. This shows how your setup compares; it is not a target.",
        {
          alternatives:
            "This compares you with what trained road riders use, not with what is best for you. Leg length and flexibility did not predict setback in that study. Saddle shape and how you sit on it also change your effective position.",
          prerequisites:
            "Stay within the saddle rail markings and seatpost clamp torque. Change one thing at a time.",
          recheck:
            "Ride 2–3 times, then re-measure setback and saddle height and re-record the side view.",
          sources: ["holliday", "kops"],
          confidence: "low",
          estimate: {
            setting: "saddleSetback",
            direction: back ? "back" : "forward",
            minMm: first,
            maxMm: mm,
            basis: `To the edge of the typical range for your ${i.saddleHeight} mm saddle height (${POPULATION.setback.mean} ± ${POPULATION.setback.sd}%).`,
          },
        },
      ),
    );
  }
  // 4. Handlebar width
  const bar = barWidthTarget(i);
  if (bar && bar.off !== 0) {
    const wider = bar.off > 0;
    later.push(
      advice(
        "bar-width",
        "equipment-training",
        wider
          ? "Your handlebar is wider than your shoulders"
          : "Your handlebar is narrower than your shoulders",
        `Your bar is ${bar.current} mm at the hoods and your shoulders are ${i.shoulderWidth} mm across.${upperSymptom ? " Bar width can change load on the hands, neck and upper back." : ""}`,
        `If you replace the bar, try ${bar.size} mm centre to centre at the hoods. Anything from ${rangeText(bar.typical)} matches your shoulders. A bar you are comfortable on is not worth replacing for this alone.`,
        {
          alternatives:
            "Wider bars give more steering leverage and some riders prefer them off-road; narrower bars are more aerodynamic. The study behind this was small and short.",
          prerequisites:
            "Brands measure width differently; check the maker's geometry chart for the hood width before buying.",
          recheck:
            "Ride 2–3 times after a change and note hand and neck comfort.",
          sources: ["bar-width"],
          confidence: "low",
          estimate: {
            setting: "barWidth",
            direction: wider ? "narrower" : "wider",
            minMm: Math.abs(bar.off),
            maxMm: Math.abs(bar.off),
            basis: `${bar.size} mm from your ${i.shoulderWidth} mm shoulder width; drop bars come in 20 mm steps.`,
          },
        },
      ),
    );
  }
  // 5. Knee tracking from front/rear
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
  // 6. Missing views
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
  const conflict = complaints.some(s => s.area === "front-knee") && complaints.some(s => s.area === "back-knee");
  if (conflict) later.unshift(advice("symptom-conflict", "information", "Knee symptoms suggest opposite changes", `Front and back knee discomfort can pull saddle height in opposite directions. Your most severe complaint is ${top.area.replaceAll("-", " ")} (${top.severity}/10).`, "Use the reviewed knee angle to choose the first small change; track each symptom separately and revert if either worsens. Do not use pain location alone to override the measurement."));
  const cautioned = new Set(complaints.filter(s => s.sharpSuddenWorsening).map(s => symptomGroup(s.area)));
  const ranked = [...context, ...out, ...later].map(r => {
    const group = r.id === "saddle" || r.id === "setback" ? "knee" : r.id === "reach" || r.id === "bar-width" ? "hands" : r.id === "cleat" ? "feet" : "";
    return group && cautioned.has(group) && r.outcome === "experiment" ? { ...r, outcome: "information" as const, action: `Hold this change until the ${group} symptom has been assessed. ${r.action}` } : r;
  });
  let p = 1;
  return ranked.map((r) =>
    r.outcome === "experiment" ? { ...r, priority: p++ } : r,
  );
}
