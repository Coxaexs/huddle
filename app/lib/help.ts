import { Marked, type Token } from "marked";
import baslarken from "../../docs/help/baslarken.md?raw";
import sunucular from "../../docs/help/sunucular.md?raw";
import roller from "../../docs/help/roller.md?raw";
import moderasyon from "../../docs/help/moderasyon.md?raw";
import mesajlasma from "../../docs/help/mesajlasma.md?raw";
import arkadaslar from "../../docs/help/arkadaslar.md?raw";
import sesliSohbet from "../../docs/help/sesli-sohbet.md?raw";
import dnd from "../../docs/help/dnd.md?raw";
import muzik from "../../docs/help/muzik.md?raw";
import oturmaOdasi from "../../docs/help/oturma-odasi.md?raw";
import birlikteIzle from "../../docs/help/birlikte-izle.md?raw";
import ayarlar from "../../docs/help/ayarlar.md?raw";
import discordGecis from "../../docs/help/discord-gecis.md?raw";
import profil from "../../docs/help/profil.md?raw";
import temalar from "../../docs/help/temalar.md?raw";
import oyunlar from "../../docs/help/oyunlar.md?raw";
import botlar from "../../docs/help/botlar.md?raw";
import tavern from "../../docs/help/tavern.md?raw";
import ikinciEkran from "../../docs/help/ikinci-ekran.md?raw";

import enGettingStarted from "../../docs/help/en/getting-started.md?raw";
import enServers from "../../docs/help/en/servers.md?raw";
import enRoles from "../../docs/help/en/roles.md?raw";
import enModeration from "../../docs/help/en/moderation.md?raw";
import enMessaging from "../../docs/help/en/messaging.md?raw";
import enFriends from "../../docs/help/en/friends.md?raw";
import enVoiceChat from "../../docs/help/en/voice-chat.md?raw";
import enDnd from "../../docs/help/en/dnd.md?raw";
import enTavern from "../../docs/help/en/tavern.md?raw";
import enMusic from "../../docs/help/en/music.md?raw";
import enLivingRoom from "../../docs/help/en/living-room.md?raw";
import enWatchTogether from "../../docs/help/en/watch-together.md?raw";
import enSecondScreen from "../../docs/help/en/second-screen.md?raw";
import enSettings from "../../docs/help/en/settings.md?raw";
import enMovingFromDiscord from "../../docs/help/en/moving-from-discord.md?raw";
import enProfile from "../../docs/help/en/profile.md?raw";
import enThemes from "../../docs/help/en/themes.md?raw";
import enGames from "../../docs/help/en/games.md?raw";
import enBots from "../../docs/help/en/bots.md?raw";

/**
 * The user manual at hoffle.online/help (Turkish) and hoffle.online/en/help (English).
 *
 * Each chapter is one markdown file in docs/help/ (or docs/help/en/). The file's
 * `##` headings are the chapter's sections and show up in the sidebar of the
 * chapter page and on the index. Screenshots live in public/help-media/img and
 * the short silent clips in public/help-media/video; both are shared across
 * languages and made from a throwaway test copy with made-up people (Deniz, Ece,
 * Mert, Zeynep, Can), never from real users.
 */

export type HelpLang = "tr" | "en";

export interface HelpChapter {
  /** URL segment under /help (for tr) or /en/help (for en). */
  slug: string;
  /** Matching chapter slug in the other language. */
  alternateSlug: string;
  title: string;
  /** One line for the index card and the meta description. */
  description: string;
  /** Emoji shown on the index card. */
  icon: string;
  source: string;
}

