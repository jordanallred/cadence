# Day-90 decision gate (proposed)

**Status: proposal. Jordan sets the final numbers before recruiting starts, and they don't change once the pilot begins.** Fixing them first keeps the result honest: no moving the bar after seeing the data.

The question at day 90 is whether "private bike fit tracking: see your position, change one thing, learn whether it helped" is a promise riders want and Cadence can keep. If the signals are weak, change the positioning before building more.

## Proposed thresholds

Percentages are of riders who completed the baseline visit.

| # | Signal | Proposed pass | Source |
|---|---|---|---|
| 1 | Riders who complete at least one full cycle (baseline, one change, at least one ride with it, a new recording or a symptom re-rating on that ride, keep or revert) | **≥ 60%** | Pilot log `loop.cyclesComplete ≥ 1` |
| 2 | Riders who complete two or more cycles | **≥ 30%** | Pilot log `loop.cyclesComplete ≥ 2` |
| 3 | Riders who say they will keep using it | **≥ 50%** answer yes | Interview Q11 |
| 4 | Recommend score (NPS: % 9–10 minus % 0–6) | **≥ 0** | Interview Q12 |
| 5 | Fitters who have referred a rider or say yes to paying for the review workflow | **≥ 2 of 5** | Fitter interview Q5–Q6 |
| 6 | First-visit capture: riders with an accepted side view within three attempts | **≥ 80%** | Pilot logs + capture log |
| 7 | Measurement: `knee-min` against `goniometer-dynamic` (or `knee-bdc` against `goniometer-static` if dynamic readings weren't possible) | Meets the `npm run validate` target (\|bias\| ≤ 2°, MAE ≤ 3°, limits of agreement within ±6°, ≥ 10 pairs), **or** the measured error is published with the app copy changed to match | `npm run validate` |
| 8 | Safety: bike advice given for an area marked with a warning sign, or harm linked to a suggested change | **Zero** | Protocol section 8 |

## Reading the result

- **All pass:** the promise holds. Next: fitter handoff and the repeat loop at larger scale; publish the results.
- **1–2 fail, 3–5 pass:** people want it but the loop is too hard. Fix capture and the return journey before anything else, then re-test with a smaller group.
- **3–5 fail:** the promise isn't landing, whatever the loop numbers. Change the positioning before investing further.
- **6 or 7 fail:** the measurement can't carry the advice yet. Publish the error, soften the app's language about angles, and work on capture before growth.
- **8 fails:** stop and fix before any other work. Not a judgment call.

Signal 7 is never a reason to claim accuracy beyond what was measured: the result applies to the riders, bikes, cameras and method in this pilot.
