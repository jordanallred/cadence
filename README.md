# Cadence

**Private bike fit tracking: see your position, change one thing, learn whether it helped.**

Record a baseline video of yourself pedaling, make one measured change to your bike, ride with it, record again, and keep or revert the change. Cadence keeps the whole history: every video's measurements, every change in millimetres, and how each ride felt. Analysis runs on your own computer. Nothing is uploaded and there is no account.

It is free and open source. It is not a replacement for a professional fitter or a clinician, and its accuracy on real riders has not been measured yet (see [What has and hasn't been tested](#what-has-and-hasnt-been-tested)).

## Download

Get the latest build for Windows, macOS or Linux from the Releases page. Unzip, run `cadence`, and it opens in your browser. See [docs/download.md](docs/download.md). No install, account or Node.js needed. Scan the QR code on the Recordings page to send videos straight from your phone over Wi-Fi.

## Build from source

Install Node.js 22.12+ (Node 24 recommended). From this folder:

```powershell
npm ci
npm run prepare:models
npm run dev
```

Open http://127.0.0.1:5173 . The model downloads from Google's official storage during setup. Videos are processed locally; there is no account or paid inference service. Once dependencies and models are present, local operation needs no internet. Fonts are bundled locally.

After `npm run build`, the app can be installed from the browser (Install app in Chrome or Edge) and works offline once the model has loaded once. Hosting the `dist` folder on any static host gives the same app at a URL; analysis still runs entirely in the visitor's browser. Nothing has been published.

To build the single-file launcher yourself (needs Go 1.22+): `npm run build` then `npm run build:desktop` (add `-- --all` for every platform). Output is in `release/`. Publishing a release: push a tag such as `v0.2.0`; `.github/workflows/release.yml` builds and attaches every download.

Use `Start-Cadence.ps1` for a guided local launch. Stop the terminal with Ctrl+C when done. Run `npm test` and `npm run build` to verify; `npm run preview` serves the build. In the development server, keep the same hostname and port to see the same browser storage; the desktop launcher also saves fit history to disk.

After `npm run build:desktop`, run `npm run e2e` to analyze real pedaling videos (`tests/e2e/videos/`) in a real browser against the built launcher. Set `CADENCE_BIN` to test a downloaded release instead. CI and the release workflow run it too, so a release cannot ship if the pose engine fails to load.

## Workflow

1. Fill in the profile, symptom check and known baseline settings. Unknown measurements stay blank.
2. Record a side view first (the on-screen framing guide helps with webcam capture), then front and rear. Import original video from any camera. Choose an 8–30 second segment of steady pedaling.
3. Review overlays throughout each recording. Correct an isolated joint or re-record widespread tracking problems. Corrections retain original landmarks.
4. Read the ranked report: saddle height first (with a millimetre estimate when your saddle height is in your profile), then reach and drop, then knee tracking. The engine may also advise no change, more information or professional assessment.
5. Log one measured change, re-record and add ride feedback. Keep an improvement or revert; the baseline and event history remain intact.
6. Back up one fit or all fits as JSON, or every fit with its kept videos as a .zip, or print the report. Keeping a video is optional; the desktop app saves kept videos in its `Cadence/videos` folder (the dev server keeps them in the browser). Keep your originals separately too.

## What has and hasn't been tested

**Tested:**

- The geometry and pedal-cycle logic, against an exact synthetic pedaling model: mean knee-angle error 0.25°, within 1.5° with simulated landmark jitter (`tests/kinematics.test.ts`). This shows the maths is right. It says nothing about how well the pose model finds joints on a real rider.
- End to end on real pedaling footage (`npm run e2e`, `tests/e2e/videos/`): the pose engine loads, tracks the rider, finds the pedal stroke and produces a report. This checks that it works, not that its numbers are correct.

**Not yet tested:**

- Measurement accuracy on real riders against a goniometer or a fitter's system. [docs/pilot/](docs/pilot/README.md) is the plan for a pilot with riders and independent fitters that will measure it and publish the error, failed captures and the cases where Cadence says there is not enough evidence. Until those results are in [docs/evidence.md](docs/evidence.md), no real-world accuracy claim should be made.
- Whether following the advice reduces pain or discomfort.

The "rule strength" shown on each recommendation describes how well the published evidence and the quality of your recording support that rule. It is not a measured accuracy.

## Honest boundaries

This is an experimental application, not an expert-validated or medically validated fitter. Saddle-height advice uses a published dynamic knee-angle range; reach, drop and knee-tracking advice uses labelled product heuristics from common fitting practice. See docs/evidence.md.

Video format support depends on the browser. H.264 MP4 and WebM are the main paths; HEVC varies. Use HandBrake locally to make a compatible copy when necessary. Measurements are projected 2D estimates. Separate clips are not simultaneous 3D capture.

Browser storage may be cleared or run out of space. Save backups. Records contain personal and symptom information; share exports only intentionally. There is no network upload feature.

## Source layout

`src/analysis`: pose worker and geometry; `src/video`: decoding/sampling; `src/fit`: versioned context/recommendation/history logic; `src/storage`: validated backups, IndexedDB and the desktop app's disk store; `src/features`: complete UI workflow. The evidence register labels product heuristics separately from research.

Original application code is MIT licensed. Dependencies retain their licenses. Model weights are never included in Git or release downloads: the source setup and the launcher both fetch them from Google's MediaPipe storage and verify the SHA-256. No public hosting or publication has been performed.
