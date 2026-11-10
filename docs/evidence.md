# Evidence register — reviewed 2026-11-10

The application is an experimental aid. No independent clinical or expert-equivalence validation has been performed.

| Source | What is used | Limits |
|---|---|---|
| https://www.nhs.uk/conditions/back-pain/ | Emergency and urgent back symptom groups; ongoing symptoms merit assessment | General clinical guidance, not diagnosis or exhaustive screening. Local emergency services wording replaces UK-specific numbers. |
| https://www.nhs.uk/symptoms/knee-pain/ | Urgent knee symptom groups; persistent symptoms merit assessment | General guidance. No condition is diagnosed from the user's selection. |
| https://pubmed.ncbi.nlm.nih.gov/32022807/ | Published abstract distinguishes static, bottom-dead-center and maximum-extension knee measurements | 26 cyclists. Cites 30–40° maximum-extension dynamic convention; this app uses cycle minimum flexion estimates, not crank-position calibration. Not a validated MediaPipe threshold. |
| https://pubmed.ncbi.nlm.nih.gov/39285616/ | Published review abstract supports caution about universal positional prescriptions | Limited study quality and population coverage; no blanket crank/cleat/handlebar recommendation. |

Product heuristics: visibility >= .65 in >=80% of frames; at least 3 complete cycles; 10 Hz sampling; >350 ms tracking-gap rejection; cadence period 400–2500 ms and ratio <=1.6; ankle excursion >=2.5% image height. These are engineering defaults, not published clinical cutoffs. Bilateral side-view disagreement >8° requires more information. A broad 25–45° maximum-extension review band can suggest saddle-height direction for knee discomfort in road/mountain context only, after all views are reviewed and mechanical limits confirmed. No automatic exact millimeter adjustment. Evidence for other disciplines is not silently transferred.

Severity >=7, reported restrictions with discomfort, off-bike/persistent symptoms, any worsened ride, or two distinct unhelpful experiments stop automated fitting and prompt assessment. These conservative product policies are not evidence that a disease is present. Urgency is elevated only for the sourced symptom groups.

The engine cannot measure pressure, forces, tissue tolerance, true 3D joint rotation, structural leg-length differences or medical cause. Front/rear projected excursions are descriptive. A blank or low-quality recording yields no measurement-based prescription. Comfortable riders are not forced to match normative angles.

Real-world evaluation needed: consented cycling clips in all views; varied lighting, clothing, frame rates, body proportions and disabilities; manual expert reference landmarks; repeated recordings; measurement errors and failure rates; blinded comparison of supported actions and referrals. Unit tests prove software behavior, not clinical accuracy or market superiority.
