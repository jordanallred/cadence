# Evidence register — reviewed 2026-11-10

The application is an experimental aid. No independent clinical or expert-equivalence validation has been performed.

| Source | What is used | Limits |
|---|---|---|
| https://www.nhs.uk/conditions/back-pain/ | Emergency and urgent back symptom groups; ongoing symptoms merit assessment | General clinical guidance, not diagnosis or exhaustive screening. Local emergency services wording replaces UK-specific numbers. |
| https://www.nhs.uk/symptoms/knee-pain/ | Urgent knee symptom groups; persistent symptoms merit assessment | General guidance. No condition is diagnosed from the user's selection. |
| https://pubmed.ncbi.nlm.nih.gov/32022807/ | Published abstract distinguishes static, bottom-dead-center and maximum-extension knee measurements | 26 cyclists. Cites 30–40° maximum-extension dynamic convention; this app uses cycle minimum flexion estimates, not crank-position calibration. Not a validated MediaPipe threshold. |
| https://pubmed.ncbi.nlm.nih.gov/21615188/ | Review suggesting 25–30° static knee flexion with the pedal at bottom dead centre | Conflicting evidence, small samples, mostly less-expert riders. Static and dynamic measurements differ; the app uses the dynamic 30–40° band. |
| https://pubmed.ncbi.nlm.nih.gov/39285616/ | Published review abstract supports caution about universal positional prescriptions | Limited study quality and population coverage; no blanket crank/cleat/handlebar recommendation. |

Product heuristics: visibility >= .65 in >=80% of frames; at least 3 complete cycles; 30 Hz sampling; >350 ms tracking-gap rejection; cadence period 400–2500 ms and ratio <=1.6; ankle excursion >=2.5% image height. These are engineering defaults, not published clinical cutoffs.

Saddle height (rules 0.2.0): dynamic knee flexion at maximum extension of 30–40° is treated as typical; 25–45° is the outer band. Outside 30–40° with symptoms, or outside 25–45° without, the app proposes a saddle-height experiment toward 32° or 38°. With a known saddle height it estimates millimetres from a two-link leg model (hip-to-pedal distance approximated as saddle height plus crank length), shows ±30%, and asks for steps of 5 mm with re-recording beyond 10 mm. Bilateral side-view disagreement >8° blocks the experiment. One reviewed side view is enough; front and rear views add knee tracking and pelvic stability.

Reach and drop (product heuristics from common fitting practice, not research thresholds): shoulder angle >100° or elbow flexion <10° suggests long reach; shoulder angle <70° suggests a short cockpit; torso below 30° (road), 35° (gravel, stationary) or 40° (mountain) is treated as low when hands, neck or back symptoms are present. Reach experiments always rank after saddle height. Front/rear knee lateral excursion >20% hip width and >1.5× the other knee prompts an equipment/cleat check, never a cleat prescription.

Measurement method: landmarks are spike-filtered (3-frame median) and lightly averaged; joint-angle extremes use a 5-point least-squares parabola per cycle. On an exact synthetic pedaling model this recovers knee extension with a mean error of 0.25° (previous method: 1.05°). Synthetic accuracy does not establish real-rider accuracy; see docs/validation.md.

Severity >=7, reported restrictions with discomfort, off-bike/persistent symptoms, any worsened ride, or two distinct unhelpful experiments stop automated fitting and prompt assessment. These conservative product policies are not evidence that a disease is present. Urgency is elevated only for the sourced symptom groups.

The engine cannot measure pressure, forces, tissue tolerance, true 3D joint rotation, structural leg-length differences or medical cause. Front/rear projected excursions are descriptive. A blank or low-quality recording yields no measurement-based prescription. Comfortable riders are not forced to match normative angles.

Real-world evaluation needed: consented cycling clips in all views; varied lighting, clothing, frame rates, body proportions and disabilities; manual expert reference landmarks; repeated recordings; measurement errors and failure rates; blinded comparison of supported actions and referrals. Unit tests prove software behavior, not clinical accuracy or market superiority.
