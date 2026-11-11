import { ratedWorse } from "./ratings";
import type {
  Intake,
  ClipAnalysis,
  FitEvent,
  Recommendation,
  Symptom,
  SymptomArea,
} from "../domain/types";
import { assessContext, advice, holdOf } from "./assessment";
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
import { AREAS, symptomName, type Lever } from "./symptoms";
import { measurement } from "./measurements";
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
/**
 * Two symptoms pulling one setting opposite ways: the worse one wins when it
 * is at least this many points worse; otherwise the setting is kept and the
 * other changes take over.
 */
export const CLEAR_LEAD = 3;
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

type Vote = { s: Symptom; lever: Lever };
/**
 * A recommendation plus what ranks it: measured on video (or the setup) and
 * outside range first, then the worst symptom it helps, then the usual
 * fitting order from the feet up.
 */
type Draft = { rec: Recommendation; measured: boolean; order: number };
const ORDER = {
  undo: -1,
  cleat: 0,
  rotation: 1,
  stance: 2,
  saddleHeight: 3,
  setback: 4,
  tilt: 5,
  drop: 6,
  reach: 7,
  crank: 8,
  barWidth: 9,
};

/** "your front-of-knee pain (left, 6/10) and hamstring pain (4/10)" */
function listed(vs: Vote[]) {
  const seen = new Map<string, Symptom>();
  for (const v of vs) seen.set(v.s.area + v.s.side, v.s);
  const parts = [...seen.values()].map((s) =>
    AREAS[s.area].sign
      ? AREAS[s.area].noun
      : `${symptomName(s)}, ${s.severity}/10`,
  );
  return parts.length < 2
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
const worst = (vs: Vote[]) => Math.max(0, ...vs.map((v) => v.s.severity));
const areas = (vs: Vote[]): SymptomArea[] => [
  ...new Set(vs.map((v) => v.s.area)),
];
/** One side when every vote comes from that side. */
const sideOf = (vs: Vote[]) => {
  const sides = new Set(vs.map((v) => v.s.side));
  return sides.size === 1 && !sides.has("both")
    ? ([...sides][0] as "left" | "right")
    : undefined;
};
const causes = (vs: Vote[]) =>
  [...new Set(vs.map((v) => AREAS[v.s.area].cause))].join(" ");
/** Symptom-driven changes also cite the review on how weak those links are. */
const srcs = (vs: Vote[], base: string[]) => [
  ...new Set([
    ...base,
    ...vs.flatMap((v) => AREAS[v.s.area].sources),
    ...(vs.length ? ["cycling-overuse"] : []),
  ]),
];
/**
 * Two groups of symptoms pull one way and the other. Returns the winning
 * direction, or null when neither leads by CLEAR_LEAD.
 */
function settle<T extends string>(
  a: { dir: T; votes: Vote[] },
  b: { dir: T; votes: Vote[] },
): { dir: T; win: Vote[]; lose: Vote[] } | null {
  const wa = worst(a.votes),
    wb = worst(b.votes);
  if (!wa && !wb) return null;
  if (!wb) return { dir: a.dir, win: a.votes, lose: [] };
  if (!wa) return { dir: b.dir, win: b.votes, lose: [] };
  if (wa - wb >= CLEAR_LEAD) return { dir: a.dir, win: a.votes, lose: b.votes };
  if (wb - wa >= CLEAR_LEAD) return { dir: b.dir, win: b.votes, lose: a.votes };
  return null;
}

/**
 * Settings that made riding worse, as "estimateSetting:direction", plus an
 * undo card when the change is still in place.
 */
function pastChanges(events: FitEvent[], intake: Intake) {
  const avoid = new Set<string>();
  let undo: Recommendation | undefined;
  const closed = new Set(
    events
      .filter((e) => e.kind === "revert" || e.kind === "retain")
      .map((e) => e.experimentId),
  );
  for (const a of events.filter((e) => e.kind === "adjustment")) {
    const worseRide = events.some(
      (e) =>
        e.kind === "ride" && e.response === "worse" && e.experimentId === a.id,
    );
    // A symptom rated 2 or more points worse on a ride with the change
    // counts the same as a ride marked worse.
    const worseRating = !worseRide && ratedWorse(events, intake, a);
    if (!worseRide && !worseRating) continue;
    const up =
      a.before != null && a.after != null ? a.after > a.before : undefined;
    if (up !== undefined)
      switch (a.setting) {
        case "saddleHeight":
          avoid.add(`saddleHeight:${up ? "raise" : "lower"}`);
          break;
        case "saddleSetback":
          avoid.add(`saddleSetback:${up ? "back" : "forward"}`);
          break;
        case "saddleTilt":
          avoid.add(`saddleTilt:${up ? "nose-up" : "nose-down"}`);
          break;
        case "stemLength":
        case "barReach":
          avoid.add(`stem:${up ? "longer" : "shorter"}`);
          break;
        case "barDrop":
          if (!up) avoid.add("spacers:raise");
          break;
        case "cleatOffset":
          avoid.add(`cleat:${up ? "back" : "forward"}`);
          break;
        case "barWidth":
          avoid.add(`barWidth:${up ? "wider" : "narrower"}`);
          break;
      }
    if (!closed.has(a.id)) {
      const known = a.setting && a.setting !== "other" && a.before != null;
      const m = known ? measurement(a.setting as never) : undefined;
      undo = advice(
        "undo",
        "experiment",
        "Undo your last change",
        worseRide
          ? `You logged a ride as worse after: ${a.detail}`
          : `A symptom you rated got worse after: ${a.detail}`,
        known && m
          ? `Put the ${m.label.toLowerCase()} back to ${a.before} ${m.unit}, ride twice to check you are back to where you started, then mark the change as reverted in Ride & refine. It will not be suggested again.`
          : "Put the setting back the way it was, ride twice to check you are back to where you started, then mark the change as reverted in Ride & refine.",
        {
          alternatives:
            "One bad ride can come from fatigue or a hard route. If you are sure it was the change, undo it; changing something else on top makes it impossible to tell what helped.",
          recheck: "Two easy rides after undoing it.",
          confidence: "moderate",
        },
      );
    }
  }
  return { avoid, undo };
}

export function recommend(
  i: Intake,
  clips: ClipAnalysis[],
  events: FitEvent[],
): Recommendation[] {
  const context = assessContext(i, events);
  if (holdOf(context)) return context;
  const usable = clips.filter(
    (c) => !c.quality.some((q) => q.severity === "reject") && c.metrics.length,
  );
  const reviewed = usable.filter((c) => c.reviewed);
  const sides = reviewed.filter((c) => c.view === "left" || c.view === "right");
  const has = (v: string) => reviewed.some((c) => c.view === v);
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
  // Areas with warning signs are held back in the context cards; their
  // votes do not move the bike.
  const symptoms = i.symptoms.filter((s) => !s.warning);
  const comfortable = i.symptoms.length === 0;
  const votes: Vote[] = symptoms.flatMap((s) =>
    AREAS[s.area].levers.map((lever) => ({ s, lever })),
  );
  const vote = (setting: Lever["setting"], dir: string) =>
    votes.filter((v) => v.lever.setting === setting && v.lever.dir === dir);
  const pelvic = metric(
    reviewed.find((c) => c.view === "rear" || c.view === "front"),
    "pelvic-rock",
  );
  const drafts: Draft[] = [];
  const push = (
    order: number,
    rec: Recommendation,
    vs: Vote[],
    measured = false,
    lost: Vote[] = [],
    lostTo: "measurement" | "severity" = "severity",
  ) => {
    const t = areas(vs),
      against = areas(lost).filter((a) => !t.includes(a));
    drafts.push({
      rec: {
        ...rec,
        ...(t.length ? { targets: [...(rec.targets ?? []), ...t] } : {}),
        ...(against.length ? { against, againstBy: lostTo } : {}),
      },
      measured,
      order,
    });
  };
  const history = pastChanges(events, i);
  if (history.undo) push(ORDER.undo, history.undo, [], true);

  // 0. Cleat fore-aft. The foot is the base of the fit, so it comes first
  // among equals: moving a cleat changes knee extension.
  {
    const cleat = cleatCheck(i);
    const vs = vote("cleat", "back");
    const one = sideOf(vs);
    const which = one ? `your ${one} cleat` : "both cleats";
    const common = {
      alternatives:
        "Foot discomfort also comes from shoe size and width, insoles, and how tight the straps are. These studies looked at efficiency and joint angles, not comfort or injury.",
      prerequisites:
        "Make sure the cleat bolts have room to move in the shoe's slots.",
      recheck:
        "Ride 2–3 times, then re-record the side view: a cleat move changes knee extension slightly, so check saddle height again.",
      confidence: "low" as const,
    };
    if (cleat && cleat.back > 0) {
      const mm = cleat.back;
      push(
        ORDER.cleat,
        advice(
          "cleat",
          vs.length ? "experiment" : "information",
          "Move your cleats back",
          `The pedal axle sits ${-cleat.current} mm ahead of the ball of your foot. Most riders use the ball of the foot or up to ${CLEAT.max} mm behind it.${vs.length ? ` This fits your ${listed(vs)}.` : ""}`,
          `Move ${which} ${mm} mm towards the heel, so the axle sits under the ball of your foot. Trace around the cleats first, keep the rotation the same, and tighten the bolts to the shoe maker's torque.${vs.length ? "" : " Optional while you are comfortable."}`,
          {
            ...common,
            sources: srcs(vs, ["cleat-15", "cleat-midfoot"]),
            estimate: {
              setting: "cleat",
              direction: "back",
              minMm: mm,
              maxMm: mm,
              ...(one ? { side: one } : {}),
              basis: `To ${CLEAT.min}–${CLEAT.max} mm behind the ball of the foot, the range studied without loss of efficiency.`,
            },
          },
        ),
        vs,
        vs.length > 0,
      );
    } else if (vs.length) {
      const room = cleat ? CLEAT.max - cleat.current : 5;
      if (room >= 2) {
        const hi = Math.min(5, room),
          lo = Math.min(3, hi);
        push(
          ORDER.cleat,
          advice(
            "cleat",
            "experiment",
            "Move your cleats back",
            `${cleat ? `The pedal axle sits ${cleat.current} mm behind the ball of your foot. ` : ""}For your ${listed(vs)}: ${causes(vs)}`,
            `Move ${which} ${rangeText({ min: lo, max: hi })} towards the heel${cleat ? `, so the axle sits ${rangeText({ min: cleat.current + lo, max: cleat.current + hi })} behind the ball of your foot` : ""}. Trace around the cleats first, keep the rotation the same, and tighten the bolts to the shoe maker's torque.${cleat ? "" : " Measure your cleat position in Your starting point for an exact number."}`,
            {
              ...common,
              sources: srcs(vs, ["cleat-15", "cleat-midfoot"]),
              estimate: {
                setting: "cleat",
                direction: "back",
                minMm: lo,
                maxMm: hi,
                ...(one ? { side: one } : {}),
                basis: `A first step within ${CLEAT.min}–${CLEAT.max} mm behind the ball of the foot, the range studied without loss of efficiency.`,
              },
            },
          ),
          vs,
        );
      } else
        push(
          ORDER.cleat,
          advice(
            "cleat",
            "equipment-training",
            "Your cleats are already well back",
            `The pedal axle sits ${cleat!.current} mm behind the ball of your foot, near the back of the usual range, so moving them further is unlikely to help your ${listed(vs)}.`,
            AREAS[vs[0].s.area].also,
            { ...common, sources: srcs(vs, ["cleat-15"]) },
          ),
          vs,
        );
    }
  }

  // 1–2. Cleat rotation and stance width: from symptoms only, since a 2D
  // video cannot measure foot rotation.
  for (const [key, a, b] of [
    ["rotation", "toe-in", "toe-out"],
    ["stance", "narrower", "wider"],
  ] as const) {
    for (const s of ["left", "right", "both"] as const) {
      const pick = (dir: string) =>
        vote(key, dir).filter((v) => (v.s.side === s) as boolean);
      const r = settle({ dir: a, votes: pick(a) }, { dir: b, votes: pick(b) });
      const all = [...pick(a), ...pick(b)];
      if (!all.length) continue;
      const foot = s === "both" ? "both feet" : `your ${s} foot`;
      const cleatWord = s === "both" ? "both cleats" : `the ${s} cleat`;
      if (!r) {
        push(
          ORDER[key],
          advice(
            `${key}-${s}`,
            "information",
            key === "rotation"
              ? `Keep the cleat angle on ${foot}`
              : `Keep the stance width on ${foot}`,
            `Your ${listed(pick(a))} and ${listed(pick(b))} pull this setting in opposite directions by a similar amount.`,
            "Leave it as it is and start with the other changes. A fitter can watch your knee path and settle it.",
            { sources: srcs(all, []), confidence: "low" },
          ),
          all,
        );
        continue;
      }
      const why = `For your ${listed(r.win)}: ${causes(r.win)}${r.lose.length ? ` Your ${listed(r.lose)} points the other way but is milder, so the worse symptom leads; stop if it flares.` : ""}`;
      const sideField = s === "both" ? {} : { side: s };
      if (key === "rotation") {
        const out = r.dir === "toe-out";
        push(
          ORDER.rotation,
          advice(
            `rotation-${s}`,
            "experiment",
            out
              ? `Turn ${foot === "both feet" ? "your toes" : `the toes of ${foot}`} slightly out`
              : `Turn ${foot === "both feet" ? "your toes" : `the toes of ${foot}`} slightly in`,
            why,
            `First, sit on a table with your legs hanging and note which way your feet point naturally. Then rotate ${cleatWord} so your toes point 1–2° further ${out ? "out (heel in)" : "in (heel out)"} on the pedal, toward that natural angle. Trace the cleat first. Pedals with at least 4–5° of float let the foot find its own angle.`,
            {
              alternatives:
                "Foot shape, arch collapse and leg alignment matter as much as the cleat. A 2D video cannot measure foot rotation, so this comes from your symptoms only.",
              prerequisites: "Note the current cleat angle so you can undo it.",
              recheck:
                "Ride 2–3 times. If the knee path looks straighter on a front view and the pain eases, keep it.",
              sources: srcs(r.win, []),
              confidence: "low",
              estimate: {
                setting: "cleatRotation",
                direction: r.dir as "toe-in" | "toe-out",
                minMm: 1,
                maxMm: 2,
                unit: "°",
                ...sideField,
                basis:
                  "One small step; fitters change cleat angle 1–2° at a time.",
              },
            },
          ),
          r.win,
          false,
          r.lose,
        );
      } else {
        const wider = r.dir === "wider";
        push(
          ORDER.stance,
          advice(
            `stance-${s}`,
            "experiment",
            wider
              ? `Widen the stance on ${foot}`
              : `Narrow the stance on ${foot}`,
            why,
            wider
              ? `Move ${cleatWord} 2 mm toward the inner edge of the shoe, which moves the foot 2 mm out from the bike. For more, a 2 mm pedal washer or a pedal with a longer axle adds 2–4 mm.`
              : `Move ${cleatWord} 1–2 mm toward the outer edge of the shoe, which brings the foot 1–2 mm closer to the bike. Check your heel does not touch the crank.`,
            {
              alternatives:
                "Hip width, foot alignment and knee path all play in. This comes from your symptoms; the video cannot measure stance width.",
              prerequisites:
                "Check the cleat has sideways adjustment and the pedal maker allows washers.",
              recheck: "Ride 2–3 times and note the pain.",
              sources: srcs(r.win, []),
              confidence: "low",
              estimate: {
                setting: "stance",
                direction: wider ? "wider" : "narrower",
                minMm: wider ? 2 : 1,
                maxMm: wider ? 4 : 2,
                ...sideField,
                basis: "One small step on each changed side.",
              },
            },
          ),
          r.win,
          false,
          r.lose,
        );
      }
    }
  }

  // 3. Saddle height
  if (knee !== undefined) {
    const k = Math.round(knee * 10) / 10;
    const inside = knee >= KNEE.low && knee <= KNEE.high;
    const clear = knee < KNEE.outerLow || knee > KNEE.outerHigh;
    const up = vote("saddleHeight", "raise"),
      down = vote("saddleHeight", "lower");
    const legRatio = metric(side, "leg-ratio")?.value;
    const sources = ["dynamic", "bini", "review", "product"];
    const common = {
      alternatives:
        "Camera angle, landmark placement, ankle style, shoe or cleat stack, and training load can all affect this. The range comes from research on trained riders and is a guide, not a rule.",
      prerequisites: i.mechanicalLimits
        ? "Stay within the seatpost's minimum insertion mark and torque specification. Stop if symptoms worsen."
        : "First confirm the seatpost minimum-insertion mark and torque specification, then tick 'limits confirmed' in your profile. Stop if symptoms worsen.",
      recheck:
        "Ride 2–3 times at your usual effort, then re-record the side view. Keep the change if it feels better or the same and the angle stayed inside 30–40°; otherwise revert.",
    };
    const estimateFor = (target: number, cap?: number) => {
      if (!i.saddleHeight) return undefined;
      let mm = Math.abs(
        saddleChangeMm(knee, target, i.saddleHeight, i.crankLength, legRatio),
      );
      if (cap) mm = Math.min(mm, cap);
      const lo = Math.max(2, Math.round(cap ? mm - 2 : mm * 0.7)),
        hi = Math.max(lo + 1, Math.round(cap ? mm : mm * 1.3));
      return { lo, hi, target };
    };
    if (!inside && !(comfortable && !clear)) {
      // Measured outside the range: the measurement sets the direction.
      const lower = knee < KNEE.low;
      const target = lower ? KNEE.low + 2 : KNEE.high - 2;
      const agree = lower ? down : up,
        against = lower ? up : down;
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
      if (agree.length) corroboration.push(`It fits your ${listed(agree)}.`);
      if (against.length)
        corroboration.push(
          `Your ${listed(against)} usually points the other way, but the video measures the saddle as ${lower ? "high" : "low"}, so the measurement leads. Take the first 5 mm only and stop if it gets worse.`,
        );
      const e = estimateFor(target);
      const amount = e
        ? e.hi > 10
          ? `about ${e.lo}–${e.hi} mm in total. Start with 5 mm, ride, then re-record before going further`
          : `about ${e.lo}–${e.hi} mm`
        : "3–5 mm";
      push(
        ORDER.saddleHeight,
        advice(
          "saddle",
          "experiment",
          lower ? "Lower your saddle" : "Raise your saddle",
          `Your knee bends ${k}° at full extension. The typical range for dynamic video measurement is 30–40°.${corroboration.length ? " " + corroboration.join(" ") : ""}${comfortable ? " This is optional while you are comfortable." : ""}`,
          `${lower ? "Lower" : "Raise"} the saddle by ${amount}. Mark the seatpost first, keep the saddle angle and setback the same, and change nothing else.${i.saddleHeight ? "" : " Enter your saddle height in your profile for a number sized to you."}`,
          {
            ...common,
            sources: srcs(agree, sources),
            confidence: lowConfidence || !clear ? "low" : "moderate",
            estimate: {
              setting: "saddleHeight",
              direction: lower ? "lower" : "raise",
              minMm: e?.lo ?? 3,
              maxMm: e?.hi ?? 5,
              basis: e
                ? `Two-link leg model from ${k}° to ${target}°, scaled by your ${i.saddleHeight} mm saddle height. ±30% for camera and landmark error.`
                : "A first step; add your saddle height for a number sized to you.",
            },
          },
        ),
        agree,
        true,
        against,
        "measurement",
      );
    } else if (inside && (up.length || down.length)) {
      // In range: symptoms may move it within the range, never out of it.
      const r = settle(
        { dir: "raise" as const, votes: up },
        { dir: "lower" as const, votes: down },
      );
      const target = r?.dir === "raise" ? KNEE.low + 1 : KNEE.high - 1;
      const room = r ? Math.abs(knee - target) : 0;
      if (!r || room < 1.5) {
        push(
          ORDER.saddleHeight,
          advice(
            "saddle-ok",
            "no-change",
            "Keep your saddle height",
            !r
              ? `Your knee bends ${k}° at full extension, inside the typical 30–40° range. Your ${listed(up)} would want it higher and your ${listed(down)} lower, by a similar amount, so height stays put and the other changes below take over.`
              : `Your knee bends ${k}° at full extension, already at the ${r.dir === "raise" ? "high" : "low"}-saddle end of the 30–40° range. Going further would take it outside, so the other changes below are the better lever for your ${listed(r.win)}.`,
            "Keep your saddle height. Re-check after any change to shoes, pedals, cleats or saddle.",
            { sources, confidence: lowConfidence ? "low" : "moderate" },
          ),
          [...up, ...down],
        );
      } else {
        const e = estimateFor(target, 5);
        const raise = r.dir === "raise";
        push(
          ORDER.saddleHeight,
          advice(
            "saddle",
            "experiment",
            raise ? "Raise your saddle a little" : "Lower your saddle a little",
            `Your knee bends ${k}° at full extension, inside the typical 30–40° range, with room to go ${raise ? "higher" : "lower"}. For your ${listed(r.win)}: ${causes(r.win)}${r.lose.length ? ` Your ${listed(r.lose)} points the other way but is milder, so the worse symptom leads.` : ""}`,
            `${raise ? "Raise" : "Lower"} the saddle by ${e ? rangeText({ min: e.lo, max: e.hi }) : "2–4 mm"}. That keeps your knee inside the range. Mark the seatpost first and change nothing else.${i.saddleHeight ? "" : " Enter your saddle height in your profile for a number sized to you."}`,
            {
              ...common,
              sources: srcs(r.win, sources),
              confidence: "low",
              estimate: {
                setting: "saddleHeight",
                direction: r.dir,
                minMm: e?.lo ?? 2,
                maxMm: e?.hi ?? 4,
                basis: e
                  ? `Two-link leg model toward ${target}°, capped at 5 mm because the measured angle is already in range.`
                  : "A small step within the range.",
              },
            },
          ),
          r.win,
          false,
          r.lose,
        );
      }
    } else if (inside)
      push(
        ORDER.saddleHeight,
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
        [],
      );
    else
      push(
        ORDER.saddleHeight,
        advice(
          "saddle-ok",
          "no-change",
          "Saddle height is close to typical",
          `Your knee bends ${k}° at full extension, just outside the typical 30–40° range. You report no discomfort.`,
          "No change needed while you are comfortable. If you develop knee discomfort, start here.",
          { sources: ["dynamic", "bini"], confidence: "low" },
        ),
        [],
      );
  }

  // 4. Saddle setback: symptoms first, measured riders as a guard rail.
  {
    const check = setbackCheck(i);
    const back = vote("setback", "back"),
      fwd = vote("setback", "forward");
    const r = settle(
      { dir: "back" as const, votes: back },
      { dir: "forward" as const, votes: fwd },
    );
    const common = {
      alternatives:
        "Measured riders show what is common, not what is best for you. Leg length and flexibility did not predict setback in that study. Saddle shape and how you sit on it also change your effective position.",
      prerequisites:
        "Stay within the saddle rail markings and seatpost clamp torque. Change one thing at a time.",
      recheck:
        "Ride 2–3 times, then re-measure setback and saddle height and re-record the side view.",
      confidence: "low" as const,
    };
    const heightNote = (b: boolean) =>
      `Moving the saddle ${b ? "back raises" : "forward lowers"} it relative to the pedals by about 3 mm per 10 mm, so re-check saddle height afterwards.`;
    const pct =
      check && check.current !== null && i.saddleHeight
        ? Math.round((check.current / i.saddleHeight) * 1000) / 10
        : null;
    const where =
      check && check.current !== null
        ? ` Your setback is ${check.current} mm (${pct}% of saddle height); measured road riders with your saddle height mostly sit at ${rangeText(check.typical)}.`
        : "";
    if (r) {
      const b = r.dir === "back";
      // Stay inside what nearly all measured riders use.
      const limit =
        check && check.current !== null
          ? b
            ? check.outer.max - check.current
            : check.current - check.outer.min
          : 5;
      // Measured riders agree and the setup is outside their range: the
      // full move to their typical edge, 5 mm first.
      const agrees = check !== null && check.move !== 0 && check.move > 0 === b;
      const hi = agrees
        ? Math.abs(check!.move)
        : Math.min(5, Math.max(0, Math.round(limit)));
      const lo = agrees ? Math.min(5, hi) : Math.min(3, hi);
      if (hi >= 2)
        push(
          ORDER.setback,
          advice(
            "setback",
            "experiment",
            b ? "Move your saddle back" : "Move your saddle forward",
            `For your ${listed(r.win)}: ${causes(r.win)}${r.lose.length ? ` Your ${listed(r.lose)} points the other way but is milder, so the worse symptom leads.` : ""}${where}`,
            `Move the saddle ${rangeText({ min: lo, max: hi })} ${b ? "back" : "forward"} on its rails${agrees && hi > 5 ? ", 5 mm at a time" : ""}. ${heightNote(b)}`,
            {
              ...common,
              sources: srcs(r.win, ["holliday", "kops"]),
              estimate: {
                setting: "saddleSetback",
                direction: r.dir,
                minMm: lo,
                maxMm: hi,
                basis: agrees
                  ? `To the edge of the typical range for your ${i.saddleHeight} mm saddle height (${POPULATION.setback.mean} ± ${POPULATION.setback.sd}%).`
                  : check
                    ? `One step, kept within what nearly all measured road riders of your saddle height use (${rangeText(check.outer)}).`
                    : "One small step on the rails.",
              },
            },
          ),
          r.win,
          false,
          r.lose,
        );
      else
        push(
          ORDER.setback,
          advice(
            "setback",
            "information",
            b
              ? "Your saddle is already far back"
              : "Your saddle is already far forward",
            `Your ${listed(r.win)} would usually call for moving it ${r.dir}, but it is already at the edge of what measured riders use.${where}`,
            "Leave the setback and start with the other changes.",
            { ...common, sources: srcs(r.win, ["holliday"]) },
          ),
          r.win,
          false,
          r.lose,
        );
    } else if (back.length && fwd.length)
      push(
        ORDER.setback,
        advice(
          "setback",
          "information",
          "Keep your saddle setback",
          `Your ${listed(back)} would want the saddle further back and your ${listed(fwd)} further forward, by a similar amount.${where}`,
          "Leave it and start with the other changes.",
          { ...common, sources: ["holliday"] },
        ),
        [...back, ...fwd],
      );
    else if (check && check.move !== 0 && i.saddleHeight) {
      const b = check.move > 0,
        mm = Math.abs(check.move),
        first = Math.min(5, mm);
      push(
        ORDER.setback,
        advice(
          "setback",
          "information",
          b
            ? "Your saddle is further forward than most riders'"
            : "Your saddle is further back than most riders'",
          `Your setback is ${check.current} mm, ${pct}% of your saddle height. Measured road riders with your saddle height mostly sit at ${rangeText(check.typical)}, and nearly all at ${rangeText(check.outer)}.`,
          "No change needed while you are comfortable. This shows how your setup compares; it is not a target.",
          {
            ...common,
            sources: ["holliday", "kops"],
            estimate: {
              setting: "saddleSetback",
              direction: b ? "back" : "forward",
              minMm: first,
              maxMm: mm,
              basis: `To the edge of the typical range for your ${i.saddleHeight} mm saddle height (${POPULATION.setback.mean} ± ${POPULATION.setback.sd}%).`,
            },
          },
        ),
        [],
      );
    }
  }

  // 5. Saddle tilt
  {
    const down = vote("tilt", "nose-down"),
      level = vote("tilt", "level");
    const t = i.saddleTilt;
    const tiltDraft = (
      direction: "nose-down" | "nose-up",
      lo: number,
      hi: number,
      title: string,
      obs: string,
      action: string,
      vs: Vote[],
      lost: Vote[] = [],
    ) =>
      push(
        ORDER.tilt,
        advice("tilt", "experiment", title, obs, action, {
          alternatives:
            "Saddle shape matters as much as angle. Tilting the nose down eases pressure on soft tissue but slides you forward onto your hands; level keeps your weight on the sit bones.",
          prerequisites:
            "Measure tilt with a level on a level floor before and after, and tighten the seatpost clamp to its torque.",
          recheck: "Ride 2–3 times and note pressure, sliding and hands.",
          sources: srcs(vs, ["bressel", "saddle-pressure"]),
          confidence: "low",
          estimate: {
            setting: "saddleTilt",
            direction,
            minMm: lo,
            maxMm: hi,
            unit: "°",
            basis:
              t === null
                ? "From level; measure your tilt for an exact change."
                : `From your measured ${t}°.`,
          },
        }),
        vs,
        t !== null && (t > 2 || t < -4),
        lost,
      );
    const r = settle(
      { dir: "nose-down" as const, votes: down },
      { dir: "level" as const, votes: level },
    );
    const why = (vs: Vote[]) => `For your ${listed(vs)}: ${causes(vs)}`;
    if (down.length || level.length) {
      if (t !== null && t > 1) {
        // Nose up: every complaint here is helped by bringing it down.
        const extra = down.length ? 1 : 0;
        tiltDraft(
          "nose-down",
          Math.round(t),
          Math.round(t) + extra,
          "Bring the saddle nose down",
          `Your saddle nose is ${t}° up. ${why([...down, ...level])}`,
          `Tilt the nose down ${rangeText({ min: Math.round(t), max: Math.round(t) + extra }, "°")}, to ${extra ? "level or 1° nose down" : "level"}.`,
          [...down, ...level],
        );
      } else if (
        r?.dir === "nose-down" ||
        (!r && down.length && level.length)
      ) {
        const vs = r ? r.win : down;
        const compromise = !r;
        if (t !== null && t <= -3)
          push(
            ORDER.tilt,
            advice(
              "tilt",
              "equipment-training",
              "Try a different saddle shape",
              `Your saddle is already ${-t}° nose down. ${why(vs)} Tilting it further would slide you onto your hands.`,
              "Keep the tilt. A saddle with a central cut-out or a short nose takes pressure off soft tissue at a level angle; many shops lend test saddles.",
              { sources: srcs(vs, ["saddle-pressure"]), confidence: "low" },
            ),
            vs,
          );
        else {
          const from = t ?? 0;
          // Aim for 1–2° nose down, or exactly 1° when level is also wanted.
          const lo = Math.round(from + 1),
            hi = Math.round(from + (compromise ? 1 : 2));
          const both = compromise ? [...down, ...level] : vs;
          if (hi < 1)
            push(
              ORDER.tilt,
              advice(
                "tilt",
                "no-change",
                "Keep your saddle tilt",
                `Your saddle is ${-from}° nose down, already where your ${listed(down)} and ${listed(level)} meet: slightly down eases pressure without sliding you forward.`,
                "Keep it. If pressure stays, a saddle with a cut-out or a shorter nose is the next step.",
                { sources: srcs(both, ["saddle-pressure"]), confidence: "low" },
              ),
              both,
            );
          else
            tiltDraft(
              "nose-down",
              Math.max(1, lo),
              hi,
              "Tilt the saddle nose down slightly",
              `${why(vs)}${compromise ? ` Your ${listed(level)} wants it level, so this stops at 1° as a compromise.` : r!.lose.length ? ` Your ${listed(r!.lose)} prefers level but is milder.` : ""}`,
              `Tilt the nose down so the saddle sits ${compromise ? "1°" : "1–2°"} nose down${t !== null ? ` (from ${t}°)` : " from level"}. If you start sliding forward, go back to level and try a cut-out saddle instead.`,
              both,
            );
        }
      } else if (r?.dir === "level") {
        if (t !== null && t < -2) {
          const lo = Math.round(-t - 1),
            hi = Math.round(-t);
          tiltDraft(
            "nose-up",
            lo,
            hi,
            "Level your saddle",
            `Your saddle nose is ${-t}° down. ${why(r.win)}${r.lose.length ? ` Your ${listed(r.lose)} prefers nose-down but is milder.` : ""}`,
            `Raise the nose ${rangeText({ min: lo, max: hi }, "°")}, to between level and 1° nose down.`,
            r.win,
            r.lose,
          );
        } else if (t === null)
          push(
            ORDER.tilt,
            advice(
              "tilt",
              "information",
              "Check your saddle is level",
              why(r.win),
              "Measure the tilt (how-to in Your starting point) and set it between level and 1° nose down.",
              { sources: srcs(r.win, ["bressel"]), confidence: "low" },
            ),
            r.win,
            false,
            r.lose,
          );
      }
    }
  }

  // 6–7. Handlebar height and reach.
  {
    const elbow = metric(side, "elbow"),
      shoulder = metric(side, "shoulder-angle"),
      torso = metric(side, "torso");
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
      reachSigns.push(
        `your arms are tucked at ${shoulder.value}° to your torso`,
      );
    }
    const lowTorso =
      torso && torso.value < UPPER.torsoMin[i.discipline] ? torso.value : null;
    const needHeight = i.riderHeight
      ? ""
      : " Add your height in your profile for a size-specific number.";
    const common = {
      alternatives:
        "Hand position on the bar, core strength, flexibility and riding posture affect these angles as much as the bike does. Your torso also moves when the bar moves, so the full change is an upper estimate. These ranges are common fitting practice, not research thresholds.",
      prerequisites:
        "Check steerer spacer limits and stem torque. Make sure the saddle height is settled first, because it changes your reach.",
      recheck:
        "Ride 2–3 times, then re-record the side view with hands on the hoods.",
      confidence: "low" as const,
    };
    // Drop
    const up = vote("barHeight", "raise");
    const roomAbove = i.barDrop === null || i.barDrop > 0;
    if (lowTorso !== null || (up.length && roomAbove)) {
      const drop = lowTorso !== null ? dropChange(i, side) : null;
      const act = up.length > 0 || !comfortable;
      const first = drop ? Math.min(10, drop.spacers.min) : 5;
      const spacers = drop ? drop.spacers : { min: 5, max: 10 };
      push(
        ORDER.drop,
        advice(
          "drop",
          act ? "experiment" : "no-change",
          "Raise your handlebar",
          `${lowTorso !== null ? `From the side view, your torso is ${lowTorso}° from horizontal, a low position for ${i.discipline} riding.` : `Your torso angle is within practice range for ${i.discipline} riding.`}${up.length ? ` For your ${listed(up)}: a higher bar takes load off ${[...new Set(up.map((v) => (["neck", "lower-back", "upper-back"].includes(v.s.area) ? "the back and neck" : v.s.area === "saddle-numb" ? "the soft tissue on the saddle" : v.s.area === "hip-front" ? "the front of the hip" : "the hands")))].reduce((t, x, n, all) => (n === 0 ? x : n === all.length - 1 ? `${t} and ${x}` : `${t}, ${x}`), "")}.` : ""}${act ? "" : " You report no discomfort, so this is for information."}`,
          act
            ? `Move ${rangeText(spacers)} of spacers from above the stem to below it, ${first} mm at a time.${drop ? ` That lifts your torso toward ${drop.toDeg}°.` : ""}${i.barDrop !== null ? ` Your saddle-to-bar drop would go from ${i.barDrop} to about ${i.barDrop - spacers.max}–${i.barDrop - spacers.min} mm.` : ""} No spacers left? A stem flipped to positive rise does the same. Change one thing only.${drop ? "" : needHeight}`
            : "No change needed while you are comfortable. If you develop hand, neck or back discomfort, start here.",
          {
            ...common,
            sources: srcs(
              up,
              i.riderHeight ? ["product", "anthropometry"] : ["product"],
            ),
            estimate: {
              setting: "spacers",
              direction: "raise",
              minMm: spacers.min,
              maxMm: spacers.max,
              basis: drop?.basis ?? "One or two 5 mm spacers, a first step.",
            },
          },
        ),
        up,
        lowTorso !== null && act,
      );
    }
    // Reach
    const shorter = vote("reach", "shorter");
    if (reachDir || shorter.length) {
      const reach = reachChange(i, side);
      const stemTo = (step: number) =>
        i.stemLength ? ` (${i.stemLength} → ${i.stemLength + step} mm)` : "";
      const reachTo = (step: number) =>
        i.barReach
          ? ` Your saddle-to-bar reach would go from ${i.barReach} to about ${i.barReach + step} mm.`
          : "";
      const seen = reachSigns.length
        ? `From the side view, ${reachSigns.join(" and ")}.`
        : "Your arm angles are within practice range.";
      if (reachDir === "longer") {
        const step = reach?.stemStep ?? 10;
        push(
          ORDER.reach,
          advice(
            "reach",
            comfortable ? "no-change" : "experiment",
            "Your cockpit may be short",
            `${seen}${comfortable ? " You report no discomfort, so this is for information." : ""}${shorter.length ? ` Your ${listed(shorter)} usually points to a shorter reach, but the video measures your arms as tucked, so the measurement leads. Take one 10 mm step only and go back if it gets worse.` : ""}`,
            comfortable
              ? "No change needed while you are comfortable."
              : reach
                ? `Try a stem ${step} mm longer${stemTo(step)}.${reachTo(step)} The full change to bring your shoulder angle to ${reach.toDeg}° is about ${rangeText(reach.mm)}; go in 10 mm steps and re-record between them. Change one thing only.`
                : `Try a stem 10 mm longer${stemTo(10)}, or move the hoods slightly forward. Change one thing only.${needHeight}`,
            {
              ...common,
              sources: i.riderHeight
                ? ["product", "anthropometry"]
                : ["product"],
              estimate: {
                setting: "stem",
                direction: "longer",
                minMm: reach ? reach.mm.min : 10,
                maxMm: reach ? reach.mm.max : 10,
                basis: reach?.basis ?? "Typical stem increment.",
              },
            },
          ),
          [],
          !comfortable,
          shorter,
          "measurement",
        );
      } else {
        const act = shorter.length > 0 || !comfortable;
        const step = 10;
        const measured = reachDir === "shorter";
        push(
          ORDER.reach,
          advice(
            "reach",
            act ? "experiment" : "no-change",
            "Shorten your reach",
            `${seen}${shorter.length ? ` For your ${listed(shorter)}: a long reach puts more weight and stretch through the arms, shoulders and back.` : ""}${act ? "" : " You report no discomfort, so this is for information."}`,
            act
              ? measured && reach
                ? `Try a stem ${step} mm shorter${stemTo(-step)}.${reachTo(-step)} The full change to bring your arms to ${reach.toDeg === reach.fromDeg ? "a softer elbow" : `a ${reach.toDeg}° shoulder angle`} is about ${rangeText(reach.mm)}; go in 10 mm steps and re-record between them. Change nothing else.`
                : `Try a stem ${step} mm shorter${stemTo(-step)}.${reachTo(-step)} Change nothing else.${measured ? needHeight : ""}`
              : "No change needed while you are comfortable. If you develop hand, neck or back discomfort, start here.",
            {
              ...common,
              sources: srcs(
                shorter,
                i.riderHeight ? ["product", "anthropometry"] : ["product"],
              ),
              estimate: {
                setting: "stem",
                direction: "shorter",
                minMm: measured && reach ? reach.mm.min : 10,
                maxMm: measured && reach ? reach.mm.max : 10,
                basis:
                  measured && reach
                    ? reach.basis
                    : "One stem size; stems come in 10 mm steps.",
              },
            },
          ),
          shorter,
          measured && act,
        );
      }
    }
  }

  // 8. Crank length: equipment, only with a known long crank.
  {
    const vs = vote("crank", "shorter").filter((v) => v.s.severity >= 4);
    if (vs.length && i.crankLength !== null && i.crankLength >= 170)
      push(
        ORDER.crank,
        advice(
          "crank",
          "equipment-training",
          "Consider shorter cranks",
          `Your cranks are ${i.crankLength} mm. For your ${listed(vs)}: shorter cranks close the hip and knee less at the top of the stroke.`,
          `If the changes above do not settle it, try cranks 5 mm shorter (${i.crankLength - 5} mm) and raise the saddle by the same 5 mm to keep your leg extension.`,
          {
            alternatives:
              "Cranks are a purchase; try the free changes first. Performance differences across common crank lengths are small.",
            recheck: "Re-record the side view after fitting them.",
            sources: srcs(vs, []),
            confidence: "low",
            estimate: {
              setting: "crank",
              direction: "shorter",
              minMm: 5,
              maxMm: 5,
              basis: "One common size step.",
            },
          },
        ),
        vs,
      );
  }

  // 9. Handlebar width
  {
    const bar = barWidthTarget(i);
    const vs = vote("barWidth", "match");
    if (bar && bar.off !== 0) {
      const wider = bar.off > 0;
      push(
        ORDER.barWidth,
        advice(
          "bar-width",
          "equipment-training",
          wider
            ? "Your handlebar is wider than your shoulders"
            : "Your handlebar is narrower than your shoulders",
          `Your bar is ${bar.current} mm at the hoods and your shoulders are ${i.shoulderWidth} mm across.${vs.length ? ` Bar width can add to your ${listed(vs)}.` : ""}`,
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
        vs,
      );
    }
  }

  // Knee tracking from front/rear
  const later: Recommendation[] = [];
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
          "Check that both cleats are set up the same way and that your shoes and insoles support your feet. A fitter or physiotherapist can assess cleat rotation, wedges or foot support.",
          {
            alternatives:
              "Camera alignment, clothing and natural asymmetry can all produce this. A 2D view cannot measure rotation.",
            sources: ["product"],
            confidence: "low",
          },
        ),
      );
  }
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

  // A change that made riding worse is not suggested again.
  for (const d of drafts) {
    const e = d.rec.estimate;
    if (
      d.rec.outcome === "experiment" &&
      e &&
      history.avoid.has(`${e.setting}:${e.direction}`)
    )
      d.rec = {
        ...d.rec,
        outcome: "information",
        title: `Already tried: ${d.rec.title.toLowerCase()}`,
        action:
          "You logged a ride as worse after this change, so it is not suggested again. Start with the next change instead.",
        estimate: undefined,
      };
  }
  // Priority: measured problems and the cleat (which shifts everything
  // above it) in fit order from the feet up; then symptom-driven changes,
  // worst symptom first, ties in fit order.
  const severityOf = (r: Recommendation) =>
    Math.max(
      0,
      ...symptoms
        .filter((s) => r.targets?.includes(s.area))
        .map((s) => s.severity),
    );
  const ranked = drafts
    .filter((d) => d.rec.outcome === "experiment")
    .map((d) => ({ ...d, first: d.measured || d.order <= ORDER.cleat }))
    .sort((a, b) =>
      a.first !== b.first
        ? Number(b.first) - Number(a.first)
        : (a.first ? 0 : severityOf(b.rec) - severityOf(a.rec)) ||
          a.order - b.order,
    )
    .map((d, n) => ({ ...d.rec, priority: n + 1 }));
  const rest = drafts
    .filter((d) => d.rec.outcome !== "experiment")
    .sort((a, b) => a.order - b.order)
    .map((d) => d.rec);
  // Notes that do not change what to do go after the changes.
  const after = new Set(["context", "reassess", "load", "equipment"]);
  return [
    ...context.filter((r) => !after.has(r.id)),
    ...ranked,
    ...context.filter((r) => after.has(r.id)),
    ...rest,
    ...later,
  ];
}
