"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

import { isRetroSoundThemeEnabled, playRetroSound } from "../lib/msn-sounds";

export interface ToastMessage {
  id: string;
  text: string;
  type?: "info" | "success" | "warning" | "error";
}

let toastListeners: Array<(toast: ToastMessage) => void> = [];

export function showToast(text: string, type: "info" | "success" | "warning" | "error" = "info") {
  const toast: ToastMessage = {
    id: Math.random().toString(36).substring(2, 9),
    text,
    type,
  };

  try {
    if (typeof window !== "undefined") {
      const root = document.documentElement;
      const isMsn =
        root.dataset.theme === "legacy" ||
        root.dataset.customThemeId === "msn" ||
        root.dataset.customThemeId === "msn-dark";
      const isRetro = isRetroSoundThemeEnabled();

      if (isMsn || isRetro) {
        if (type === "warning" || type === "error") {
          playRetroSound("error");
        } else if (type === "success") {
          playRetroSound("ding");
        }
      }
    }
  } catch {
    // Best-effort
  }

  toastListeners.forEach((listener) => listener(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (newToast: ToastMessage) => {
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 3500);
    };

    toastListeners.push(handleToast);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== handleToast);
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-card ${toast.type || "info"}`}>
          <span className="toast-icon">
            {toast.type === "success" ? (
              <CheckCircle2 size={18} />
            ) : toast.type === "warning" || toast.type === "error" ? (
              <AlertCircle size={18} />
            ) : (
              <Info size={18} />
            )}
          </span>
          <span className="toast-text">{toast.text}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
