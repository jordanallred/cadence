import { useRef, useState, useEffect } from "react";
import { Camera, CheckCircle2, Film, ChevronRight } from "lucide-react";
import { viewLabel, type ClipAnalysis, type View } from "../../domain/types";
import { analyze, findSteadyPedaling } from "../../analysis/run";
import { beep } from "./beep";
import { openVideo } from "../../video/sample";
import { Field, Check, Notice } from "../../components/Fields";
import { RELOAD_TO_UPDATE, updatedSinceLoad } from "../../storage/version";
import { PhoneLink } from "./PhoneLink";
const VIEW_HINTS: Record<View, string> = {
  left: "Camera square to the bike, 2–3 m away, lens level with the bottom bracket. Shows saddle height, reach and posture.",
  right:
    "Camera square to the bike, 2–3 m away, lens level with the bottom bracket. Shows saddle height, reach and posture.",
  front:
    "Camera directly ahead at hip height, centred on the bike. Shows knee tracking and shoulder movement.",
  rear: "Camera directly behind at hip height, centred on the bike. Shows pelvic rocking and knee tracking.",
};
/** Webcam recording: seconds to get on the bike, then seconds recorded. */
const COUNTDOWN_SECONDS = 10;
const RECORD_SECONDS = 20;
const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
export function Capture({
  clips,
  revision,
  onClip,
  onReview,
  onNext,
}: {
  clips: ClipAnalysis[];
  revision: number;
  onClip: (c: ClipAnalysis, f: File, retain: boolean) => Promise<void>;
  onReview: (c: ClipAnalysis) => void;
  onNext: () => void;
}) {
  const [view, setView] = useState<View>("left"),
    [file, setFile] = useState<File>(),
    [duration, setDuration] = useState(0),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(15),
    [retain, setRetain] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<number | null>(null),
    [recording, setRecording] = useState(false),
    [countdown, setCountdown] = useState<number | null>(null),
    [elapsed, setElapsed] = useState(0),
    [scan, setScan] = useState<number | null>(null),
    [trimNote, setTrimNote] = useState("");
  const abort = useRef<AbortController | null>(null),
    scanAbort = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    camera = useRef<HTMLVideoElement>(null),
    preview = useRef<HTMLVideoElement>(null),
    stopAtEnd = useRef<(() => void) | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    generation = useRef(0);
  useEffect(
    () => () => {
      abort.current?.abort();
      scanAbort.current?.abort();
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      generation.current++;
    },
    [],
  );
  const select = async (f?: File, forView: View = view) => {
    if (!f) return;
    const gen = ++generation.current;
    scanAbort.current?.abort();
    setError("");
    setTrimNote("");
    setFile(undefined);
    try {
      const opened = await openVideo(f);
      const d = opened.video.duration;
      opened.dispose();
      if (gen !== generation.current) return;
      setFile(f);
      setDuration(d);
      setStart(0);
      setEnd(Math.min(20, d));
      if (d < 8) return;
      if (await updatedSinceLoad()) {
        if (gen === generation.current) setTrimNote(RELOAD_TO_UPDATE);
        return;
      }
      // Find the steady pedaling so getting on and off the bike is trimmed.
      const controller = new AbortController();
      scanAbort.current = controller;
      setScan(0);
      try {
        const seg = await findSteadyPedaling(
          f,
          forView,
          setScan,
          controller.signal,
        );
        if (gen !== generation.current) return;
        if (seg) {
          setStart(seg.start);
          setEnd(seg.end);
          setTrimNote(
            `Cadence picked ${fmt(seg.start)}–${fmt(seg.end)} s of steady pedaling. Adjust the times if you need to.`,
          );
        } else
          setTrimNote(
            "Couldn't find 8 seconds of steady pedaling automatically. Set the start and end times yourself.",
          );
      } catch (e) {
        if (gen === generation.current && !controller.signal.aborted)
          setTrimNote(
            "Automatic trimming didn't work for this video. Set the start and end times yourself.",
          );
      } finally {
        if (scanAbort.current === controller) scanAbort.current = null;
        if (gen === generation.current) setScan(null);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };
  const run = async () => {
    if (!file) return;
    setError("");
    // An old page would analyze with old code, bugs included.
    if (await updatedSinceLoad()) {
      setError(RELOAD_TO_UPDATE + " Analysis waits until then.");
      return;
    }
    setProgress(0);
    abort.current = new AbortController();
    try {
      const c = await analyze(
        file,
        view,
        start,
        end,
        revision,
        setProgress,
        abort.current.signal,
      );
      await onClip(c, file, retain);
      setFile(undefined);
      onReview(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };
  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const cancelRecording = () => {
    stopTimer();
    setCountdown(null);
    if (recorder.current?.state === "recording") recorder.current.stop();
    else stream.current?.getTracks().forEach((t) => t.stop());
  };
  const record = async () => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error(
          "Camera capture is not supported here. Import a video instead.",
        );
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 },
        },
        audio: false,
      });
      stream.current = s;
      if (camera.current) {
        camera.current.srcObject = s;
        await camera.current.play();
      }
      const r = new MediaRecorder(s);
      recorder.current = r;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        stopTimer();
        s.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const mime = r.mimeType;
        void select(
          new File(
            chunks,
            "camera-recording." + (mime.includes("mp4") ? "mp4" : "webm"),
            { type: mime },
          ),
        );
      };
      // Hands-free: count down while the rider gets on, beep, record for a
      // fixed time, beep again and stop.
      setRecording(true);
      let left = COUNTDOWN_SECONDS;
      setCountdown(left);
      timer.current = setInterval(() => {
        left--;
        if (left > 0) {
          setCountdown(left);
          if (left <= 3) beep(660, 120);
          return;
        }
        stopTimer();
        setCountdown(null);
        beep(990, 450);
        r.start(1000);
        const began = Date.now();
        setElapsed(0);
        timer.current = setInterval(() => {
          const t = (Date.now() - began) / 1000;
          setElapsed(t);
          if (t >= RECORD_SECONDS) {
            beep(660, 300);
            setTimeout(() => beep(660, 300), 380);
            if (r.state === "recording") r.stop();
          }
        }, 250);
      }, 1000);
    } catch (e) {
      stopTimer();
      setRecording(false);
      setCountdown(null);
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const busy = progress !== null;
  const scanning = scan !== null;
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!file) return setPreviewUrl("");
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // The same rule openVideo() enforces, shown before Analyze is pressed.
  const length = end - start;
  const trimProblem = !file
    ? ""
    : start < 0 || end > duration + 0.05 || length <= 0
      ? `Times must be between 0 and ${fmt(duration)} s, start before end.`
      : length < 8
        ? `That is ${fmt(length)} s. Choose at least 8 seconds.`
        : length > 30
          ? `That is ${fmt(length)} s. Choose at most 30 seconds.`
          : "";
  const here = () => Math.round((preview.current?.currentTime ?? 0) * 10) / 10;
  return (
    <>
      <div className="section-title">
        <h1>Recordings</h1>
        <p>
          Film one side of the bike while you pedal. Front and rear views add
          knee tracking.
        </p>
      </div>
      <div className="capture-layout">
        <section className="panel upload-panel">
          <div className="panel-heading">
            <h2>Add a recording</h2>
          </div>
          <div className="view-tabs" role="group" aria-label="Recording view">
            {(["left", "right", "front", "rear"] as View[]).map((v) => (
              <button
                disabled={busy || recording}
                key={v}
                className={view === v ? "selected" : ""}
                onClick={() => setView(v)}
              >
                {viewLabel(v)}
              </button>
            ))}
          </div>
          <p className="view-hint">{VIEW_HINTS[view]}</p>
          <label className={"dropzone " + (file ? "has-file" : "")}>
            <input
              type="file"
              accept="video/*"
              disabled={busy || recording}
              onChange={(e) => {
                void select(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <h3>{file ? file.name : "Choose a video"}</h3>
            <p>
              {file
                ? `${duration.toFixed(1)} seconds · ${(file.size / 1e6).toFixed(1)} MB`
                : "A video file on this computer"}
            </p>
            <span className="small-button">
              {file ? "Choose another video" : "Browse videos"}
            </span>
            <small>
              Phone, action camera, webcam or existing footage.
              <br />
              Browser-decodable MP4, WebM and other formats.
            </small>
          </label>
          <div className="camera-row">
            <span>
              Or record with a connected camera: {COUNTDOWN_SECONDS} s to get
              on, then {RECORD_SECONDS} s recorded automatically
            </span>
            <button
              className="secondary"
              disabled={busy || scanning}
              onClick={() => (recording ? cancelRecording() : void record())}
            >
              <Camera size={16} />
              {countdown !== null
                ? "Cancel"
                : recording
                  ? `Stop now · ${Math.max(0, Math.ceil(RECORD_SECONDS - elapsed))} s left`
                  : "Record hands-free"}
            </button>
          </div>
          <div className={recording ? "camera-frame" : "hidden"}>
            <video ref={camera} muted playsInline className="camera-preview" />
            <svg
              className="framing-guide"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect x="6" y="6" width="88" height="88" rx="2" />
              <line x1="0" y1="62" x2="100" y2="62" />
            </svg>
            {countdown !== null && (
              <span className="countdown" aria-live="assertive">
                {countdown}
                <small>Get on and start pedaling</small>
              </span>
            )}
            {countdown === null && recording && (
              <span className="recording-dot">● Recording</span>
            )}
            <span className="framing-label top">
              Keep head, hands and both feet inside the box
            </span>
            <span className="framing-label line">
              {view === "left" || view === "right"
                ? "Camera level with the pedals' lowest point"
                : "Camera at hip height, centred on the bike"}
            </span>
          </div>
          <PhoneLink
            disabled={busy || recording}
            onFile={(f, v) => {
              setView(v);
              void select(f, v);
            }}
          />
          {file && (
            <>
              {scanning ? (
                <div className="analysis-progress">
                  <div>
                    <strong>
                      Finding steady pedaling · {Math.round(scan * 100)}%
                    </strong>
                    <button
                      className="text-button"
                      onClick={() => scanAbort.current?.abort()}
                    >
                      Set times myself
                    </button>
                  </div>
                  <progress max="1" value={scan} />
                </div>
              ) : (
                trimNote && <p className="trim-note">{trimNote}</p>
              )}
              {previewUrl && (
                <div className="trim-preview">
                  <video
                    ref={preview}
                    src={previewUrl}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    aria-label={`Preview of ${file.name}`}
                    onLoadedMetadata={() => {
                      if (preview.current) preview.current.currentTime = start;
                    }}
                  />
                  <div className="trim-bar" aria-hidden="true">
                    <span
                      style={{
                        left: `${(Math.max(0, start) / (duration || 1)) * 100}%`,
                        width: `${(Math.max(0, Math.min(duration, end) - Math.max(0, start)) / (duration || 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="trim-buttons">
                    <button
                      className="secondary"
                      disabled={busy || scanning}
                      onClick={() => setStart(here())}
                    >
                      Start here
                    </button>
                    <button
                      className="secondary"
                      disabled={busy || scanning}
                      onClick={() => setEnd(here())}
                    >
                      End here
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        const v = preview.current;
                        if (!v) return;
                        if (stopAtEnd.current)
                          v.removeEventListener(
                            "timeupdate",
                            stopAtEnd.current,
                          );
                        const stop = () => {
                          if (v.currentTime >= end) {
                            v.pause();
                            v.removeEventListener("timeupdate", stop);
                          }
                        };
                        stopAtEnd.current = stop;
                        v.currentTime = start;
                        v.addEventListener("timeupdate", stop);
                        void v.play();
                      }}
                    >
                      Play selection
                    </button>
                  </div>
                </div>
              )}
              <div className="form-grid trim">
                <Field label="Start time · seconds">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    disabled={busy || scanning}
                    value={start}
                    onChange={(e) => setStart(+e.target.value)}
                  />
                </Field>
                <Field
                  label="End time · seconds"
                  hint="Select 8–30 seconds of steady pedaling."
                >
                  <input
                    type="number"
                    max={duration}
                    step="0.1"
                    disabled={busy || scanning}
                    value={end}
                    onChange={(e) => setEnd(+e.target.value)}
                  />
                </Field>
              </div>
              {trimProblem && !scanning && (
                <p className="trim-problem" role="status">
                  {trimProblem}
                </p>
              )}
              <Check
                label="Keep this video with the fit (optional)"
                checked={retain}
                onChange={setRetain}
              />
              <small className="muted">
                Otherwise only measurements are saved; reattach the original
                video after closing the app.
              </small>
            </>
          )}
          {error && <Notice tone="warning">{error}</Notice>}
          {busy ? (
            <div className="analysis-progress">
              <div>
                <strong>
                  {progress === 0
                    ? "Loading local pose model…"
                    : `Analyzing frames · ${Math.round(progress * 100)}%`}
                </strong>
                <button
                  className="text-button"
                  onClick={() => abort.current?.abort()}
                >
                  Cancel
                </button>
              </div>
              <progress max="1" value={progress!} />
            </div>
          ) : (
            <button
              className="primary full"
              disabled={!file || recording || scanning || !!trimProblem}
              onClick={() => void run()}
            >
              Analyze {viewLabel(view).toLowerCase()} view
            </button>
          )}
        </section>
        <aside>
          <section className="guide">
            <h2>Before you record</h2>
            <ul>
              <li>
                <strong>Ride steadily</strong>
                <p>
                  Use a secure trainer. Warm up, then pedal comfortably at your
                  normal effort.
                </p>
              </li>
              <li>
                <strong>Place the camera squarely</strong>
                <p>
                  Keep it level near hip height, far enough away to include your
                  head, hands and feet. Avoid ultra-wide lenses.
                </p>
              </li>
              <li>
                <strong>Keep the setup consistent</strong>
                <p>
                  Record each view without changing the bike. Use your usual
                  shoes and hand position.
                </p>
              </li>
            </ul>
            <details>
              <summary>Tips for phone recordings</summary>
              <p>
                Support the phone, use the rear camera and good lighting.
                Landscape usually frames the rider well; portrait also works.
                Transfer the original file without messaging-app compression.
              </p>
            </details>
            <details>
              <summary>Video will not open?</summary>
              <p>
                HEVC support varies by browser. Use{" "}
                <a
                  href="https://handbrake.fr/"
                  target="_blank"
                  rel="noreferrer"
                >
                  HandBrake
                </a>{" "}
                locally to convert a copy to H.264 MP4. No upload is needed.
              </p>
            </details>
          </section>
        </aside>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Your recordings</h2>
          <span>Setup {revision + 1}</span>
        </div>
        {!clips.length ? (
          <div className="empty-inline">
            <Film />
            <p>Your analyzed recordings will appear here.</p>
          </div>
        ) : (
          <div className="clip-list">
            {[...clips]
              // Current setup first, newest first; earlier setups after.
              .sort(
                (a, b) =>
                  b.setupRevision - a.setupRevision ||
                  b.createdAt.localeCompare(a.createdAt),
              )
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => onReview(c)}
                  className={
                    c.setupRevision !== revision ? "earlier" : undefined
                  }
                >
                  <Film size={20} />
                  <span>
                    <strong>{viewLabel(c.view)} view</strong>
                    <small>
                      {c.name} · Setup {c.setupRevision + 1}
                      {c.setupRevision !== revision &&
                        ", before your last change"}
                    </small>
                  </span>
                  <span className="clip-status">
                    {c.quality.some((q) => q.severity === "reject") ? (
                      "Needs a new recording"
                    ) : c.reviewed ? (
                      <>
                        <CheckCircle2 size={15} />
                        Reviewed
                      </>
                    ) : (
                      "Review tracking"
                    )}
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
          </div>
        )}
      </section>
      <div className="footer-actions">
        <p>
          Start with a side view. Add front and rear views for knee tracking.
        </p>
        <button className="primary" onClick={onNext} disabled={busy}>
          See fit report
        </button>
      </div>
    </>
  );
}
