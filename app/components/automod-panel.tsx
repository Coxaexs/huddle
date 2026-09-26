"use client";

/**
 * Server settings → AutoMod: the operator-facing half of `lib/automod.ts`.
 *
 * Kept beside the dialog rather than inline in it, because the dialog is already
 * the longest file in the app and this screen owns three pieces of state nothing
 * else wants (the rule list, the in-progress draft, the in-flight row). It mounts
 * only while its tab is selected, so mounting *is* the lazy load the other tabs
 * spell out as a `tab === "x"` effect.
 *
 * One property of the API shapes the whole component: `GET /api/automod` runs
 * every row through the evaluator's own parser, and that parser discards a rule
 * whose `enabled` flag is clear. The list the panel loads therefore only ever
 * contains rules that are currently live — which is why toggling edits local
 * state instead of refetching. A refetch after disabling would drop the row from
 * the response, and a rule that vanishes looks deleted; worse, re-enabling it
 * would then be impossible because the client would no longer hold its id.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Pencil, Plus, Shield, Trash2 } from "lucide-react";
import {
  AUTOMOD_ACTIONS,
  AUTOMOD_KINDS,
  type AutomodAction,
  type AutomodConfig,
  type AutomodKind,
  type AutomodRule,
} from "@/lib/automod";
import { apiFetch } from "../lib/client";

/**
 * A rule as this panel tracks it. `AutomodRule` has no `enabled` field because
 * the API never returns a rule without one, so the list adds the flag itself.
 */
type PanelRule = AutomodRule & { enabled: boolean };

export interface AutomodPanelProps {
  serverId: string;
  /** Only used in copy, so the panel can name the server it is protecting. */
  serverName: string;
  canManageServer: boolean;
  onRequestConfirm: (options: {
    title: string;
    message?: string;
    isDanger?: boolean;
    confirmText?: string;
    onConfirm: () => void;
  }) => void;
}

const KIND_LABELS: Record<AutomodKind, string> = {
  keyword: "Blocked words",
  mention_limit: "Mention limit",
  link: "Link filter",
  caps: "Excessive caps",
  repeat: "Repeated messages",
};

/** What each kind actually refuses, shown under the type picker. */
const KIND_HELP: Record<AutomodKind, string> = {
  keyword:
    "Refuses messages containing any of the listed words, matched on whole words and ignoring case.",
  mention_limit: "Refuses messages that mention more people than the limit allows.",
  link:
    "Refuses messages containing links outside the allow-list. An entry also covers its subdomains, so example.com allows cdn.example.com.",
  caps: "Refuses messages that are mostly capital letters.",
  repeat: "Refuses the same message posted over and over in one channel.",
};

/** The summary line an operator scans instead of reading the raw config. */
export function summarizeRule(rule: AutomodRule): string {
  const config = rule.config;
  switch (config.kind) {
    case "keyword":
      return `${config.words.length} blocked ${
        config.words.length === 1 ? "word" : "words"
      }${config.regex ? " (regular expressions)" : ""}`;
    case "mention_limit":
      return `max ${config.max} ${config.max === 1 ? "mention" : "mentions"}`;
    case "link":
      // An empty allow-list is not "no restriction" — it refuses every link,
      // which is worth spelling out rather than showing as nothing at all.
      return config.allow.length
        ? `allow only ${config.allow.join(", ")}`
        : "allow no links";
    case "caps":
      return `mostly caps over ${config.minLetters} letters, at ${config.percent}%`;
    case "repeat":
      return `max ${config.maxRepeats} ${
        config.maxRepeats === 1 ? "repeat" : "repeats"
      }`;
  }
}

/** Plain-language duration, so "10080" is never what the operator has to read. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 minutes";
  const parts: string[] = [];
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = Math.floor(minutes % 60);
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (mins) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

/** What happens to the author, not to the message, once a rule matches. */
export function describeAction(rule: AutomodRule): string {
  if (rule.action !== "timeout") return "message refused";
  return `message refused, ${formatMinutes(rule.timeoutMinutes)} timeout`;
}

const ACTION_LABELS: Record<AutomodAction, string> = {
  block: "Refuse the message",
  timeout: "Refuse the message and time the author out",
};

/**
 * Mirrors the server's own coercion (`positiveInt` in `lib/automod.ts`).
 *
 * Numbers arrive from `type="number"` inputs, which hand back 0 for an emptied
 * field and `NaN` for nonsense, so anything unusable falls back to the same
 * default the server would have used rather than saving a 0 whose meaning the
 * evaluator would silently change.
 */
