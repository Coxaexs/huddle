import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  ENGLISH_CATALOG,
  LOCALES,
  MESSAGE_KEYS,
  baseLanguage,
  createTranslator,
  formatNumber,
  isSupportedLocale,
  pickLocale,
  resolveLocale,
  translate,
  type MessageKey,
} from "./i18n";

/**
 * Tests are written against real ids from the shipped catalogs wherever a real
 * one proves the point, and against an injected `catalogs` map where the point
 * *is* the fallback order: every locale we ship is complete, so an incomplete
 * catalog is the only way to reach the English and key-id branches.
 */

/**
 * Blanks the built-in English so a lookup has to succeed *in the requested
 * locale*. Used by the catalog-completeness tests: `translate` would otherwise
 * quietly answer with English and hide a missing translation.
 */
const withoutEnglish = { catalogs: { en: {} } };

/**
 * The catalogs that are translations *of* English. English itself is checked
 * against ENGLISH_CATALOG directly - running it through the "blank English"
 * trick below would only prove that blanking English works.
 */
const translatedLocales = LOCALES.filter((entry) => entry.code !== "en");

describe("translate interpolation", () => {
  it("substitutes a named value", () => {
    expect(translate("en", "auth.welcomeBack", { name: "Ada" })).toBe("Welcome back, Ada");
  });

  it("substitutes several placeholders in one string", () => {
    // `chat.typing` has one; reuse a synthetic string through a catalog override
    // to prove multiple placeholders are all replaced, not just the first.
    const catalogs = { en: { "auth.welcomeBack": "{name}, {name} again" } };
    expect(translate("en", "auth.welcomeBack", { name: "Ada" }, { catalogs })).toBe(
      "Ada, Ada again",
    );
  });

  it("leaves an unmatched placeholder visible so the missing argument is debuggable", () => {
    expect(translate("en", "auth.welcomeBack")).toBe("Welcome back, {name}");
    expect(translate("en", "auth.welcomeBack", { other: "Ada" })).toBe("Welcome back, {name}");
  });

  it("keeps a null or undefined value from blanking the placeholder", () => {
    expect(translate("en", "auth.welcomeBack", { name: undefined })).toBe("Welcome back, {name}");
  });

  it("does not re-scan text that was substituted in", () => {
    // Otherwise a user whose display name is literally `{password}` would be
    // able to reach into the catalog, and every substitution would be a loop.
    expect(translate("en", "auth.welcomeBack", { name: "{name}" })).toBe("Welcome back, {name}");
  });

  it("formats numeric values with the grouping of the string's language", () => {
    expect(translate("en", "members.count", { count: 1234 })).toBe("1,234 members");
    expect(translate("de", "members.count", { count: 1234 })).toBe("1.234 Mitglieder");
    expect(translate("pt-BR", "members.count", { count: 1234 })).toBe("1.234 membros");
  });
});

