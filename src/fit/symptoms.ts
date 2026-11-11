import type { Intake, SymptomEntry } from "../domain/types";

const legacy: Record<string, SymptomEntry["area"]> = {
  knee: "front-knee", back: "lower-back", neck: "neck",
  hands: "hands-pain", saddle: "sit-bones", feet: "hot-foot", other: "other",
};
export function symptoms(i: Intake): SymptomEntry[] {
  if (i.symptoms.length) return i.symptoms;
  return i.symptom === "none" ? [] : [{
    area: legacy[i.symptom], side: "both", severity: i.severity,
    onset: i.onset, sharpSuddenWorsening: false,
  }];
}
export const symptomGroup = (area: SymptomEntry["area"]) => {
  if (["front-knee", "back-knee", "inner-knee", "outer-knee"].includes(area)) return "knee";
  if (["lower-back", "upper-back"].includes(area)) return "back";
  if (["hands-numb", "hands-pain", "wrist"].includes(area)) return "hands";
  if (["saddle-numb", "sit-bones", "chafing", "sliding"].includes(area)) return "saddle";
  if (["hot-foot", "achilles"].includes(area)) return "feet";
  if (["neck", "shoulder"].includes(area)) return "neck";
  return "other";
};
