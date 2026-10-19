"use client";

import { useEffect, useState } from "react";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { useI18n } from "../lib/i18n-context";
import {
  approvePasskeyHandoff,
  finishPasskeySetup,
  passkeyCancelled,
  passkeyHandoffCode,
  passkeySetupInfo,
} from "../lib/passkeys";

/** The browser half of a desktop app's passkey sign-in (see app/lib/passkeys.ts). */
export function PasskeyHandoffPage({ handoffId, setup }: { handoffId: string; setup: boolean }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [options, setOptions] = useState<PublicKeyCredentialCreationOptionsJSON | null>(null);

  useEffect(() => {
    if (!handoffId) return setError("This sign-in link has expired. Start again from the app.");
    const info = setup
      ? passkeySetupInfo(handoffId).then((data) => {
          setOptions(data.options);
          return data.code;
        })
      : passkeyHandoffCode(handoffId).then((data) => data.code);
    info
      .then(setCode)
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("gate.failed")));
  }, [handoffId, setup, t]);

  async function approve() {
    setError("");
    setBusy(true);
    try {
      if (options) await finishPasskeySetup(handoffId, options);
      else await approvePasskeyHandoff(handoffId);
      setDone(true);
    } catch (failure) {
      if (!passkeyCancelled(failure)) setError(failure instanceof Error ? failure.message : t("gate.passkeyFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="username-gate">
      <div className="username-card">
        <span className="username-mark">h</span>
        <h2>{t(setup ? "handoff.setupTitle" : "handoff.title")}</h2>
        {done ? (
          <p>{t(setup ? "handoff.setupDone" : "handoff.done")}</p>
        ) : code ? (
          <>
            <p>{t(setup ? "handoff.setupLead" : "handoff.lead")}</p>
            <p className="auth-handoff-code" aria-label={t("gate.handoffCode")}>{code}</p>
            {error && <p className="auth-error">{error}</p>}
            <button type="button" className="auth-passkey" disabled={busy} onClick={() => void approve()}>
              <KeyRound size={16} aria-hidden /> {busy ? t("gate.busy") : t(setup ? "handoff.setupButton" : "handoff.button")}
            </button>
          </>
        ) : error ? (
          <p className="auth-error">{error}</p>
        ) : (
          <p>{t("handoff.loading")}</p>
        )}
      </div>
    </div>
  );
}
