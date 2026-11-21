import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { outsideQuietHours } from "./push";
import { sqliteAvailable, sqliteD1 } from "../test/stubs/sqlite-d1";

describe.skipIf(!sqliteAvailable)("outsideQuietHours", () => {
  const quiet = (from: string, to: string) => JSON.stringify({ quiet: { on: true, from, to, tz: "UTC" }, keywords: [] });

  async function seeded() {
    const db = sqliteD1();
    await db.prepare("CREATE TABLE users (id TEXT PRIMARY KEY, notify_prefs TEXT)").run();
    await db.batch([
      db.prepare("INSERT INTO users VALUES (?, ?)").bind("asleep", quiet("23:00", "08:00")),
      db.prepare("INSERT INTO users VALUES (?, ?)").bind("awake", quiet("13:00", "14:00")),
      db.prepare("INSERT INTO users VALUES (?, ?)").bind("no-prefs", null),
      db.prepare("INSERT INTO users VALUES (?, ?)").bind("garbled", "not json"),
    ]);
    return db;
  }

  it("drops only the people inside their quiet hours", async () => {
    const db = await seeded();
    const everyone = ["asleep", "awake", "no-prefs", "garbled", "unknown"];
    expect(await outsideQuietHours(db, everyone, new Date("2026-01-01T02:00:00Z"))).toEqual([
      "awake",
      "no-prefs",
      "garbled",
      "unknown",
    ]);
    expect(await outsideQuietHours(db, everyone, new Date("2026-01-01T13:30:00Z"))).toEqual([
      "asleep",
      "no-prefs",
      "garbled",
      "unknown",
    ]);
  });

  it("silences nobody when the lookup fails", async () => {
    const db = sqliteD1();
    expect(await outsideQuietHours(db, ["a", "b"])).toEqual(["a", "b"]);
  });
});
