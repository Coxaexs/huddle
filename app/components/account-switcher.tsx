"use client";

import { useEffect, useState } from "react";
import { Check, LogOut, UserPlus, X } from "lucide-react";
import type { AccountSummary } from "@/lib/multi-account";
import { apiFetch, apiUrl } from "../lib/client";
import { useI18n } from "../lib/i18n-context";
import { Avatar } from "./avatar";

interface AccountsPayload {
  accounts: AccountSummary[];
  maxAccounts: number;
}

interface SessionOAuthInfo {
  oauth?: { google: boolean; discord: boolean };
}

interface LoginResult {
  twoFactor?: boolean;
  ticket?: string;
}

/**
 * Multi-account switcher section embedded inside `StatusMenu`: lists all
 * sessions stored in `hoffle_accounts` (max 5), switches with one click, and
 * lets you add or remove accounts without losing your current login.
 */
export function AccountSwitcher({
  onCloseMenu,
  onAddAccount,
}: {
  onCloseMenu: () => void;
  onAddAccount: () => void;
}) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [maxAccounts, setMaxAccounts] = useState(5);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void apiFetch<AccountsPayload>("/api/auth/accounts")
      .then((res) => {
        if (!alive) return;
        setAccounts(res.accounts ?? []);
        setMaxAccounts(res.maxAccounts ?? 5);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function switchAccount(userId: string) {
    setBusyId(userId);
    try {
      await apiFetch("/api/auth/accounts", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      onCloseMenu();
      window.location.reload();
    } catch {
      setBusyId(null);
    }
  }

  async function removeAccount(userId: string) {
    setBusyId(userId);
    try {
      const res = await apiFetch<{ clearedActive?: boolean }>("/api/auth/accounts", {
        method: "DELETE",
        body: JSON.stringify({ userId }),
      });
      if (res.clearedActive) {
        onCloseMenu();
        window.location.reload();
        return;
      }
      setAccounts((prev) => prev.filter((a) => a.userId !== userId));
    } finally {
      setBusyId(null);
    }
  }

  async function signOutAll() {
    setBusyId("all");
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ scope: "all" }),
      });
      onCloseMenu();
      window.location.reload();
    } catch {
      setBusyId(null);
    }
  }

  if (!loaded) return null;

  return (
    <div className="account-switcher" role="group" aria-label={t("accounts.section")}>
      <div className="status-menu-divider" />
      <div className="account-switcher-label">{t("accounts.section")}</div>
      {accounts.map((acc) => (
        <div key={acc.userId} className="account-switcher-row">
          <button
            type="button"
            role="menuitem"
            className={`account-switcher-item ${acc.isActive ? "active" : ""}`}
            disabled={busyId !== null}
            onClick={() => {
              if (acc.isActive) {
                onCloseMenu();
                return;
              }
              void switchAccount(acc.userId);
            }}
          >
            <Avatar
              avatar={acc.avatar}
              avatarUrl={acc.avatarUrl}
              color={acc.color}
              size={20}
            />
            <span className="account-switcher-names">
              <span className="account-switcher-display">{acc.displayName}</span>
              <span className="account-switcher-handle">@{acc.username}</span>
            </span>
            {acc.isActive && <Check size={13} aria-label={t("accounts.active")} />}
          </button>
          {!acc.isActive && (
            <button
              type="button"
              className="account-switcher-remove"
              aria-label={t("accounts.remove", { name: acc.displayName })}
              title={t("accounts.remove", { name: acc.displayName })}
              disabled={busyId !== null}
              onClick={() => void removeAccount(acc.userId)}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      {accounts.length < maxAccounts ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onCloseMenu();
            onAddAccount();
          }}
        >
          <span className="status-dot flex items-center justify-center" style={{ background: "transparent" }}>
            <UserPlus size={13} />
          </span>
          {t("accounts.add")}
        </button>
      ) : (
        <div className="account-switcher-limit">{t("accounts.limitReached")}</div>
      )}
      {accounts.length > 1 && (
        <button
          type="button"
          role="menuitem"
          disabled={busyId !== null}
          onClick={() => void signOutAll()}
        >
          <span className="status-dot flex items-center justify-center" style={{ background: "transparent" }}>
            <LogOut size={13} />
          </span>
          {t("accounts.signOutAll")}
        </button>
      )}
    </div>
  );
}

/** Modal opened from `StatusMenu -> Add account` so signing in another user never signs out the current one. */
export function AddAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorTicket, setTwoFactorTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauth, setOauth] = useState<{ google: boolean; discord: boolean }>({
    google: false,
    discord: false,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTwoFactorTicket(null);
    setCode("");
    void apiFetch<SessionOAuthInfo>("/api/auth/session")
      .then((res) => {
        if (res.oauth) setOauth(res.oauth);
      })
      .catch(() => undefined);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (twoFactorTicket) {
        await apiFetch("/api/auth/two-factor", {
          method: "POST",
          body: JSON.stringify({ ticket: twoFactorTicket, code: code.trim() }),
        });
      } else {
        const res = await apiFetch<LoginResult>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: identifier.trim(), password }),
        });
        if (res.twoFactor && res.ticket) {
          setTwoFactorTicket(res.ticket);
          setBusy(false);
          return;
        }
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("accounts.failed"));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-account-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="add-account-title">{t("accounts.modalTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("accounts.cancel")}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ padding: "18px 20px", display: "grid", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t("accounts.modalLead")}</p>
          {(oauth.google || oauth.discord) && !twoFactorTicket && (
            <div style={{ display: "grid", gap: 8 }}>
              {oauth.google && (
                <a
                  className="ghost-btn"
                  style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 8, textDecoration: "none" }}
                  href={apiUrl("/api/auth/oauth/google?mode=add")}
                >
                  {t("accounts.withGoogle")}
                </a>
              )}
              {oauth.discord && (
                <a
                  className="ghost-btn"
                  style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 8, textDecoration: "none" }}
                  href={apiUrl("/api/auth/oauth/discord?mode=add")}
                >
                  {t("accounts.withDiscord")}
                </a>
              )}
              <div style={{ textAlign: "center", fontSize: 12, opacity: 0.6 }}>{t("accounts.or")}</div>
            </div>
          )}
          <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "grid", gap: 10 }}>
            {twoFactorTicket ? (
              <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <span>{t("accounts.twoFactorCode")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </label>
            ) : (
              <>
                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <span>{t("gate.label.username")}</span>
                  <input
                    type="text"
                    autoFocus
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </label>
                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <span>{t("accounts.password")}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
              </>
            )}
            {error && <p className="error-text" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button type="button" className="ghost-btn" onClick={onClose}>
                {t("accounts.cancel")}
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? "…" : t("accounts.submit")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
