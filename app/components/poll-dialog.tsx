"use client";

import { useEffect, useState } from "react";
import { Vote, Plus, Trash2, X } from "lucide-react";

interface PollDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (question: string, options: string[], isPrivate: boolean) => void;
}

export function PollDialog({ open, onClose, onSubmit }: PollDialogProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    if (open) {
      setQuestion("");
      setOptions(["", ""]);
      setIsPrivate(false);
    }
  }, [open]);

  if (!open) return null;

  const validOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit = question.trim().length > 0 && validOptions.length >= 2;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(question.trim(), validOptions, isPrivate);
    onClose();
  };

  return (
    <div className="poll-dialog-backdrop" onClick={onClose}>
      <div className="poll-dialog-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="poll-dialog-header">
            <div className="flex items-center gap-2">
              <Vote size={20} className="text-indigo-400" />
              <h3>Create a Poll</h3>
            </div>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="poll-dialog-body">
            <div className="form-group">
              <label htmlFor="poll-question">Poll Question</label>
              <input
                id="poll-question"
                type="text"
                className="poll-input"
                placeholder="Ask a question (e.g., What game should we play tonight?)"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Options (Minimum 2)</label>
              <div className="poll-options-list">
                {options.map((opt, idx) => (
                  <div key={idx} className="poll-option-row">
                    <input
                      type="text"
                      className="poll-input"
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        className="poll-remove-btn"
                        onClick={() => handleRemoveOption(idx)}
                        title="Remove option"
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
                  <Plus size={16} /> Add Option
                </button>
              )}
            </div>

            <div className="form-group border-t border-white/10 pt-3 mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-300">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                🔒 Private Mode (Anonymous voting, hide voter names)
              </label>
              <p className="text-[11px] text-gray-400 pl-6">
                {isPrivate
                  ? "Voters' identities will be hidden. Only total votes will be shown."
                  : "Public Mode (Default): Everyone can see who voted for each option."}
              </p>
            </div>
          </div>

          <div className="poll-dialog-footer">
            <button type="button" className="discord-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="discord-btn primary-indigo"
              disabled={!canSubmit}
            >
              Post Poll
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
