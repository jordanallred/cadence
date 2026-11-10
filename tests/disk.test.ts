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
