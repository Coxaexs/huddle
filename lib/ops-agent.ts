/**
 * Client for the host-side ops agent (huddle-ops/admin-agent), which reports
 * where Hoffle is running, voice servers and backups, and starts backups. The
 * worker itself cannot see the machine it runs on.
 */

import { bindings } from "./storage";

const DEFAULT_URL = "http://127.0.0.1:8735";

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const env = bindings();
  const token = env.ADMIN_AGENT_TOKEN;
  if (!token) return { status: 503, body: { error: "ADMIN_AGENT_TOKEN is not set, so host status is unavailable." } };
  try {
    const response = await fetch(`${env.ADMIN_AGENT_URL || DEFAULT_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  } catch {
    return { status: 502, body: { error: "The ops agent on this host is not answering." } };
  }
}

export function agentStatus() {
  return call("/status");
}

export function agentBackup(kind: "replica" | "archive") {
  return call(`/backup/${kind}`, { method: "POST" });
}

export interface JobTarget {
  host: "home" | "oracle";
  scope: "system" | "user";
  unit: string;
}

/** "run" starts or restarts an allowlisted job; "clear" resets a failed unit. The agent checks both. */
export function agentJob(action: "run" | "clear", target: JobTarget) {
  return call(`/jobs/${action}`, { method: "POST", body: JSON.stringify(target) });
}
