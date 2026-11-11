/**
 * Notice when Cadence was updated while this page stayed open (#18).
 *
 * A new launcher replaces an older running one on the same port, but an
 * open tab keeps running the old JavaScript until it is reloaded. The
 * launcher answers /__cadence with "cadence <version>"; if that changes
 * after the page loaded, the page is out of date. Without a launcher (the
 * dev server, a static host) there is nothing to compare and this stays
 * quiet.
 */
export const UPDATED_EVENT = "cadence-updated";

async function launcherVersion(): Promise<string | null> {
  try {
    const r = await fetch("/__cadence", { cache: "no-store" });
    const text = (await r.text()).trim();
    return r.ok && /^cadence\b/.test(text) ? text : null;
  } catch {
    return null;
  }
}

let loadedWith: Promise<string | null> | null = null;

/** Remember which launcher served this page. Call once at start-up. */
export function rememberVersion() {
  loadedWith ??= launcherVersion();
  return loadedWith;
}

/**
 * True when a different Cadence now serves this address. Tells the rest of
 * the page through UPDATED_EVENT so the reload banner shows.
 */
export async function updatedSinceLoad(): Promise<boolean> {
  const before = await rememberVersion();
  if (!before) return false;
  const now = await launcherVersion();
  const changed = now !== null && now !== before;
  if (changed) window.dispatchEvent(new Event(UPDATED_EVENT));
  return changed;
}

export const RELOAD_TO_UPDATE =
  "Cadence was updated. Reload this page to use the new version.";
