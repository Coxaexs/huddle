/** Server welcome screen: rules plus an optional intro form for newcomers. */

export type WelcomeFieldType = "text" | "long" | "date";

export interface WelcomeField {
  id: string;
  label: string;
  type: WelcomeFieldType;
  required: boolean;
}

export interface WelcomeConfig {
  enabled: boolean;
  rules: string;
  fields: WelcomeField[];
}

export const MAX_WELCOME_FIELDS = 10;
export const MAX_RULES_LENGTH = 4000;
export const MAX_ANSWER_LENGTH = 1000;

const TYPES: WelcomeFieldType[] = ["text", "long", "date"];

/** Cleans an owner-supplied field list: known types, trimmed labels, unique ids. */
export function sanitizeFields(raw: unknown): WelcomeField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const fields: WelcomeField[] = [];
  for (const item of raw) {
    if (fields.length >= MAX_WELCOME_FIELDS) break;
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const label = String(entry.label ?? "").trim().slice(0, 80);
    if (!label) continue;
    let id = String(entry.id ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
    if (!id || seen.has(id)) id = `f${fields.length}_${Math.random().toString(36).slice(2, 7)}`;
    seen.add(id);
    const type = TYPES.includes(entry.type as WelcomeFieldType) ? (entry.type as WelcomeFieldType) : "text";
    fields.push({ id, label, type, required: Boolean(entry.required) });
  }
  return fields;
}

/** Checks a newcomer's answers against the form. Returns the cleaned answers or an error. */
export function validateAnswers(
  fields: WelcomeField[],
  raw: unknown,
): { answers: Record<string, string> } | { error: string } {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const answers: Record<string, string> = {};
  for (const field of fields) {
    const value = String(input[field.id] ?? "").trim().slice(0, MAX_ANSWER_LENGTH);
    if (!value) {
      if (field.required) return { error: `"${field.label}" is required.` };
      continue;
    }
    if (field.type === "date") {
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
      if (!valid) return { error: `"${field.label}" needs a valid date.` };
    }
    answers[field.id] = field.type === "long" ? value : value.replace(/\s+/g, " ");
  }
  return { answers };
}

export function parseFields(json: string | null | undefined): WelcomeField[] {
  try {
    return sanitizeFields(JSON.parse(json || "[]"));
  } catch {
    return [];
  }
}
