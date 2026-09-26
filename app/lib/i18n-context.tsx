"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  createTranslator,
  pickLocale,
  resolveLocale,
  type Locale,
  type TranslateFn,
} from "@/lib/i18n";

/**
 * Where the choice is remembered. Deliberately *not* part of the account:
 * language is like theme and the device pickers in this app - a property of where
 * you are sitting, not of who you are. A shared computer should not silently flip
 * the next person's interface, and someone travelling should not have to edit
 * their profile to read a menu. It also means the choice works before sign-in:
 * on the landing page, in a signed-out tab and for the auth screens.
 *
 * The `hoffle_locale` name is fixed by the spec for this foundation. Older
 * preferences here use a `huddle-` prefix; a new key gets the new prefix rather
 * than a legacy alias that would need migrating later.
 */
export const LOCALE_STORAGE_KEY = "hoffle_locale";

export interface I18nContextValue {
  locale: Locale;
  /** Remembers the choice and applies it on the next render. */
  setLocale: (locale: Locale) => void;
  /** Translator bound to the current locale; stable until the locale changes. */
  t: TranslateFn;
}

/**
 * The context default is English rather than a throw.
 *
 * A missing provider in a 10,000-line shell would otherwise white-screen the
 * whole app, which is a far worse failure than English strings: this foundation
 * lands while other surfaces are still being converted, so the safe degradation
 * is "renders in English" and not "renders nothing". The name of the hook is
 * enough warning for a developer; the user should never pay for our mistake.
 */
const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: createTranslator(DEFAULT_LOCALE),
});

/**
 * The stored choice, or null when there is none (or when we cannot read it).
 *
 * `resolveLocale` runs on the way out so a value written by an older build, a
 * hand-edited devtools entry or a regional code still lands on something we
 * ship instead of being trusted verbatim.
 */
export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!stored) return null;
    return resolveLocale(stored);
  } catch {
    // localStorage throws in Safari private mode and wherever site data is
    // blocked. A language preference is not worth a crash on first paint.
    return null;
  }
}

/**
 * The language to use when nobody has chosen yet: the browser's own preference
 * list, run through the same parser as an `Accept-Language` header. Going
 * through one code path means a bug in q-value handling cannot make the picker
 * and the server disagree about the same preference.
 *
 * Detection runs once, at startup. A `languagechange` listener would let us
 * follow an OS change mid-session, but the event barely fires in practice, and
 * switching under someone's cursor while they are reading a menu is worse than
 * making them reload. The stored choice always wins over detection.
 */
function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const languages = window.navigator?.languages;
  const header = languages && languages.length > 0 ? languages.join(",") : window.navigator?.language;
  return pickLocale(header);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // English for the server render and the first client paint, then adopt the
  // stored/detected language in an effect. Reading localStorage during render
  // would make the first client render disagree with the server HTML, and React
  // resolves that by throwing the tree away and re-rendering - a visible flash
  // for every user on every load. The cost of the effect is a one-frame
  // English-only paint for people who chose something else, which is the smaller
  // of the two evils and needs no `suppressHydrationWarning` anywhere.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const next = readStoredLocale() ?? detectLocale();
    setLocaleState((current) => (current === next ? current : next));
  }, []);

  useEffect(() => {
    // `<html lang>` is what screen readers use to pick a pronunciation, what
    // browsers use for spell-check and hyphenation, and what CSS `:lang()` sees.
    // It has to follow the interface, not the operating system.
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Same reasoning as readStoredLocale: a blocked storage area must not stop
      // someone from switching language for this session.
    }
  }, []);

  // `t` is rebuilt only when the locale changes. A fresh function on every
  // render would retrigger every effect that lists `t` as a dependency, and with
  // a context value that changes identity each render, every consumer re-renders
  // on every provider render.
  const t = useMemo(() => createTranslator(locale), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Reads the current locale, the setter and a bound translator. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
