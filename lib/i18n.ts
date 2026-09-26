/**
 * Internationalization for Hoffle.
 *
 * This module is deliberately dependency-free and framework-free: it runs in
 * the browser, in the Cloudflare Worker and in vitest without a DOM, so the
 * same catalog and the same resolution rules serve every place a string is
 * needed. Anything React-shaped (state, persistence, re-render on change) lives
 * in `app/lib/i18n-context.tsx` on top of this.
 *
 * Three rules drove the design:
 *
 * 1. A missing translation must never render as an empty box. The fallback
 *    chain ends at the message id itself, so a translator's oversight shows up
 *    as `auth.signIn` on screen - obviously wrong, and searchable - instead of a
 *    button that silently loses its label.
 * 2. English is the source of truth. Every other catalog is a partial of the
 *    English key set, which makes a typo in a key a compile error while still
 *    allowing a translation to land one key at a time.
 * 3. Resolution is total. `translate`, `resolveLocale` and `pickLocale` accept
 *    whatever a browser or an `Accept-Language` header throws at them (nulls,
 *    `en_US`, `es-MX`, `q=abc`, `*`) and always answer with something usable.
 */

// ---------------------------------------------------------------------------
// Supported locales
// ---------------------------------------------------------------------------

/**
 * The single source of truth for which locales exist: the `Locale` type is
 * derived from these keys, so adding a language is one entry here plus one
 * catalog below.
 *
 * Names are endonyms - what speakers call their own language - because the
 * picker is read by exactly the person who cannot yet read the interface: a
 * Dutch speaker who has landed in the Spanish UI is scanning for "Nederlands",
 * not "Dutch". `englishName` carries the exonym for logs, docs and search.
 */
const LOCALE_INFO = {
  en: { name: "English", englishName: "English" },
  es: { name: "Español", englishName: "Spanish" },
  de: { name: "Deutsch", englishName: "German" },
  fr: { name: "Français", englishName: "French" },
  "pt-BR": { name: "Português (Brasil)", englishName: "Portuguese (Brazil)" },
  nl: { name: "Nederlands", englishName: "Dutch" },
} as const satisfies Record<string, { name: string; englishName: string }>;

export type Locale = keyof typeof LOCALE_INFO;

/**
 * What the app falls back to. Not configurable on purpose: a build whose
 * fallback depends on a request header is a build where one parsing bug decides
 * whether strings exist at all.
 */
export const DEFAULT_LOCALE: Locale = "en";

export interface LocaleInfo {
  code: Locale;
  /** Endonym, for the picker. */
  name: string;
  /** Exonym in English, for logs, search and docs. */
  englishName: string;
}

/** Picker-ready list, in declaration order (English first). */
export const LOCALES: readonly LocaleInfo[] = (Object.keys(LOCALE_INFO) as Locale[]).map(
  (code) => ({ code, ...LOCALE_INFO[code] }),
);

/**
 * Exact-code check, with a type predicate. Loose input (`EN_us`, `es-MX`) is
 * `resolveLocale`'s job; this one answers "is this already one of our codes".
 */
export function isSupportedLocale(value: string): value is Locale {
  return Object.prototype.hasOwnProperty.call(LOCALE_INFO, value);
}

// ---------------------------------------------------------------------------
// Message catalogs
// ---------------------------------------------------------------------------

/**
 * Plural families. A family is a base id (`members.count`) whose strings live
 * under `<base>.<plural category>` (`members.count.one`, `members.count.other`).
 *
 * The base id is declared here rather than duplicated in the catalogs so there
 * is no count-less third copy of every sentence for translators to keep in sync.
 * `translate` derives the category from `vars.count` and treats a family called
 * without a count as `other`. Only the categories a shipped language actually
 * needs are written out: a category we have no string for (`few`, `many`,
 * `zero`, `two`) degrades to `other`, which is the same escape hatch CLDR
 * recommends for a language whose rules we have not caught up with.
 */
const PLURAL_FAMILIES = ["members.count", "messages.count"] as const;

export type PluralFamily = (typeof PLURAL_FAMILIES)[number];

/** The variants every plural family has to provide in a complete catalog. */
type PluralVariantKey = `${PluralFamily}.${"one" | "other"}`;

/**
 * English is the source of truth. `MessageKey` is `keyof typeof en`, so every
 * other catalog is checked against exactly this set: a misspelled id in a
 * translation is a compile error, while a *missing* id is allowed (the other
 * catalogs are `Partial`) so a language can ship before it is finished.
 */
