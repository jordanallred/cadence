import { useEffect, useState } from "react";
import { Smartphone, Download, X } from "lucide-react";
import type { View } from "../../domain/types";

type Item = {
  id: string;
  name: string;
  view: View;
  size: number;
  type: string;
};

const viewName: Record<View, string> = {
  left: "Left side",
  right: "Right side",
  front: "Front",
  rear: "Rear",
};

/**
 * Shows a QR code that opens a phone upload page on the local network, and
 * lists videos the phone has sent. Only available when Cadence runs from the
 * desktop launcher; hidden in the development server.
 */
export function PhoneLink({
  disabled,
  onFile,
}: {
  disabled: boolean;
  onFile: (file: File, view: View) => void;
}) {
  const [link, setLink] = useState<{ url: string; error: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/phone/link")
      .then((r) => (r.ok ? r.json() : null))
      .then((l) => live && setLink(l))
      .catch(() => live && setLink(null));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!link?.url) return;
    let live = true;
    const poll = () =>
      fetch("/api/phone/inbox")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: Item[]) => live && setItems(list))
        .catch(() => undefined);
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [link?.url]);
  if (!link) return null;
  const take = async (it: Item) => {
    setBusy(it.id);
    setError("");
    try {
      const r = await fetch("/api/phone/inbox/" + it.id);
      if (!r.ok) throw Error("This video is no longer waiting. Send it again.");
      const blob = await r.blob();
      onFile(new File([blob], it.name, { type: it.type }), it.view);
      await fetch("/api/phone/inbox/" + it.id, { method: "DELETE" });
      setItems((list) => list.filter((x) => x.id !== it.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  const discard = async (it: Item) => {
    await fetch("/api/phone/inbox/" + it.id, { method: "DELETE" });
    setItems((list) => list.filter((x) => x.id !== it.id));
  };
  return (
    <section className="phone-link">
      <div className="phone-link-head">
        <Smartphone size={18} />
        <h3>From your phone</h3>
      </div>
      {link.url ? (
        <div className="phone-link-body">
          <img
            src="/api/phone/qr.png"
            width={132}
            height={132}
            alt="QR code that opens the Cadence phone page"
          />
          <div>
            <p>
              Scan with your phone's camera. Record or choose a video and it
              arrives here over your Wi-Fi. Nothing goes through the internet.
            </p>
            <small className="muted">
              Phone and computer must be on the same network. If Windows asks,
              allow Cadence on private networks.
            </small>
          </div>
        </div>
      ) : (
        <small className="muted">
          Phone link is unavailable: {link.error || "no local network found"}.
          Copy the video to this computer and choose it above instead.
        </small>
      )}
      {items.length > 0 && (
        <ul className="phone-inbox">
          {items.map((it) => (
            <li key={it.id}>
              <span>
                <strong>{viewName[it.view]}</strong>
                <small>
                  {it.name} · {(it.size / 1e6).toFixed(1)} MB
                </small>
              </span>
              <button
                className="secondary"
                disabled={disabled || !!busy}
                onClick={() => void take(it)}
              >
                <Download size={15} />
                {busy === it.id ? "Loading…" : "Use this video"}
              </button>
              <button
                className="text-button"
                aria-label={"Discard " + it.name}
                disabled={!!busy}
                onClick={() => void discard(it)}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <small className="warning-text">{error}</small>}
    </section>
  );
}
