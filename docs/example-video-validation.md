# Example-video optimization

The user-provided MOV was tested locally in the browser. Its footage and extracted landmarks are excluded from source control.

The browser decoded a 21.4-second, 320 × 568 portrait recording and auto-selected 0–20 seconds. Actual pose inference completed on 600 samples, yielding 21 complete pedal cycles. The overlays and manual correction/recalculation path were inspected in the rendered app; temporary corrections were restored to original landmarks afterward.

Changes:
- Refine ankle peak timestamps between samples to reduce quantized cadence estimates.
- Explain low-resolution limitations without discarding usable motion.

Reprocessing the same landmarks changed cadence from 66.7 to 66.8 rpm, preserved all 21 cycles and preserved the knee-extension result. This is a numerical refinement, not evidence that 66.8 rpm is a measured ground truth. No thresholds were tuned to force this recording to pass.

Regression tests cover exact known peak locations with nonuniform timestamps, safe fallbacks, multiple synthetic cadences and resolution warnings. A separate ignored local test checked the supplied recording's landmarks. Independent code review found no actionable issues. Real-rider reference angles and independently counted cadence are still needed to quantify accuracy.