const en = {
  // Common actions. Short on purpose: these sit in buttons next to icons.
  "common.send": "Send",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.retry": "Try again",
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.settings": "Settings",
  "common.done": "Done",
  "common.back": "Back",
  "common.next": "Next",
  "common.remove": "Remove",
  "common.create": "Create",
  "common.join": "Join",
  "common.leave": "Leave",
  "common.upload": "Upload",
  "common.download": "Download",

  // Auth screens.
  "auth.signIn": "Sign in",
  "auth.signUp": "Sign up",
  "auth.signOut": "Sign out",
  "auth.email": "Email",
  "auth.username": "Username",
  "auth.password": "Password",
  "auth.displayName": "Display name",
  "auth.forgotPassword": "Forgot your password?",
  "auth.invalidCredentials": "Incorrect email or password.",
  "auth.sessionExpired": "Your session expired. Please sign in again.",
  "auth.welcomeBack": "Welcome back, {name}",
  "auth.needAccount": "Need an account?",
  "auth.haveAccount": "Already have an account?",
  "auth.signInTitle": "Sign in to Hoffle",
  "auth.signUpTitle": "Create your Hoffle account",

  // Settings sections and their controls.
  "settings.appearance": "Appearance",
  "settings.language": "Language",
  "settings.language.description": "Choose the language Hoffle uses for you.",
  "settings.notifications": "Notifications",
  "settings.voice": "Voice & video",
  "settings.voice.inputDevice": "Input device",
  "settings.voice.outputDevice": "Output device",
  "settings.privacy": "Privacy",
  "settings.account": "My account",
  "settings.theme": "Theme",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
  "settings.reduceMotion": "Reduce motion",
  "settings.saved": "Settings saved",

  // Chat surface.
  "chat.messagePlaceholder": "Message {channel}",
  "chat.send": "Send message",
  "chat.typing": "{name} is typing…",

  // Voice rooms.
  "voice.connected": "Connected",
  "voice.connecting": "Connecting…",
  "voice.mute": "Mute",
  "voice.unmute": "Unmute",

  // Errors a person can actually act on.
  "errors.generic": "Something went wrong. Please try again.",
  "errors.network": "Check your connection and try again.",

  // Plural families; see PLURAL_FAMILIES above.
  "members.count.one": "{count} member",
  "members.count.other": "{count} members",
  "messages.count.one": "{count} message",
  "messages.count.other": "{count} messages",
} as const satisfies Record<string, string> & Record<PluralVariantKey, string>;

/** Every id a catalog can hold. */
export type MessageKey = keyof typeof en;

/** Every id a caller may ask for: a message, or a plural family. */
export type TranslatableKey = MessageKey | PluralFamily;

/**
 * Every id English ships, in catalog order. Exported so tests and future
 * tooling (a translator dashboard, a coverage script) can audit completeness
 * without re-declaring the key list and drifting from it.
 */
export const MESSAGE_KEYS: readonly MessageKey[] = Object.keys(en) as MessageKey[];

/** The English catalog, exposed for tooling that needs the untranslated text. */
export const ENGLISH_CATALOG: Readonly<Record<MessageKey, string>> = en;

/**
 * Spanish (es). A partial by type, complete by intent: the completeness test in
 * `lib/i18n.test.ts` fails if any English id has no non-empty string here, so a
 * half-finished catalog cannot be mistaken for a finished one.
 */
