# Execution ledger — plan: docs/superpowers/plans/2026-11-10-bike-fit.md

Ruling: New separate repository on feat/local-fit, no linked worktree needed — there is no existing bike-fit checkout to protect.
Ruling: Use frontend-design guidance for the functional workspace, no generated design concept — the approved design is behavioral, and the user delegated implementation decisions.
Ruling: Use native Windows commands and this durable ledger instead of POSIX task scripts — preserves the task/test record on this host.
Pre-flight: Tasks 1/4 share Intake/Recommendation; tasks 2/3/4 share ClipAnalysis; tasks 5/6 share Session/FitEvent. Define contracts together; preserve source, rule and model versions in exported sessions.
Pre-flight: plan puts application scaffolding late; create minimal test/runtime configuration with Task 1 so verification can run.
Status: implementation underway. Real-rider reference validation is unavailable until consented recordings and reference assessments exist.

Task 1: complete — assessment tests observed failing then passing (7 tests).
Task 2: geometry and rejection tests observed failing then passing; runtime/model downloaded locally with SHA256 recorded in public/models/manifest.json. Browser inference verification pending.
Tasks 3–6: domain tests observed failing then passing; 32 tests green. UI implemented; rendered workflow verification underway.
Ruling: use broad 25–45 degree review band for maximum-extension knee flexion, explicitly labeled product heuristic; no exact millimeter prescription — laboratory reference methods do not establish our model's error bounds.
Ruling: automatic hardware direction initially restricted to saddle height for road/mountain knee discomfort — unsupported issues produce assessment/information rather than made-up prescriptions. Costs broader automation until validated rules are added.
Build failure resolved: Array.findLast exceeded ES2022 library target; equivalent reverse/find preserves supported runtime target.
Dependency audit: initial pins had advisories; updated Vite/Vitest/Zod to registry patched versions, current audit reports zero vulnerabilities.

## 2026-11-10 — competitive upgrade (rules 0.2.0)
Ruling: Jordan asked to put Cadence at the front of the pack; target riders with a free, private, installable app.
Measurement: 30 Hz sampling, landmark spike filter, per-cycle parabola extremes; new ankle, elbow, shoulder, knee-over-pedal, leg-ratio metrics with cycle spread and confidence; side-label check. Synthetic kinematic tests added (mean knee error 1.05° → 0.25°).
Recommendations: saddle height for all disciplines with mm estimate when saddle height is known; reach/drop; knee tracking; one reviewed side view is enough; experiments ranked one at a time. Safety screening unchanged and still runs first.
App: installable offline web app (manifest + service worker), webcam framing guide, per-view recording hints.
Validation: docs/validation.md and scripts/validate.mjs (Bland–Altman vs reference measurements). Real-rider validation still not done.
CI: .github/workflows/ci.yml (tests, types, build) for when the repo is on GitHub.
