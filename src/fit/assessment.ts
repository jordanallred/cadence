import type { Intake, FitEvent, Recommendation } from "../domain/types";
import { RULE_VERSION } from "./evidence";
import { AREAS, symptomName } from "./symptoms";
/**
 * The one thing that stops fit advice: an emergency or urgent red flag.
 * Everything else adds a note and keeps the advice.
 */
export const holdOf = (results: Recommendation[]) =>
  results.find((r) => r.urgency !== "routine");
export function advice(
  id: string,
  outcome: Recommendation["outcome"],
  title: string,
  observations: string,
  action: string,
  extra: Partial<Recommendation> = {},
): Recommendation {
  return {
    id,
    outcome,
    title,
    observations,
    action,
    urgency: "routine",
    alternatives: "Video cannot establish the cause of discomfort.",
    prerequisites: "Use only evidence applicable to your situation.",
    recheck: "Reassess if symptoms change.",
    sources: ["product"],
    ruleVersion: RULE_VERSION,
    ...extra,
  };
}
export function assessContext(i: Intake, e: FitEvent[]): Recommendation[] {
  if (i.screen === "emergency-back")
    return [
      advice(
        "emergency",
        "assessment",
        "Seek emergency medical care now",
        "You selected a back-pain emergency symptom combination.",
        "Stop this fitting session and contact local emergency services. Do not drive yourself.",
        { urgency: "emergency", sources: ["nhs-back"] },
      ),
    ];
  if (i.screen === "urgent-back" || i.screen === "urgent-knee")
    return [
      advice(
        "urgent",
        "assessment",
        "Seek urgent medical advice",
        "You reported symptoms that need prompt assessment.",
        "Contact an urgent medical service now; do not use bike adjustments to delay assessment.",
        {
          urgency: "urgent",
          sources: [i.screen === "urgent-back" ? "nhs-back" : "nhs-knee"],
        },
      ),
    ];
  const r: Recommendation[] = [];
  const symptoms = i.symptoms.filter((x) => !AREAS[x.area].sign);
  // Unanswered: ask, but do not withhold the fit. The emergency groups are
  // things a rider would notice and act on; the rest of the advice is a
  // small, reversible bike change.
  if (i.screen === "unknown" && symptoms.length)
    r.push(
      advice(
        "screen-check",
        "information",
        "Answer the safety check",
        "You reported discomfort but have not answered the safety check in Your starting point.",
        "Open Your starting point and answer it. If any of its emergency or urgent signs apply, stop and get medical help before changing your bike.",
        { sources: ["nhs-back", "nhs-knee"] },
      ),
    );
  // An area with warning signs is held back on its own; everything else
  // keeps its advice.
  for (const s of i.symptoms.filter((x) => x.warning)) {
    const a = AREAS[s.area];
    r.push(
      advice(
        `hold-${s.area}-${s.side}`,
        "assessment",
        `Get your ${symptomName(s)} checked first`,
        a.numb
          ? "You said the numbness or weakness lasts after you get off the bike."
          : "You said the pain is sharp, came on suddenly, is getting worse, or comes with swelling.",
        `See ${a.clinician} before changing the bike for this. Bike changes for it are held back here because they can mask ${a.numb ? "a trapped nerve" : "an injury"} that needs treatment. The other changes below do not depend on it and are fine to try if riding does not make it worse.`,
        { sources: a.sources, targets: [s.area] },
      ),
    );
  }
  if (
    symptoms.length &&
    (i.outsideCycling ||
      i.persistent ||
      symptoms.some((s) => s.severity >= 7) ||
      i.limitations.trim())
  )
    r.push(
      advice(
        "context",
        "assessment",
        "Also have a clinician look at it",
        [
          i.outsideCycling && "Your symptoms also happen off the bike.",
          i.persistent && "They have lasted weeks or affect daily life.",
          symptoms.some((s) => s.severity >= 7) &&
            "At least one is 7/10 or worse.",
          i.limitations.trim() && "You noted a limitation or restriction.",
        ]
          .filter(Boolean)
          .join(" "),
        `Position is often part of the cause, so the changes below are still worth trying one at a time. Book a physiotherapist or sports doctor alongside them, because the cause may not be the bike alone.${i.limitations.trim() ? " Skip any change that conflicts with a clinician's restriction." : ""}`,
        { sources: ["product", "nhs-knee", "nhs-back"] },
      ),
    );
  const worse = new Set(
    e
      .filter((x) => x.kind === "ride" && x.response === "worse")
      .map((x) => x.experimentId ?? x.id),
  );
  const failed = new Set(
    e
      .filter(
        (x) => x.kind === "ride" && x.response === "same" && x.experimentId,
      )
      .map((x) => x.experimentId),
  );
  if (worse.size >= 2 || failed.size >= 2)
    r.push(
      advice(
        "reassess",
        "assessment",
        "Consider a professional fitter",
        worse.size >= 2
          ? "Two changes have made riding worse."
          : "Two changes have not helped.",
        "The next changes below avoid the ones that did not work. If they do not help either, a fitter or physiotherapist who can watch you ride will find causes a video cannot.",
      ),
    );
  if (i.trainingChange)
    r.push(
      advice(
        "load",
        "equipment-training",
        "Review the change in riding load",
        "You recently changed training volume or intensity.",
        "Compare symptom onset with the training change. Avoid assuming position is the sole cause; consider a qualified coach or clinician if symptoms persist.",
      ),
    );
  if (i.equipmentIssue)
    r.push(
      advice(
        "equipment",
        "equipment-training",
        "Check your contact points and equipment",
        "You flagged a possible shoe, saddle or equipment problem.",
        "Inspect wear, shoe pressure and hardware with an appropriate professional. Do not infer a need for wedges, shims or a specific saddle from this video.",
      ),
    );
  return r;
}