const es = {
  "common.send": "Enviar",
  "common.cancel": "Cancelar",
  "common.save": "Guardar",
  "common.delete": "Eliminar",
  "common.edit": "Editar",
  "common.close": "Cerrar",
  "common.confirm": "Confirmar",
  "common.copy": "Copiar",
  "common.copied": "Copiado",
  "common.retry": "Reintentar",
  "common.loading": "Cargando…",
  "common.search": "Buscar",
  "common.settings": "Ajustes",
  "common.done": "Listo",
  "common.back": "Atrás",
  "common.next": "Siguiente",
  "common.remove": "Quitar",
  "common.create": "Crear",
  "common.join": "Unirse",
  "common.leave": "Salir",
  "common.upload": "Subir",
  "common.download": "Descargar",

  "auth.signIn": "Iniciar sesión",
  "auth.signUp": "Registrarse",
  "auth.signOut": "Cerrar sesión",
  "auth.email": "Correo electrónico",
  "auth.username": "Nombre de usuario",
  "auth.password": "Contraseña",
  "auth.displayName": "Nombre visible",
  "auth.forgotPassword": "¿Olvidaste tu contraseña?",
  "auth.invalidCredentials": "Correo o contraseña incorrectos.",
  "auth.sessionExpired": "Tu sesión ha caducado. Inicia sesión de nuevo.",
  "auth.welcomeBack": "Bienvenido de nuevo, {name}",
  "auth.needAccount": "¿No tienes cuenta?",
  "auth.haveAccount": "¿Ya tienes cuenta?",
  "auth.signInTitle": "Inicia sesión en Hoffle",
  "auth.signUpTitle": "Crea tu cuenta de Hoffle",

  "settings.appearance": "Apariencia",
  "settings.language": "Idioma",
  "settings.language.description": "Elige el idioma que Hoffle usa para ti.",
  "settings.notifications": "Notificaciones",
  "settings.voice": "Voz y vídeo",
  "settings.voice.inputDevice": "Dispositivo de entrada",
  "settings.voice.outputDevice": "Dispositivo de salida",
  "settings.privacy": "Privacidad",
  "settings.account": "Mi cuenta",
  "settings.theme": "Tema",
  "settings.theme.dark": "Oscuro",
  "settings.theme.light": "Claro",
  "settings.reduceMotion": "Reducir movimiento",
  "settings.saved": "Ajustes guardados",

  "chat.messagePlaceholder": "Escribe en {channel}",
  "chat.send": "Enviar mensaje",
  "chat.typing": "{name} está escribiendo…",

  "voice.connected": "Conectado",
  "voice.connecting": "Conectando…",
  "voice.mute": "Silenciar",
  "voice.unmute": "Activar micrófono",

  "errors.generic": "Algo salió mal. Inténtalo de nuevo.",
  "errors.network": "Comprueba tu conexión e inténtalo de nuevo.",

  "members.count.one": "{count} miembro",
  "members.count.other": "{count} miembros",
  "messages.count.one": "{count} mensaje",
  "messages.count.other": "{count} mensajes",
} satisfies Partial<Record<MessageKey, string>>;

/** German (de). */
const de = {
  "common.send": "Senden",
  "common.cancel": "Abbrechen",
  "common.save": "Speichern",
  "common.delete": "Löschen",
  "common.edit": "Bearbeiten",
  "common.close": "Schließen",
  "common.confirm": "Bestätigen",
  "common.copy": "Kopieren",
  "common.copied": "Kopiert",
  "common.retry": "Erneut versuchen",
  "common.loading": "Wird geladen…",
  "common.search": "Suchen",
  "common.settings": "Einstellungen",
  "common.done": "Fertig",
  "common.back": "Zurück",
  "common.next": "Weiter",
  "common.remove": "Entfernen",
  "common.create": "Erstellen",
  "common.join": "Beitreten",
  "common.leave": "Verlassen",
  "common.upload": "Hochladen",
  "common.download": "Herunterladen",

  "auth.signIn": "Anmelden",
  "auth.signUp": "Registrieren",
  "auth.signOut": "Abmelden",
  "auth.email": "E-Mail",
  "auth.username": "Benutzername",
  "auth.password": "Passwort",
  "auth.displayName": "Anzeigename",
  "auth.forgotPassword": "Passwort vergessen?",
  "auth.invalidCredentials": "E-Mail-Adresse oder Passwort ist falsch.",
  "auth.sessionExpired": "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
  "auth.welcomeBack": "Willkommen zurück, {name}",
  "auth.needAccount": "Noch kein Konto?",
  "auth.haveAccount": "Schon ein Konto?",
  "auth.signInTitle": "Bei Hoffle anmelden",
  "auth.signUpTitle": "Erstelle dein Hoffle-Konto",

  "settings.appearance": "Darstellung",
  "settings.language": "Sprache",
  "settings.language.description": "Wähle die Sprache, die Hoffle für dich verwendet.",
  "settings.notifications": "Benachrichtigungen",
  // "Sprache" alone would be read as the setting above, so the section keeps the
  // pair form German interfaces use for voice plus camera.
  "settings.voice": "Sprache & Video",
  "settings.voice.inputDevice": "Eingabegerät",
  "settings.voice.outputDevice": "Ausgabegerät",
  "settings.privacy": "Datenschutz",
  "settings.account": "Mein Konto",
  "settings.theme": "Design",
  "settings.theme.dark": "Dunkel",
  "settings.theme.light": "Hell",
  "settings.reduceMotion": "Bewegung reduzieren",
  "settings.saved": "Einstellungen gespeichert",

  "chat.messagePlaceholder": "Nachricht an {channel}",
  "chat.send": "Nachricht senden",
  "chat.typing": "{name} schreibt…",

  "voice.connected": "Verbunden",
  "voice.connecting": "Verbinden…",
  "voice.mute": "Stummschalten",
  "voice.unmute": "Stummschaltung aufheben",

  "errors.generic": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  "errors.network": "Prüfe deine Verbindung und versuche es erneut.",

  "members.count.one": "{count} Mitglied",
  "members.count.other": "{count} Mitglieder",
  "messages.count.one": "{count} Nachricht",
  "messages.count.other": "{count} Nachrichten",
} satisfies Partial<Record<MessageKey, string>>;