export const HELP_CHAPTERS_TR: HelpChapter[] = [
  {
    slug: "baslarken",
    alternateSlug: "getting-started",
    title: "Başlarken",
    description: "Hesap açma, davetle katılma, ilk açılıştaki tur ve Hoffle ekranının bölümleri.",
    icon: "👋",
    source: baslarken,
  },
  {
    slug: "sunucular",
    alternateSlug: "servers",
    title: "Sunucular ve kanallar",
    description: "Sunucu kurma, arkadaş davet etme, kanal ve kategori açma, kanal türleri.",
    icon: "🏠",
    source: sunucular,
  },
  {
    slug: "roller",
    alternateSlug: "roles",
    title: "Roller ve izinler",
    description: "Rol oluşturma, renk ve simge verme, izinler, rol atama ve özel kanallar.",
    icon: "🛡️",
    source: roller,
  },
  {
    slug: "moderasyon",
    alternateSlug: "moderation",
    title: "Moderasyon ve güvenlik",
    description: "Susturma, zaman aşımı, atma ve yasaklama; AutoMod, doğrulama düzeyi ve denetim kaydı.",
    icon: "🚨",
    source: moderasyon,
  },
  {
    slug: "mesajlasma",
    alternateSlug: "messaging",
    title: "Mesajlaşma",
    description: "Yanıt, tepki, konu, anket, metin efektleri, GIF ve çıkartmalar, eğik çizgi komutları ve arama.",
    icon: "💬",
    source: mesajlasma,
  },
  {
    slug: "arkadaslar",
    alternateSlug: "friends",
    title: "Arkadaşlar ve özel mesajlar",
    description: "Arkadaş ekleme ve kabul etme, doğrudan mesajlar, grup DM, sesli ve görüntülü arama, engelleme.",
    icon: "🤝",
    source: arkadaslar,
  },
  {
    slug: "sesli-sohbet",
    alternateSlug: "voice-chat",
    title: "Sesli sohbet ve ekran paylaşımı",
    description: "Ses odaları, mikrofon ve kamera, ekran paylaşımı, ses tahtası, uzamsal ses, gürültü engelleme ve sahne kanalları.",
    icon: "🎙️",
    source: sesliSohbet,
  },
  {
    slug: "dnd",
    alternateSlug: "dnd",
    title: "D&D ve masa oyunları",
    description: "3D zarlar, gizli zar, büyü ve canavar kartları, savaş haritası, inisiyatif takibi ve masa ayarları.",
    icon: "🐉",
    source: dnd,
  },
  {
    slug: "tavern",
    alternateSlug: "tavern",
    title: "D&D Companion (Tavern)",
    description: "Karakter oluşturma ve kâğıdı, savaş haritası, dünya haritası, Compendium, Bard, Oracle yapay zekâ DM yardımcısı, iPad ve ortak ekran.",
    icon: "🏰",
    source: tavern,
  },
  {
    slug: "muzik",
    alternateSlug: "music",
    title: "Müzik botu ve DJ modu",
    description: "Müzik botunu ekleme, /play ile şarkı açma, tam ekran oynatıcı, senkron sözler, DJ seti, AutoMix ve müzik komutları.",
    icon: "🎵",
    source: muzik,
  },
  {
    slug: "oturma-odasi",
    alternateSlug: "living-room",
    title: "3D Oturma Odası",
    description: "Ses odasının 3D hâli: salon, sinema, D&D masası, oyun salonu, çayır ve kulüp; hareket, tepkiler ve oda ayarları.",
    icon: "🛋️",
    source: oturmaOdasi,
  },
  {
    slug: "birlikte-izle",
    alternateSlug: "watch-together",
    title: "Birlikte İzle ve Reels",
    description: "Ses odasında herkesle aynı anda video izleme, sıra ve arama, kalite seçimi; Shorts'ları grupça kaydırma.",
    icon: "🎬",
    source: birlikteIzle,
  },
  {
    slug: "ikinci-ekran",
    alternateSlug: "second-screen",
    title: "İkinci ekran",
    description: "Ekran paylaşımını, sohbeti, savaş haritasını ya da Tavern'i ikinci monitöre, iPad'e veya televizyona göndermek; bölünmüş düzen ve eşleştirme.",
    icon: "🖥️",
    source: ikinciEkran,
  },
  {
    slug: "ayarlar",
    alternateSlug: "settings",
    title: "Ayarlar",
    description: "Hesap güvenliği, iki adımlı giriş ve geçiş anahtarı, gizlilik, bildirimler, metin okuma, erişilebilirlik ve özellik anahtarları.",
    icon: "⚙️",
    source: ayarlar,
  },
  {
    slug: "discord-gecis",
    alternateSlug: "moving-from-discord",
    title: "Discord'dan geçiş",
    description: "Discord sunucusunu şablonla kopyalama, iki yönlü Discord köprüsü ve discord.js / discord.py botlarını Hoffle'da çalıştırma.",
    icon: "🔁",
    source: discordGecis,
  },
  {
    slug: "profil",
    alternateSlug: "profile",
    title: "Profil ve başarımlar",
    description: "Profil resmi, hazır görünümler, avatar süslemeleri, profil efektleri, hakkımda, durum ve başarımlar.",
    icon: "🪪",
    source: profil,
  },
  {
    slug: "temalar",
    alternateSlug: "themes",
    title: "Temalar ve Y2K / MSN",
    description: "Tema değiştirme, hazır temalar, yerleşim; Y2K Sohbet teması, titreşim, göz kırpmalar, el yazısı ve ses klibi.",
    icon: "🎨",
    source: temalar,
  },
  {
    slug: "oyunlar",
    alternateSlug: "games",
    title: "Oyunlar, aktiviteler ve etkinlikler",
    description: "Sohbet içi oyunlar (XOX, Dört Taş, Rota…), ses odası aktiviteleri (Beyaz Tahta, Beatbox…) ve katılım toplayan etkinlikler.",
    icon: "🎲",
    source: oyunlar,
  },
  {
    slug: "botlar",
    alternateSlug: "bots",
    title: "Botlar ve entegrasyonlar",
    description: "Beslemeler, web kancaları, sunucudaki botlar, Geliştirici Portalı'nda kendi botunu yazmak ve Minecraft sunucusu bileşeni.",
    icon: "🤖",
    source: botlar,
  },
];

