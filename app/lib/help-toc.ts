/**
 * The manual's chapters, light enough for the app bundle (app/lib/help.ts pulls in
 * every chapter's text). help.test.ts checks this stays in step with it.
 */
export const HELP_TOC = {
  tr: [
    { slug: "baslarken", title: "Başlarken", icon: "👋" },
    { slug: "sunucular", title: "Sunucular ve kanallar", icon: "🏠" },
    { slug: "roller", title: "Roller ve izinler", icon: "🛡️" },
    { slug: "moderasyon", title: "Moderasyon ve güvenlik", icon: "🚨" },
    { slug: "mesajlasma", title: "Mesajlaşma", icon: "💬" },
    { slug: "arkadaslar", title: "Arkadaşlar ve özel mesajlar", icon: "🤝" },
    { slug: "sesli-sohbet", title: "Sesli sohbet ve ekran paylaşımı", icon: "🎙️" },
    { slug: "dnd", title: "D&D ve masa oyunları", icon: "🐉" },
    { slug: "tavern", title: "D&D Companion (Tavern)", icon: "🏰" },
    { slug: "muzik", title: "Müzik botu ve DJ modu", icon: "🎵" },
    { slug: "oturma-odasi", title: "3D Oturma Odası", icon: "🛋️" },
    { slug: "birlikte-izle", title: "Birlikte İzle ve Reels", icon: "🎬" },
    { slug: "ikinci-ekran", title: "İkinci ekran", icon: "🖥️" },
    { slug: "ayarlar", title: "Ayarlar", icon: "⚙️" },
    { slug: "discord-gecis", title: "Discord'dan geçiş", icon: "🔁" },
    { slug: "profil", title: "Profil ve başarımlar", icon: "🪪" },
    { slug: "temalar", title: "Temalar ve Y2K / MSN", icon: "🎨" },
    { slug: "oyunlar", title: "Oyunlar, aktiviteler ve etkinlikler", icon: "🎲" },
    { slug: "botlar", title: "Botlar ve entegrasyonlar", icon: "🤖" },
  ],
  en: [
    { slug: "getting-started", title: "Getting Started", icon: "👋" },
    { slug: "servers", title: "Servers & Channels", icon: "🏠" },
    { slug: "roles", title: "Roles & Permissions", icon: "🛡️" },
    { slug: "moderation", title: "Moderation & Safety", icon: "🚨" },
    { slug: "messaging", title: "Messaging", icon: "💬" },
    { slug: "friends", title: "Friends & Direct Messages", icon: "🤝" },
    { slug: "voice-chat", title: "Voice Chat & Screen Sharing", icon: "🎙️" },
    { slug: "dnd", title: "D&D & Tabletop", icon: "🐉" },
    { slug: "tavern", title: "D&D Companion (Tavern)", icon: "🏰" },
    { slug: "music", title: "Music Bot & DJ Mode", icon: "🎵" },
    { slug: "living-room", title: "3D Living Room", icon: "🛋️" },
    { slug: "watch-together", title: "Watch Together & Reels", icon: "🎬" },
    { slug: "second-screen", title: "Second Screen", icon: "🖥️" },
    { slug: "settings", title: "Settings", icon: "⚙️" },
    { slug: "moving-from-discord", title: "Moving from Discord", icon: "🔁" },
    { slug: "profile", title: "Profile & Achievements", icon: "🪪" },
    { slug: "themes", title: "Themes & Y2K / MSN", icon: "🎨" },
    { slug: "games", title: "Games, Activities & Events", icon: "🎲" },
    { slug: "bots", title: "Bots & Integrations", icon: "🤖" },
  ],
} as const;

export const HELP_SITE = "https://hoffle.online";

/** Full link to the manual (or one chapter) in the language closest to the interface. */
export function helpUrl(lang: "tr" | "en", slug?: string): string {
  const base = `${HELP_SITE}${lang === "tr" ? "/help" : "/en/help"}`;
  return slug ? `${base}/${slug}` : base;
}
