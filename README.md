# Cadence

A free, local bike-fitting workspace: rider context, side/front/rear video analysis, overlay review and corrections, evidence-linked reports, adjustment history, and ride feedback.

## Run on your PC

Install Node.js 22.12+ (Node 24 recommended). From this folder:

```powershell
npm ci
npm run prepare:models
npm run dev
```

Open http://127.0.0.1:5173 . The model downloads from Google's official storage during setup. Videos are processed locally; there is no account or paid inference service. Once dependencies and models are present, local operation needs no internet. Fonts are bundled locally.

Use `Start-Cadence.ps1` for a guided local launch. Stop the terminal with Ctrl+C when done. Run `npm test` and `npm run build` to verify; `npm run preview` serves the build. Keep the same hostname and port to access the same browser storage.

## Workflow

1. Fill in the profile, symptom check and known baseline settings. Unknown measurements stay blank.
2. Import original video from any camera or use a connected webcam. Choose an 8–30 second segment of steady pedaling. Record one side plus front and rear without changing the setup between views.
3. Review overlays throughout each recording. Correct an isolated joint or re-record widespread tracking problems. Corrections retain original landmarks.
4. Read observations, alternatives, evidence and recommended next steps. The engine may advise no change, more information or professional assessment.
5. Log one measured change, re-record and add ride feedback. Keep an improvement or revert; the baseline and event history remain intact.
6. Export a JSON backup or print the report. Original videos are not in JSON backups. Retention in browser storage is optional; retain originals separately.

## Honest boundaries

This is an experimental application, not an expert-validated or medically validated fitter. Automatic hardware experiments currently cover saddle-height direction for knee discomfort in road/mountain cycling. Other concerns receive a supported next step, not an invented prescription. The full user workflow exists, but comprehensive expert-level recommendation coverage and actual rider accuracy remain research work. See docs/evidence.md and docs/verification.md.

Video format support depends on the browser. H.264 MP4 and WebM are the main paths; HEVC varies. Use HandBrake locally to make a compatible copy when necessary. Measurements are projected 2D estimates. Separate clips are not simultaneous 3D capture.

Browser storage may be cleared or run out of space. Save backups. Records contain personal and symptom information; share exports only intentionally. There is no network upload feature.

## Source layout

`src/analysis`: pose worker and geometry; `src/video`: decoding/sampling; `src/fit`: versioned context/recommendation/history logic; `src/storage`: validated backups and IndexedDB; `src/features`: complete UI workflow. The evidence register labels product heuristics separately from research.

Original application code is MIT licensed. Dependencies retain their licenses. Model weights are fetched separately and excluded from Git; verify their redistribution terms before public distribution. No public hosting or publication has been performed.
