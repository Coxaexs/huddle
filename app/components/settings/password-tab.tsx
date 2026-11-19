"use client";

import { type PublicUser } from "@/lib/users";
import { SecuritySection } from "./security-section";
import { Tab } from "./types";
import { useI18n } from "../../lib/i18n-context";

export function PasswordTab({
  tab,
  newUsername,
  setNewUsername,
  user,
  usernamePassword,
  setUsernamePassword,
  saveUsername,
  newEmail,
  setNewEmail,
  emailPassword,
  setEmailPassword,
  saveEmail,
  pendingEmail,
  emailCode,
  setEmailCode,
  verifyEmail,
  current,
  setCurrent,
  next,
  setNext,
  savePassword,
  deletePassword,
  setDeletePassword,
  deleteMessagesToo,
  setDeleteMessagesToo,
  deletingAccount,
  deleteAccount,
}: {
  tab: Tab;
  newUsername: string;
  setNewUsername: React.Dispatch<React.SetStateAction<string>>;
  user: PublicUser;
  usernamePassword: string;
  setUsernamePassword: React.Dispatch<React.SetStateAction<string>>;
  saveUsername: () => Promise<void>;
  newEmail: string;
  setNewEmail: React.Dispatch<React.SetStateAction<string>>;
  emailPassword: string;
  setEmailPassword: React.Dispatch<React.SetStateAction<string>>;
  saveEmail: () => Promise<void>;
  pendingEmail: string | null;
  emailCode: string;
  setEmailCode: React.Dispatch<React.SetStateAction<string>>;
  verifyEmail: () => Promise<void>;
  current: string;
  setCurrent: React.Dispatch<React.SetStateAction<string>>;
  next: string;
  setNext: React.Dispatch<React.SetStateAction<string>>;
  savePassword: () => Promise<void>;
  deletePassword: string;
  setDeletePassword: React.Dispatch<React.SetStateAction<string>>;
  deleteMessagesToo: boolean;
  setDeleteMessagesToo: React.Dispatch<React.SetStateAction<boolean>>;
  deletingAccount: boolean;
  deleteAccount: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <>
      {tab === "password" && (
            <div className="account-settings">
              <section className="profile-studio-section" data-settings-anchor="username" data-settings-label={t("account.username")}>
                <h3 id="settings-username-title" className="profile-studio-section-title">{t("account.username")}</h3>
                <input
                  id="settings-username"
                  aria-labelledby="settings-username-title"
                  style={{ marginTop: 10 }}
                  value={newUsername}
                  autoComplete="username"
                  maxLength={24}
                  onChange={(event) => setNewUsername(event.target.value)}
                />
                <p className="modal-hint">
                  {t("account.usernameHint")}
                </p>
                {newUsername.trim() !== user.username && (
                  <>
                    <label htmlFor="settings-username-password">{t("account.passwordToConfirm")}</label>
                    <input
                      id="settings-username-password"
                      type="password"
                      value={usernamePassword}
                      autoComplete="current-password"
                      onChange={(event) => setUsernamePassword(event.target.value)}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="primary"
                  onClick={saveUsername}
                  disabled={!newUsername.trim() || newUsername.trim() === user.username || !usernamePassword}
                >
                  {t("account.changeUsername")}
                </button>
              </section>

              <section className="profile-studio-section" data-settings-anchor="email" data-settings-label={t("account.email")}>
                <h3 className="profile-studio-section-title">{t("account.email")}</h3>
                {!user.email && (
                  <p className="auth-error">
                    {t("account.noEmailYet")}
                  </p>
                )}
                <input
                  id="settings-email"
                  aria-label={t("account.email")}
                  style={{ marginTop: 10 }}
                  type="email"
                  data-streamer-hide
                  value={newEmail}
                  autoComplete="email"
                  maxLength={254}
                  placeholder={t("emailPrompt.placeholder")}
                  onChange={(event) => setNewEmail(event.target.value)}
                />
                <p className="modal-hint">{t("account.emailHint")}</p>
                {newEmail.trim().toLowerCase() !== (user.email || "") && (
                  <>
                    <label htmlFor="settings-email-password">{t("account.passwordToConfirm")}</label>
                    <input
                      id="settings-email-password"
                      type="password"
                      value={emailPassword}
                      autoComplete="current-password"
                      onChange={(event) => setEmailPassword(event.target.value)}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="primary"
                  onClick={saveEmail}
                  disabled={
                    !newEmail.trim() ||
                    newEmail.trim().toLowerCase() === (user.email || "") ||
                    !emailPassword
                  }
                >
                  {user.email ? t("account.sendCodeChangeEmail") : t("account.sendCodeAddEmail")}
                </button>
                {pendingEmail && (
                  <>
                    <label htmlFor="settings-email-code">{t("account.codeSentTo", { email: pendingEmail })}</label>
                    <input
                      id="settings-email-code"
                      value={emailCode}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      onChange={(event) =>
                        setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                    />
                    <button
                      type="button"
                      className="primary"
                      onClick={verifyEmail}
                      disabled={emailCode.length !== 6}
                    >
                      {t("account.verifyEmail")}
                    </button>
                  </>
                )}
              </section>

              <section className="profile-studio-section" data-settings-anchor="password" data-settings-label={t("account.password")}>
                <h3 className="profile-studio-section-title">{t("account.password")}</h3>
                <p className="modal-hint">{t("account.passwordHint")}</p>
                <label htmlFor="settings-current">{t("account.currentPassword")}</label>
                <input
                  id="settings-current"
                  type="password"
                  value={current}
                  autoComplete="current-password"
                  onChange={(event) => setCurrent(event.target.value)}
                />
                <label htmlFor="settings-next">{t("account.newPassword")}</label>
                <input
                  id="settings-next"
                  type="password"
                  value={next}
                  autoComplete="new-password"
                  onChange={(event) => setNext(event.target.value)}
                />
                <button
                  type="button"
                  className="primary"
                  onClick={savePassword}
                  disabled={!current || !next}
                >
                  {t("account.changePassword")}
                </button>
              </section>
              <SecuritySection />
              {!user.isAdmin && (
                <section className="profile-studio-section danger-zone" data-settings-anchor="delete" data-settings-label={t("account.deleteTitle")}>
                  <h3 className="profile-studio-section-title">{t("account.deleteTitle")}</h3>
                  <p className="modal-hint">
                    {t("account.deleteHint")}
                  </p>
                  <label htmlFor="settings-delete-password">{t("account.password")}</label>
                  <input
                    id="settings-delete-password"
                    type="password"
                    value={deletePassword}
                    autoComplete="current-password"
                    onChange={(event) => setDeletePassword(event.target.value)}
                  />
                  <label className="appearance-switch">
                    <span>
                      <strong>{t("account.deleteMessagesToo")}</strong>
                    </span>
                    <input
                      type="checkbox"
                      checked={deleteMessagesToo}
                      onChange={(event) => setDeleteMessagesToo(event.target.checked)}
                    />
                  </label>
                  <button
                    type="button"
                    className="danger"
                    disabled={!deletePassword || deletingAccount}
                    onClick={() => void deleteAccount()}
                  >
                    {deletingAccount ? t("account.deleting") : t("account.deleteMyAccount")}
                  </button>
                </section>
              )}
            </div>
          )}
    </>
  );
}
