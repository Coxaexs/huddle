/**
 * Alerts from the host-side ops agent (huddle-ops/admin-agent): a systemd unit
 * failed, a disk is almost full or its SMART counters got worse, or Oracle
 * looks idle by its free-tier rule.
 * Every instance admin gets a note in their Notes and a push. The agent decides
 * what is new and how often to tell; this only checks the report and delivers it.
 */

import { sendPushNotifications } from "./push";
import { noteToSelf } from "./reminders";
import { bindings } from "./storage";

export const OPS_HOSTS = ["home", "oracle", "thinkpad"] as const;
export type OpsHost = (typeof OPS_HOSTS)[number];

export interface FailedUnit {
  unit: string;
  scope: "system" | "user";
  since: string | null;
  description: string;
}

export interface FullDisk {
  mount: string;
  usedPct: number;
  free: number;
  size: number;
}

/** Oracle reclaims an Always Free VM when CPU p95, memory and network all stay under 20 % for 7 days. */
export interface IdleRisk {
  level: "close" | "risk";
  cpuP95: number;
  memory: number;
  network: number;
  days: number;
}

/** One disk whose SMART counters got worse; the agent words the problems. */
export interface DiskHealth {
  disk: string;
  problems: string[];
}

export interface OpsAlert {
  host: OpsHost;
  units: FailedUnit[];
  disks: FullDisk[];
  smart: DiskHealth[];
  idle: IdleRisk | null;
}

const UNIT_RE = /^[\w@.:\\-]{1,160}$/;
const MOUNT_RE = /^\/[\w./ -]{0,200}$/;
const MAX_ITEMS = 20;

const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

function parseUnit(raw: unknown): FailedUnit | null {
  if (!raw || typeof raw !== "object") return null;
  const { unit, scope, since, description } = raw as Record<string, unknown>;
  if (typeof unit !== "string" || !UNIT_RE.test(unit)) return null;
  return {
    unit,
    scope: scope === "user" ? "user" : "system",
    since: typeof since === "string" && !Number.isNaN(Date.parse(since)) ? since : null,
    description: typeof description === "string" ? description.replace(/\s+/g, " ").trim().slice(0, 200) : "",
  };
}

function parseDisk(raw: unknown): FullDisk | null {
  if (!raw || typeof raw !== "object") return null;
  const { mount, usedPct, free, size } = raw as Record<string, unknown>;
  const pct = number(usedPct);
  if (typeof mount !== "string" || !MOUNT_RE.test(mount) || pct === null || pct < 0 || pct > 100) return null;
  return { mount, usedPct: Math.round(pct), free: Math.max(0, number(free) ?? 0), size: Math.max(0, number(size) ?? 0) };
}

function parseHealth(raw: unknown): DiskHealth | null {
  if (!raw || typeof raw !== "object") return null;
  const { disk, problems } = raw as Record<string, unknown>;
  if (typeof disk !== "string" || !disk.trim() || !Array.isArray(problems) || !problems.length) return null;
  if (!problems.every((problem) => typeof problem === "string" && problem.trim())) return null;
  const clean = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);
  return { disk: clean(disk, 160), problems: (problems as string[]).slice(0, 10).map((problem) => clean(problem, 200)) };
}

function parseIdle(raw: unknown): IdleRisk | null {
  if (!raw || typeof raw !== "object") return null;
  const { level, cpuP95, memory, network, days } = raw as Record<string, unknown>;
  if (level !== "close" && level !== "risk") return null;
  const values = [cpuP95, memory, network, days].map(number);
  if (values.some((value) => value === null)) return null;
  const [cpu, mem, net, span] = values as number[];
  return { level, cpuP95: cpu, memory: mem, network: net, days: span };
}

/** The agent's report, or null if it is not one. Each part is optional, but not all of them. */
export function parseOpsAlert(body: unknown): OpsAlert | null {
  if (!body || typeof body !== "object") return null;
  const { host, units = [], disks = [], smart = [], idle = null } = body as Record<string, unknown>;
  if (!OPS_HOSTS.includes(host as OpsHost) || !Array.isArray(units) || !Array.isArray(disks) || !Array.isArray(smart)) {
    return null;
  }
  const cleanUnits = units.slice(0, MAX_ITEMS).map(parseUnit);
  const cleanDisks = disks.slice(0, MAX_ITEMS).map(parseDisk);
  const cleanSmart = smart.slice(0, MAX_ITEMS).map(parseHealth);
  if (cleanUnits.includes(null) || cleanDisks.includes(null) || cleanSmart.includes(null)) return null;
  const cleanIdle = idle === null ? null : parseIdle(idle);
  if (idle !== null && !cleanIdle) return null;
  if (!cleanUnits.length && !cleanDisks.length && !cleanSmart.length && !cleanIdle) return null;
  return {
    host: host as OpsHost,
    units: cleanUnits as FailedUnit[],
    disks: cleanDisks as FullDisk[],
    smart: cleanSmart as DiskHealth[],
    idle: cleanIdle,
  };
}

