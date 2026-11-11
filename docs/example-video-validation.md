# Example-video optimization

The user-provided MOV was tested locally in the browser. Its footage and extracted landmarks are excluded from source control.

The browser decoded a 21.4-second, 320 × 568 portrait recording and auto-selected 0–20 seconds. Actual pose inference completed on 600 samples, yielding 21 complete pedal cycles. The overlays and manual correction/recalculation path were inspected in the rendered app; temporary corrections were restored to original landmarks afterward.

Changes:
- Refine ankle peak timestamps between samples to reduce quantized cadence estimates.
- Explain low-resolution limitations without discarding usable motion.

Reprocessing the same landmarks changed cadence from 66.7 to 66.8 rpm, preserved all 21 cycles and preserved the knee-extension result. This is a numerical refinement, not evidence that 66.8 rpm is a measured ground truth. No thresholds were tuned to force this recording to pass.

Regression tests cover exact known peak locations with nonuniform timestamps, safe fallbacks, multiple synthetic cadences and resolution warnings. A separate ignored local test checked the supplied recording's landmarks. Independent code review found no actionable issues. Real-rider reference angles and independently counted cadence are still needed to quantify accuracy.

## Original-resolution comparison

The user subsequently supplied the original 1080 × 1920 MP4. Both versions decode locally and auto-select 0–20 seconds, yielding 600 pose samples and 21 complete cycles. With the same updated timing method:

| Metric | Compressed | Original |
|---|---:|---:|
| Cadence (rpm) | 66.8 | 67.6 |
| Knee flexion near extension (degrees) | 28.3 | 29.8 |
| Knee flexion near bottom of stroke (degrees) | 33.4 | 32.9 |
| Torso to horizontal (degrees) | 54.4 | 54.5 |

Visual spot checks at 0, 0.5 and approximately 10 seconds showed plausible major-limb following, but heel/toe landmarks sometimes extended outside the visible shoe. Loose clothing obscures precise anatomical hip/knee centres. These are qualitative observations, not independently annotated reference measurements. In particular, foot-based angles and knee-to-foot offsets must not be treated as validated on this example. Higher resolution did not eliminate those errors.

The real-pose-model accuracy gate remains unmet: obtain independent anatomical annotations or marker-based reference measurements and evaluate error across riders and views. Resolution agreement and synthetic geometry tests cannot substitute for that gate. No reference labels were fabricated for this recording.
