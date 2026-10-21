import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverOpsAlert, instanceAdminIds, parseOpsAlert, renderOpsAlert } from "@/lib/ops-alerts";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

const pushes = vi.hoisted(() => [] as Array<{ userIds: string[]; title: string; url?: string }>);
vi.mock("@/lib/push", () => ({
  sendPushNotifications: vi.fn(async (_db: unknown, userIds: string[], payload: { title: string; url?: string }) => {
    pushes.push({ userIds, title: payload.title, url: payload.url });
  }),
}));
vi.mock("@/lib/reminders", () => ({
  noteToSelf: vi.fn(async (_db: unknown, userId: string, text: string, _now: number, from: { author: string }) => ({
    channelId: `notes-${userId}`,
    message: { id: `note-${userId}`, text, author: from.author },
  })),
}));
vi.mock("@/lib/storage", () => ({ bindings: () => ({ ADMIN_IDS: "kiwi, flo" }) }));

const unit = { unit: "hoffle-stems-sync.service", scope: "user", since: "2026-10-21T09:22:53+00:00", description: "Send songs to Oracle" };

describe("parseOpsAlert", () => {
  it("accepts the agent's report", () => {
    expect(parseOpsAlert({ host: "home", units: [unit] })).toEqual({ host: "home", units: [unit], disks: [], smart: [], idle: null });
  });

  it("refuses unknown hosts, empty lists and odd unit names", () => {
    expect(parseOpsAlert({ host: "mars", units: [unit] })).toBeNull();
    expect(parseOpsAlert({ host: "home", units: [] })).toBeNull();
    expect(parseOpsAlert({ host: "home", units: [{ ...unit, unit: "x; rm -rf /" }] })).toBeNull();
    expect(parseOpsAlert(null)).toBeNull();
  });

  it("drops a bad timestamp and squeezes the description", () => {
    const alert = parseOpsAlert({ host: "oracle", units: [{ unit: "a.service", since: "soon", description: " two\n lines " }] });
    expect(alert?.units[0]).toEqual({ unit: "a.service", scope: "system", since: null, description: "two lines" });
  });
});

describe("disks and idle", () => {
  const disk = { mount: "/mnt/harddisk", usedPct: 97.4, free: 73_894_236_160, size: 2_951_194_296_320 };
  const idle = { level: "risk", cpuP95: 4.2, memory: 12, network: 0.01, days: 7 };

  it("accepts a report with only disks or only idle", () => {
    expect(parseOpsAlert({ host: "home", disks: [disk] })?.disks).toEqual([{ ...disk, usedPct: 97 }]);
    expect(parseOpsAlert({ host: "oracle", idle })?.idle).toEqual(idle);
  });

  it("refuses odd mounts, impossible numbers and unknown idle levels", () => {
    expect(parseOpsAlert({ host: "home", disks: [{ ...disk, mount: "../etc" }] })).toBeNull();
    expect(parseOpsAlert({ host: "home", disks: [{ ...disk, usedPct: 140 }] })).toBeNull();
    expect(parseOpsAlert({ host: "oracle", idle: { ...idle, level: "safe" } })).toBeNull();
    expect(parseOpsAlert({ host: "oracle", units: [], disks: [] })).toBeNull();
  });

  it("says which disk and how much is left", () => {
    const { text, title, body } = renderOpsAlert({ host: "home", units: [], disks: [{ ...disk, usedPct: 97 }] });
    expect(text).toContain("A disk is almost full on the home server");
    expect(text).toContain("/mnt/harddisk: 97% used, 74 GB free");
    expect(title).toBe("💾 Disk almost full on home");
    expect(body).toBe("/mnt/harddisk 97%");
  });

  it("explains the idle rule", () => {
    const { text, title } = renderOpsAlert({ host: "oracle", units: [], idle: idle as never });
    expect(text).toContain("Oracle looks idle by its free-tier rule (CPU p95 4.2%, memory 12%, network 0.01% over 7 days)");
    expect(title).toBe("💤 Oracle may be reclaimed");
  });
});

describe("SMART", () => {
  const health = { disk: "WDC WD20EARS-00MVWB0 (/mnt/disk_new)", problems: ["reallocated sectors: 0 → 8", "pending sectors: 0 → 2"] };

  it("accepts the agent's wording and refuses empty or odd items", () => {
    expect(parseOpsAlert({ host: "home", smart: [health] })?.smart).toEqual([health]);
    expect(parseOpsAlert({ host: "home", smart: [{ disk: "x", problems: [] }] })).toBeNull();
    expect(parseOpsAlert({ host: "home", smart: [{ disk: "x", problems: [42] }] })).toBeNull();
  });

  it("says which disk and what got worse", () => {
    const { text, title, body } = renderOpsAlert({ host: "home", units: [], smart: [health] });
    expect(text).toContain("🩺 Disk health warning on the home server:");
    expect(text).toContain("• WDC WD20EARS-00MVWB0 (/mnt/disk_new): reallocated sectors: 0 → 8; pending sectors: 0 → 2");
    expect(title).toBe("🩺 Disk health warning on home");
    expect(body).toContain("reallocated sectors: 0 → 8");
  });
});

describe("renderOpsAlert", () => {
  it("names the host, each unit and where to look", () => {
    const { text, title, body } = renderOpsAlert({ host: "home", units: [unit as never] });
    expect(text).toContain("A job failed on the home server");
    expect(text).toContain("hoffle-stems-sync.service (Send songs to Oracle), user unit");
    expect(text).toContain("Hosts & backups");
    expect(title).toBe("⚠️ Failed on home");
    expect(body).toBe("hoffle-stems-sync.service");
  });

  it("counts several", () => {
    const { text } = renderOpsAlert({ host: "oracle", units: [unit as never, { ...unit, unit: "b.timer" } as never] });
    expect(text).toContain("2 jobs failed on Oracle");
  });
});

describe.skipIf(!sqliteAvailable)("delivery", () => {
  let db: D1Database;

  beforeEach(async () => {
    pushes.length = 0;
    db = sqliteD1();
    await db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, is_admin INTEGER DEFAULT 0, suspended_at TEXT)`);
    await db.exec(`INSERT INTO users VALUES ('site', 1, NULL), ('kiwi', 0, NULL), ('flo', 0, '2026-01-01'), ('someone', 0, NULL)`);
  });

  it("goes to site admins and ADMIN_IDS, not suspended accounts or members", async () => {
    expect((await instanceAdminIds(db)).sort()).toEqual(["kiwi", "site"]);
  });

  it("leaves a note for each admin and pushes once", async () => {
    const notes = await deliverOpsAlert(db, { host: "home", units: [unit as never], disks: [], smart: [], idle: null });
    expect(notes.map((note) => note.userId).sort()).toEqual(["kiwi", "site"]);
    expect(notes[0].message.author).toBe("Hoffle ops");
    expect(pushes).toHaveLength(1);
    expect(pushes[0].userIds.sort()).toEqual(["kiwi", "site"]);
    expect(pushes[0].url).toBe("/hangout/kivi");
  });
});
