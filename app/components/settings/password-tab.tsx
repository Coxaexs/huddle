"use client";

import { type PublicUser } from "@/lib/users";
import { SecuritySection } from "./security-section";
import { Tab } from "./types";

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
  return (
    <>
      {tab === "password" && (
            <div className="account-settings">
              <section className="profile-studio-section">
                <h3 className="profile-studio-section-title">Username</h3>
                <label htmlFor="settings-username">Username</label>
                <input
                  id="settings-username"
                  value={newUsername}
                  autoComplete="username"
                  maxLength={24}
                  onChange={(event) => setNewUsername(event.target.value)}
                />
                <p className="modal-hint">
                  2–24 letters, numbers, dots, dashes or underscores. You sign in with this.
                </p>
                {newUsername.trim() !== user.username && (
                  <>
                    <label htmlFor="settings-username-password">Password to confirm</label>
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
                  Change username
                </button>
              </section>

              <section className="profile-studio-section">
                <h3 className="profile-studio-section-title">Email</h3>
                {!user.email && (
                  <p className="auth-error">
                    You have no email yet. Add one so you can reset your password if you forget it.
                  </p>
                )}
                <label htmlFor="settings-email">Email</label>
                <input
                  id="settings-email"
                  type="email"
                  value={newEmail}
                  autoComplete="email"
                  maxLength={254}
                  placeholder="you@example.com"
                  onChange={(event) => setNewEmail(event.target.value)}
                />
                <p className="modal-hint">Only used for password reset links. Nobody else sees it.</p>
                {newEmail.trim().toLowerCase() !== (user.email || "") && (
                  <>
                    <label htmlFor="settings-email-password">Password to confirm</label>
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
                  {user.email ? "Send code to change email" : "Send code to add email"}
                </button>
                {pendingEmail && (
                  <>
                    <label htmlFor="settings-email-code">Code sent to {pendingEmail}</label>
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
                      Verify email
                    </button>
                  </>
                )}
              </section>

              <section className="profile-studio-section">
                <h3 className="profile-studio-section-title">Password</h3>
                <p className="modal-hint">Changing it signs you out on every other device.</p>
                <label htmlFor="settings-current">Current password</label>
                <input
                  id="settings-current"
                  type="password"
                  value={current}
                  autoComplete="current-password"
                  onChange={(event) => setCurrent(event.target.value)}
                />
                <label htmlFor="settings-next">New password</label>
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
                  Change password
                </button>
              </section>
              <SecuritySection />
              {!user.isAdmin && (
                <section className="profile-studio-section danger-zone">
                  <h3 className="profile-studio-section-title">Delete account</h3>
                  <p className="modal-hint">
                    This signs you out everywhere and removes your profile, friends and settings.
                    Your messages stay in their conversations as &ldquo;Deleted user&rdquo; unless
                    you remove them too. It cannot be undone.
                  </p>
                  <label htmlFor="settings-delete-password">Password</label>
                  <input
                    id="settings-delete-password"
                    type="password"
                    value={deletePassword}
                    autoComplete="current-password"
                    onChange={(event) => setDeletePassword(event.target.value)}
                  />
                  <label className="appearance-switch">
                    <span>
                      <strong>Also delete my messages and files</strong>
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
                    {deletingAccount ? "Deleting…" : "Delete my account"}
                  </button>
                </section>
              )}
            </div>
          )}
    </>
  );
}
