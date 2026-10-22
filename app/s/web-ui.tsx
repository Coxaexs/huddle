import { APP_URL, SITE } from "../components/site-chrome";
import type { WebServer } from "@/lib/web-public";

/** Words and small pieces for the web-readable server pages (app/s), in the reader's language. */
export type WebLang = "en" | "tr";

export const webLang = (acceptLanguage: string | null): WebLang =>
  /^\s*tr\b/i.test(acceptLanguage || "") ? "tr" : "en";

export const WEB_COPY = {
  en: {
    members: (n: number) => `${n} member${n === 1 ? "" : "s"}`,
    join: "Join on Hoffle",
    channels: "Channels",
    allChannels: "All channels",
    older: "Older messages",
    newest: "Back to the newest",
    empty: "Nothing here yet.",
    reading: "You're reading this on the web. Join the server to talk.",
    about: "This server's owner made these channels readable on the web.",
    serverDescription: (server: string, channels: string) => `${server}, a server on Hoffle. Read ${channels}.`,
    locale: "en-GB",
  },
  tr: {
    members: (n: number) => `${n} üye`,
    join: "Hoffle'da katıl",
    channels: "Kanallar",
    allChannels: "Tüm kanallar",
    older: "Eski mesajlar",
    newest: "En yeniye dön",
    empty: "Burada henüz bir şey yok.",
    reading: "Bunu web'de okuyorsun. Konuşmak için sunucuya katıl.",
    about: "Bu sunucunun sahibi bu kanalları web'de okunabilir yaptı.",
    serverDescription: (server: string, channels: string) => `${server}, Hoffle'da bir sunucu. Oku: ${channels}.`,
    locale: "tr-TR",
  },
} as const;

export const primaryButton =
  "inline-flex items-center gap-2 rounded-lg bg-(--violet) px-5 py-3 font-semibold text-white no-underline hover:brightness-110";

export function ServerIcon({ server, size = 64 }: { server: WebServer; size?: number }) {
  return server.iconUrl ? (
    <img src={server.iconUrl} alt="" width={size} height={size} className="rounded-2xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-2xl font-bold text-white"
      style={{ width: size, height: size, background: server.color, fontSize: size * 0.38 }}
    >
      {server.icon}
    </span>
  );
}

export const joinUrl = (server: WebServer) => (server.vanity ? `${SITE}/i/${encodeURIComponent(server.vanity)}` : APP_URL);

