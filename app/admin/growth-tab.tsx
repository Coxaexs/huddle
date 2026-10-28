"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AdminGrowth, Share } from "@/lib/admin-growth";
import { apiFetch } from "../lib/client";

function percent(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

function ShareCell({ share }: { share: Share }) {
  if (!share.of) return <td className="admin-muted">too soon</td>;
  return (
    <td title={`${share.count} of ${share.of}`}>
      <strong>{percent(share.count, share.of)}</strong> <span className="admin-muted">{share.count}/{share.of}</span>
    </td>
  );
}

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Sign-ups, who comes back, and where new people stall. */
export function GrowthTab() {
  const [growth, setGrowth] = useState<AdminGrowth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<AdminGrowth>("/api/admin/growth")
      .then(setGrowth)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load growth numbers."));
  }, []);

  if (error) return <p className="admin-error">{error}</p>;
  if (!growth) {
    return (
      <div className="portal-loading">
        <Loader2 size={24} className="animate-spin" /> Counting…
      </div>
    );
  }

  const peak = Math.max(1, ...growth.daily.map((day) => day.active));
  const signups = growth.funnel.steps[0]?.count ?? 0;

  return (
    <>
      <div className="admin-stats">
        <div className="portal-card admin-stat">
          <span>Active today</span>
          <strong>{growth.active.day}</strong>
          <small>of {growth.accounts} accounts</small>
        </div>
        <div className="portal-card admin-stat">
          <span>Active this week</span>
          <strong>{growth.active.week}</strong>
          <small>last 7 days</small>
        </div>
        <div className="portal-card admin-stat">
          <span>Active this month</span>
          <strong>{growth.active.month}</strong>
          <small>last 30 days</small>
        </div>
        <div className="portal-card admin-stat">
          <span>Stickiness</span>
          <strong>{Math.round(growth.stickiness * 100)}%</strong>
          <small>avg. daily ÷ monthly actives</small>
        </div>
      </div>

      <section className="portal-card admin-section">
        <h2>People each day, last 30 days</h2>
        <div className="admin-bars admin-bars-30" role="img" aria-label="People active and posting per day for the last 30 days">
          {growth.daily.map((day) => (
            <div
              key={day.day}
              className="admin-bar admin-bar-stack"
              title={`${shortDay(day.day)}: ${day.active} active, ${day.posting} posted${day.signups ? `, ${day.signups} signed up` : ""}`}
            >
              <span style={{ height: `${Math.max(2, (day.active / peak) * 100)}%` }}>
                <i style={{ height: day.active ? `${(day.posting / day.active) * 100}%` : 0 }} />
              </span>
              <small>{day.signups ? `+${day.signups}` : day.day.slice(8)}</small>
            </div>
          ))}
        </div>
        <p className="admin-muted admin-legend">
          <span className="admin-key" /> used Hoffle <span className="admin-key admin-key-dark" /> posted · <b>+N</b> under a bar = sign-ups that day
        </p>
      </section>

      <div className="admin-split">
        <section className="portal-card admin-section">
          <h2>New people, last {growth.funnel.days} days</h2>
          {signups ? (
            <ul className="admin-funnel">
              {growth.funnel.steps.map((step) => (
                <li key={step.id}>
                  <span className="admin-funnel-label">{step.label}</span>
                  <span className="admin-funnel-bar">
                    <span style={{ width: `${Math.max(1, (step.count / signups) * 100)}%` }} />
                  </span>
                  <span className="admin-funnel-value">
                    <strong>{step.count}</strong> {step.id !== "signup" && <span className="admin-muted">{percent(step.count, signups)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-muted">Nobody signed up in that time.</p>
          )}
          <p className="admin-muted">Each line is a share of everyone who signed up, not of the line above.</p>
        </section>

        <section className="portal-card admin-section">
          <h2>How they found Hoffle</h2>
          {growth.sources.length ? (
            <ul className="admin-list">
              {growth.sources.map((source) => (
                <li key={source.source}>
                  <strong>{source.count}</strong> <span className="admin-muted">· {source.source}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-muted">Nobody signed up in the last {growth.funnel.days} days.</p>
          )}
        </section>
      </div>

      <section className="portal-card admin-section">
        <h2>Do they come back?</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Signed up the week of</th>
                <th>People</th>
                <th>Next day</th>
                <th>First week</th>
                <th>Weeks 2–4</th>
              </tr>
            </thead>
            <tbody>
              {growth.cohorts.map((cohort) => (
                <tr key={cohort.week}>
                  <td>{shortDay(cohort.week)}</td>
                  <td>{cohort.signups}</td>
                  {cohort.signups ? (
                    <>
                      <ShareCell share={cohort.day1} />
                      <ShareCell share={cohort.week1} />
                      <ShareCell share={cohort.weeks2to4} />
                    </>
                  ) : (
                    <td colSpan={3} className="admin-muted">—</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="admin-muted">
          "First week" = used Hoffle on any of the 7 days after signing up; "Weeks 2–4" = any of days 8–28. Only people old
          enough for a column count in it. Days before Oct 26, 2026 come from messages and sign-ins, so days someone only
          read are missing.
        </p>
      </section>
    </>
  );
}