export const HELP_CHAPTERS_EN: HelpChapter[] = [
  {
    slug: "getting-started",
    alternateSlug: "baslarken",
    title: "Getting Started",
    description: "Creating an account, joining with an invite, the welcome tour, and parts of the Hoffle screen.",
    icon: "👋",
    source: enGettingStarted,
  },
  {
    slug: "servers",
    alternateSlug: "sunucular",
    title: "Servers & Channels",
    description: "Creating a server, inviting friends, adding channels and categories, and channel types.",
    icon: "🏠",
    source: enServers,
  },
  {
    slug: "roles",
    alternateSlug: "roller",
    title: "Roles & Permissions",
    description: "Creating roles, picking colors and icons, permissions, assigning roles, and private channels.",
    icon: "🛡️",
    source: enRoles,
  },
  {
    slug: "moderation",
    alternateSlug: "moderasyon",
    title: "Moderation & Safety",
    description: "Muting, timeouts, kicking, and banning; AutoMod, verification levels, and the audit log.",
    icon: "🚨",
    source: enModeration,
  },
  {
    slug: "messaging",
    alternateSlug: "mesajlasma",
    title: "Messaging",
    description: "Replies, reactions, threads, polls, text effects, GIFs and stickers, slash commands, and search.",
    icon: "💬",
    source: enMessaging,
  },
  {
    slug: "friends",
    alternateSlug: "arkadaslar",
    title: "Friends & Direct Messages",
    description: "Adding and accepting friends, direct messages, group DMs, voice and video calls, and blocking.",
    icon: "🤝",
    source: enFriends,
  },
  {
    slug: "voice-chat",
    alternateSlug: "sesli-sohbet",
    title: "Voice Chat & Screen Sharing",
    description: "Voice rooms, mic and camera, screen sharing, soundboard, spatial audio, noise suppression, and Stage channels.",
    icon: "🎙️",
    source: enVoiceChat,
  },
  {
    slug: "dnd",
    alternateSlug: "dnd",
    title: "D&D & Tabletop",
    description: "3D dice, secret rolls, spell and monster cards, battle map, initiative tracker, and tabletop settings.",
    icon: "🐉",
    source: enDnd,
  },
  {
    slug: "tavern",
    alternateSlug: "tavern",
    title: "D&D Companion (Tavern)",
    description: "Character creator and sheet, battle map, world map, Compendium, Bard, Oracle AI DM assistant, iPad, and shared display.",
    icon: "🏰",
    source: enTavern,
  },
  {
    slug: "music",
    alternateSlug: "muzik",
    title: "Music Bot & DJ Mode",
    description: "Adding the music bot, playing songs with /play, full-screen player, synced lyrics, DJ sets, AutoMix, and music commands.",
    icon: "🎵",
    source: enMusic,
  },
  {
    slug: "living-room",
    alternateSlug: "oturma-odasi",
    title: "3D Living Room",
    description: "Voice rooms in 3D: living room, cinema, tabletop, board hall, meadow, and club; movement, reactions, and room settings.",
    icon: "🛋️",
    source: enLivingRoom,
  },
  {
    slug: "watch-together",
    alternateSlug: "birlikte-izle",
    title: "Watch Together & Reels",
    description: "Watching videos in sync in a voice room, queue and search, quality options, and swiping Shorts together.",
    icon: "🎬",
    source: enWatchTogether,
  },
  {
    slug: "second-screen",
    alternateSlug: "ikinci-ekran",
    title: "Second Screen",
    description: "Sending screen shares, chat, the battle map, or Tavern to a second monitor, iPad, or TV; split layouts and pairing.",
    icon: "🖥️",
    source: enSecondScreen,
  },
  {
    slug: "settings",
    alternateSlug: "ayarlar",
    title: "Settings",
    description: "Account security, two-factor auth and passkeys, privacy, notifications, text-to-speech, accessibility, and feature toggles.",
    icon: "⚙️",
    source: enSettings,
  },
  {
    slug: "moving-from-discord",
    alternateSlug: "discord-gecis",
    title: "Moving from Discord",
    description: "Copying a Discord server from a template, two-way Discord bridge, and running discord.js / discord.py bots on Hoffle.",
    icon: "🔁",
    source: enMovingFromDiscord,
  },
  {
    slug: "profile",
    alternateSlug: "profil",
    title: "Profile & Achievements",
    description: "Avatar, preset looks, avatar decorations, profile effects, about me, status, and achievements.",
    icon: "🪪",
    source: enProfile,
  },
  {
    slug: "themes",
    alternateSlug: "temalar",
    title: "Themes & Y2K / MSN",
    description: "Switching themes, built-in themes, layout; Y2K Chat theme, nudges, winks, handwriting, and voice clips.",
    icon: "🎨",
    source: enThemes,
  },
  {
    slug: "games",
    alternateSlug: "oyunlar",
    title: "Games, Activities & Events",
    description: "In-chat games (Tic-Tac-Toe, Connect Four, Rota…), voice room activities (Whiteboard, Beatbox…), and RSVP events.",
    icon: "🎲",
    source: enGames,
  },
  {
    slug: "bots",
    alternateSlug: "botlar",
    title: "Bots & Integrations",
    description: "Feeds, webhooks, server bots, building your own bot in the Developer Portal, and the Minecraft server widget.",
    icon: "🤖",
    source: enBots,
  },
];

