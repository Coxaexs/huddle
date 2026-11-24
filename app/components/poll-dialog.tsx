"use client";

import { useEffect, useState } from "react";
import { Vote, Plus, Trash2, X, Lock, CalendarClock } from "lucide-react";
import {
  MAX_WHEN2MEET_CELLS,
  type When2MeetGrid,
} from "@/lib/when2meet";
import { useDismiss } from "../hooks/use-dismiss";
import { useI18n } from "../lib/i18n-context";

interface PollDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    question: string,
    options: string[],
    isPrivate: boolean,
    when2meet?: When2MeetGrid,
  ) => void;
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DEFAULT_SELECTED_DAYS = ["fri", "sat", "sun"];

function buildHourlySlots(startHour: number, endHour: number, maxSlots: number): string[] {
  const from = Math.max(0, Math.min(23, startHour));
  const to = Math.max(from, Math.min(23, endHour));
  const slots: string[] = [];
  for (let h = from; h <= to && slots.length < maxSlots; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}

export function PollDialog({ open, onClose, onSubmit }: PollDialogProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"standard" | "when2meet">("standard");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [isPrivate, setIsPrivate] = useState(false);

  // When2Meet builder state
  const [selectedDays, setSelectedDays] = useState<string[]>(DEFAULT_SELECTED_DAYS);
  const [startHour, setStartHour] = useState(17);
  const [endHour, setEndHour] = useState(22);

  useEffect(() => {
    if (open) {
      setTab("standard");
      setQuestion("");
      setOptions(["", ""]);
      setIsPrivate(false);
      setSelectedDays(DEFAULT_SELECTED_DAYS);
      setStartHour(17);
      setEndHour(22);
    }
  }, [open]);
  useDismiss(open, onClose);

  if (!open) return null;

  const validOptions = options.map((o) => o.trim()).filter(Boolean);
  const orderedDays = WEEKDAY_KEYS.filter((d) => selectedDays.includes(d)).map((d) =>
    t(`poll.w2m.day.${d}` as const),
  );
  const maxSlotsPerDay = orderedDays.length
    ? Math.max(1, Math.floor(MAX_WHEN2MEET_CELLS / orderedDays.length))
    : 24;
  const slots = buildHourlySlots(startHour, endHour, maxSlotsPerDay);

  const canSubmit =
    tab === "when2meet"
      ? question.trim().length > 0 && orderedDays.length >= 1 && slots.length >= 1
      : question.trim().length > 0 && validOptions.length >= 2;

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions((prev) => [...prev, ""]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const toggleDay = (dayKey: string) => {
    setSelectedDays((prev) => {
      if (prev.includes(dayKey)) {
        return prev.length > 1 ? prev.filter((d) => d !== dayKey) : prev;
      }
      return [...prev, dayKey];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (tab === "when2meet") {
      const tz =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined;
      onSubmit(question.trim(), [], isPrivate, {
        days: orderedDays,
        slots,
        ...(tz ? { timezone: tz } : {}),
      });
    } else {
      onSubmit(question.trim(), validOptions, isPrivate);
    }
    onClose();
  };

  return (
    <div className="poll-dialog-backdrop" onClick={onClose}>
      <div className="poll-dialog-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="poll-dialog-header">
            <div className="flex items-center gap-2">
              {tab === "when2meet" ? (
                <CalendarClock size={20} className="text-emerald-400" />
              ) : (
                <Vote size={20} className="text-indigo-400" />
              )}
              <h3>{t("poll.createTitle")}</h3>
            </div>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="poll-dialog-body">
            <div className="poll-kind-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "standard"}
                className={`poll-kind-tab ${tab === "standard" ? "active" : ""}`}
                onClick={() => setTab("standard")}
              >
                <Vote size={14} /> {t("poll.mode.standard")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "when2meet"}
                className={`poll-kind-tab ${tab === "when2meet" ? "active" : ""}`}
                onClick={() => setTab("when2meet")}
              >
                <CalendarClock size={14} /> {t("poll.mode.when2meet")}
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="poll-question">{t("poll.questionLabel")}</label>
              <input
                id="poll-question"
                type="text"
                className="poll-input"
                placeholder={
                  tab === "when2meet"
                    ? t("poll.w2m.titlePlaceholder")
                    : t("poll.questionPlaceholder")
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                autoFocus
              />
            </div>

            {tab === "standard" ? (
              <div className="form-group">
                <label>{t("poll.optionsLabel")}</label>
                <div className="poll-options-list">
                  {options.map((opt, idx) => (
                    <div key={idx} className="poll-option-row">
                      <input
                        type="text"
                        className="poll-input"
                        placeholder={t("poll.optionPlaceholder", { num: idx + 1 })}
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          className="poll-remove-btn"
                          onClick={() => handleRemoveOption(idx)}
                          title={t("poll.removeOption")}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {options.length < 10 && (
                  <button
                    type="button"
                    className="poll-add-btn"
                    onClick={handleAddOption}
                  >
                    <Plus size={16} /> {t("poll.addOption")}
                  </button>
                )}
              </div>
            ) : (
              <div className="form-group space-y-3">
                <div>
                  <label className="block mb-1.5">{t("poll.w2m.daysLabel")}</label>
                  <div className="w2m-day-chips">
                    {WEEKDAY_KEYS.map((dayKey) => {
                      const active = selectedDays.includes(dayKey);
                      return (
                        <button
                          key={dayKey}
                          type="button"
                          aria-pressed={active}
                          className={`w2m-day-chip ${active ? "active" : ""}`}
                          onClick={() => toggleDay(dayKey)}
                        >
                          {t(`poll.w2m.day.${dayKey}` as const)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="w2m-start-hour">{t("poll.w2m.startHour")}</label>
                    <select
                      id="w2m-start-hour"
                      className="poll-input"
                      value={startHour}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setStartHour(val);
                        if (endHour < val) setEndHour(val);
                      }}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="w2m-end-hour">{t("poll.w2m.endHour")}</label>
                    <select
                      id="w2m-end-hour"
                      className="poll-input"
                      value={endHour}
                      onChange={(e) => setEndHour(Math.max(startHour, Number(e.target.value)))}
                    >
                      {Array.from({ length: 24 - startHour }, (_, idx) => {
                        const h = startHour + idx;
                        return (
                          <option key={h} value={h}>
                            {String(h).padStart(2, "0")}:00
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">{t("poll.w2m.hint")}</p>
              </div>
            )}

            <div className="form-group border-t border-white/10 pt-3 mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-300">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span className="inline-flex items-center gap-1">
                  <Lock size={12} /> {t("poll.privateLabel")}
                </span>
              </label>
              <p className="text-[11px] text-gray-400 pl-6">
                {isPrivate ? t("poll.privateHint") : t("poll.publicHint")}
              </p>
            </div>
          </div>

          <div className="poll-dialog-footer">
            <button type="button" className="discord-btn secondary" onClick={onClose}>
              {t("dialog.cancel")}
            </button>
            <button
              type="submit"
              className="discord-btn primary-indigo"
              disabled={!canSubmit}
            >
              {tab === "when2meet" ? t("poll.w2m.post") : t("poll.post")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
