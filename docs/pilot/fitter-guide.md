# Fitter measurement guide

For the independent fitters in the Cadence pilot. Thank you for taking part. We are testing whether Cadence's video angles agree with a careful hand measurement, so your readings are the reference. Please measure exactly as below, even where your usual practice differs, and write down anything unusual.

You will need: a long-arm goniometer (arms 30 cm or longer), a digital inclinometer or a phone level app, round high-contrast stickers about 15 mm across, a turbo trainer, and a phone or camera on a tripod.

## Before the rider arrives

- Get the rider's participant code from the pilot lead (for example `P07`). You never need their name for pilot paperwork.
- Bike on the trainer, front wheel level with the rear (check with the inclinometer on the top tube or a level reference).
- Plain wall behind the rider if possible. Even light, no strong window behind.

## Camera set-up (the same as Cadence asks every rider)

- Side view first, from the drive side or the side the rider chooses. Note which side (`left` = the rider's left side faces the camera).
- Camera 2–3 m away, lens at bottom-bracket height, square to the bike. The whole rider and both wheels in frame.
- 30 fps or faster. Landscape.
- Front and rear views are optional for this pilot. They are not compared with goniometer readings.

## Markers

Put a sticker on the side facing the camera at:

| Landmark | Where |
|---|---|
| Hip | Greater trochanter (feel it while the rider lifts the knee) |
| Knee | Lateral femoral epicondyle |
| Ankle | Lateral malleolus |
| Shoulder | Acromion (lateral tip) |
| Elbow | Lateral epicondyle of the humerus |
| Wrist | Ulnar styloid |

Cadence does not use the stickers. They give your readings and the video the same anatomical points, and let us check afterwards if a value looks wrong.

## Recording

1. Rider warms up for 5 minutes at their usual effort.
2. Start recording. The rider pedals seated, hands on the hoods (or grips), at their usual cadence and a steady, moderate effort, for 20–30 seconds. Don't talk to them about position during the bout.
3. Take the dynamic readings below during this same bout, while the camera is running.
4. Stop. Rename the file `<code>-v<visit>-<side>.mp4`, for example `P07-v1-left.mp4`, and give it to the rider to import into Cadence. Let the rider do the import and review on their own. Note in the capture log anything the app rejects or any point where the rider got stuck.

## The readings

Record each value in degrees, to the nearest degree, as the **average of three readings**. All knee and elbow values are **flexion**: 0° means straight, bigger means more bent. If your goniometer reads the inside angle, subtract it from 180.

| Metric id | What to measure | How |
|---|---|---|
| `knee-min` | Knee flexion at the most extended point of the stroke, **while pedaling** | Goniometer axis on the knee sticker, fixed arm toward the hip sticker, moving arm toward the ankle sticker. Read at the leg's straightest point. If you cannot read it dynamically, leave it blank and use `knee-bdc` below instead. |
| `knee-bdc` | Knee flexion with the crank at the bottom (6 o'clock, in line with the seat tube), **static** | Rider stops pedaling, crank at bottom, weight on the saddle, foot as when pedaling. Same goniometer placement. This is the classic static reading. |
| `knee-max` | Knee flexion at the top of the stroke (12 o'clock), **static** | Crank at top, rider relaxed. Same placement. |
| `torso` | Angle between the hip-to-shoulder line and horizontal, while pedaling | Inclinometer held along the line from the hip sticker to the shoulder sticker, or a goniometer with one arm held level. 0° = flat back, 90° = upright. |
| `elbow` | Elbow flexion, while pedaling, hands in their usual place | Axis on the elbow sticker, arms toward the shoulder and wrist stickers. |

Static and dynamic readings of the same joint usually differ by several degrees, so every row says which method was used, and they are analysed separately.

## Writing it down

One row per reading in [references.csv](references.csv). Keep commas out of the notes.

```
clip,view,metric,reference,participant,fitter,visit,method,notes
P07-v1-left.mp4,left,knee-min,36,P07,F2,1,goniometer-dynamic,
P07-v1-left.mp4,left,knee-bdc,31,P07,F2,1,goniometer-static,crank at 6 o'clock
```

- `clip` is exactly the file name you gave the video. `view` is `left` or `right`.
- `method` is one of `goniometer-dynamic`, `goniometer-static`, `inclinometer`, or `fitter-system` (your 3D or marker system, if you have one; say which in notes).
- If a reading was impossible, leave `reference` empty and say why in notes.

Then add a row to [capture-log.csv](capture-log.csv) for **every** time the app rejected a clip, failed to analyse it, or answered with "review the overlays", "start with a side view", "check the difference between side views" or another not-enough-evidence message. Say whether you agreed with it: was the clip genuinely not good enough, or should the app have managed?

## What not to do

- Don't adjust the bike during the measurement bout.
- Don't coach the rider through Cadence. If they are stuck, note where and help only after writing it down.
- Don't look at Cadence's numbers before writing your own.
