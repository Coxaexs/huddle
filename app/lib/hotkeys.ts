/**
 * Keyboard shortcuts for the voice controls.
 *
 * A combo is stored as modifiers plus the physical key code, joined with "+",
 * e.g. `Ctrl+Shift+KeyM`. Using `event.code` (not `key`) keeps a shortcut on the
 * same physical key regardless of layout, which matters on a Turkish keyboard.
 */

export interface Hotkey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
}

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

/** True while the event is only a modifier being held. */
export function isModifierOnly(code: string): boolean {
  return MODIFIER_CODES.has(code);
}

export function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(event.code);
  return parts.join("+");
}

export function parseCombo(combo: string): Hotkey | null {
  if (!combo) return null;
  const parts = combo.split("+");
  const code = parts.pop();
  if (!code) return null;
  return {
    ctrl: parts.includes("Ctrl"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    meta: parts.includes("Meta"),
    code,
  };
}

export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const parsed = parseCombo(combo);
  if (!parsed) return false;
  return (
    event.code === parsed.code &&
    event.ctrlKey === parsed.ctrl &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift &&
    event.metaKey === parsed.meta
  );
}

/** "Ctrl+Shift+KeyM" → "Ctrl + Shift + M", for the settings button. */
export function comboLabel(combo: string): string {
  const parsed = parseCombo(combo);
  if (!parsed) return "Not set";
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  if (parsed.meta) parts.push("Meta");
  parts.push(
    parsed.code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace(/^Numpad/, "Num "),
  );
  return parts.join(" + ");
}

/**
 * Converts a stored combo into an Electron accelerator, so the desktop shell
 * can register the same shortcut globally. Returns "" when it cannot be
 * expressed (Electron needs a real key, not a bare modifier).
 */
export function comboToAccelerator(combo: string): string {
  const parsed = parseCombo(combo);
  if (!parsed || isModifierOnly(parsed.code)) return "";
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("CommandOrControl");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  if (parsed.meta) parts.push("Super");

  const code = parsed.code;
  let key = "";
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (code === "Space") key = "Space";
  else if (code === "Enter") key = "Return";
  else if (code === "Backquote") key = "`";
  else return "";

  parts.push(key);
  return parts.join("+");
}

/**
 * True when the shortcut should be ignored because the person is typing.
 * Without this a single-key shortcut would fire mid-message.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  const tag = element.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    element.isContentEditable === true
  );
}
