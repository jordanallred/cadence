import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
let model: PoseLandmarker | null = null;

// MediaPipe loads its wasm glue with importScripts, which module workers
// lack. It then falls back to self.import(url), so run the glue as a
// classic script here; its top-level `var ModuleFactory` becomes global.
(self as unknown as { import: (url: string) => Promise<void> }).import =
  async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw Error("Could not load the pose engine (" + r.status + ").");
    (0, eval)(await r.text());
  };
self.onmessage = async (e: MessageEvent) => {
  const { id, bitmap, timeMs, base } = e.data;
  try {
    if (!model) {
      const files = await FilesetResolver.forVisionTasks(base + "wasm");
      model = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: base + "models/pose.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 2,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
    }
    if (!bitmap) {
      self.postMessage({ id, ready: true });
      return;
    }
    const r = model.detectForVideo(bitmap, timeMs);
    self.postMessage({
      id,
      frame: {
        timeMs,
        people: r.landmarks.length,
        points:
          r.landmarks[0]?.map((p) => ({
            x: p.x,
            y: p.y,
            visibility: p.visibility ?? 0,
          })) ?? [],
      },
    });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    bitmap?.close();
  }
};