/** French (fr). */
const fr = {
  "common.send": "Envoyer",
  "common.cancel": "Annuler",
  "common.save": "Enregistrer",
  "common.delete": "Supprimer",
  "common.edit": "Modifier",
  "common.close": "Fermer",
  "common.confirm": "Confirmer",
  "common.copy": "Copier",
  "common.copied": "Copié",
  "common.retry": "Réessayer",
  "common.loading": "Chargement…",
  "common.search": "Rechercher",
  "common.settings": "Paramètres",
  "common.done": "Terminé",
  "common.back": "Retour",
  "common.next": "Suivant",
  "common.remove": "Retirer",
  "common.create": "Créer",
  "common.join": "Rejoindre",
  "common.leave": "Quitter",
  "common.upload": "Téléverser",
  "common.download": "Télécharger",

  "auth.signIn": "Se connecter",
  "auth.signUp": "S'inscrire",
  "auth.signOut": "Se déconnecter",
  "auth.email": "Adresse e-mail",
  "auth.username": "Nom d'utilisateur",
  "auth.password": "Mot de passe",
  "auth.displayName": "Nom affiché",
  "auth.forgotPassword": "Mot de passe oublié ?",
  "auth.invalidCredentials": "Adresse e-mail ou mot de passe incorrect.",
  "auth.sessionExpired": "Votre session a expiré. Veuillez vous reconnecter.",
  "auth.welcomeBack": "Bon retour, {name}",
  "auth.needAccount": "Pas encore de compte ?",
  "auth.haveAccount": "Déjà un compte ?",
  "auth.signInTitle": "Se connecter à Hoffle",
  "auth.signUpTitle": "Créez votre compte Hoffle",

  "settings.appearance": "Apparence",
  "settings.language": "Langue",
  "settings.language.description": "Choisissez la langue que Hoffle utilise pour vous.",
  "settings.notifications": "Notifications",
  "settings.voice": "Voix et vidéo",
  "settings.voice.inputDevice": "Périphérique d'entrée",
  "settings.voice.outputDevice": "Périphérique de sortie",
  "settings.privacy": "Confidentialité",
  "settings.account": "Mon compte",
  "settings.theme": "Thème",
  "settings.theme.dark": "Sombre",
  "settings.theme.light": "Clair",
  "settings.reduceMotion": "Réduire les animations",
  "settings.saved": "Paramètres enregistrés",

  "chat.messagePlaceholder": "Envoyer un message dans {channel}",
  "chat.send": "Envoyer le message",
  "chat.typing": "{name} est en train d'écrire…",

  "voice.connected": "Connecté",
  "voice.connecting": "Connexion…",
  "voice.mute": "Couper le micro",
  "voice.unmute": "Réactiver le micro",

  "errors.generic": "Une erreur est survenue. Veuillez réessayer.",
  "errors.network": "Vérifiez votre connexion et réessayez.",

  "members.count.one": "{count} membre",
  "members.count.other": "{count} membres",
  "messages.count.one": "{count} message",
  "messages.count.other": "{count} messages",
} satisfies Partial<Record<MessageKey, string>>;

/**
 * Brazilian Portuguese. The catalog code carries the region because `pt` alone
 * would claim a neutral form we do not have: the European wording differs in
 * ways speakers notice (gerund vs infinitive, "você" placement), so the code
 * states which one this is and lets `resolveLocale` send plain `pt` here as the
 * closest thing we ship.
 */
