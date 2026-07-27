"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/client";

interface PollCardProps {
  pollId: string;
  question: string;
  options: string[];
  multi?: boolean;
  /** Live tallies pushed over the socket; falls back to a fetch on mount. */
  liveCounts?: number[];
}

/** An inline poll: click a bar to vote, click it again to take the vote back. */
export function PollCard({
  pollId,
  question,
  options,
  multi,
  liveCounts,
}: PollCardProps) {
  const [counts, setCounts] = useState<number[]>(() =>
    new Array(options.length).fill(0),
  );
  const [mine, setMine] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ counts: number[]; mine: number[] }>(
      `/api/polls?pollId=${encodeURIComponent(pollId)}`,
    )
      .then((data) => {
        setCounts(data.counts || []);
        setMine(data.mine || []);
      })
      .catch(() => undefined);
  }, [pollId]);

  // Someone else voted: the socket carries the new tallies.
  useEffect(() => {
    if (liveCounts) setCounts(liveCounts);
  }, [liveCounts]);

  async function vote(choice: number) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ counts: number[]; mine: number[] }>(
        "/api/polls/vote",
        { method: "POST", body: JSON.stringify({ pollId, choice }) },
      );
      setCounts(data.counts || []);
      setMine(data.mine || []);
    } catch {
      // A failed vote just leaves the previous tallies in place.
    } finally {
      setBusy(false);
    }
  }

  const total = counts.reduce((sum, count) => sum + count, 0);

  return (
    <div className="poll-card">
      <div className="poll-question">{question}</div>
      <div className="poll-options">
        {options.map((option, index) => {
          const count = counts[index] || 0;
          const percent = total ? Math.round((count / total) * 100) : 0;
          const chosen = mine.includes(index);
          return (
            <button
              key={index}
              type="button"
              className={`poll-option ${chosen ? "chosen" : ""}`}
              onClick={() => void vote(index)}
              disabled={busy}
            >
              <span className="poll-fill" style={{ width: `${percent}%` }} />
              <span className="poll-label">
                {chosen ? "◉" : "○"} {option}
              </span>
              <span className="poll-count">
                {percent}% · {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="poll-foot">
        {total} {total === 1 ? "vote" : "votes"}
        {multi ? " · pick as many as you like" : ""}
      </div>
    </div>
  );
}
