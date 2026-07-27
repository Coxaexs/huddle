"use client";

import { useEffect, useRef, useState } from "react";

export interface DialogOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  type: "prompt" | "confirm" | "alert";
}

interface CustomDialogProps {
  options: DialogOptions | null;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

export function CustomDialog({ options, onConfirm, onCancel }: CustomDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (options) {
      setInputValue(options.defaultValue || "");
      if (options.type === "prompt") {
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      }
    }
  }, [options]);

  if (!options) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onConfirm(options.type === "prompt" ? inputValue : undefined);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="custom-dialog-backdrop" onClick={onCancel}>
      <div
        className="custom-dialog-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="custom-dialog-header">
          <h3 id="dialog-title">{options.title}</h3>
        </div>

        {options.message && (
          <div className="custom-dialog-body">
            <p>{options.message}</p>
          </div>
        )}

        {options.type === "prompt" && (
          <div className="custom-dialog-input-wrap">
            <input
              ref={inputRef}
              type="text"
              className="custom-dialog-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={options.placeholder || ""}
            />
          </div>
        )}

        <div className="custom-dialog-actions">
          {options.type !== "alert" && (
            <button
              type="button"
              className="custom-dialog-btn secondary"
              onClick={onCancel}
            >
              {options.cancelText || "Cancel"}
            </button>
          )}
          <button
            type="button"
            className={`custom-dialog-btn primary ${options.isDanger ? "danger" : ""}`}
            onClick={() => onConfirm(options.type === "prompt" ? inputValue : undefined)}
          >
            {options.confirmText || (options.type === "confirm" ? "Confirm" : "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
