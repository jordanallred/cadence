export const RULE_VERSION = "0.2.0";
export const evidence: Record<
  string,
  { title: string; url: string; limit: string }
> = {
  "nhs-back": {
    title: "NHS: Back pain",
    url: "https://www.nhs.uk/conditions/back-pain/",
    limit:
      "Symptom guidance, not a diagnosis. Emergency and urgent pathways preserve the source urgency; use local emergency services.",
  },
  "nhs-knee": {
    title: "NHS: Knee pain",
    url: "https://www.nhs.uk/symptoms/knee-pain/",
    limit: "Clinical advice for knee symptoms, not a bike-fitting protocol.",
  },
  dynamic: {
    title: "Millour et al. — Static and dynamic knee measurement (2019)",
    url: "https://pubmed.ncbi.nlm.nih.gov/32022807/",
    limit:
      "Small cycling study; measurement conventions matter. A pose model is not the laboratory measurement system.",
  },
  bini: {
    title:
      "Bini et al. — Saddle height, knee injury risk and performance (2011)",
    url: "https://pubmed.ncbi.nlm.nih.gov/21615188/",
    limit:
      "Review suggesting 25–30° static knee flexion with the pedal at the bottom. Evidence is conflicting, samples are small, and static and dynamic measurements differ.",
  },
  review: {
    title: "Husband et al. — Cycling position review (2024)",
    url: "https://pubmed.ncbi.nlm.nih.gov/39285616/",
    limit:
      "Evidence differs by position variable and population. No universal ideal posture.",
  },
  product: {
    title: "Cadence decision policy",
    url: "#policy",
    limit:
      "Conservative product heuristic, not a validated clinical threshold. Confidence and repeatability need real-rider validation.",
  },
};