const HOST_NAMES: Record<OpsHost, string> = { home: "the home server", oracle: "Oracle", thinkpad: "the ThinkPad" };
const SHORT_NAMES: Record<OpsHost, string> = { home: "home", oracle: "Oracle", thinkpad: "the ThinkPad" };

function gigabytes(bytes: number): string {
  const gb = bytes / 1e9;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}

export function renderOpsAlert(alert: Pick<OpsAlert, "host" | "units"> & Partial<OpsAlert>): {
  text: string;
  title: string;
  body: string;
} {
  const where = HOST_NAMES[alert.host];
  const units = alert.units ?? [];
  const disks = alert.disks ?? [];
  const smart = alert.smart ?? [];
  const parts: string[] = [];
  if (units.length) {
    parts.push(
      [
        `⚠️ ${units.length === 1 ? "A job failed" : `${units.length} jobs failed`} on ${where}:`,
        ...units.map((unit) => {
          const what = unit.description ? ` (${unit.description})` : "";
          return `• ${unit.unit}${what}, ${unit.scope === "user" ? "user unit" : "system unit"}`;
        }),
      ].join("\n"),
    );
  }
  if (smart.length) {
    parts.push(
      [
        `🩺 Disk health warning on ${where}:`,
        ...smart.map((disk) => `• ${disk.disk}: ${disk.problems.join("; ")}`),
      ].join("\n"),
    );
  }
  if (disks.length) {
    parts.push(
      [
        `💾 ${disks.length === 1 ? "A disk is" : "Disks are"} almost full on ${where}:`,
        ...disks.map((disk) => `• ${disk.mount}: ${disk.usedPct}% used, ${gigabytes(disk.free)} free`),
      ].join("\n"),
    );
  }
  if (alert.idle) {
    const { cpuP95, memory, network, days, level } = alert.idle;
    parts.push(
      `💤 Oracle ${level === "risk" ? "looks idle" : "is close to idle"} by its free-tier rule ` +
        `(CPU p95 ${cpuP95}%, memory ${memory}%, network ${network}% over ${days} days). ` +
        "Oracle may reclaim the VM when all three stay under 20% for 7 days.",
    );
  }
  const text = [...parts, "Details: Admin → Hosts & backups."].join("\n\n");
  const title = units.length
    ? `⚠️ Failed on ${SHORT_NAMES[alert.host]}`
    : smart.length
      ? `🩺 Disk health warning on ${SHORT_NAMES[alert.host]}`
      : disks.length
      ? `💾 Disk almost full on ${SHORT_NAMES[alert.host]}`
      : "💤 Oracle may be reclaimed";
  const body = [
    ...units.map((unit) => unit.unit),
    ...smart.map((disk) => `${disk.disk}: ${disk.problems[0]}`),
    ...disks.map((disk) => `${disk.mount} ${disk.usedPct}%`),
    ...(alert.idle ? [`idle: CPU p95 ${alert.idle.cpuP95}%`] : []),
  ]
    .join(", ")
    .slice(0, 120);
  return { text, title, body };
}

/** Everyone who runs /admin: site admins and ADMIN_IDS, minus suspended accounts. */
export async function instanceAdminIds(db: D1Database): Promise<string[]> {
  let listed: string[] = [];
  try {
    const env = bindings();
    listed = (env.ADMIN_IDS || env.MEDIA_ADMIN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
  } catch {
    listed = [];
  }
  const placeholders = listed.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT id FROM users
        WHERE (is_admin = 1${listed.length ? ` OR id IN (${placeholders})` : ""})
          AND suspended_at IS NULL`,
    )
    .bind(...listed)
    .all<{ id: string }>();
  return (rows.results || []).map((row) => row.id);
}

/** Notes + push for every instance admin. Returns the notes, for the hub to show live. */
export async function deliverOpsAlert(
  db: D1Database,
  alert: OpsAlert,
  now = Date.now(),
): Promise<Array<{ userId: string; channelId: string; message: Record<string, unknown> }>> {
  const admins = await instanceAdminIds(db);
  const { text, title, body } = renderOpsAlert(alert);
  const notes: Array<{ userId: string; channelId: string; message: Record<string, unknown> }> = [];
  for (const userId of admins) {
    const { channelId, message } = await noteToSelf(db, userId, text, now, {
      author: "Hoffle ops",
      avatar: "🛠️",
      color: "#e5534b",
    });
    notes.push({ userId, channelId, message });
  }
  const kinds = [
    alert.units.length && "units",
    alert.smart.length && "smart",
    alert.disks.length && "disks",
    alert.idle && "idle",
  ].filter(Boolean);
  await sendPushNotifications(db, admins, {
    title,
    body,
    url: "/hangout/kivi", // the admin panel's address (app/kivi)
    tag: `ops-${alert.host}-${kinds.join("-")}`,
  }).catch(() => undefined);
  return notes;
}