export const HELP_CHAPTERS_BY_LANG: Record<HelpLang, HelpChapter[]> = {
  tr: HELP_CHAPTERS_TR,
  en: HELP_CHAPTERS_EN,
};

export const HELP_CHAPTERS = HELP_CHAPTERS_TR;

export const HELP_TITLE_BY_LANG: Record<HelpLang, string> = {
  tr: "Hoffle Kullanım Kılavuzu",
  en: "Hoffle User Guide",
};

export const HELP_TITLE = HELP_TITLE_BY_LANG.tr;

export function findHelpChapter(slug: string, lang: HelpLang = "tr"): HelpChapter | undefined {
  return HELP_CHAPTERS_BY_LANG[lang].find((chapter) => chapter.slug === slug);
}

export function helpHref(chapter?: Pick<HelpChapter, "slug">, lang: HelpLang = "tr"): string {
  const base = lang === "en" ? "/en/help" : "/help";
  return chapter ? `${base}/${chapter.slug}` : base;
}

export interface HelpSection {
  id: string;
  text: string;
}

/** Anchor ids matching GitHub-style heading slugs for the given language. */
export function makeSlugger(lang: HelpLang = "tr") {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text
      .toLocaleLowerCase(lang)
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s+/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

function plainText(tokens: Token[] | undefined): string {
  return (tokens || [])
    .map((token) => {
      if ("tokens" in token && token.tokens) return plainText(token.tokens);
      return "text" in token ? token.text : "";
    })
    .join("");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** The `##` headings of a chapter, without rendering it. */
export function helpSections(chapter: HelpChapter, lang: HelpLang = "tr"): HelpSection[] {
  const slug = makeSlugger(lang);
  const sections: HelpSection[] = [];
  for (const token of new Marked({ gfm: true }).lexer(chapter.source)) {
    if (token.type !== "heading") continue;
    const text = plainText(token.tokens);
    const id = slug(text);
    if (token.depth === 2) sections.push({ id, text });
  }
  return sections;
}

export function renderHelp(chapter: HelpChapter, lang: HelpLang = "tr"): { html: string; sections: HelpSection[] } {
  const tokens = new Marked({ gfm: true }).lexer(expandVideos(chapter.source));
  // The page supplies its own <h1>.
  const first = tokens.findIndex((token) => token.type !== "space");
  if (first >= 0 && tokens[first].type === "heading" && (tokens[first] as { depth: number }).depth === 1) {
    tokens.splice(first, 1);
  }
  const sections: HelpSection[] = [];
  const slug = makeSlugger(lang);
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(token) {
        const text = plainText(token.tokens);
        const id = slug(text);
        if (token.depth === 2) sections.push({ id, text });
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${escapeAttr(id)}"><a class="doc-anchor" href="#${escapeAttr(id)}">${inner}</a></h${token.depth}>\n`;
      },
      image(token) {
        const title = token.title ? `<figcaption>${escapeAttr(token.title)}</figcaption>` : "";
        return `<figure class="help-shot"><img src="${escapeAttr(token.href)}" alt="${escapeAttr(token.text)}" loading="lazy" decoding="async">${title}</figure>`;
      },
      link(token) {
        const external = /^https?:/i.test(token.href) && !token.href.startsWith("https://hoffle.online");
        const rel = external ? ` rel="noopener"` : "";
        return `<a href="${escapeAttr(token.href)}"${rel}>${this.parser.parseInline(token.tokens)}</a>`;
      },
      table(token) {
        const head = token.header.map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`).join("");
        const rows = token.rows
          .map((row) => `<tr>${row.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join("")}</tr>`)
          .join("");
        return `<div class="doc-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });
  return { html: marked.parser(tokens), sections };
}

/**
 * `::video name | caption` on a line of its own becomes a silent clip with a
 * poster frame. Clips load only when someone presses play.
 */
export function expandVideos(source: string): string {
  return source.replace(/^::video\s+([\w-]+)\s*(?:\|\s*(.+))?$/gm, (_line, name: string, caption?: string) => {
    const base = `/help-media/video/${name}`;
    const label = escapeAttr(caption?.trim() || "");
    return [
      `<figure class="help-video">`,
      `<video controls preload="none" playsinline muted width="1280" height="800" poster="${base}.jpg"${label ? ` aria-label="${label}"` : ""}>`,
      `<source src="${base}.mp4" type="video/mp4">`,
      `</video>`,
      label ? `<figcaption>${label}</figcaption>` : "",
      `</figure>`,
    ].join("");
  });
}
