import type { Intake, FitEvent, Recommendation } from "../domain/types";
import { RULE_VERSION } from "./evidence";
import { symptoms, symptomGroup } from "./symptoms";
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
  if (i.screen === "unknown")
    return [
      advice(
        "screen",
        "information",
        "Complete the symptom check first",
        "Important context is still unknown.",
        "Return to Your starting point and answer the symptom check. A negative check does not establish medical clearance.",
      ),
    ];
  const failed = new Set(
    e
      .filter(
        (x) => x.kind === "ride" && x.response === "same" && x.experimentId,
      )
      .map((x) => x.experimentId),
  );
  const r: Recommendation[] = [];
  if (e.some((x) => x.kind === "ride" && x.response === "worse") || failed.size >= 2)
    r.push(advice(
        "reassess",
        "assessment",
        "Pause adjustments and reassess",
        "Your follow-up shows worsening symptoms or multiple unhelpful experiments.",
        "Discuss the symptoms and your adjustment history with a qualified clinician or fitter. Use any video findings as context, and avoid repeating a change that made symptoms worse.",
      ));
  const complaints = symptoms(i);
  if (complaints.length && (i.outsideCycling || i.persistent || complaints.some(s => s.severity >= 7) || i.limitations.trim()))
    r.push(advice(
        "context",
        "assessment",
        "Your symptoms need a broader assessment",
        "Persistent, severe, off-bike symptoms or a reported limitation may have causes beyond position.",
        "Discuss your symptoms or restrictions with a qualified clinician. Review measured fit findings alongside that advice.",
        {
          sources: [
            "product",
            ...(complaints.some(s => symptomGroup(s.area) === "knee")
              ? ["nhs-knee"]
              : complaints.some(s => symptomGroup(s.area) === "back")
                ? ["nhs-back"]
                : []),
          ],
        },
      ));
  for (const s of complaints.filter(s => s.sharpSuddenWorsening))
    r.push(advice(`caution-${s.area}-${s.side}`, "assessment", "Check this symptom before changing its fit setting", `${s.side} ${s.area.replaceAll("-", " ")} is sharp, sudden or worsening.`, "Seek appropriate clinical advice for this area; other measured findings remain in the report."));
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