describe("translate fallback chain", () => {
  it("uses the requested locale", () => {
    expect(translate("de", "common.cancel")).toBe("Abbrechen");
    expect(translate("nl", "common.cancel")).toBe("Annuleren");
  });

  it("normalizes the requested locale first", () => {
    expect(translate("DE_de", "common.cancel")).toBe("Abbrechen");
    expect(translate("es-MX", "common.cancel")).toBe("Cancelar");
  });

  it("prefers the requested locale over its base language", () => {
    const catalogs = {
      "pt-BR": { "common.cancel": "Cancelar (BR)" },
      pt: { "common.cancel": "Cancelar (PT)" },
    };
    expect(translate("pt-BR", "common.cancel", undefined, { catalogs })).toBe("Cancelar (BR)");
  });

  it("falls to the base language when the locale has no string", () => {
    const catalogs = {
      "pt-BR": {},
      pt: { "common.cancel": "Cancelar (PT)" },
    };
    expect(translate("pt-BR", "common.cancel", undefined, { catalogs })).toBe("Cancelar (PT)");
  });

  it("falls to English when neither the locale nor its base language has a string", () => {
    // The override merges per language, so English is the real catalog here
    // while pt-BR and its base language are emptied out.
    const catalogs = { "pt-BR": {}, pt: {} };
    expect(translate("pt-BR", "common.cancel", undefined, { catalogs })).toBe("Cancel");
    // No entry for the locale or its base at all: the chain skips to English.
    expect(translate("es", "common.save", undefined, { catalogs: { es: {} } })).toBe("Save");
  });

  it("treats an empty catalog entry as missing rather than rendering nothing", () => {
    const catalogs = { es: { "common.save": "" } };
    expect(translate("es", "common.save", undefined, { catalogs })).toBe("Save");
  });

  it("treats a blank string value as an empty substitution, not as a reason to skip", () => {
    // A var that is an empty string is a real value ("", not "missing"), so the
    // placeholder is replaced by nothing - which is correct here and distinct
    // from an unmatched placeholder.
    expect(translate("en", "auth.welcomeBack", { name: "" })).toBe("Welcome back, ");
  });

  it("returns the id itself when nothing in the chain has the string", () => {
    const catalogs = { es: {}, en: {} };
    const missing = "not.a.real.key" as MessageKey;
    expect(translate("es", missing, undefined, { catalogs })).toBe("not.a.real.key");
  });

  it("never returns an empty string for any shipped id in any locale", () => {
    for (const { code } of LOCALES) {
      for (const key of MESSAGE_KEYS) {
        const value = translate(code, key);
        expect(value.length, `${code}/${key} rendered empty`).toBeGreaterThan(0);
      }
    }
  });

  it("folds an unknown or absent locale into the default", () => {
    expect(translate("xx-YY", "common.save")).toBe("Save");
    expect(translate(null, "common.save")).toBe("Save");
    expect(translate(undefined, "common.save")).toBe("Save");
    expect(translate("", "common.save")).toBe("Save");
    expect(translate("   ", "common.save")).toBe("Save");
  });

  it("does not leak inherited object properties into a label", () => {
    // `catalog["constructor"]` is a function and `catalog["toString"]` is too;
    // the lookup guard is what stops them from being rendered. No override here:
    // the miss has to happen against the real English catalog.
    expect(translate("en", "constructor" as MessageKey)).toBe("constructor");
    expect(translate("en", "toString" as MessageKey)).toBe("toString");
  });
});

describe("pluralization", () => {
  it("picks one and other in English at 0, 1 and 2", () => {
    expect(translate("en", "members.count", { count: 0 })).toBe("0 members");
    expect(translate("en", "members.count", { count: 1 })).toBe("1 member");
    expect(translate("en", "members.count", { count: 2 })).toBe("2 members");
  });

  it("uses the language's own plural rules", () => {
    // French and Brazilian Portuguese count 0 as `one` (CLDR), English does not.
    expect(translate("fr", "members.count", { count: 0 })).toBe("0 membre");
    expect(translate("fr", "members.count", { count: 1 })).toBe("1 membre");
    expect(translate("fr", "members.count", { count: 2 })).toBe("2 membres");
    expect(translate("pt-BR", "members.count", { count: 0 })).toBe("0 membro");
    expect(translate("pt-BR", "members.count", { count: 1 })).toBe("1 membro");
    expect(translate("pt-BR", "members.count", { count: 2 })).toBe("2 membros");
    expect(translate("de", "members.count", { count: 1 })).toBe("1 Mitglied");
    expect(translate("de", "members.count", { count: 2 })).toBe("2 Mitglieder");
    expect(translate("es", "members.count", { count: 1 })).toBe("1 miembro");
    expect(translate("nl", "members.count", { count: 1 })).toBe("1 lid");
  });

  it("applies the plural rules of the catalog it actually read", () => {
    // Emptying the French catalog forces the English sentence, and an English
    // sentence needs English rules: English says 0 is `other` while French would
    // have said `one`. Using the reader's locale here yields the unmistakably
    // broken "0 message".
    expect(translate("fr", "messages.count", { count: 0 }, { catalogs: { fr: {} } })).toBe(
      "0 messages",
    );
  });

  it("uses `other` for a count we ship no category for", () => {
    // 5 is `other` in every shipped language, but the point is the mechanism:
    // a category with no key walks down to `.other` rather than to the base id.
    expect(translate("en", "messages.count", { count: 5 })).toBe("5 messages");
    expect(translate("de", "messages.count", { count: 5 })).toBe("5 Nachrichten");
  });

  it("uses `other` when a family is called without a count", () => {
    // No count means no category to choose, so `other` stands in. The untouched
    // placeholder is deliberate: it is visible, where a blank would not be.
    expect(translate("en", "messages.count")).toBe("{count} messages");
  });

  it("does not guess at a count it cannot pluralize", () => {
    // A string count is a legitimate var (vars accept strings) and interpolates
    // as written, but it cannot choose a plural form, so the sentence stays
    // `other` rather than silently becoming "1 message".
    expect(translate("en", "messages.count", { count: "2" as unknown as number })).toBe(
      "2 messages",
    );
    // A non-finite number is treated as a missing value: the placeholder stays
    // on screen instead of the UI printing "NaN messages".
    expect(translate("en", "messages.count", { count: Number.NaN })).toBe("{count} messages");
    expect(translate("en", "members.count", { count: Number.POSITIVE_INFINITY })).toBe(
      "{count} members",
    );
  });

  it("leaves a non-plural key alone when a count is passed anyway", () => {
    // Callers can pass `count` unconditionally without hunting for plural keys;
    // the two derived ids simply miss.
    expect(translate("en", "common.save", { count: 3 })).toBe("Save");
  });
});