const ptBR = {
  "common.send": "Enviar",
  "common.cancel": "Cancelar",
  "common.save": "Salvar",
  "common.delete": "Excluir",
  "common.edit": "Editar",
  "common.close": "Fechar",
  "common.confirm": "Confirmar",
  "common.copy": "Copiar",
  "common.copied": "Copiado",
  "common.retry": "Tentar novamente",
  "common.loading": "Carregando…",
  "common.search": "Pesquisar",
  "common.settings": "Configurações",
  "common.done": "Concluído",
  "common.back": "Voltar",
  "common.next": "Próximo",
  "common.remove": "Remover",
  "common.create": "Criar",
  "common.join": "Entrar",
  "common.leave": "Sair",
  "common.upload": "Enviar arquivo",
  "common.download": "Baixar",

  "auth.signIn": "Entrar",
  "auth.signUp": "Criar conta",
  "auth.signOut": "Sair",
  "auth.email": "E-mail",
  "auth.username": "Nome de usuário",
  "auth.password": "Senha",
  "auth.displayName": "Nome de exibição",
  "auth.forgotPassword": "Esqueceu a senha?",
  "auth.invalidCredentials": "E-mail ou senha incorretos.",
  "auth.sessionExpired": "Sua sessão expirou. Entre novamente.",
  "auth.welcomeBack": "Bem-vindo de volta, {name}",
  "auth.needAccount": "Ainda não tem conta?",
  "auth.haveAccount": "Já tem uma conta?",
  "auth.signInTitle": "Entrar no Hoffle",
  "auth.signUpTitle": "Crie sua conta no Hoffle",

  "settings.appearance": "Aparência",
  "settings.language": "Idioma",
  "settings.language.description": "Escolha o idioma que o Hoffle usa para você.",
  "settings.notifications": "Notificações",
  "settings.voice": "Voz e vídeo",
  "settings.voice.inputDevice": "Dispositivo de entrada",
  "settings.voice.outputDevice": "Dispositivo de saída",
  "settings.privacy": "Privacidade",
  "settings.account": "Minha conta",
  "settings.theme": "Tema",
  "settings.theme.dark": "Escuro",
  "settings.theme.light": "Claro",
  "settings.reduceMotion": "Reduzir animações",
  "settings.saved": "Configurações salvas",

  "chat.messagePlaceholder": "Mensagem para {channel}",
  "chat.send": "Enviar mensagem",
  "chat.typing": "{name} está digitando…",

  "voice.connected": "Conectado",
  "voice.connecting": "Conectando…",
  "voice.mute": "Silenciar",
  "voice.unmute": "Ativar microfone",

  "errors.generic": "Algo deu errado. Tente novamente.",
  "errors.network": "Verifique sua conexão e tente novamente.",

  "members.count.one": "{count} membro",
  "members.count.other": "{count} membros",
  "messages.count.one": "{count} mensagem",
  "messages.count.other": "{count} mensagens",
} satisfies Partial<Record<MessageKey, string>>;

/** Dutch (nl). */
const nl = {
  "common.send": "Verzenden",
  "common.cancel": "Annuleren",
  "common.save": "Opslaan",
  "common.delete": "Verwijderen",
  "common.edit": "Bewerken",
  "common.close": "Sluiten",
  "common.confirm": "Bevestigen",
  "common.copy": "Kopiëren",
  "common.copied": "Gekopieerd",
  "common.retry": "Opnieuw proberen",
  "common.loading": "Laden…",
  "common.search": "Zoeken",
  "common.settings": "Instellingen",
  "common.done": "Klaar",
  "common.back": "Terug",
  "common.next": "Volgende",
  // "Verwijderen" already means "delete" above; "weghalen" is the milder
  // "take this off" that a detach-an-item action actually wants.
  "common.remove": "Weghalen",
  "common.create": "Aanmaken",
  "common.join": "Deelnemen",
  "common.leave": "Verlaten",
  "common.upload": "Uploaden",
  "common.download": "Downloaden",

  "auth.signIn": "Inloggen",
  "auth.signUp": "Registreren",
  "auth.signOut": "Uitloggen",
  "auth.email": "E-mailadres",
  "auth.username": "Gebruikersnaam",
  "auth.password": "Wachtwoord",
  "auth.displayName": "Weergavenaam",
  "auth.forgotPassword": "Wachtwoord vergeten?",
  "auth.invalidCredentials": "Onjuist e-mailadres of wachtwoord.",
  "auth.sessionExpired": "Je sessie is verlopen. Log opnieuw in.",
  "auth.welcomeBack": "Welkom terug, {name}",
  "auth.needAccount": "Nog geen account?",
  "auth.haveAccount": "Al een account?",
  "auth.signInTitle": "Inloggen bij Hoffle",
  "auth.signUpTitle": "Maak je Hoffle-account aan",

  "settings.appearance": "Weergave",
  "settings.language": "Taal",
  "settings.language.description": "Kies de taal die Hoffle voor jou gebruikt.",
  "settings.notifications": "Meldingen",
  "settings.voice": "Spraak en video",
  "settings.voice.inputDevice": "Invoerapparaat",
  "settings.voice.outputDevice": "Uitvoerapparaat",
  "settings.privacy": "Privacy",
  "settings.account": "Mijn account",
  "settings.theme": "Thema",
  "settings.theme.dark": "Donker",
  "settings.theme.light": "Licht",
  "settings.reduceMotion": "Beweging verminderen",
  "settings.saved": "Instellingen opgeslagen",

  "chat.messagePlaceholder": "Bericht aan {channel}",
  "chat.send": "Bericht verzenden",
  "chat.typing": "{name} is aan het typen…",

  "voice.connected": "Verbonden",
  "voice.connecting": "Verbinden…",
  "voice.mute": "Dempen",
  "voice.unmute": "Dempen opheffen",

  "errors.generic": "Er is iets misgegaan. Probeer het opnieuw.",
  "errors.network": "Controleer je verbinding en probeer het opnieuw.",

  "members.count.one": "{count} lid",
  "members.count.other": "{count} leden",
  "messages.count.one": "{count} bericht",
  "messages.count.other": "{count} berichten",
} satisfies Partial<Record<MessageKey, string>>;

