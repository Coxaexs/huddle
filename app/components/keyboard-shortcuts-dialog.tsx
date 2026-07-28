"use client";

import { useEffect } from "react";
import { Command, X, Mic, Headphones, Monitor, Video, Search, MessageSquare, Terminal } from "lucide-react";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
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
      title: "Navigation & Quick Actions",
      icon: <Command size={18} />,
      shortcuts: [
        { keys: ["Ctrl", "K"], description: "Quick Channel / DM Switcher" },
        { keys: ["Ctrl", "/"], description: "Open Keyboard Shortcuts" },
        { keys: ["ESC"], description: "Close Modal or Popover" },
      ],
    },
    {
      title: "Voice & Video Controls",
      icon: <Mic size={18} />,
      shortcuts: [
        { keys: ["Ctrl", "Shift", "M"], description: "Toggle Microphone Mute" },
        { keys: ["Ctrl", "Shift", "D"], description: "Toggle Headphones Deafen" },
        { keys: ["Ctrl", "Shift", "S"], description: "Toggle Screen Share" },
        { keys: ["Ctrl", "Shift", "V"], description: "Toggle Camera" },
      ],
    },
    {
      title: "Chat & Messaging",
      icon: <MessageSquare size={18} />,
      shortcuts: [
        { keys: ["/"], description: "Open Slash Command Menu" },
        { keys: ["↑"], description: "Edit your last sent message" },
        { keys: ["Shift", "Enter"], description: "Insert a new line" },
      ],
    },
  ];

  return (
    <div className="shortcuts-dialog-backdrop" onClick={onClose}>
      <div className="shortcuts-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-dialog-header">
          <div className="flex items-center gap-2">
            <Command size={20} className="text-indigo-400" />
            <h3>Keyboard Shortcuts Cheat Sheet</h3>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
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