describe("resolveLocale", () => {
  it("maps a regional tag to its base language", () => {
    expect(resolveLocale("es-MX")).toBe("es");
    expect(resolveLocale("de-AT")).toBe("de");
    expect(resolveLocale("en-GB")).toBe("en");
    expect(resolveLocale("fr_CA")).toBe("fr");
  });

  it("is case-insensitive and accepts underscores", () => {
    expect(resolveLocale("EN_us")).toBe("en");
    expect(resolveLocale("ES")).toBe("es");
    expect(resolveLocale("PT-br")).toBe("pt-BR");
  });

  it("keeps a region when we ship that exact catalog", () => {
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
  });

  it("sends a bare base language to the closest catalog we ship", () => {
    // Documented tradeoff: we only have Brazilian Portuguese, so `pt` and a
    // European `pt-PT` both land there rather than falling into English.
    expect(resolveLocale("pt")).toBe("pt-BR");
    expect(resolveLocale("pt-PT")).toBe("pt-BR");
  });

  it("tolerates header syntax pasted into a tag", () => {
    expect(resolveLocale("de-DE;q=0.9")).toBe("de");
    expect(resolveLocale(" de-DE ; q=0.9 ")).toBe("de");
    expect(resolveLocale("de-DE,es;q=0.8")).toBe("de");
  });

  it("returns null for anything we cannot place", () => {
    expect(resolveLocale("xx-YY")).toBeNull();
    expect(resolveLocale("!!!")).toBeNull();
    expect(resolveLocale("en--US")).toBeNull();
    expect(resolveLocale("*")).toBeNull();
    expect(resolveLocale("")).toBeNull();
    expect(resolveLocale("   ")).toBeNull();
    expect(resolveLocale(null)).toBeNull();
    expect(resolveLocale(undefined)).toBeNull();
  });

  it("is a type predicate for exact codes only", () => {
    expect(isSupportedLocale("pt-BR")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("pt-br")).toBe(false);
    expect(isSupportedLocale("constructor")).toBe(false);
    expect(isSupportedLocale("toString")).toBe(false);
  });
});

describe("baseLanguage", () => {
  it("keeps only the primary subtag", () => {
    expect(baseLanguage("pt-BR")).toBe("pt");
    expect(baseLanguage("pt_br")).toBe("pt");
    expect(baseLanguage("EN")).toBe("en");
    expect(baseLanguage("zh-Hant-TW")).toBe("zh");
  });
});


