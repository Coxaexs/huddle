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

/**
 * The user manual at hoffle.online/help, in Turkish first.
 *
 * Each chapter is one markdown file in docs/help/. The file's `##` headings are
 * the chapter's sections and show up in the sidebar of the chapter page and on
 * the index. Screenshots live in public/help-media/img and the short silent
 * clips in public/help-media/video; both are made from a throwaway test copy
 * with made-up people (Deniz, Ece, Mert, Zeynep, Can), never from real users.
 *
 * A chapter appears on the site as soon as it is listed here, so the manual can
 * grow one chapter at a time.
 */

export interface HelpChapter {
  /** URL segment under /help. */
  slug: string;
  title: string;
  /** One line for the index card and the meta description. */
  description: string;
  /** Emoji shown on the index card. */
  icon: string;
  source: string;
}

export const HELP_CHAPTERS: HelpChapter[] = [
  {
    slug: "baslarken",
    title: "Başlarken",
    description: "Hesap açma, davetle katılma, ilk açılıştaki tur ve Hoffle ekranının bölümleri.",
    icon: "👋",
    source: baslarken,
  },
  {
    slug: "sunucular",
    title: "Sunucular ve kanallar",
    description: "Sunucu kurma, arkadaş davet etme, kanal ve kategori açma, kanal türleri.",
    icon: "🏠",
    source: sunucular,
  },
  {
    slug: "roller",
    title: "Roller ve izinler",
    description: "Rol oluşturma, renk ve simge verme, izinler, rol atama ve özel kanallar.",
    icon: "🛡️",
    source: roller,
  },
  {
    slug: "moderasyon",
    title: "Moderasyon ve güvenlik",
    description: "Susturma, zaman aşımı, atma ve yasaklama; AutoMod, doğrulama düzeyi ve denetim kaydı.",
    icon: "🚨",
    source: moderasyon,
  },
  {
    slug: "mesajlasma",
    title: "Mesajlaşma",
    description: "Yanıt, tepki, konu, anket, metin efektleri, GIF ve çıkartmalar, eğik çizgi komutları ve arama.",
    icon: "💬",
    source: mesajlasma,
  },
  {
    slug: "arkadaslar",
    title: "Arkadaşlar ve özel mesajlar",
    description: "Arkadaş ekleme ve kabul etme, doğrudan mesajlar, grup DM, sesli ve görüntülü arama, engelleme.",
    icon: "🤝",
    source: arkadaslar,
  },
  {
    slug: "sesli-sohbet",
    title: "Sesli sohbet ve ekran paylaşımı",
    description: "Ses odaları, mikrofon ve kamera, ekran paylaşımı, ses tahtası, uzamsal ses, gürültü engelleme ve sahne kanalları.",
    icon: "🎙️",
    source: sesliSohbet,
  },
  {
    slug: "dnd",
    title: "D&D ve masa oyunları",
    description: "3D zarlar, gizli zar, büyü ve canavar kartları, savaş haritası, inisiyatif takibi ve masa ayarları.",
    icon: "🐉",
    source: dnd,
  },
  {
    slug: "muzik",
    title: "Müzik botu ve DJ modu",
    description: "Müzik botunu ekleme, /play ile şarkı açma, tam ekran oynatıcı, senkron sözler, DJ seti, AutoMix ve müzik komutları.",
    icon: "🎵",
    source: muzik,
  },
  {
    slug: "oturma-odasi",
    title: "3D Oturma Odası",
    description: "Ses odasının 3D hâli: salon, sinema, D&D masası, oyun salonu, çayır ve kulüp; hareket, tepkiler ve oda ayarları.",
    icon: "🛋️",
    source: oturmaOdasi,
  },
  {
    slug: "birlikte-izle",
    title: "Birlikte İzle ve Reels",
    description: "Ses odasında herkesle aynı anda video izleme, sıra ve arama, kalite seçimi; Shorts'ları grupça kaydırma.",
    icon: "🎬",
    source: birlikteIzle,
  },
  {
    slug: "ayarlar",
    title: "Ayarlar",
    description: "Hesap güvenliği, iki adımlı giriş ve geçiş anahtarı, gizlilik, bildirimler, metin okuma, erişilebilirlik ve özellik anahtarları.",
    icon: "⚙️",
    source: ayarlar,
  },
  {
    slug: "discord-gecis",
    title: "Discord'dan geçiş",
    description: "Discord sunucusunu şablonla kopyalama, iki yönlü Discord köprüsü ve discord.js / discord.py botlarını Hoffle'da çalıştırma.",
    icon: "🔁",
    source: discordGecis,
  },
  {
    slug: "profil",
    title: "Profil ve başarımlar",
    description: "Profil resmi, hazır görünümler, avatar süslemeleri, profil efektleri, hakkımda, durum ve başarımlar.",
    icon: "🪪",
    source: profil,
  },
  {
    slug: "temalar",
    title: "Temalar ve Y2K / MSN",
    description: "Tema değiştirme, hazır temalar, yerleşim; Y2K Sohbet teması, titreşim, göz kırpmalar, el yazısı ve ses klibi.",
    icon: "🎨",
    source: temalar,
  },
  {
    slug: "oyunlar",
    title: "Oyunlar, aktiviteler ve etkinlikler",
    description: "Sohbet içi oyunlar (XOX, Dört Taş, Rota…), ses odası aktiviteleri (Beyaz Tahta, Beatbox…) ve katılım toplayan etkinlikler.",
    icon: "🎲",
    source: oyunlar,
  },
  {
    slug: "botlar",
    title: "Botlar ve entegrasyonlar",
    description: "Beslemeler, web kancaları, sunucudaki botlar, Geliştirici Portalı'nda kendi botunu yazmak ve Minecraft sunucusu bileşeni.",
    icon: "🤖",
    source: botlar,
  },
];

export const HELP_TITLE = "Hoffle Kullanım Kılavuzu";

export function findHelpChapter(slug: string): HelpChapter | undefined {
  return HELP_CHAPTERS.find((chapter) => chapter.slug === slug);
}

export function helpHref(chapter?: HelpChapter): string {
  return chapter ? `/help/${chapter.slug}` : "/help";
}

export interface HelpSection {
  id: string;
  text: string;
}

/** Anchor ids that keep Turkish letters, like GitHub's. */
function makeSlugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text
      .toLocaleLowerCase("tr")
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
export function helpSections(chapter: HelpChapter): HelpSection[] {
  const slug = makeSlugger();
  const sections: HelpSection[] = [];
  for (const token of new Marked({ gfm: true }).lexer(chapter.source)) {
    if (token.type !== "heading") continue;
    const text = plainText(token.tokens);
    const id = slug(text);
    if (token.depth === 2) sections.push({ id, text });
  }
  return sections;
}

export function renderHelp(chapter: HelpChapter): { html: string; sections: HelpSection[] } {
  const tokens = new Marked({ gfm: true }).lexer(expandVideos(chapter.source));
  // The page supplies its own <h1>.
  const first = tokens.findIndex((token) => token.type !== "space");
  if (first >= 0 && tokens[first].type === "heading" && (tokens[first] as { depth: number }).depth === 1) {
    tokens.splice(first, 1);
  }
  const sections: HelpSection[] = [];
  const slug = makeSlugger();
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
