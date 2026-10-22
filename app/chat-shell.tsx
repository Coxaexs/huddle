"use client";
import { AuthGate } from "./components/auth-gate";
import { findThemeById } from "@/lib/themes";
import { useShellState } from "./hooks/chat-shell/use-shell-state";
import { useShellSession } from "./hooks/chat-shell/use-shell-session";
import { useShellRealtime } from "./hooks/chat-shell/use-shell-realtime";
import { useShellVoice } from "./hooks/chat-shell/use-shell-voice";
import { useShellHistory } from "./hooks/chat-shell/use-shell-history";
import { useShellActions } from "./hooks/chat-shell/use-shell-actions";
import { useShellCommands } from "./hooks/chat-shell/use-shell-commands";
import { useShellMessaging } from "./hooks/chat-shell/use-shell-messaging";
import { useShellComposer } from "./hooks/chat-shell/use-shell-composer";
import { renderChatShell } from "./components/chat/shell/chat-shell-view";
import { TermsConsent } from "./components/terms-consent";
import { Hoffy } from "./components/hoffy";
import { GuestBanner } from "./components/guest-banner";

// The app's main screen. Its state and handlers live in a chain of hooks
// (app/hooks/chat-shell/, called in this order every render) and its markup
// in app/components/chat/shell/chat-shell-view.tsx.
export function ChatShell() {
  const state = useShellState();
  const session = useShellSession(state);
  const realtime = useShellRealtime(session);
  const voiceState = useShellVoice(realtime);
  const history = useShellHistory(voiceState);
  const actions = useShellActions(history);
  const commands = useShellCommands(actions);
  const messaging = useShellMessaging(commands);
  const shell = useShellComposer(messaging);
  const {
    applyTheme, bootstrap, openSignup, ready, setBootstrap, setUser, turnstileSiteKey, user,
  } = shell;

  if (!ready) {
    return (
      <main className="app-shell booting">
        <div className="boot-card hoffy-boot-card">
          <Hoffy motion="boot" size={132} id="hoffy-boot" />
          <p className="hoffy-boot-text">Opening Hoffle…</p>
          <p className="hoffy-boot-about">
            An open-source, self-hostable chat app: voice channels with screen sharing, servers, DMs and friends, on web and desktop. AGPL-3.0, no tracking.
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell">
        <AuthGate
          bootstrap={bootstrap}
          openSignup={openSignup}
          turnstileSiteKey={turnstileSiteKey}
          onSignedIn={(signedIn, defaultTheme) => {
            const startTheme = defaultTheme && findThemeById(defaultTheme);
            if (startTheme) applyTheme(startTheme);
            setUser(signedIn);
            setBootstrap(false);
          }}
        />
      </main>
    );
  }

  return (
    <>
      {renderChatShell({ ...shell, user })}
      <TermsConsent />
      <GuestBanner user={user} onSaved={setUser} />
    </>
  );
}
