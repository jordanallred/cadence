import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  UserRound,
  ScanLine,
  ClipboardList,
  Route,
  Plus,
  Download,
  Upload,
  Trash2,
} from "lucide-react";
import { newSession, type Session, type ClipAnalysis } from "./domain/types";
import { Intake } from "./features/intake/Intake";
import { Capture } from "./features/capture/Capture";
import { ClipReview } from "./features/review/ClipReview";
import { Report } from "./features/report/Report";
import { FollowUp } from "./features/followup/FollowUp";
import { recommend } from "./fit/recommend";
import { assessContext } from "./fit/assessment";
import {
  saveSession,
  DiskSaveError,
  loadSessions,
  deleteSession,
  mergeImported,
  savedWhere,
  saveVideo,
  deleteVideo,
  loadVideo,
  hasVideo,
  diskFolder,
} from "./storage/db";
import {
  readBackupFile,
  exportSession,
  exportAll,
  exportAllWithVideos,
} from "./storage/portable";
import { Notice } from "./components/Fields";
const SAVE_FAILED = "Could not save locally.";
const DISK_FAILED = "Saved in this browser, but not in the fit folder on disk.";
const steps = [
  {
    title: "Your starting point",
    sub: "Rider, bike & comfort",
    icon: UserRound,
  },
  { title: "Recordings", sub: "Capture & review movement", icon: ScanLine },
  { title: "Fit report", sub: "What to change first", icon: ClipboardList },
  { title: "Ride & refine", sub: "Changes & real-world feedback", icon: Route },
];
export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]),
    [session, setSession] = useState<Session | null>(null),
    [step, setStep] = useState(0),
    [review, setReview] = useState<string | null>(null),
    [error, setError] = useState(""),
    [saveState, setSaveState] = useState("Loading…"),
    [deletePending, setDeletePending] = useState(false);
  const files = useRef(new Map<string, File>()),
    saveChain = useRef(Promise.resolve()),
    loaded = useRef(false);
  useEffect(() => {
    let live = true;
    void loadSessions()
      .then((list) => {
        if (!live) return;
        setSessions(list);
        setSession(list[0] ?? newSession());
        loaded.current = true;
        setSaveState(savedWhere());
      })
      .catch((e) => {
        if (live) {
          setError("Local storage could not be read: " + String(e));
          setSession(newSession());
          loaded.current = true;
          setSaveState("Not saved");
        }
      });
    return () => {
      live = false;
    };
  }, []);
  const latest = useMemo(() => {
    if (!session) return [];
    const current = session.clips.filter(
      (c) => c.setupRevision === session.setupRevision,
    );
    return current.filter(
      (c, n) => !current.slice(n + 1).some((d) => d.view === c.view),
    );
  }, [session]);
  const results = useMemo(
    () => (session ? recommend(session.intake, latest, session.events) : []),
    [session, latest],
  );
  useEffect(() => {
    if (!session || !loaded.current) return;
    setSaveState("Saving…");
    const snapshot = { ...session, recommendations: results };
    const timer = setTimeout(() => {
      saveChain.current = saveChain.current
        .then(async () => {
          await saveSession(snapshot);
          setSessions((list) => [
            snapshot,
            ...list.filter((s) => s.id !== snapshot.id),
          ]);
          setSaveState(savedWhere());
          // A later good save means the earlier failure is over.
          setError((e) =>
            e.startsWith(SAVE_FAILED) || e.startsWith(DISK_FAILED) ? "" : e,
          );
        })
        .catch((e) => {
          if (e instanceof DiskSaveError) {
            setSaveState("Saved in this browser");
            setError(
              DISK_FAILED +
                " Other browsers and ports will show an older copy until it saves. Download a backup to be safe. " +
                e.message,
            );
            return;
          }
          setSaveState("Not saved");
          setError(SAVE_FAILED + " Download a backup now. " + String(e));
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [session, results]);
  const update = (s: Session) =>
    setSession({ ...s, updatedAt: new Date().toISOString() });
  const go = (n: number) => {
    setStep(n);
    setReview(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const replaceClip = (clip: ClipAnalysis) => {
    if (session)
      update({
        ...session,
        clips: session.clips.map((c) => (c.id === clip.id ? clip : c)),
      });
  };
  const persistNow = async () => {
    if (session) {
      await saveChain.current;
      await saveSession({ ...session, recommendations: results });
    }
  };
  const switchSession = async (id: string) => {
    try {
      await persistNow();
      const target = sessions.find((s) => s.id === id);
      if (target) {
        setSession(target);
        go(0);
      }
    } catch (e) {
      setError(String(e));
    }
  };
  const create = async () => {
    try {
      await persistNow();
      setSession(newSession());
      go(0);
    } catch (e) {
      setError(String(e));
    }
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      await persistNow();
      if (backup.all) {
        // A full backup restores fits as they were, keeping their ids, so
        // restoring twice does not duplicate anything.
        await mergeImported(backup.sessions);
        const failed: string[] = [];
        for (const [id, video] of backup.videos)
          if (!(await hasVideo(id)))
            await saveVideo(id, video).catch(() => failed.push(video.name));
        if (failed.length)
          throw Error(
            "Fits were restored, but these videos could not be saved: " +
              failed.join(", "),
          );
        const list = await loadSessions();
        setSessions(list);
        setSession(list[0] ?? newSession());
        setError("");
        go(0);
        return;
      }
      const incoming = backup.sessions[0];
      incoming.id = crypto.randomUUID();
      incoming.clips = incoming.clips.map((c) => ({
        ...c,
        id: crypto.randomUUID(),
      }));
      incoming.updatedAt = new Date().toISOString();
      await saveSession(incoming);
      setSessions((list) => [incoming, ...list]);
      setSession(incoming);
      setError("");
      go(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const remove = async () => {
    if (!session) return;
    try {
      await saveChain.current;
      await deleteSession(session);
      session.clips.forEach((c) => files.current.delete(c.id));
      const remaining = sessions.filter((s) => s.id !== session.id);
      setSessions(remaining);
      setSession(remaining[0] ?? newSession());
      setDeletePending(false);
      go(0);
    } catch (e) {
      setError(String(e));
    }
  };
  if (!session) return <div className="loading">Loading your fits…</div>;
  const selected = session.clips.find((c) => c.id === review),
    context = assessContext(session.intake, session.events),
    urgent = context.find((r) => r.urgency !== "routine");
  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go(0);
          }}
        >
          <span className="brand-icon">
            <Bike size={25} />
          </span>
          cadence<span className="brand-period">.</span>
        </a>
        <nav aria-label="Fit steps">
          {steps.map((s, n) => (
            <button
              key={s.title}
              onClick={() => go(n)}
              className={step === n ? "active" : ""}
            >
              <s.icon size={20} />
              <span>
                <strong>{s.title}</strong>
                <small>{s.sub}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="session-picker">
          <label htmlFor="session">Current fit</label>
          <select
            id="session"
            value={session.id}
            onChange={(e) => void switchSession(e.target.value)}
          >
            {!sessions.some((s) => s.id === session.id) && (
              <option value={session.id}>New fit</option>
            )}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.intake.bike || s.intake.name || "Untitled fit"} ·{" "}
                {new Date(s.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
          <button className="text-button" onClick={() => void create()}>
            <Plus size={15} />
            Start a new fit
          </button>
          <p
            className={
              "save-indicator" + (saveState === "Not saved" ? " bad" : "")
            }
            role="status"
          >
            {saveState}
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <main>
          {error && (
            <div role="alert">
              <Notice tone="warning">
                <span>{error}</span>
                <button className="text-button" onClick={() => setError("")}>
                  Dismiss
                </button>
              </Notice>
            </div>
          )}
          {urgent && (
            <div role="alert">
              <Notice tone="danger">
                <strong>{urgent.title}</strong>
                <span>{urgent.action}</span>
              </Notice>
            </div>
          )}
          {step === 0 && (
            <Intake
              value={session.intake}
              onChange={(i) => update({ ...session, intake: i })}
              onNext={() => go(1)}
              locked={session.baseline !== null}
            />
          )}
          {step === 1 &&
            (selected ? (
              <ClipReview
                key={selected.id}
                clip={selected}
                file={files.current.get(selected.id)}
                onUpdate={replaceClip}
                onBack={() => setReview(null)}
                onFile={(f) => {
                  files.current.set(selected.id, f);
                  setSession({ ...session });
                }}
              />
            ) : (
              <Capture
                clips={session.clips}
                revision={session.setupRevision}
                onClip={async (c, f, retain) => {
                  files.current.set(c.id, f);
                  if (retain) {
                    try {
                      await saveVideo(c.id, f);
                    } catch (e) {
                      setError(
                        "Video could not be retained. Measurements remain available; keep your original file. " +
                          String(e),
                      );
                    }
                  }
                  update({
                    ...session,
                    baseline:
                      session.baseline ?? structuredClone(session.intake),
                    clips: [...session.clips, c],
                  });
                }}
                onReview={(c) => setReview(c.id)}
                onNext={() => go(2)}
              />
            ))}
          {step === 2 && (
            <Report session={session} results={results} onNext={() => go(3)} />
          )}
          {step === 3 && (
            <FollowUp
              key={session.id}
              session={session}
              results={results}
              onChange={update}
              onRecord={() => go(1)}
              onReport={() => go(2)}
            />
          )}
          <footer className="workspace-footer no-print">
            <div className="footer-tools">
              <button
                onClick={() =>
                  exportSession({ ...session, recommendations: results })
                }
              >
                <Download size={14} />
                Back up this fit
              </button>
              <button
                onClick={async () => {
                  await persistNow().catch(() => undefined);
                  exportAll(
                    sessions.some((s) => s.id === session.id)
                      ? sessions.map((s) =>
                          s.id === session.id
                            ? { ...session, recommendations: results }
                            : s,
                        )
                      : [{ ...session, recommendations: results }, ...sessions],
                  );
                }}
              >
                <Download size={14} />
                Back up all fits
              </button>
              <button
                title="One .zip file with every fit and each kept video"
                onClick={async () => {
                  try {
                    await persistNow();
                    await exportAllWithVideos(
                      sessions.some((s) => s.id === session.id)
                        ? sessions.map((s) =>
                            s.id === session.id
                              ? { ...session, recommendations: results }
                              : s,
                          )
                        : [
                            { ...session, recommendations: results },
                            ...sessions,
                          ],
                      loadVideo,
                    );
                  } catch (e) {
                    setError("Backup failed. " + String(e));
                  }
                }}
              >
                <Download size={14} />
                Back up fits and videos
              </button>
              <label>
                <Upload size={14} />
                Import backup
                <input
                  type="file"
                  accept=".json,.zip"
                  onChange={(e) => {
                    void importBackup(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <button onClick={() => setDeletePending(!deletePending)}>
                <Trash2 size={14} />
                Delete fit
              </button>
            </div>
          </footer>
          {deletePending && (
            <Notice tone="warning">
              <span>
                Delete this fit and its kept videos from{" "}
                {diskFolder ? "this computer" : "this browser"}?
              </span>
              <button className="danger-button" onClick={() => void remove()}>
                Delete this fit
              </button>
              <button
                className="secondary"
                onClick={() => setDeletePending(false)}
              >
                Cancel
              </button>
            </Notice>
          )}
          <p className="storage-note no-print">
            {diskFolder
              ? `Fits and kept videos are saved in ${diskFolder.replace(/[\\/]sessions$/, "")}. Keep a backup and your original videos too.`
              : "Browser data can be cleared by your browser or operating system. Keep a backup and your original videos."}{" "}
            <a href="#policy" onClick={() => go(2)}>
              Evidence & limitations
            </a>
          </p>
          {step === 1 && selected && (
            <button
              className="text-button no-print"
              onClick={async () => {
                try {
                  await deleteVideo(selected.id);
                  files.current.delete(selected.id);
                  update({
                    ...session,
                    clips: session.clips.filter((c) => c.id !== selected.id),
                  });
                  setReview(null);
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Remove this recording and its stored video
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