describe("pickLocale / Accept-Language", () => {
  it("falls back to the default for a missing or empty header", () => {
    expect(pickLocale(null)).toBe(DEFAULT_LOCALE);
    expect(pickLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(pickLocale("")).toBe(DEFAULT_LOCALE);
    expect(pickLocale("   ")).toBe(DEFAULT_LOCALE);
  });

  it("picks a listed language, region or not", () => {
    expect(pickLocale("de")).toBe("de");
    expect(pickLocale("de-DE")).toBe("de");
    expect(pickLocale("es-MX,en;q=0.8")).toBe("es");
    expect(pickLocale("fr-CA,fr;q=0.9")).toBe("fr");
    expect(pickLocale("nl-NL,nl;q=0.9,en;q=0.8")).toBe("nl");
  });

  it("orders by q-value, not by position in the header", () => {
    expect(pickLocale("en;q=0.5,de;q=0.9")).toBe("de");
    expect(pickLocale("nl;q=0.2, pt-BR;q=0.7, de;q=0.3")).toBe("pt-BR");
  });

  it("keeps header order when q-values tie", () => {
    expect(pickLocale("de;q=0.9,en;q=0.9")).toBe("de");
    expect(pickLocale("en;q=0.8,de;q=0.8")).toBe("en");
  });

  it("drops q=0 entries, which RFC 9110 spells as 'not acceptable'", () => {
    expect(pickLocale("de;q=0, es;q=0.5")).toBe("es");
    expect(pickLocale("de;q=0")).toBe(DEFAULT_LOCALE);
  });

  it("treats an unreadable q as the default 1 instead of as a rejection", () => {
    // A truncated header should not hide the language the user asked for.
    expect(pickLocale("de;q=abc, es;q=0.1")).toBe("de");
    expect(pickLocale("de;q=, es;q=0.1")).toBe("de");
    expect(pickLocale("de;q")).toBe("de");
  });

  it("clamps an out-of-range q instead of trusting it", () => {
    expect(pickLocale("de;q=3, es;q=2")).toBe("de");
    expect(pickLocale("de;q=-1, es")).toBe("es");
  });

  it("ignores parameters that are not q", () => {
    expect(pickLocale("de;level=1;q=0.4, es;q=0.9")).toBe("es");
    expect(pickLocale("de;charset=utf-8")).toBe("de");
  });

  it("never lets a wildcard beat a language the user named", () => {
    expect(pickLocale("de;q=0.1, *;q=0.9")).toBe("de");
    expect(pickLocale("*;q=1, de;q=0.5")).toBe("de");
  });

  it("treats a wildcard alone as 'you pick', which is the default", () => {
    expect(pickLocale("*")).toBe(DEFAULT_LOCALE);
    expect(pickLocale("*;q=0.5")).toBe(DEFAULT_LOCALE);
  });

  it("skips entries we do not ship and keeps looking", () => {
    expect(pickLocale("sv-SE, nl")).toBe("nl");
    expect(pickLocale("xx-YY;q=1, de;q=0.4")).toBe("de");
    expect(pickLocale("sv-SE")).toBe(DEFAULT_LOCALE);
  });

  it("drops empty entries rather than reading them as a language", () => {
    expect(pickLocale(",,de,,")).toBe("de");
    expect(pickLocale(";q=0.9,es")).toBe("es");
  });

  it("survives garbage without throwing", () => {
    const junk = ["!!!", "???;q=1,,", ";", ";;;;", "q=", "\u0000\u0001", "-", "  ,  "];
    for (const header of junk) {
      expect(() => pickLocale(header), `threw on ${JSON.stringify(header)}`).not.toThrow();
      expect(pickLocale(header)).toBe(DEFAULT_LOCALE);
    }
  });

  it("prefers the first acceptable language of a real browser header", () => {
    expect(pickLocale("de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("de");
    expect(pickLocale("pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("pt-BR");
    expect(pickLocale("ja,en-US;q=0.9,en;q=0.8")).toBe("en");
  });
});


describe("locale registry", () => {
  it("ships the six locales the foundation promises", () => {
    expect(LOCALES.map((locale) => locale.code)).toEqual(["en", "es", "de", "fr", "pt-BR", "nl"]);
  });

  it("starts with the default locale and recognizes it", () => {
    expect(LOCALES[0].code).toBe(DEFAULT_LOCALE);
    expect(isSupportedLocale(DEFAULT_LOCALE)).toBe(true);
  });

  it("gives every locale a distinct, non-empty endonym and an exonym", () => {
    for (const locale of LOCALES) {
      expect(locale.name.trim().length, `${locale.code} has no endonym`).toBeGreaterThan(0);
      expect(locale.englishName.trim().length, `${locale.code} has no exonym`).toBeGreaterThan(0);
    }
    // Endonyms are what a lost reader scans for, so two languages cannot share one.
    expect(new Set(LOCALES.map((locale) => locale.name)).size).toBe(LOCALES.length);
  });
});

describe("catalog integrity", () => {
  it("carries a realistic number of ids", () => {
    // A floor, not a target: it catches a bad merge that empties a catalog
    // instead of letting one quiet edit shrink the app's vocabulary.
    expect(MESSAGE_KEYS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(MESSAGE_KEYS).size).toBe(MESSAGE_KEYS.length);
  });

  it("covers both plural variants of every family in English", () => {
    for (const family of ["members.count", "messages.count"]) {
      for (const category of ["one", "other"]) {
        expect(MESSAGE_KEYS).toContain(`${family}.${category}`);
      }
    }
  });

  it("has non-empty English text for every id", () => {
    for (const key of MESSAGE_KEYS) {
      expect(ENGLISH_CATALOG[key].trim().length, `en/${key} is empty`).toBeGreaterThan(0);
    }
  });

  it("is complete in every locale, not quietly answered by English", () => {
    for (const { code } of translatedLocales) {
      for (const key of MESSAGE_KEYS) {
        const value = translate(code, key, undefined, withoutEnglish);
        expect(value, `${code} is missing ${key}`).not.toBe(key);
        expect(value.trim().length, `${code}/${key} is blank`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every placeholder of the English string in every translation", () => {
    // The highest-value lint a catalog can have: `{name}` and `{count}` are the
    // only parts of a sentence a program can get wrong silently.
    const placeholders = (text: string) => text.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
    for (const { code } of translatedLocales) {
      for (const key of MESSAGE_KEYS) {
        const translated = translate(code, key, undefined, withoutEnglish);
        expect(placeholders(translated), `${code}/${key} changed its placeholders`).toEqual(
          placeholders(ENGLISH_CATALOG[key]),
        );
      }
    }
  });

  it("translates rather than copies English for the ids that are sentences", () => {
    // A few labels are legitimately identical in some languages ("Notifications"
    // in French). Sentences never are, so they are the honest smoke test that a
    // catalog is not an English placeholder pretending to be a translation.
    const sentences: MessageKey[] = [
      "auth.sessionExpired",
      "auth.invalidCredentials",
      "errors.network",
      "settings.language.description",
    ];
    for (const locale of translatedLocales) {
      for (const key of sentences) {
        expect(
          translate(locale.code, key, undefined, withoutEnglish),
          `${locale.code}/${key} looks untranslated`,
        ).not.toBe(ENGLISH_CATALOG[key]);
      }
    }
  });
});

describe("helpers", () => {
  it("binds a translator to one locale", () => {
    const t = createTranslator("pt-BR");
    expect(t("common.send")).toBe("Enviar");
    expect(t("members.count", { count: 2 })).toBe("2 membros");
  });

  it("resolves a loose locale once when creating a translator", () => {
    expect(createTranslator("ES_mx")("common.cancel")).toBe("Cancelar");
    expect(createTranslator("xx-YY")("common.save")).toBe("Save");
    expect(createTranslator(null)("common.save")).toBe("Save");
  });

  it("formats numbers with the reader's grouping", () => {
    expect(formatNumber("en", 1234)).toBe("1,234");
    expect(formatNumber("de", 1234)).toBe("1.234");
    expect(formatNumber("pt-BR", 1234)).toBe("1.234");
    expect(formatNumber(null, 5)).toBe("5");
  });
});

