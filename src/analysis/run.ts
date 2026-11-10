import type { ClipAnalysis, PoseFrame, View } from "../domain/types";
import { openVideo, seek, sampleTimes } from "../video/sample";
import { measureClip } from "./metrics";
import {
  pickSegment,
  SCAN_HZ,
  SCAN_MAX_SECONDS,
  type Segment,
} from "./segment";
export const MODEL_VERSION = "MediaPipe Tasks 0.10.35 / pose_full_float16_v1";

/**
 * Run the pose model on `times` (seconds) of a video. `use` runs while the
 * video is still open, for anything that needs the decoded frames.
 */
async function withPose<T>(
  file: File,
  times: (duration: number) => number[],
  onProgress: (n: number) => void,
  signal: AbortSignal,
  use: (frames: PoseFrame[], video: HTMLVideoElement) => Promise<T> | T,
): Promise<T> {
  const { video, dispose } = await openVideo(file);
  const worker = new Worker(new URL("./pose.worker.ts", import.meta.url), {
    type: "module",
  });
  let serial = 0;
  const send = (bitmap: ImageBitmap | undefined, timeMs: number) =>
    new Promise<PoseFrame | undefined>((resolve, reject) => {
      signal.throwIfAborted();
      const id = ++serial;
      const timer = setTimeout(
        () =>
          finish(
            Error(
              "Pose analysis timed out. Check local model files and try a shorter clip.",
            ),
          ),
        60000,
      );
      const finish = (error?: Error, frame?: PoseFrame) => {
        clearTimeout(timer);
        worker.removeEventListener("message", message);
        worker.removeEventListener("error", failed);
        signal.removeEventListener("abort", abort);
        error ? reject(error) : resolve(frame);
      };
      const message = (e: MessageEvent) => {
        if (e.data.id === id)
          finish(e.data.error ? Error(e.data.error) : undefined, e.data.frame);
      };
      const failed = (e: ErrorEvent) =>
        finish(Error(e.message || "Pose worker failed."));
      const abort = () =>
        finish(new DOMException("Analysis cancelled", "AbortError"));
      worker.addEventListener("message", message);
      worker.addEventListener("error", failed);
      signal.addEventListener("abort", abort, { once: true });
      worker.postMessage(
        { id, bitmap, timeMs, base: location.origin + "/" },
        bitmap ? [bitmap] : [],
      );
    });
  try {
    const list = times(video.duration);
    await send(undefined, 0);
    const frames: PoseFrame[] = [];
    for (let n = 0; n < list.length; n++) {
      signal.throwIfAborted();
      await seek(video, list[n], signal);
      const frame = await send(
        await createImageBitmap(video),
        Math.round(list[n] * 1000),
      );
      if (frame) frames.push(frame);
      onProgress((n + 1) / list.length);
    }
    return await use(frames, video);
  } finally {
    worker.terminate();
    dispose();
  }
}

export async function analyze(
  file: File,
  view: View,
  start: number,
  end: number,
  revision: number,
  onProgress: (n: number) => void,
  signal: AbortSignal,
): Promise<ClipAnalysis> {
  return withPose(
    file,
    (duration) => sampleTimes(duration, start, end),
    onProgress,
    signal,
    (frames, video) => ({
      id: crypto.randomUUID(),
      view,
      name: file.name,
      size: file.size,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      frames,
      ...measureClip(frames, view, video.videoWidth, video.videoHeight),
      modelVersion: MODEL_VERSION,
      createdAt: new Date().toISOString(),
      setupRevision: revision,
      reviewed: false,
    }),
  );
}

/**
 * Quick low-rate scan of the whole video to find steady pedaling, so the
 * rider does not have to trim getting on and off the bike by hand.
 */
export async function findSteadyPedaling(
  file: File,
  view: View,
  onProgress: (n: number) => void,
  signal: AbortSignal,
): Promise<Segment | null> {
  return withPose(
    file,
    (duration) =>
      Array.from(
        { length: Math.floor(Math.min(duration, SCAN_MAX_SECONDS) * SCAN_HZ) },
        (_, n) => n / SCAN_HZ,
      ),
    onProgress,
    signal,
    (frames, video) =>
      pickSegment(frames, view, Math.min(video.duration, SCAN_MAX_SECONDS)),
  );
}
