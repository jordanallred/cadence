# Test videos

Real pedaling footage for `npm run e2e`.

- `side-trainer.mp4`: a rider pedaling steadily on a smart trainer, filmed
  from the left side (15 s, 360×254, 15 fps). Cropped from `test_video.mp4`
  in [datarootsio/bikefitting](https://github.com/datarootsio/bikefitting)
  (commit cd4048e, MIT License, Copyright (c) 2021 dataroots) to remove a
  life-size cardboard cutout of a person standing behind the bike.
  Reference cadence 69 rpm, counted from the raw frames independently of
  the pose model.
- `side-trainer-late-start.mp4`: the same clip with its first frame held
  for 6 s, standing in for a rider who waits before pedaling.

Add more riders here (side, front and rear views, different bikes and
lighting), each with independently measured reference values.
