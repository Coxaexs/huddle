"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@/lib/auth";
import { apiFetch } from "../lib/client";
import { AuthGate } from "./auth-gate";

interface Session {
  user: PublicUser | null;
  bootstrap: boolean;
  openSignup?: boolean;
  turnstileSiteKey?: string | null;
}

/** For pages outside the chat app: shows the sign-in screen until there is a user. */
export function SignedIn({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void apiFetch<Session>("/api/auth/session")
      .then(setSession)
      .catch(() => setSession({ user: null, bootstrap: false }));
  }, []);

  if (!session) return null;
  if (!session.user) {
    return (
      <main className="app-shell">
        <AuthGate
          bootstrap={session.bootstrap}
          openSignup={session.openSignup}
          turnstileSiteKey={session.turnstileSiteKey}
          onSignedIn={(user) => setSession({ user, bootstrap: false })}
        />
      </main>
    );
  }
  return <>{children}</>;
}