function clampInt(value: number, fallback: number, max: number): number {
  const parsed = Math.floor(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

/**
 * Splits a textarea into config entries.
 *
 * Commas are accepted alongside newlines because both are how people write a
 * list; a keyword phrase that genuinely contains a comma is not worth the extra
 * syntax to support.
 */
function entriesOf(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,]+/)) {
    const entry = raw.trim();
    if (entry) seen.add(entry);
  }
  return [...seen];
}

/** Every per-kind input lives in one flat draft, keyed by intent not by kind. */
interface RuleDraft {
  kind: AutomodKind;
  action: AutomodAction;
  timeoutMinutes: number;
  words: string;
  regex: boolean;
  maxMentions: number;
  allow: string;
  minLetters: number;
  percent: number;
  maxRepeats: number;
}

/**
 * The defaults shown before anything is typed.
 *
 * They match `DEFAULTS` in `lib/automod.ts` on purpose: what the operator sees
 * in an untouched form is then what the server would have chosen anyway. The
 * keyword field is deliberately empty, because a keyword rule with no words can
 * never match and the API rejects it outright.
 */
function emptyDraft(): RuleDraft {
  return {
    kind: "keyword",
    action: "block",
    timeoutMinutes: 10,
    words: "",
    regex: false,
    maxMentions: 5,
    allow: "",
    minLetters: 12,
    percent: 70,
    maxRepeats: 3,
  };
}

/** Turns the flat draft into the body the API expects for one kind. */
function draftConfig(draft: RuleDraft): AutomodConfig {
  switch (draft.kind) {
    case "keyword":
      return { kind: "keyword", words: entriesOf(draft.words), regex: draft.regex };
    case "mention_limit":
      return { kind: "mention_limit", max: clampInt(draft.maxMentions, 5, 100) };
    case "link":
      return { kind: "link", allow: entriesOf(draft.allow) };
    case "caps":
      return {
        kind: "caps",
        minLetters: clampInt(draft.minLetters, 12, 1000),
        percent: clampInt(draft.percent, 70, 100),
      };
    case "repeat":
      return { kind: "repeat", maxRepeats: clampInt(draft.maxRepeats, 3, 50) };
  }
}

/** Reopens an existing rule in the form, so editing never starts from scratch. */
function draftFromRule(rule: PanelRule): RuleDraft {
  const draft = {
    ...emptyDraft(),
    kind: rule.kind,
    action: rule.action,
    // A block-only rule stores 0, which would render as an empty-looking field
    // the moment the operator switches the action over to timeout.
    timeoutMinutes: rule.timeoutMinutes || 10,
  };
  switch (rule.config.kind) {
    case "keyword":
      return {
        ...draft,
        words: rule.config.words.join("\n"),
        regex: rule.config.regex,
      };
    case "mention_limit":
      return { ...draft, maxMentions: rule.config.max };
    case "link":
      return { ...draft, allow: rule.config.allow.join("\n") };
    case "caps":
      return {
        ...draft,
        minLetters: rule.config.minLetters,
        percent: rule.config.percent,
      };
    case "repeat":
      return { ...draft, maxRepeats: rule.config.maxRepeats };
  }
}

