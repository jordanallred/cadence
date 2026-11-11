import { describe, expect, it } from "vitest";
import { newSession } from "../src/domain/types";
import { mergeSessions } from "../src/storage/disk";
import { parseBackup } from "../src/storage/portable";

const at = (id: string, updatedAt: string) => ({
  ...newSession(),
  id,
  updatedAt,
});

describe("fit history on disk", () => {
  it("keeps the newest copy and reports what each side lacks", () => {
    const local = [
      at("a", "2026-01-02"),
      at("b", "2026-01-01"),
      at("c", "2026-01-01"),
    ];
    const disk = {
      sessions: [
        at("a", "2026-01-01"),
        at("b", "2026-01-03"),
        at("d", "2026-01-05"),
      ],
      deleted: [],
      folder: "",
    };
    const m = mergeSessions(local, disk);
    expect(m.merged.map((s) => s.id)).toEqual(["d", "b", "a", "c"]);
    expect(m.toDisk.map((s) => s.id).sort()).toEqual(["a", "c"]);
    expect(m.toLocal.map((s) => s.id).sort()).toEqual(["b", "d"]);
    expect(m.dropLocal).toEqual([]);
  });
  it("drops fits that were deleted in another browser", () => {
    const m = mergeSessions([at("a", "2026-01-02")], {
      sessions: [],
      deleted: ["a"],
      folder: "",
    });
    expect(m.merged).toEqual([]);
    expect(m.dropLocal.map((s) => s.id)).toEqual(["a"]);
  });
  it("reads single-fit and all-fits backups", () => {
    const one = at("a", "2026-01-01");
    expect(parseBackup(JSON.stringify(one))).toMatchObject({ all: false });
    const all = parseBackup(
      JSON.stringify({
        format: "cadence-backup",
        version: 1,
        sessions: [one, at("b", "2026-01-02")],
      }),
    );
    expect(all.all).toBe(true);
    expect(all.sessions).toHaveLength(2);
    expect(() => parseBackup("not json")).toThrow(/not a Cadence backup/);
  });
});

describe("fit size (#8)", () => {
  it("the largest realistic fit fits under the save limit", async () => {
    const { MAX_FIT_BYTES } = await import("../src/storage/portable");
    // 40 clips of 30 s at 30 Hz with corrected tracking (two copies of
    // the frames) and two report stills each, landmarks as saved now.
    const frames = Array.from({ length: 900 }, (_, n) => ({
      timeMs: n * 33,
      people: 1,
      points: Array.from({ length: 33 }, () => ({
        x: 0.5123,
        y: 0.4567,
        visibility: 0.987,
      })),
    }));
    const still = "data:image/jpeg;base64," + "A".repeat(299_000);
    const clip = {
      frames,
      originalFrames: frames,
      keyframes: [
        { position: "extension", timeMs: 1, image: still },
        { position: "top", timeMs: 2, image: still },
      ],
    };
    const size = JSON.stringify({ clips: Array(40).fill(clip) }).length;
    expect(size).toBeGreaterThan(30 << 20);
    expect(size).toBeLessThan(MAX_FIT_BYTES * 0.8);
  });
});
