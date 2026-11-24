"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Globe, CalendarClock, Sparkles } from "lucide-react";
import {
  computeAvailabilityHeatmap,
  when2MeetCellIndex,
  type When2MeetGrid,
} from "@/lib/when2meet";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";

interface PollCardProps {
  pollId: string;
  question: string;
  options: string[];
  multi?: boolean;
  pollKind?: "standard" | "when2meet";
  grid?: When2MeetGrid;
  /** Live tallies pushed over the socket; falls back to a fetch on mount. */
  liveCounts?: number[];
  /** Who voted for what, pushed with the tallies (public polls only). */
  liveVoters?: Array<Array<{ id: string; name: string }>>;
}

/** An inline poll or When2Meet availability grid. */
export function PollCard({
  pollId,
  question,
  options,
  multi,
  pollKind: initialKind,
  grid: initialGrid,
  liveCounts,
  liveVoters,
}: PollCardProps) {
  const { t } = useI18n();
  const [counts, setCounts] = useState<number[]>(() =>
    new Array(options.length).fill(0),
  );
  const [mine, setMine] = useState<number[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [pollKind, setPollKind] = useState<"standard" | "when2meet">(
    initialKind === "when2meet" ? "when2meet" : "standard",
  );
  const [grid, setGrid] = useState<When2MeetGrid | null>(initialGrid ?? null);
  const [voters, setVoters] = useState<Array<Array<{ id: string; name: string }>>>([]);
  const [busy, setBusy] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const dragActionRef = useRef<"add" | "remove" | null>(null);
  const draftMineRef = useRef<number[]>([]);

  const loadPollDetails = () => {
    apiFetch<{
      counts: number[];
      mine: number[];
      isPrivate?: boolean;
      pollKind?: "standard" | "when2meet";
      grid?: When2MeetGrid;
      voters?: Array<Array<{ id: string; name: string }>>;
    }>(`/api/polls?pollId=${encodeURIComponent(pollId)}`)
      .then((data) => {
        setCounts(data.counts || []);
        setMine(data.mine || []);
        draftMineRef.current = data.mine || [];
        setIsPrivate(Boolean(data.isPrivate));
        if (data.pollKind === "when2meet") setPollKind("when2meet");
        if (data.grid) setGrid(data.grid);
        if (data.voters) setVoters(data.voters);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    loadPollDetails();
  }, [pollId]);

  useEffect(() => {
    if (liveCounts) setCounts(liveCounts);
  }, [liveCounts]);
  useEffect(() => {
    if (liveVoters) setVoters(liveVoters);
  }, [liveVoters]);

  async function vote(choice: number) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await apiFetch<{
        counts: number[];
        mine: number[];
        voters?: Array<Array<{ id: string; name: string }>>;
      }>("/api/polls/vote", { method: "POST", body: JSON.stringify({ pollId, choice }) });
      setCounts(data.counts || []);
      setMine(data.mine || []);
      if (data.voters) setVoters(data.voters);
    } catch {
      // A failed vote just leaves the previous tallies in place.
    } finally {
      setBusy(false);
    }
  }

  const saveBatchChoices = useCallback(
    async (choices: number[]) => {
      setBusy(true);
      try {
        const data = await apiFetch<{
          counts: number[];
          mine: number[];
          voters?: Array<Array<{ id: string; name: string }>>;
        }>("/api/polls/vote", {
          method: "POST",
          body: JSON.stringify({ pollId, choices }),
        });
        setCounts(data.counts || []);
        setMine(data.mine || []);
        draftMineRef.current = data.mine || [];
        if (data.voters) setVoters(data.voters);
      } catch {
        loadPollDetails();
      } finally {
        setBusy(false);
      }
    },
    [pollId],
  );

  useEffect(() => {
    if (pollKind !== "when2meet") return;
    const handlePointerUp = () => {
      if (!dragActionRef.current) return;
      dragActionRef.current = null;
      void saveBatchChoices(draftMineRef.current);
    };
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [pollKind, saveBatchChoices]);

  const heatmap = useMemo(() => {
    if (pollKind !== "when2meet" || !grid) return null;
    return computeAvailabilityHeatmap(grid, counts, voters);
  }, [pollKind, grid, counts, voters]);

  if (pollKind === "when2meet" && grid && heatmap) {
    const hoveredCell = hoverIndex !== null ? heatmap.cells[hoverIndex] : null;
    const applyDragToCell = (index: number, action: "add" | "remove") => {
      const nextSet = new Set(draftMineRef.current);
      if (action === "add") nextSet.add(index);
      else nextSet.delete(index);
      const next = Array.from(nextSet);
      draftMineRef.current = next;
      setMine(next);
    };

    return (
      <div className="poll-card w2m-card">
        <div className="poll-question flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={15} className="text-emerald-400 shrink-0" />
            <span>{question}</span>
          </span>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${
              isPrivate
                ? "bg-red-500/20 text-red-300 border border-red-500/30"
                : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
            }`}
          >
            {isPrivate ? (
              <>
                <Lock size={11} /> {t("chat.poll.private")}
              </>
            ) : (
              <>
                <Globe size={11} /> {t("chat.poll.public")}
              </>
            )}
          </span>
        </div>

        <div className="w2m-best">
          <Sparkles size={13} className="text-emerald-400 shrink-0" />
          {heatmap.bestSlots.length > 0 ? (
            <>
              <strong>{t("chat.poll.w2mBest")}</strong>
              <span>
                {heatmap.bestSlots
                  .map((s) => `${s.day} ${s.slot} (${s.count})`)
                  .join(" · ")}
              </span>
            </>
          ) : (
            <span>{t("chat.poll.w2mNone")}</span>
          )}
        </div>

        <div className="w2m-grid-wrap">
          <div
            className="w2m-grid"
            style={{
              gridTemplateColumns: `auto repeat(${grid.days.length}, minmax(36px, 1fr))`,
            }}
          >
            <div />
            {grid.days.map((day) => (
              <div key={day} className="w2m-head">
                {day}
              </div>
            ))}
            {grid.slots.map((slot, slotIdx) => (
              <Fragment key={slot}>
                <div className="w2m-time">
                  {slot}
                </div>
                {grid.days.map((day, dayIdx) => {
                  const index = when2MeetCellIndex(dayIdx, slotIdx, grid.slots.length);
                  const cell = heatmap.cells[index];
                  const isMine = mine.includes(index);
                  const alpha = cell && cell.ratio > 0 ? 0.22 + cell.ratio * 0.65 : 0.05;
                  return (
                    <button
                      key={`${day}-${slot}`}
                      type="button"
                      disabled={busy}
                      aria-pressed={isMine}
                      aria-label={`${day} ${slot} (${cell?.count ?? 0})`}
                      className={`w2m-cell ${isMine ? "mine" : ""}`}
                      style={{
                        background:
                          cell && cell.count > 0
                            ? `rgba(74, 222, 128, ${alpha.toFixed(2)})`
                            : "rgba(255, 255, 255, 0.05)",
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        const action = isMine ? "remove" : "add";
                        dragActionRef.current = action;
                        draftMineRef.current = mine;
                        applyDragToCell(index, action);
                        setHoverIndex(index);
                      }}
                      onPointerEnter={() => {
                        setHoverIndex(index);
                        if (dragActionRef.current) {
                          applyDragToCell(index, dragActionRef.current);
                        }
                      }}
                      onFocus={() => setHoverIndex(index)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          const next = isMine
                            ? mine.filter((i) => i !== index)
                            : [...mine, index];
                          setMine(next);
                          draftMineRef.current = next;
                          void saveBatchChoices(next);
                        }
                      }}
                    >
                      {cell && cell.count > 0 ? cell.count : ""}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="w2m-detail">
          {hoveredCell
            ? `${t("chat.poll.w2mFree", {
                slot: `${hoveredCell.day} ${hoveredCell.slot}`,
                count: hoveredCell.count,
              })}${
                !isPrivate && hoveredCell.voters.length > 0
                  ? ` — ${hoveredCell.voters.map((v) => v.name).join(", ")}`
                  : ""
              }`
            : t("chat.poll.w2mHint")}
        </div>
      </div>
    );
  }

  const total = counts.reduce((sum, count) => sum + count, 0);

  return (
    <div className="poll-card">
      <div className="poll-question flex items-center justify-between">
        <span>{question}</span>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
            isPrivate
              ? "bg-red-500/20 text-red-300 border border-red-500/30"
              : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
          }`}
        >
          {isPrivate ? <><Lock size={11} /> {t("chat.poll.private")}</> : <><Globe size={11} /> {t("chat.poll.public")}</>}
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
                  <span className="font-medium text-gray-300">{t("chat.poll.votedBy")}</span>{" "}
                  {choiceVoters.map((v) => v.name).join(", ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="poll-foot">
        {total} {total === 1 ? t("chat.poll.voteOne") : t("chat.poll.voteOther")}
        {isPrivate ? t("chat.poll.anonymous") : t("chat.poll.publicVisible")}
        {multi ? t("chat.poll.multiAllowed") : ""}
      </div>
    </div>
  );
}
