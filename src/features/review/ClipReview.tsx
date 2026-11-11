import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Undo2 } from "lucide-react";
import type { ClipAnalysis, Point } from "../../domain/types";
import { measureClip, joints } from "../../analysis/metrics";
import { Field, Notice } from "../../components/Fields";
import { loadVideo } from "../../storage/db";
const edges = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [28, 30],
  [30, 32],
];
export function ClipReview({
  clip,
  file,
  onUpdate,
  onBack,
  onFile,
}: {
  clip: ClipAnalysis;
  file?: File;
  onUpdate: (c: ClipAnalysis) => void;
  onBack: () => void;
  onFile: (f: File) => void;
}) {
  const [source, setSource] = useState(""),
    [index, setIndex] = useState(0),
    [joint, setJoint] = useState("leftKnee"),
    [edit, setEdit] = useState(false),
    [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let gone = false,
      url = "";
    void (async () => {
      const f = file ?? (await loadVideo(clip.id));
      if (f && !gone) {
        url = URL.createObjectURL(f);
        setSource(url);
      }
    })().catch((e) => setError(String(e)));
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, clip.id]);
  const frame = clip.frames[index];
  const move = (n: number) => {
    setIndex(n);
    if (video.current && clip.frames[n])
      video.current.currentTime = clip.frames[n].timeMs / 1000;
  };
  // The report keeps its original still frame; only the numbers change.
  const remeasure = (frames: typeof clip.frames) => {
    const { metrics, quality } = measureClip(
      frames,
      clip.view,
      clip.width,
      clip.height,
    );
    return { metrics, quality };
  };
  const updatePoint = (p: Point) => {
    if (!frame || !frame.points[joints[joint]]) return;
    const frames = structuredClone(clip.frames);
    frames[index].points[joints[joint]] = p;
    frames[index].corrected = true;
    onUpdate({
      ...clip,
      originalFrames: clip.originalFrames ?? clip.frames,
      frames,
      reviewed: false,
      ...remeasure(frames),
    });
  };
  return (
    <>
      <button className="text-button back" onClick={onBack}>
        <ArrowLeft size={17} /> All recordings
      </button>
      <div className="section-title">
        <h1>
          Check the tracking:{" "}
          <span className="view-name">{clip.view} view</span>
        </h1>
        <p>
          Follow the joints through the whole clip. A misplaced point changes
          the measurement.
        </p>
      </div>
      <div className="review-layout">
        <section className="panel">
          <div
            className="video-stage"
            style={{ aspectRatio: `${clip.width}/${clip.height}` }}
          >
            {source ? (
              <video
                ref={video}
                src={source}
                controls={!edit}
                playsInline
                onLoadedMetadata={() => move(index)}
                onTimeUpdate={() => {
                  if (!edit && video.current) {
                    const t = video.current.currentTime * 1000;
                    let best = 0;
                    clip.frames.forEach((f, n) => {
                      if (
                        Math.abs(f.timeMs - t) <
                        Math.abs((clip.frames[best]?.timeMs ?? 0) - t)
                      )
                        best = n;
                    });
                    setIndex(best);
                  }
                }}
              />
            ) : (
              <div className="video-missing">
                <p>Reattach the original video to review tracking.</p>
                <input
                  type="file"
                  accept="video/*"
                  aria-label="Reattach original video"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.name !== clip.name || f.size !== clip.size) {
                        setError(
                          "Choose the same original file used for this analysis.",
                        );
                        return;
                      }
                      onFile(f);
                      setError("");
                    }
                  }}
                />
              </div>
            )}
            {source && frame && (
              <svg
                className={"pose-overlay " + (edit ? "editing" : "")}
                viewBox={`0 0 ${clip.width} ${clip.height}`}
                onClick={(e) => {
                  if (!edit) return;
                  const b = e.currentTarget.getBoundingClientRect();
                  updatePoint({
                    x: (e.clientX - b.left) / b.width,
                    y: (e.clientY - b.top) / b.height,
                    visibility: 1,
                  });
                }}
              >
                {edges.map(([a, b]) => {
                  const p = frame.points[a],
                    q = frame.points[b];
                  return p && q ? (
                    <line
                      key={`${a}-${b}`}
                      x1={p.x * clip.width}
                      y1={p.y * clip.height}
                      x2={q.x * clip.width}
                      y2={q.y * clip.height}
                      stroke={
                        Math.min(p.visibility, q.visibility) < 0.65
                          ? "#f2ac58"
                          : "#c5ef87"
                      }
                      strokeWidth={Math.max(2, clip.width / 350)}
                    />
                  ) : null;
                })}
                {frame.points.map((p, n) =>
                  n >= 11 ? (
                    <circle
                      key={n}
                      cx={p.x * clip.width}
                      cy={p.y * clip.height}
                      r={clip.width / (n === joints[joint] && edit ? 90 : 180)}
                      fill={n === joints[joint] && edit ? "#fff" : "#c5ef87"}
                      stroke="#173d34"
                      strokeWidth="2"
                    />
                  ) : null,
                )}
              </svg>
            )}
          </div>
          <div className="frame-controls">
            <span>{((frame?.timeMs ?? 0) / 1000).toFixed(1)}s</span>
            <input
              aria-label="Review frame"
              type="range"
              min="0"
              max={Math.max(0, clip.frames.length - 1)}
              value={index}
              onChange={(e) => {
                video.current?.pause();
                move(+e.target.value);
              }}
            />
            <span>
              {index + 1} / {clip.frames.length}
            </span>
          </div>
          {error && <Notice tone="warning">{error}</Notice>}
          <div className="button-row">
            <button
              className="secondary"
              disabled={!source || !frame?.points.length}
              onClick={() => {
                video.current?.pause();
                setEdit(!edit);
              }}
            >
              {edit ? "Finish correction" : "Correct a joint"}
            </button>
            {clip.originalFrames && (
              <button
                className="text-button"
                onClick={() => {
                  const frames = clip.originalFrames!;
                  onUpdate({
                    ...clip,
                    frames,
                    originalFrames: undefined,
                    reviewed: false,
                    ...remeasure(frames),
                  });
                }}
              >
                <Undo2 size={15} />
                Restore automatic tracking
              </button>
            )}
          </div>
          {edit && frame?.points[joints[joint]] && (
            <div className="correction">
              <Field label="Joint to correct">
                <select
                  value={joint}
                  onChange={(e) => setJoint(e.target.value)}
                >
                  {Object.keys(joints).map((k) => (
                    <option key={k} value={k}>
                      {k.replace(/([A-Z])/g, " $1")}
                    </option>
                  ))}
                </select>
              </Field>
              <p>
                Click its correct position in the image. This corrects only this
                frame, not the whole clip. Re-record extensive tracking
                failures.
              </p>
              <div className="form-grid">
                {(["x", "y"] as const).map((axis) => (
                  <Field
                    key={axis}
                    label={`${axis.toUpperCase()} position · %`}
                  >
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={
                        Math.round(frame.points[joints[joint]][axis] * 1000) /
                        10
                      }
                      onChange={(e) =>
                        updatePoint({
                          ...frame.points[joints[joint]],
                          [axis]: Math.max(
                            0,
                            Math.min(1, +e.target.value / 100),
                          ),
                          visibility: 1,
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}
          <button
            className="primary full"
            disabled={
              !source ||
              clip.quality.some((q) => q.severity === "reject") ||
              edit
            }
            onClick={() => {
              onUpdate({ ...clip, reviewed: true });
              onBack();
            }}
          >
            <Check size={17} /> I checked the tracking throughout this clip
          </button>
        </section>
        <aside>
          <section className="panel">
            <h2>Measured movement</h2>
            <div className="metric-list">
              {clip.metrics.map((m) => (
                <div key={m.id}>
                  <span>{m.label}</span>
                  <strong>
                    {m.value}
                    <small>{m.unit}</small>
                  </strong>
                </div>
              ))}
            </div>
            {!clip.metrics.length && <p>No reliable cycle measurements yet.</p>}
          </section>
          {clip.quality.map((q) => (
            <Notice
              key={q.code}
              tone={q.severity === "reject" ? "warning" : "neutral"}
            >
              {q.message}
            </Notice>
          ))}
          <p className="caption">
            {clip.modelVersion}. Each view is measured separately. Confidence
            reflects tracking quality, not proven measurement accuracy.
          </p>
        </aside>
      </div>
    </>
  );
}
