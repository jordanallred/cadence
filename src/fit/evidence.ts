export const RULE_VERSION = "0.3.0";
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
  holliday: {
    title:
      "Holliday & Swart — Anthropometrics, flexibility and bicycle configuration (2021)",
    url: "https://pubmed.ncbi.nlm.nih.gov/35782160/",
    limit:
      "Measured trained road cyclists: setback 10.3 ± 2.3% and drop 13.0 ± 3.6% of saddle height. Describes what riders use, not what is best, and leg length or flexibility did not predict setback. Not applied to mountain or stationary bikes.",
  },
  "bar-width": {
    title: "Lin et al. — Handlebar width and shoulder width (2025)",
    url: "https://pubmed.ncbi.nlm.nih.gov/39846669/",
    limit:
      "Ten women at low power on an ergometer. A bar matching shoulder width lowered arm and back muscle activity against 2 cm narrower or wider. Comfort and handling were not tested.",
  },
  "cleat-midfoot": {
    title: "Paton — Shoe cleat position and performance (2009)",
    url: "https://pubmed.ncbi.nlm.nih.gov/20029102/",
    limit:
      "Ten competitive cyclists; a midfoot cleat made no substantial difference to physiology or time-trial power. Short-term study.",
  },
  "cleat-15": {
    title: "Cleat 15 mm forward or back of the ball of the foot (2016)",
    url: "https://lida.sport-iat.de/bdr/Record/4046604?lng=en",
    limit:
      "Twelve cyclists, conference abstract. ±15 mm changed hip and ankle motion but not efficiency or sprint power. Comfort and injury were not studied.",
  },
  anthropometry: {
    title:
      "Winter — Biomechanics and Motor Control of Human Movement, 4th ed. (2009): segment lengths",
    url: "https://doi.org/10.1002/9780470549148",
    limit:
      "Average proportions (Drillis & Contini). Your own segments can differ by several per cent, which carries into every length estimate scaled from height.",
  },
  kops: {
    title: "Knee over pedal spindle: a starting point, not validated",
    url: "https://pubmed.ncbi.nlm.nih.gov/35782160/",
    limit:
      "Holliday & Swart note the plumb-line rule has not been validated and no data support a role in preventing knee injury. Shown for information only.",
  },
  product: {
    title: "Cadence decision policy",
    url: "#policy",
    limit:
      "Conservative product heuristic, not a validated clinical threshold. Confidence and repeatability need real-rider validation.",
  },
};
