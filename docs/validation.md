# Real-rider validation protocol

Cadence's measurement pipeline is checked against an exact synthetic pedaling
model (`tests/kinematics.test.ts`): knee extension is recovered to within
about 0.25° on average, and within 1.5° with landmark jitter. That proves the
geometry and cycle logic. It does **not** prove the pose model finds joints
accurately on real riders. This protocol measures that.

## What to collect

For each rider (aim for at least 10, varied in height, clothing and bike type):

1. Mark the greater trochanter (hip), lateral knee joint line and lateral
   malleolus (ankle) with small high-contrast stickers, if you want a
   marker-based reference.
2. Record a side view with Cadence's guidance: 10–20 s of steady pedaling,
   camera 2–3 m away, lens level with the bottom bracket.
3. Take the reference measurement for the same pedaling bout:
   - **Best:** a marker-based motion capture system or a fitter's 3D system.
   - **Good:** knee angle at full extension with a long-arm goniometer while
     the rider pedals slowly, repeated three times and averaged.
   - **Acceptable:** two people independently clicking the marker centres on
     5 bottom-of-stroke frames and averaging the computed angle.
4. Keep the original file name. Analyze the clip in Cadence, review the
   overlay, then export a backup.

## Comparing

Add one row per measurement to a CSV (see
`validation/references.example.csv`):

```
clip,view,metric,reference
rider01-left.mp4,left,knee-min,34
```

Then run:

```
npm run validate -- validation/references.csv path/to/backup1.json path/to/backup2.json
```

The script prints bias, mean absolute error and 95% limits of agreement for
each metric, and exits non-zero if any metric misses the targets:
|bias| ≤ 2°, MAE ≤ 3°, limits of agreement within ±6°, at least 10 pairs.

## Publishing results

Record the results in `docs/evidence.md` with the date, rider count and
reference method. Until then, the app and README must keep saying accuracy on
real riders has not been validated.
