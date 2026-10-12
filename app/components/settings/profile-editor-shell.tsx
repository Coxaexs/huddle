"use client";

import { createPortal } from "react-dom";

/** Full-screen profile editor, opened from "Edit Profiles" like Discord's. */
export function ProfileEditorShell({ children }: { children: React.ReactNode }) {
  return createPortal(
    <div className="profile-editor" role="dialog" aria-modal="true" aria-label="Edit profile">
      {children}
    </div>,
    document.body,
  );
}