/**
 * What a catalog holds: ids to strings, with the ids constrained to the English
 * set. Keyed loosely by string (not `Locale`) so the chain can also consult a
 * *base* language catalog - a `pt` entry alongside `pt-BR` - and so callers can
 * layer their own catalogs without inventing a new union member.
 */
export type CatalogMap = Record<string, Partial<Record<MessageKey, string>> | undefined>;

/**
 * The built-in catalogs. The explicit `Locale` key means a locale added to
 * LOCALE_INFO without a catalog fails to compile, and English is pinned to a
 * complete record because it is what every fallback lands on.
 */
const CATALOGS: CatalogMap & Record<Locale, Partial<Record<MessageKey, string>>> = {
  en,
  es,
  de,
  fr,
  "pt-BR": ptBR,
  nl,
};

// ---------------------------------------------------------------------------
// Locale resolution
// ---------------------------------------------------------------------------

/**
 * Lowercases, turns `_` into `-`, drops any header parameters (`es-MX;q=0.9`),
 * and rejects anything that cannot plausibly be a language tag. Forgiving about
 * *shape*, strict about *content*: garbage in must not become garbage out, so
 * `!!!` resolves to nothing rather than to something surprising.
 */
function normalizeTag(input: string): string | null {
  const tag = input
    .split(",")[0]
    .split(";")[0]
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!tag) return null;
  // BCP-47 subtags are alphanumeric. `*` fails this on purpose: a wildcard is
  // the caller's meaning to interpret, not a language we can look up.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag)) return null;
  return tag;
}

/**
 * The language part of a tag: `pt-BR` -> `pt`, `es` -> `es`. This is the step
 * that turns a regional preference into the nearest catalog we own.
 */
export function baseLanguage(tag: string): string {
  return tag.split(/[-_]/)[0].toLowerCase();
}

/**
 * Normalizes browser and header input (`es-MX`, `pt-br`, `EN_us`) to a locale we
 * ship, or `null` when nothing is close.
 *
 * Two passes, in order: the full tag first, so `pt-br` lands on `pt-BR` instead
 * of nowhere; then the base language, so `es-MX` and `en-GB` find `es` and `en`.
 *
 * Base-language matching carries one real tradeoff worth stating: `pt-PT`
 * resolves to `pt-BR`, so a European reader gets Brazilian wording rather than
 * English. A closely related variant is a much smaller error than a language
 * nobody asked for, and the picker is one click away. The alternatives
 * (pretending we ship neutral `pt`, or dumping anyone regional into English)
 * are worse for the same reader.
 *
 * Returning `null` instead of defaulting keeps the decision visible at each call
 * site: `translate` and `pickLocale` both fold `null` into DEFAULT_LOCALE, while
 * a caller that genuinely needs "did we recognize this?" can ask.
 */
