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
  const [isPrivate, setIsPrivate] = useState(false);
  const [voters, setVoters] = useState<Array<Array<{ id: string; name: string }>>>([]);
  const [busy, setBusy] = useState(false);

  const loadPollDetails = () => {
    apiFetch<{
      counts: number[];
      mine: number[];
      isPrivate?: boolean;
      voters?: Array<Array<{ id: string; name: string }>>;
    }>(`/api/polls?pollId=${encodeURIComponent(pollId)}`)
      .then((data) => {
        setCounts(data.counts || []);
        setMine(data.mine || []);
        setIsPrivate(Boolean(data.isPrivate));
        if (data.voters) setVoters(data.voters);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    loadPollDetails();
  }, [pollId]);

  // Someone else voted: the socket carries the new tallies.
  useEffect(() => {
    if (liveCounts) {
      setCounts(liveCounts);
      loadPollDetails();
    }
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
      loadPollDetails();
    } catch {
      // A failed vote just leaves the previous tallies in place.
    } finally {
      setBusy(false);
    }
  }

  const total = counts.reduce((sum, count) => sum + count, 0);

  return (
    <div className="poll-card">
      <div className="poll-question flex items-center justify-between">
        <span>{question}</span>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            isPrivate
              ? "bg-red-500/20 text-red-300 border border-red-500/30"
              : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
          }`}
        >
          {isPrivate ? "🔒 Private" : "🌐 Public"}
        </span>
      </div>
      <div className="poll-options">
        {options.map((option, index) => {
          const count = counts[index] || 0;
          const percent = total ? Math.round((count / total) * 100) : 0;
          const chosen = mine.includes(index);
          const choiceVoters = voters[index] || [];
          return (
            <div key={index} className="poll-option-wrapper my-1">
              <button
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
              {!isPrivate && choiceVoters.length > 0 && (
                <div className="text-[11px] text-gray-400 pl-3 pt-0.5 flex items-center gap-1">
                  <span className="font-medium text-gray-300">Voted by:</span>{" "}
                  {choiceVoters.map((v) => v.name).join(", ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="poll-foot">
        {total} {total === 1 ? "vote" : "votes"}
        {isPrivate ? " · Anonymous voting" : " · Public votes visible"}
        {multi ? " · Multi-choice allowed" : ""}
      </div>
    </div>
  );
}