export function AutomodPanel({
  serverId,
  serverName,
  canManageServer,
  onRequestConfirm,
}: AutomodPanelProps) {
  const [rules, setRules] = useState<PanelRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  /** null means the form is shut; "new" means creating; anything else is a rule id. */
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The rule whose toggle is in flight, so only that row locks up. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const formId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ rules: AutomodRule[] }>(
        `/api/automod?serverId=${encodeURIComponent(serverId)}`,
      );
      // The server reports `enabled` per rule, including paused ones, so the
      // flag is taken as given. Defaulting a missing flag to true keeps this
      // working against an older server that only returned live rules.
      setRules(
        (data.rules || []).map((rule) => ({
          ...rule,
          enabled: (rule as AutomodRule & { enabled?: boolean }).enabled !== false,
        })),
      );
      setNotice("");
    } catch (error) {
      setRules([]);
      setNotice(
        error instanceof Error ? error.message : "Could not load automod rules.",
      );
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setDraft(emptyDraft());
    setEditing("new");
    setNotice("");
  }

  function startEdit(rule: PanelRule) {
    setDraft(draftFromRule(rule));
    setEditing(rule.id);
    setNotice("");
  }

  function closeForm() {
    setEditing(null);
    setDraft(emptyDraft());
  }

  async function toggleRule(rule: PanelRule) {
    const next = !rule.enabled;
    setBusyId(rule.id);
    try {
      await apiFetch(`/api/automod/${encodeURIComponent(rule.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: next }),
      });
      // Local rather than refetched — see the note at the top of the file: the
      // list endpoint stops returning a rule the moment it is switched off.
      setRules((current) =>
        current.map((row) => (row.id === rule.id ? { ...row, enabled: next } : row)),
      );
      setNotice(next ? "Rule is active again." : "Rule paused. Posts that it would have refused now go through.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not change that rule.");
    } finally {
      setBusyId(null);
    }
  }

  function removeRule(rule: PanelRule) {
    onRequestConfirm({
      title: `Delete the ${KIND_LABELS[rule.kind].toLowerCase()} rule?`,
      message: `${summarizeRule(rule)}. Messages it would have refused will go through again.`,
      isDanger: true,
      confirmText: "Delete Rule",
      onConfirm: async () => {
        try {
          await apiFetch(`/api/automod/${encodeURIComponent(rule.id)}`, {
            method: "DELETE",
          });
          setRules((current) => current.filter((row) => row.id !== rule.id));
          if (editing === rule.id) closeForm();
          setNotice("Rule deleted.");
        } catch (error) {
          setNotice(
            error instanceof Error ? error.message : "Could not delete that rule.",
          );
        }
      },
    });
  }

  async function saveRule() {
    const config = draftConfig(draft);
    if (config.kind === "keyword" && !config.words.length) {
      // The API answers this with a 400; catching it here says so in the same
      // breath as the empty field rather than after a round trip.
      setNotice("A keyword rule needs at least one word to look for.");
      return;
    }

    const body = {
      kind: draft.kind,
      action: draft.action,
      // The column is meaningless for a block-only rule and the API zeroes it
      // anyway; sending 0 keeps what is displayed equal to what is stored.
      timeoutMinutes:
        draft.action === "timeout" ? clampInt(draft.timeoutMinutes, 10, 10080) : 0,
      config,
    };

    setSaving(true);
    try {
      if (editing && editing !== "new") {
        await apiFetch(`/api/automod/${encodeURIComponent(editing)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/automod", {
          method: "POST",
          body: JSON.stringify({ serverId, ...body }),
        });
      }
      // The saved rule is the authority on its own shape (the server clamps and
      // defaults), so the list is reloaded rather than patched locally.
      closeForm();
      await load();
      setNotice(
        editing && editing !== "new"
          ? "Rule updated."
          : "Rule created. It applies to the next message posted.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save that rule.");
    } finally {
      setSaving(false);
    }
  }
  const fieldId = (name: string) => `${formId}-${name}`;
  const update = (patch: Partial<RuleDraft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <div className="tab-pane automod-pane">
      <div className="roles-toolbar">
        <div>
          <h1 className="pane-title">AutoMod</h1>
          <p className="pane-subtitle">
            Every message posted in {serverName} is checked against these rules before
            it appears.
          </p>
        </div>
        <div className="button-group">
          <button
            type="button"
            className="discord-btn secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
          {canManageServer && !editing && (
            <button
              type="button"
              className="discord-btn primary-indigo"
              onClick={startCreate}
            >
              <Plus size={16} style={{ marginRight: 6 }} /> Create Rule
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p className="pane-subtitle" role="status" style={{ color: "#f0b232" }}>
          {notice}
        </p>
      )}

      {!canManageServer && (
        <p className="pane-subtitle">
          You can read these rules, but only members with Manage Server can change them.
        </p>
      )}

      {canManageServer && editing && (
        <form
          className="automod-form"
          aria-label={editing === "new" ? "New automod rule" : "Edit automod rule"}
          onSubmit={(event) => {
            event.preventDefault();
            void saveRule();
          }}
        >
          <div className="form-field">
            <label htmlFor={fieldId("kind")}>Rule type</label>
            <select
              id={fieldId("kind")}
              className="discord-text-input"
              value={draft.kind}
              // A rule's type is what its row is; changing it means a new rule.
              disabled={editing !== "new"}
              onChange={(event) => update({ kind: event.target.value as AutomodKind })}
            >
              {AUTOMOD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <p className="field-hint">{KIND_HELP[draft.kind]}</p>
          </div>

          {draft.kind === "keyword" && (
            <div className="form-field">
              <label htmlFor={fieldId("words")}>Words or phrases</label>
              <textarea
                id={fieldId("words")}
                className="discord-text-input"
                rows={4}
                value={draft.words}
                placeholder={"one per line, or separated by commas"}
                onChange={(event) => update({ words: event.target.value })}
              />
              <label className="automod-check">
                <input
                  type="checkbox"
                  checked={draft.regex}
                  onChange={(event) => update({ regex: event.target.checked })}
                />
                <span>Treat entries as regular expressions</span>
              </label>
            </div>
          )}

          {draft.kind === "mention_limit" && (
            <NumberField
              id={fieldId("max")}
              label="Most mentions allowed in one message"
              value={draft.maxMentions}
              max={100}
              onChange={(value) => update({ maxMentions: value })}
            />
          )}

          {draft.kind === "link" && (
            <div className="form-field">
              <label htmlFor={fieldId("allow")}>Allowed sites</label>
              <textarea
                id={fieldId("allow")}
                className="discord-text-input"
                rows={3}
                value={draft.allow}
                placeholder={"youtube.com\ntenor.com   (leave empty to block every link)"}
                onChange={(event) => update({ allow: event.target.value })}
              />
            </div>
          )}

          {draft.kind === "caps" && (
            <>
              <NumberField
                id={fieldId("percent")}
                label="Refuse when more than this % of letters are capitals"
                value={draft.percent}
                max={100}
                onChange={(value) => update({ percent: value })}
              />
              <NumberField
                id={fieldId("letters")}
                label="Only check messages with at least this many letters"
                value={draft.minLetters}
                max={1000}
                onChange={(value) => update({ minLetters: value })}
              />
            </>
          )}

          {draft.kind === "repeat" && (
            <NumberField
              id={fieldId("repeats")}
              label="Identical messages allowed within 10 minutes"
              value={draft.maxRepeats}
              max={50}
              onChange={(value) => update({ maxRepeats: value })}
            />
          )}

          <div className="form-field">
            <label htmlFor={fieldId("action")}>When it matches</label>
            <select
              id={fieldId("action")}
              className="discord-text-input"
              value={draft.action}
              onChange={(event) => update({ action: event.target.value as AutomodAction })}
            >
              {AUTOMOD_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
              ))}
            </select>
          </div>

          {draft.action === "timeout" && (
            <NumberField
              id={fieldId("timeout")}
              label={`Timeout length in minutes (${formatMinutes(draft.timeoutMinutes)})`}
              value={draft.timeoutMinutes}
              max={10080}
              onChange={(value) => update({ timeoutMinutes: value })}
            />
          )}

          <div className="button-group">
            <button type="button" className="discord-btn secondary" onClick={closeForm}>
              Cancel
            </button>
            <button type="submit" className="discord-btn primary-indigo" disabled={saving}>
              {saving ? "Saving…" : editing === "new" ? "Create Rule" : "Save Rule"}
            </button>
          </div>
        </form>
      )}

      {loading && !rules.length ? (
        <p className="pane-subtitle">Loading automod rules…</p>
      ) : !rules.length ? (
        <div className="empty-illustration-box">
          <span className="illustration-graphic" aria-hidden="true">
            <Shield size={42} />
          </span>
          <h2>NO AUTOMOD RULES</h2>
          <p>
            AutoMod reads each message as it is posted and either refuses it, or
            refuses it and times the author out.
          </p>
          <p>
            Moderators are never subject to these rules, and direct messages between
            two people are never filtered.
          </p>
        </div>
      ) : (
        <ul className="ban-list">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="ban-row"
              // A paused rule is dimmed rather than hidden, so the operator can
              // see what they switched off and switch it straight back on.
              style={{ opacity: rule.enabled ? 1 : 0.55 }}
            >
              <span className="ban-who">
                <strong>{KIND_LABELS[rule.kind]}</strong>
                <small>
                  {summarizeRule(rule)} · {describeAction(rule)}
                </small>
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginLeft: "auto",
                }}
              >
                {canManageServer ? (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      color: "#b5bac1",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      disabled={busyId === rule.id}
                      onChange={() => void toggleRule(rule)}
                      // Each row's switch needs its own name; "Enabled" alone
                      // would be ambiguous read out of context.
                      aria-label={`${KIND_LABELS[rule.kind]} rule: ${summarizeRule(rule)}. ${
                        rule.enabled ? "Enabled" : "Disabled"
                      }`}
                    />
                    <span>{rule.enabled ? "Enabled" : "Disabled"}</span>
                  </label>
                ) : (
                  <span style={{ fontSize: 13, color: "#b5bac1" }}>
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </span>
                )}
                {canManageServer && (
                  <>
                    <button
                      type="button"
                      className="discord-btn secondary"
                      onClick={() => startEdit(rule)}
                      aria-label={`Edit the ${KIND_LABELS[rule.kind].toLowerCase()} rule`}
                    >
                      <Pencil size={14} style={{ marginRight: 4 }} /> Edit
                    </button>
                    <button
                      type="button"
                      className="discord-btn danger-btn"
                      onClick={() => removeRule(rule)}
                      aria-label={`Delete the ${KIND_LABELS[rule.kind].toLowerCase()} rule`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {rules.some((rule) => !rule.enabled) && (
        <p className="field-hint">
          Paused rules stay listed here so you can turn them back on.
        </p>
      )}
    </div>
  );
}


function NumberField({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={1}
        max={max}
        className="discord-text-input"
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </div>
  );
}