export function resolveLocale(input: string | null | undefined): Locale | null {
  if (!input) return null;
  const tag = normalizeTag(input);
  if (!tag) return null;
  const codes = Object.keys(LOCALE_INFO) as Locale[];
  for (const locale of codes) {
    if (locale.toLowerCase() === tag) return locale;
  }
  const language = baseLanguage(tag);
  for (const locale of codes) {
    if (baseLanguage(locale) === language) return locale;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Accept-Language
// ---------------------------------------------------------------------------

interface LanguagePreference {
  tag: string;
  quality: number;
  /** Position in the header, so equal q-values break deterministically. */
  order: number;
}

/**
 * Parses `Accept-Language` into preferences, best first.
 *
 * This parser is total on purpose. The header is attacker-adjacent input: a
 * proxy error page, a bot or a hand-written curl can put anything in it, and a
 * throw here would take down rendering for reasons nobody can debug. Rules:
 *
 *   - a q we cannot read (`q=`, `q=abc`) is treated as the RFC default of 1
 *     rather than as a rejection. A one-character truncation should not hide
 *     the language the user asked for;
 *   - q is clamped into 0..1, and q=0 entries are dropped because that is how
 *     RFC 9110 spells "not acceptable";
 *   - ties keep header order, so `en;q=0.8, de;q=0.8` prefers English - the
 *     order the client wrote them in;
 *   - entries with an empty tag (a stray `,,` or a trailing comma) are dropped.
 */
function parseAcceptLanguage(header: string): LanguagePreference[] {
  return header
    .split(",")
    .map((entry, order) => {
      const [rawTag, ...params] = entry.split(";");
      const tag = (rawTag ?? "").trim().toLowerCase();
      let quality = 1;
      for (const param of params) {
        const [rawName, rawValue] = param.split("=");
        if ((rawName ?? "").trim().toLowerCase() !== "q") continue;
        const parsed = Number.parseFloat((rawValue ?? "").trim());
        quality = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 1;
      }
      return { tag, quality, order };
    })
    .filter((preference) => preference.tag.length > 0 && preference.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.order - b.order);
}

/**
 * The best locale for an `Accept-Language` header, or DEFAULT_LOCALE when the
 * header is absent, unreadable or lists nothing we ship.
 *
 * `*` is skipped while scanning and only ever resolves to the default. Strictly
 * reading the q-values, `*;q=0.9` would beat `de;q=0.1`; but "any language" is
 * not a preference for Swedish, and no real browser sends a wildcard that should
 * outrank a language it also named. Preferring a named language, and treating
 * the wildcard as "you pick", is both the common server behaviour and the only
 * reading that cannot surprise a German speaker with English.
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  for (const preference of parseAcceptLanguage(acceptLanguage)) {
    if (preference.tag === "*") continue;
    const resolved = resolveLocale(preference.tag);
    if (resolved) return resolved;
  }
  return DEFAULT_LOCALE;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

/** Values substituted into `{placeholders}`. Numbers are locale-formatted. */
export interface TranslateVars {
  [name: string]: string | number | undefined;
}

/**
 * Extra catalogs, merged over the built-ins per language. Production passes
 * nothing. It exists for two reasons: tests can prove the fallback *order* with
 * a deliberately incomplete catalog (with every shipped catalog complete, the
 * interesting branches are otherwise unreachable), and a future server-side
 * loader can layer per-request catalogs instead of this module holding state.
 */
export interface TranslateOptions {
  catalogs?: CatalogMap;
}

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

const pluralRulesCache = new Map<string, Intl.PluralRules>();
const numberFormatCache = new Map<string, Intl.NumberFormat>();

/**
 * Plural category for `count` *in the language of the catalog being read*, not
 * in the user's locale. The distinction bites on the fallback path: a French
 * preference falling back to the English "0 messages" needs English's `other`,
 * while French itself would say `one` for 0. Asking the string's own language is
 * the only way to get that right. Categories we ship no key for are handled in
 * `keyCandidates`, which always walks down to `.other`.
 */
function pluralCategory(language: string, count: number): string {
  let rules = pluralRulesCache.get(language);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(language);
    } catch {
      // `Intl` throws on tags it does not know, and a catalog key is data rather
      // than a compile-time guarantee (a test override can be anything). Falling
      // back to the default language's rules keeps a bad key from throwing
      // mid-render.
      rules = new Intl.PluralRules(DEFAULT_LOCALE);
    }
    pluralRulesCache.set(language, rules);
  }
  return rules.select(count);
}

/**
 * A number with the grouping its readers expect (`1,234` in English, `1.234` in
 * German or Brazilian Portuguese, `1 234` in French). Exported because counts
 * also appear where `translate` is not involved, and re-implementing
 * `toLocaleString` at each of those is how they drift apart.
 */
