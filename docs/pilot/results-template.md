# Cadence real-rider pilot: results

> Template. Copy to a dated file, fill in every section, and publish it in `docs/evidence.md` whatever the outcome. Report failures, missing data and "not enough evidence" answers with the same care as successes. No names anywhere; codes only where needed.

**Dates:** [start] to [end]
**App versions used:** [from pilot logs `app.version`] · **Rules:** [`app.rules`] · **Pose model:** [`app.poseModel`]
**Riders:** [n recruited] recruited, [n] completed the baseline visit, [n] sent a pilot log, [n] interviewed, [n] withdrew ([reasons, if given]).
**Fitters:** [n], [years of experience range], reference methods used: [list].
**Spread:** height [range] cm; [n] road, [n] gravel, [n] mountain, [n] trainer only; [n] with discomfort at the start.

## 1. Gate result

| # | Signal | Threshold set before the pilot | Result | Pass? |
|---|---|---|---|---|
| 1 | ≥ 1 complete cycle | | [n]/[N] ([%]) | |
| 2 | ≥ 2 complete cycles | | | |
| 3 | Will keep using | | | |
| 4 | Recommend score (NPS) | | | |
| 5 | Fitters referring or would pay | | | |
| 6 | First-visit capture success | | | |
| 7 | Measurement | | | |
| 8 | Safety | | | |

**Decision:** [what we will do next, and why]

## 2. The loop

Where riders stopped (each rider counted once, at the furthest step reached):

| Furthest step | Riders |
|---|---|
| No accepted baseline | |
| Baseline, no change logged | |
| Change, no ride logged | |
| Ride, no re-record or re-rating | |
| Re-recorded or re-rated, no keep/revert | |
| At least one complete cycle | |

Median hours from baseline to first keep-or-revert: [ ] (range [ ]).
Settings changed: [setting: count].
What riders said stopped them: [themes, with counts].

## 3. Measurement agreement

Paste the `npm run validate` output for each reference method.

```
[goniometer-dynamic]
[goniometer-static]
[inclinometer]
```

| Metric | Method | n | Bias | MAE | 95% limits of agreement | Meets target? |
|---|---|---|---|---|---|---|
| | | | | | | |

Clips excluded from comparison and why: [ ].
Limits of this comparison: [e.g. goniometer error itself is about ±[ ]°; static vs dynamic; camera types; number of fitters].

## 4. Failed captures

| Reason code | Attempts | Riders affected | Usually fixed on the next try? |
|---|---|---|---|
| | | | |

Analyses that failed outright (`analysis-error`): [n], [what we know].
Accepted / rejected / failed by view: [ ].

## 5. "Not enough evidence" answers

| Answer | Times shown | Fitter agreed | Fitter disagreed |
|---|---|---|---|
| Review the tracking overlays | | | |
| Start with a side view | | | |
| Check the difference between side views | | | |
| Recording rejected | | | |

Cases where Cadence should have said "not enough evidence" and didn't: [ ].

## 6. What riders and fitters said

Tally: keep using yes [ ] / maybe [ ] / no [ ]; NPS [ ] (promoters [ ], passives [ ], detractors [ ]); fitters would refer [ ] / would pay [ ] / price mentioned [ ].
Themes, with counts and quotes from riders who agreed to be quoted (code only): [ ].

## 7. Symptoms (descriptive only)

Start and day-90 ratings by area. **This pilot has no control group and cannot show that Cadence reduced pain.** [table]

## 8. Safety

[Every safety event, or "None reported."]

## 9. What changes because of this

[App changes, copy changes, what the README and app may now say about accuracy, and what they still must not say.]
