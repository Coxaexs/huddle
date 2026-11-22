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

/** Keys that are not letters, digits or F-keys, as Electron accelerators name them. */
const ACCELERATOR_KEYS: Record<string, string> = {
  Space: "Space",
  Enter: "Return",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  NumpadAdd: "numadd",
  NumpadSubtract: "numsub",
  NumpadMultiply: "nummult",
  NumpadDivide: "numdiv",
  NumpadDecimal: "numdec",
};

/** What each key prints on a US keyboard, the fallback when the real layout is unknown. */
const US_LABELS: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  IntlBackslash: "<",
};

let layoutMap: Map<string, string> | null = null;
let layoutLoading: Promise<void> | null = null;

/**
 * Loads what each physical key prints on this person's keyboard (Chromium
 * only), so a Turkish keyboard shows "Alt + Ö" rather than "Alt + Comma".
 */
export function loadKeyboardLayout(): Promise<void> {
  if (layoutLoading) return layoutLoading;
  const keyboard = (globalThis.navigator as Navigator & {
    keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
  } | undefined)?.keyboard;
  layoutLoading = keyboard?.getLayoutMap
    ? keyboard
        .getLayoutMap()
        .then((map) => {
          layoutMap = map;
        })
        .catch(() => undefined)
    : Promise.resolve();
  return layoutLoading;
}

function isMac(): boolean {
  const nav = globalThis.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  return /mac/i.test(nav?.userAgentData?.platform || nav?.platform || "");
}

function keyLabel(code: string): string {
  if (/^F\d{1,2}$/.test(code)) return code;
  if (code === "Space") return "Space";
  if (code === "Enter") return "Enter";
  const printed = layoutMap?.get(code);
  if (printed && printed.trim()) return printed.toLocaleUpperCase();
  if (US_LABELS[code]) return US_LABELS[code];
  return code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Numpad/, "Num ")
    .replace(/^Arrow/, "");
}

/** "Ctrl+Shift+KeyM" → "Ctrl + Shift + M", for the settings button. */
export function comboLabel(combo: string): string {
  const parsed = parseCombo(combo);
  if (!parsed) return "Not set";
  const mac = isMac();
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.alt) parts.push(mac ? "Option" : "Alt");
  if (parsed.shift) parts.push("Shift");
  if (parsed.meta) parts.push(mac ? "Cmd" : "Win");
  parts.push(keyLabel(parsed.code));
  return parts.join(" + ");
}

/**
 * Converts a stored combo into an Electron accelerator, so the desktop shell
 * can register the same shortcut globally. Returns "" when it cannot be
 * expressed (Electron needs a real key, not a bare modifier).
 *
 * Ctrl maps to "Control", not "CommandOrControl": the combo records Cmd as
 * Meta, so on a Mac Ctrl+M must stay Ctrl+M rather than turn into Cmd+M.
 */
export function comboToAccelerator(combo: string): string {
  const parsed = parseCombo(combo);
  if (!parsed || isModifierOnly(parsed.code)) return "";
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Control");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  if (parsed.meta) parts.push("Super");

  const code = parsed.code;
  let key = "";
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^Numpad[0-9]$/.test(code)) key = `num${code.slice(6)}`;
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (ACCELERATOR_KEYS[code]) key = ACCELERATOR_KEYS[code];
  else return "";

  parts.push(key);
  return parts.join("+");
}

/**
 * Why a combo cannot be a shortcut that works in every app, or "" when it can.
 * Shift alone is not enough (it would swallow capital letters everywhere), and
 * copy, paste, cut, undo and select-all stay with the other apps.
 */
export function globalShortcutProblem(combo: string): "" | "modifier" | "key" | "reserved" {
  const parsed = parseCombo(combo);
  if (!parsed || isModifierOnly(parsed.code)) return "key";
  if (!comboToAccelerator(combo)) return "key";
  const fKey = /^F\d{1,2}$/.test(parsed.code);
  if (!parsed.ctrl && !parsed.alt && !parsed.meta && !(parsed.shift && fKey)) return "modifier";
  const onlyCtrlOrCmd = (parsed.ctrl !== parsed.meta) && !parsed.alt && !parsed.shift;
  if (onlyCtrlOrCmd && /^Key[CVXAZ]$/.test(parsed.code)) return "reserved";
  return "";
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