export function formatNumber(locale: Locale | string | null | undefined, value: number): string {
  const language = resolveLocale(locale) ?? DEFAULT_LOCALE;
  let format = numberFormatCache.get(language);
  if (!format) {
    try {
      format = new Intl.NumberFormat(language);
    } catch {
      format = new Intl.NumberFormat(DEFAULT_LOCALE);
    }
    numberFormatCache.set(language, format);
  }
  return format.format(value);
}

/**
 * Candidate ids to try, most specific first: the plural form for this count,
 * then `other` (a category we have no string for still needs a sentence), then
 * the id as written. A caller that passes `count` for a non-plural key misses
 * both derived ids and lands on the literal one, so passing `count` is safe
 * everywhere.
 *
 * A family called *without* a usable count resolves to `other` rather than
 * falling through to the id: the sentence comes out with its `{count}`
 * placeholder intact, which names the argument the call forgot, where the raw
 * id `messages.count` only says the key exists.
 */
function keyCandidates(language: string, key: string, vars: TranslateVars | undefined): string[] {
  const isFamily = (PLURAL_FAMILIES as readonly string[]).includes(key);
  const count = vars?.count;
  if (typeof count !== "number" || !Number.isFinite(count)) {
    return isFamily ? [`${key}.other`, key] : [key];
  }
  const candidates = [`${key}.${pluralCategory(language, count)}`, `${key}.other`, key];
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

/**
 * `{name}` substitution. A placeholder with no matching var is left intact
 * rather than blanked: `Welcome back, {name}` on screen names the call that
 * forgot its argument, while an empty gap looks like a layout bug and gets
 * reported as one. A non-finite number is treated as "no value" for the same
 * reason - `NaN messages` in the UI is worse than a visible `{count}`.
 */
function interpolate(template: string, vars: TranslateVars | undefined, language: string): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = vars[name];
    if (value === undefined || value === null) return placeholder;
    if (typeof value !== "number") return String(value);
    return Number.isFinite(value) ? formatNumber(language, value) : placeholder;
  });
}

/**
 * Runtime lookup by a generated id. `members.count.one` is built by string
 * concatenation, which the compiler cannot narrow to a `MessageKey`, so the cast
 * lives here once - next to the `typeof === "string"` guard that also makes a
 * hostile key such as `constructor` (an inherited object property) miss instead
 * of leaking a function into a label.
 */
function lookup(
  catalog: Partial<Record<MessageKey, string>> | undefined,
  key: string,
): string | undefined {
  if (!catalog) return undefined;
  const value = (catalog as Record<string, string | undefined>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * The languages to consult, nearest first, without duplicates:
 * `pt-BR` -> `["pt-BR", "pt", "en"]`; `es` -> `["es", "en"]`.
 */
function catalogChain(locale: Locale): string[] {
  const chain = [locale, baseLanguage(locale), DEFAULT_LOCALE];
  return chain.filter((language, index) => chain.indexOf(language) === index);
}

/**
 * The one function callers use.
 *
 * Fallback chain, in order:
 *   1. the requested locale, normalized with `resolveLocale`;
 *   2. its base language, e.g. `pt-BR` -> a `pt` catalog added later;
 *   3. English, the source of truth;
 *   4. the id itself.
 *
 * An empty string counts as missing at every step: a blank catalog entry is a
 * half-deleted translation, and rendering nothing is the exact failure this
 * chain exists to prevent. The last resort is the id, which is at least
 * searchable in the codebase and unmistakable in a screenshot.
 */
export function translate(
  locale: Locale | string | null | undefined,
  key: TranslatableKey,
  vars?: TranslateVars,
  options?: TranslateOptions,
): string {
  const catalogs: CatalogMap = options?.catalogs ? { ...CATALOGS, ...options.catalogs } : CATALOGS;
  const resolved = resolveLocale(locale) ?? DEFAULT_LOCALE;
  for (const language of catalogChain(resolved)) {
    for (const candidate of keyCandidates(language, key, vars)) {
      const template = lookup(catalogs[language], candidate);
      if (template !== undefined && template !== "") {
        return interpolate(template, vars, language);
      }
    }
  }
  return key;
}

/** A translator bound to one locale. */
export type TranslateFn = (key: TranslatableKey, vars?: TranslateVars) => string;

/**
 * Curries `translate` for a locale, resolving it once. The React provider
 * memoizes one of these per locale so components hold a stable `t`: a fresh
 * function on every render would retrigger every `useEffect` that lists `t`.
 */
export function createTranslator(locale: Locale | string | null | undefined): TranslateFn {
  const resolved = resolveLocale(locale) ?? DEFAULT_LOCALE;
  return (key, vars) => translate(resolved, key, vars);
}

