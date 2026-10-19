"use client";

import { useEffect } from "react";
import { Command, X, Mic, Headphones, Monitor, Video, Search, MessageSquare, Terminal } from "lucide-react";
import { useI18n } from "../lib/i18n-context";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const shortcutGroups = [
    {
      title: t("shortcuts.group.nav"),
      icon: <Command size={18} />,
      shortcuts: [
        { keys: ["Ctrl", "K"], description: t("shortcuts.switcher") },
        { keys: ["Ctrl", "Shift", "K"], description: t("shortcuts.findPeople") },
        { keys: ["Alt", "↑ / ↓"], description: t("shortcuts.prevNext") },
        { keys: ["Ctrl", "/"], description: t("shortcuts.open") },
        { keys: ["ESC"], description: t("shortcuts.close") },
      ],
    },
    {
      title: t("shortcuts.group.voice"),
      icon: <Mic size={18} />,
      shortcuts: [
        { keys: ["Ctrl", "Shift", "M"], description: t("shortcuts.mute") },
        { keys: ["Ctrl", "Shift", "D"], description: t("shortcuts.deafen") },
        { keys: ["Ctrl", "Shift", "S"], description: t("shortcuts.screen") },
        { keys: ["Ctrl", "Shift", "V"], description: t("shortcuts.camera") },
      ],
    },
    {
      title: t("shortcuts.group.chat"),
      icon: <MessageSquare size={18} />,
      shortcuts: [
        { keys: ["/"], description: t("shortcuts.slash") },
        { keys: ["↑"], description: t("shortcuts.editLast") },
        { keys: ["Shift", "Enter"], description: t("shortcuts.newLine") },
        { keys: ["Shift", "Delete"], description: t("shortcuts.skipConfirm") },
      ],
    },
  ];

  return (
    <div className="shortcuts-dialog-backdrop" onClick={onClose}>
      <div className="shortcuts-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-dialog-header">
          <div className="flex items-center gap-2">
            <Command size={20} className="text-indigo-400" />
            <h3>{t("shortcuts.title")}</h3>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label={t("common.close")}>
            <X size={18} />
          </button>
        </div>

        <div className="shortcuts-dialog-body">
          {shortcutGroups.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <div className="shortcuts-group-title">
                {group.icon}
                <span>{group.title}</span>
              </div>
              <div className="shortcuts-list">
                {group.shortcuts.map((sc) => (
                  <div key={sc.description} className="shortcut-row">
                    <span className="shortcut-desc">{sc.description}</span>
                    <div className="shortcut-keys">
                      {sc.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
