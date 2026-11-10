export function sampleTimes(
  duration: number,
  start: number,
  end: number,
): number[] {
  if (
    ![duration, start, end].every(Number.isFinite) ||
    start < 0 ||
    end > duration ||
    end - start < 8 ||
    end - start > 30
  )
    throw Error("Choose 8–30 seconds within the video duration.");
  return Array.from(
    { length: Math.floor((end - start) * 10) },
    (_, n) => start + n / 10,
  );
}
export async function openVideo(file: File) {
  const url = URL.createObjectURL(file),
    video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          finish(
            Error("Video decoding timed out. Try an H.264 MP4 or WebM copy."),
          ),
        15000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timer);
        video.onloadeddata = null;
        video.onerror = null;
        error ? reject(error) : resolve();
      };
      video.onloadeddata = () => finish();
      video.onerror = () =>
        finish(
          Error(
            "This browser cannot decode this video. Convert locally to H.264 MP4 with HandBrake, or try another browser.",
          ),
        );
      video.src = url;
    });
    if (!Number.isFinite(video.duration) || !video.videoWidth)
      throw Error(
        "Video has no usable duration or dimensions. Export a standard MP4 copy.",
      );
    return {
      video,
      dispose: () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
      },
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
export async function seek(
  video: HTMLVideoElement,
  time: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2)
    return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        finish(
          Error("Could not decode a frame. Try a local H.264 conversion."),
        ),
      10000,
    );
    const done = () => finish();
    const abort = () =>
      finish(new DOMException("Analysis cancelled", "AbortError"));
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    video.addEventListener("seeked", done, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    video.currentTime = time;
  });
}
