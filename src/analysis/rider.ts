import type { Point, PoseFrame } from "../domain/types";
import { quantile } from "./geometry";

/** One analysed video frame with every pose the model found in it. */
export interface RawFrame {
  timeMs: number;
  poses: Point[][];
}

interface Track {
  frames: Map<number, number>; // frame index -> pose index
  center: { x: number; y: number };
  lastMs: number;
  sizes: number[];
  ankles: number[];
  centers: { x: number; y: number }[];
}

const BODY = [11, 12, 23, 24, 25, 26];

function describe(pose: Point[]) {
  const seen = pose.filter((p) => p.visibility >= 0.5);
  const pts = seen.length >= 3 ? seen : pose;
  const body = BODY.map((j) => pose[j]).filter(
    (p): p is Point => !!p && p.visibility >= 0.5,
  );
  const mid = body.length ? body : pts;
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  return {
    center: {
      x: mid.reduce((a, p) => a + p.x, 0) / Math.max(mid.length, 1),
      y: mid.reduce((a, p) => a + p.y, 0) / Math.max(mid.length, 1),
    },
    size: Math.hypot(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    ),
    ankle: Math.max(pose[27]?.y ?? NaN, pose[28]?.y ?? NaN),
  };
}

/**
 * Keep only the rider in every frame. Homes have posters, TVs, mirrors and
 * people walking past, so a second pose must not fail the clip.
 *
 * Poses are linked frame to frame into tracks by position. The rider's
 * track is the one seen longest, largest, and with the most ankle motion:
 * a poster or cut-out does not pedal and someone walking past is only in a
 * few frames. Tracks that continue the rider's after a dropout (same place,
 * no overlap in time) are kept too. Frames without the rider get no points,
 * so later checks treat them as missing.
 */
export function selectRider(raw: RawFrame[]): PoseFrame[] {
  const tracks: Track[] = [];
  const open: Track[] = [];
  raw.forEach((frame, index) => {
    const info = frame.poses.map(describe);
    const pairs: { t: Track; p: number; d: number }[] = [];
    for (const t of open) {
      if (frame.timeMs - t.lastMs > 1500) continue;
      info.forEach((pi, p) => {
        const d = Math.hypot(
          pi.center.x - t.center.x,
          pi.center.y - t.center.y,
        );
        if (d < Math.max(0.08, 0.5 * pi.size)) pairs.push({ t, p, d });
      });
    }
    pairs.sort((a, b) => a.d - b.d);
    const usedTrack = new Set<Track>(),
      usedPose = new Set<number>();
    const add = (t: Track, p: number) => {
      t.frames.set(index, p);
      t.center = info[p].center;
      t.lastMs = frame.timeMs;
      t.sizes.push(info[p].size);
      t.ankles.push(info[p].ankle);
      t.centers.push(info[p].center);
      usedTrack.add(t);
      usedPose.add(p);
    };
    for (const { t, p } of pairs)
      if (!usedTrack.has(t) && !usedPose.has(p)) add(t, p);
    info.forEach((_, p) => {
      if (usedPose.has(p)) return;
      const t: Track = {
        frames: new Map(),
        center: info[p].center,
        lastMs: frame.timeMs,
        sizes: [],
        ankles: [],
        centers: [],
      };
      tracks.push(t);
      open.push(t);
      add(t, p);
    });
  });
  const score = (t: Track) =>
    t.frames.size *
    quantile(t.sizes, 0.5) *
    (quantile(t.ankles, 0.95) - quantile(t.ankles, 0.05) + 0.02);
  const ranked = [...tracks].sort((a, b) => score(b) - score(a));
  const kept: Track[] = [];
  if (ranked.length) {
    const home = (t: Track) => ({
      x: quantile(
        t.centers.map((c) => c.x),
        0.5,
      ),
      y: quantile(
        t.centers.map((c) => c.y),
        0.5,
      ),
    });
    const base = home(ranked[0]);
    for (const t of ranked) {
      const h = home(t);
      if (kept.length && Math.hypot(h.x - base.x, h.y - base.y) > 0.15)
        continue;
      if (kept.some((k) => [...t.frames.keys()].some((i) => k.frames.has(i))))
        continue;
      kept.push(t);
    }
  }
  return raw.map((frame, index) => {
    const owner = kept.find((t) => t.frames.has(index));
    const pose = owner ? frame.poses[owner.frames.get(index)!] : undefined;
    return {
      timeMs: frame.timeMs,
      // Stored as 0, 1 or 2 ("two or more") so older versions still load it.
      people: Math.min(frame.poses.length, 2),
      points: pose ?? [],
    };
  });
}

/** Share of frames where someone besides the rider was detected. */
export const othersShare = (frames: PoseFrame[]) =>
  frames.length ? frames.filter((f) => f.people > 1).length / frames.length : 0;
