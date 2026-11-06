/**
 * Every word on hoffle.online's landing page, in English and Turkish
 * (hoffle.online/tr). The page itself is app/components/landing-page.tsx.
 *
 * Write it the way you'd explain Hoffle to a friend, and only claim what the
 * app does today. The Turkish is its own text, not a word-for-word copy:
 * keep the meaning in step, not the sentences.
 */

export type LandingLang = "en" | "tr";

export const LANDING_PATH: Record<LandingLang, string> = { en: "/", tr: "/tr" };

export interface LandingCopy {
  meta: { title: string; description: string; ogLocale: string };
  nav: { features: string; themes: string; download: string; docs: string; open: string; otherLang: string; otherLangShort: string; otherLangLabel: string };
  footer: { madeBy: string; notDiscord: string; webApp: string; download: string; docs: string; selfHost: string; faq: string; status: string; terms: string; privacy: string };
  hero: {
    /** Phrases that stay whole, so the lines only ever break between them. */
    title: string[];
    body: string;
    open: string; downloadFor: (os: string) => string; downloadGeneric: string;
    onPhone: string;
  };
  live: {
    lead: string;
    tryRoll: string;
    anyTheme: string;
    /** {n} is filled in on the client, so this has to stay a plain string. */
    moreThemes: string;
    frameTitle: string;
    name: { titleRoll: string; titleSend: string; lead: string; label: string; placeholder: string; cancel: string; sending: string; roll: string; send: string; offline: string; badName: string; failed: string };
    join: { title: string; partOfThing: string | null; partOfPlain: string; joinTitle: string; joinBody: string; create: string; hostTitle: string; hostBody: string; guide: string };
  };
  /** Shown only once the community's invite (COMMUNITY_INVITE) exists. */
  /** `members` is null while the community is too small for a number to help. */
  community: { line: (members: number | null, online: number) => string; button: string; read: string };
  features: {
    title: string;
    lead: string;
    cards: Record<"call" | "music" | "games" | "chat", { title: string; body: string }>;
    /** The words inside the drawn scenes. */
    scenes: { movieNight: string; live: string; sharing: string; sameSecond: string; upNext: string; rolled: string; chatKai: string; chatMira: string };
    more: { title: string; body: string }[];
    themesLine: (count: number) => string;
    musicBotLink: string;
    musicBotLead: string;
    musicBotTail: string;
  };
  tour: {
    /** Strings for the client-side slideshow: {i}, {n} and {name} are filled in there. */
    controls: { label: string; counter: string; prev: string; next: string; show: string };
    msn: { title: string; intro: string; points: string[]; emoticons: string; alt: string; toast: string };
    vampire: { intro: string; points: string[]; alt: string; toast: string };
    cyberpunk: { intro: string; points: string[]; alt: string; toast: string };
    matrix: { intro: string; points: string[]; alt: string; toast: [string, string] };
  };
  compare: { title: string; lead: string; caption: string; featureColumn: string; discord: string; rows: { label: string; discord: string; hoffle: string }[]; source: string; full: string };
  /** Coming from Discord: the one-link move. */
  moving: { title: string; lead: string; steps: string[] };
  staying: { title: string; lead: string; points: { title: string; body: string }[]; status: string };
  download: {
    title: string;
    lead: string;
    browserTitle: string;
    browserBody: string;
    browserButton: string;
    desktopTitle: string;
    desktopBody: string;
    smallerTitle: string;
    warningTitle: string;
    rows: { windows: string; macArm: string; macIntel: string; linux: string; lite: string; native: string };
    files: { windows: string; macArm: string; macIntel: string; linux: string; lite: string; native: string };
    action: string;
    version: (v: string) => string;
    windowsUnsigned: string;
    macUnsigned: string;
    phoneTitle: string;
    phoneBody: string;
    phoneAlt: string;
  };
  selfHost: { title: string; body: string; points: string[]; guide: string; after: string; copy: string; copied: string };
  faq: { title: string; items: { q: string; a: string }[] };
  closing: { title: string; body: string };
  about: { body: string; github: string; kofi: string; sponsors: string };
}

const en: LandingCopy = {
  meta: {
    title: "Hoffle: the free, open-source Discord alternative",
    description:
      "Voice chat, 1080p screen sharing with sound, music together and D&D tools for your friends. Free, open source, no Nitro. Browser, desktop or self-hosted.",
    ogLocale: "en_US",
  },
  nav: {
    features: "Features",
    themes: "Themes",
    download: "Download",
    docs: "Docs",
    open: "Open Hoffle",
    otherLang: "Türkçe",
    otherLangShort: "TR",
    otherLangLabel: "Bu sayfayı Türkçe oku",
  },
  footer: {
    madeBy: "Hoffle is open source under the AGPL-3.0. Made by",
    notDiscord: "Hoffle is not affiliated with or endorsed by Discord Inc. Discord is a trademark of Discord Inc.",
    webApp: "Web app",
    download: "Download",
    docs: "Docs",
    selfHost: "Self-hosting guide",
    faq: "FAQ",
    status: "Status",
    terms: "Terms",
    privacy: "Privacy",
  },
  hero: {
    title: ["Game night,", "movie night,", "any night."],
    body:
      "Hoffle is a free, open-source chat app for your friend group, with voice, 1080p screen sharing, music and D&D tools built in. It runs right in your browser.",
    open: "Open Hoffle",
    downloadFor: (os) => `Download for ${os}`,
    downloadGeneric: "Get the desktop app",
    onPhone: "Add it to your home screen",
  },
  live: {
    lead: "This channel is live.",
    tryRoll: "Say hi, ask me something (I read all of it), or try",
    anyTheme: "Try another theme:",
    moreThemes: "{n} more",
    frameTitle: "#say-hi, a live Hoffle channel",
    name: {
      titleRoll: "What name should we roll this under?",
      titleSend: "What name should we send this with?",
      lead: "Everyone on this page will see it under this name.",
      label: "Your name",
      placeholder: "e.g. Sam",
      cancel: "Cancel",
      sending: "Sending…",
      roll: "Roll",
      send: "Send message",
      offline: "Couldn't reach Hoffle. Check your connection and try again.",
      badName: "That name can't be used.",
      failed: "That didn't go through. Try again in a moment.",
    },
    join: {
      title: "Try the whole Hoffle",
      // {What} is "#general" or "the Lounge voice room", from the embed.
      partOfThing:
        "{What} is part of the full app. This page only has #say-hi; the real thing has every channel, voice rooms, 1080p screen sharing and the music bot. Two ways in:",
      partOfPlain:
        "That's part of the full app. This page only has #say-hi; the real thing has every channel, voice rooms, 1080p screen sharing and the music bot. Two ways in:",
      joinTitle: "Join chat.hoffle.online",
      joinBody: "Anyone can join: pick a name and a password and you're in. It's free, and it stays free.",
      create: "Create an account",
      hostTitle: "Host your own",
      hostBody: "Free, with Docker, on a spare PC or a small server. The first account becomes the owner and invites everyone else.",
      guide: "Self-hosting guide",
    },
  },
  community: {
    line: (members, online) =>
      `There's also the Hoffle community, where people who use Hoffle hang out, swap themes and find people to play with${members === null ? "." : `: ${members} members, ${online} online right now.`}`,
    button: "Join the community",
    read: "Read the chat",
  },
  features: {
    title: "Everything your group does together.",
    lead: "All of it is in the app today, for everyone, with nothing to unlock.",
    cards: {
      call: {
        title: "Talk, share, watch",
        body: "Noise suppression keeps fans, keyboards and the TV out of the call. Share your screen at up to 1080p and 60 fps, with the game or film audio.",
      },
      music: {
        title: "Music, in sync",
        body: "One shared queue, so everyone hears the same second of the song. Lyrics, a two-deck DJ booth and Watch Together rooms for YouTube and reels too.",
      },
      games: {
        title: "Game night, built in",
        body: "Battlemaps with tokens and fog of war, 3D dice everyone sees land, and a spell and monster compendium right inside the call.",
      },
      chat: {
        title: "Chat, the way you like it",
        body: "Threads, replies, reactions, custom emoji and stickers, GIFs and voice messages, plus events with RSVPs and search with filters.",
      },
    },
    scenes: {
      movieNight: "Movie night",
      live: "LIVE",
      sharing: "Mira's screen, with sound",
      sameSecond: "All on the same second",
      upNext: "Up next",
      rolled: "Kai rolled 17",
      chatKai: "movie at 9? I'll share my screen",
      chatMira: "in. bringing snacks",
    },
    more: [
      { title: "In the call", body: "Spatial audio seating, virtual backgrounds, and push-to-talk that keeps working while a game has focus (desktop app)." },
      { title: "Party games", body: "A whiteboard, Draw & Guess, tier lists, polls and a soundboard." },
      { title: "Discord bots", body: "Bots written with discord.js or discord.py connect without code changes, and a bridge mirrors channels you still keep on Discord." },
    ],
    themesLine: (count) => `${count} built-in themes, plus your own in CSS. Profile banners, pride badges and a nickname per server.`,
    musicBotLead: "The music bot is",
    musicBotLink: "its own open-source project",
    musicBotTail: "and also plays in Discord voice channels.",
  },
  tour: {
    controls: { label: "Theme tour", counter: "Theme tour · {i} of {n}", prev: "Previous theme", next: "Next: {name}", show: "Show {name}" },
    msn: {
      title: "The Y2K Chat theme",
      intro:
        "A full second interface for Hoffle, modelled on Windows Live Messenger. Messages read “Mira says:”, friends signing in show a toast, and a nudge shakes the other person's window.",
      points: [
        "A contact list with your own groups, and a quiet list",
        "Display pictures, personal emoticons, winkies and handwriting",
        "Y2K Today: who's around, unread conversations and what's playing",
      ],
      emoticons: "Emoticons that turn into pictures when you send them",
      alt: "A Hoffle channel in the Y2K Chat theme, with “says:” before each message and a Winkies, Voice Clip, Handwriting, Backgrounds and Nudge toolbar",
      toast: "has just signed in.",
    },
    vampire: {
      intro: "Gothic midnight: blood red on black velvet. Channel names and server titles are set in blackletter and glow faintly red.",
      points: [
        "Blackletter headings with a red glow",
        "Velvet gradients down the sidebars and member list",
        "The message box glows red while you type",
      ],
      alt: "Hoffle's Vampire theme: the Tuesday Crew server in blackletter with a red glow, a friend group's channel and six people online",
      toast: "has risen.",
    },
    cyberpunk: {
      intro: "A neon street terminal: acid yellow and cyan on black, hard clipped corners, and faint CRT scanlines over everything.",
      points: [
        "Headings with a red and cyan chromatic split",
        "Clipped corners on server icons, channels and the message box",
        "Monospace cyan labels and timestamps",
      ],
      alt: "Hoffle's Cyberpunk theme: acid yellow on black, the selected channel as a clipped yellow tab and cyan labels",
      toast: "jacked in",
    },
    matrix: {
      intro: "Phosphor green on black, monospace type, and digital rain falling behind slightly see-through panels.",
      points: [
        "Digital rain behind the glass, or one still frame if you've asked for reduced motion",
        "A blinking cursor after the channel name",
        "The selected channel reads like a terminal's highlighted line",
      ],
      alt: "Hoffle's Matrix theme: phosphor green monospace text over digital rain",
      toast: ["Wake up,", "Sam has joined the Lounge."],
    },
  },
  compare: {
    title: "Hoffle compared to Discord",
    lead: "Discord's free plan next to Hoffle, in numbers. Discord is the better choice for big public communities and has proper phone apps; Hoffle is made for groups of friends.",
    caption: "Hoffle compared with Discord's free plan",
    featureColumn: "Feature",
    discord: "Discord (free)",
    rows: [
      { label: "Price", discord: "Free; Nitro is $9.99 a month (US)", hoffle: "Free, no paid tier" },
      { label: "Screen share", discord: "720p at 30 fps (1080p60 and up with Nitro)", hoffle: "Up to 1080p at 60 fps, with audio" },
      { label: "Custom emoji in other servers", discord: "Nitro only", hoffle: "Free" },
      { label: "Source code", discord: "Closed", hoffle: "Open source, AGPL-3.0" },
      { label: "Host it yourself", discord: "No", hoffle: "Yes, with Docker" },
      { label: "Bots", discord: "Yes", hoffle: "discord.js and discord.py bots connect unchanged" },
      { label: "Phone", discord: "iOS and Android apps", hoffle: "Phone browser, added to the home screen, with notifications" },
    ],
    source: "Discord figures are from discord.com/nitro and Discord's help centre, October 2026.",
    full: "The full comparison →",
  },
  moving: {
    title: "Coming from Discord?",
    lead: "Bring your server with you. Channels, categories, roles and who can see what come across in one go, no bot needed.",
    steps: [
      "In Discord, open Server Settings → Server Template and copy the link.",
      "In Hoffle, press + → Create New and paste the link instead of a name.",
      "Post the ready-made \"we're moving\" message Hoffle gives you, invite link included.",
    ],
  },
  staying: {
    title: "Built to stick around.",
    lead: "Moving your group is a big step. Hoffle is one person's project, so it's set up to keep running, and to never lock you in.",
    points: [
      {
        title: "Backed up every five minutes",
        body: "Every message and upload is copied to a second server in Germany every five minutes, and to a separate disk every night.",
      },
      {
        title: "Stays up by itself",
        body: "If the main server stops answering, the one in Germany takes over on its own, usually within three minutes.",
      },
      {
        title: "Your stuff is yours",
        body: "Settings → Password & Security → Download my data gives you everything you've posted, as one file, whenever you like.",
      },
      {
        title: "Open source, for good",
        body: "The code is AGPL, so nobody can lock it up, not even me. Your group can always carry on with its own Hoffle on any PC.",
      },
    ],
    status: "Live status and uptime",
  },
  download: {
    title: "Download Hoffle",
    lead: "You don't need to install anything: Hoffle works in Chrome, Edge, Firefox and Safari. If you'd like it in your taskbar or dock, there are two ways.",
    browserTitle: "Install it from your browser",
    browserBody:
      "Open Hoffle in Chrome or Edge and click Install. In Safari on a Mac: File → Add to Dock. No installer, nothing to approve, and it keeps itself up to date.",
    browserButton: "Install Hoffle",
    desktopTitle: "Or get the desktop app",
    desktopBody: "It adds push-to-talk that works while a game has focus, and your computer's sound when you share your screen.",
    smallerTitle: "Smaller builds",
    warningTitle: "Seeing a warning when you open it?",
    rows: { windows: "Windows", macArm: "Mac (Apple chip)", macIntel: "Mac (Intel)", linux: "Linux", lite: "Hoffle Lite", native: "Hoffle Native" },
    files: {
      windows: ".exe installer",
      macArm: ".dmg, M1 and newer",
      macIntel: ".dmg, older Macs",
      linux: ".AppImage, Wayland and X11",
      lite: "a much smaller app for Windows and Mac",
      native: "beta: the lightest one, under 1 MB, for Windows, Mac (Apple chip) and Linux (no voice calls on Linux yet)",
    },
    action: "Download",
    version: (v) => `Version ${v}, downloaded straight from hoffle.online.`,
    windowsUnsigned:
      "Windows: the first time, a blue “Windows protected your PC” box may show up, because the app isn't code-signed yet (that's being sorted). Click More info, then Run anyway. Or install from the browser above, which never asks.",
    macUnsigned:
      "Mac: if it says the app can't be opened, go to System Settings → Privacy & Security, scroll down and click Open Anyway.",
    phoneTitle: "On your phone",
    phoneBody: "Open chat.hoffle.online and add it to your home screen. It works like an app, notifications included (on an iPhone, add it to the home screen first).",
    phoneAlt: "Hoffle on a phone: the same channel in the Cozy theme with the message box at the bottom",
  },
  selfHost: {
    title: "Run your own Hoffle",
    body: "Hoffle runs on a spare PC, a home server or a small VPS with Docker. The first account you create becomes the owner, and a backup is just a copy of one folder.",
    points: [
      "No configuration needed for a first run",
      "Add LiveKit, the music bot or a TURN relay with a Docker profile",
      "The desktop app can point at your server from its menu",
    ],
    guide: "Self-hosting guide, step by step",
    after: "# then open http://localhost:8730 and make your account",
    copy: "Copy",
    copied: "Copied",
  },
  faq: {
    title: "Questions",
    items: [
      { q: "Is it free?", a: "Yes. There's no paid tier and nothing is locked. The code is AGPL-3.0, so it stays open." },
      {
        q: "How do I get in?",
        a: "Anyone can make a free account on chat.hoffle.online: open it, pick a name and a password, and you're in. If a friend sent you an invite link, open that instead and you'll land in their server.",
      },
      {
        q: "Do my friends have to install anything?",
        a: "No, it works in the browser. The desktop app adds push-to-talk that works in games, a screen-share picker with your computer's sound, and taskbar or dock notifications.",
      },
      {
        q: "How many people fit in a voice call?",
        a: "On chat.hoffle.online calls go through LiveKit, so there's no fixed limit; the server's upload speed is what runs out first. A self-hosted server without LiveKit uses peer-to-peer calls, which work well up to about 8 people.",
      },
      {
        q: "Is there a phone app?",
        a: "Not in the stores yet. Open chat.hoffle.online on your phone and add it to your home screen; it then works like an app, notifications included. Rather keep Google and Apple out of it? Hoffle can send them through the free ntfy app instead.",
      },
      {
        q: "Who can read my messages?",
        a: "Like with most chat apps, whoever runs the server can. On chat.hoffle.online that's me, Abdullah. I don't go through people's chats, there are no ads or trackers, and nothing gets sold. If you'd rather it be you, host your own.",
      },
      {
        q: "How does it stay free?",
        a: "It's cheap to run: a home server and a free cloud machine, so it doesn't need your money to stay up. Ko-fi tips go to hardware and code-signing.",
      },
      {
        q: "What if Hoffle shuts down?",
        a: "You'd get at least three months' notice, in the app and by email, and data downloads stay open until the last day. The code is open too, so your group can keep going on its own server.",
      },
      {
        q: "What does the Y2K Chat theme change?",
        a: "The whole layout, not only the colours: a contact list with groups, “says:” before each message, display pictures, personal emoticons, nudges, winkies, handwriting, chat backgrounds, sign-in toasts with their own sounds, and an Y2K Today window. Pick it in Settings → Appearance.",
      },
    ],
  },
  closing: {
    title: "Your group is one link away.",
    body: "Make a free account, send your friends an invite link, and you're all in. Nothing to install.",
  },
  about: {
    body: "I started Hoffle for my own friend group, who spent most evenings in a Discord call. I'm Abdullah, I make it in the Netherlands, and most of the ideas in it came from those friends. Bug reports and pull requests are welcome on GitHub, or just say hi in #say-hi up top.",
    github: "Hoffle on GitHub",
    kofi: "Support on Ko-fi",
    sponsors: "GitHub Sponsors",
  },
};

const tr: LandingCopy = {
  meta: {
    title: "Hoffle: ücretsiz, açık kaynak Discord alternatifi",
    description:
      "Arkadaşların için sesli sohbet, sesli 1080p ekran paylaşımı, birlikte müzik ve D&D araçları. Ücretsiz, açık kaynak, Nitro yok. Tarayıcıda, masaüstünde ya da kendi sunucunda.",
    ogLocale: "tr_TR",
  },
  nav: {
    features: "Özellikler",
    themes: "Temalar",
    download: "İndir",
    docs: "Belgeler",
    open: "Hoffle'ı aç",
    otherLang: "English",
    otherLangShort: "EN",
    otherLangLabel: "Read this page in English",
  },
  footer: {
    madeBy: "Hoffle, AGPL-3.0 lisanslı açık kaynak bir proje. Yapan:",
    notDiscord: "Hoffle'ın Discord Inc. ile bir bağı yoktur. Discord, Discord Inc.'in ticari markasıdır.",
    webApp: "Web uygulaması",
    download: "İndir",
    docs: "Belgeler",
    selfHost: "Kendi sunucunda kur",
    faq: "SSS",
    status: "Durum",
    terms: "Kullanım koşulları",
    privacy: "Gizlilik",
  },
  hero: {
    title: ["Oyun gecesi,", "film gecesi,", "her gece."],
    body:
      "Hoffle, arkadaş grubun için ücretsiz ve açık kaynak bir sohbet uygulaması. Sesli sohbet, 1080p ekran paylaşımı, müzik ve D&D araçları içinde geliyor; doğrudan tarayıcında çalışıyor.",
    open: "Hoffle'ı aç",
    downloadFor: (os) => `${os} için indir`,
    downloadGeneric: "Masaüstü uygulamasını indir",
    onPhone: "Ana ekranına ekle",
  },
  live: {
    lead: "Bu kanal canlı.",
    tryRoll: "Selam ver, bir şey sor (hepsini okuyorum) ya da şunu dene:",
    anyTheme: "Başka bir tema dene:",
    moreThemes: "{n} tema daha",
    frameTitle: "#say-hi, canlı bir Hoffle kanalı",
    name: {
      titleRoll: "Bu zarı hangi isimle atalım?",
      titleSend: "Bunu hangi isimle gönderelim?",
      lead: "Bu sayfadaki herkes mesajını bu isimle görecek.",
      label: "Adın",
      placeholder: "ör. Deniz",
      cancel: "Vazgeç",
      sending: "Gönderiliyor…",
      roll: "Zar at",
      send: "Mesajı gönder",
      offline: "Hoffle'a ulaşılamadı. Bağlantını kontrol edip tekrar dene.",
      badName: "Bu isim kullanılamıyor.",
      failed: "Gönderilemedi. Birazdan tekrar dene.",
    },
    join: {
      title: "Hoffle'ın tamamını dene",
      // The embed names what was clicked in English, so it stays out of this one.
      partOfThing: null,
      partOfPlain:
        "Bu, uygulamanın tam sürümünde var. Bu sayfada yalnızca #say-hi var; asıl uygulamada bütün kanallar, sesli odalar, 1080p ekran paylaşımı ve müzik botu seni bekliyor. İki yolu var:",
      joinTitle: "chat.hoffle.online'a katıl",
      joinBody: "Herkes katılabilir: bir isim ve şifre seç, içeridesin. Ücretsiz ve öyle kalacak.",
      create: "Hesap oluştur",
      hostTitle: "Kendi sunucunu kur",
      hostBody: "Ücretsiz, Docker ile, boşta duran bir bilgisayarda ya da küçük bir sunucuda. İlk açılan hesap sahibi olur ve diğerlerini davet eder.",
      guide: "Kurulum rehberi",
    },
  },
  community: {
    line: (members, online) =>
      `Bir de Hoffle topluluğu var: Hoffle kullananlar orada takılıyor, tema paylaşıyor, birlikte oynayacak birilerini buluyor.${members === null ? "" : ` ${members} üye, şu an ${online} kişi çevrimiçi.`}`,
    button: "Topluluğa katıl",
    read: "Sohbeti oku",
  },
  features: {
    title: "Grubunla yaptığın her şey, tek yerde.",
    lead: "Hepsi bugün uygulamada, herkes için; kilitli hiçbir şey yok.",
    cards: {
      call: {
        title: "Konuş, paylaş, izle",
        body: "Gürültü engelleme fan, klavye ve televizyon sesini görüşmenin dışında tutar. Ekranını oyunun ya da filmin sesiyle birlikte 60 fps'de 1080p'ye kadar paylaş.",
      },
      music: {
        title: "Herkes aynı saniyede",
        body: "Ortak bir sıra, herkes şarkının aynı saniyesini duyar. Şarkı sözleri, iki desteli DJ kabini ve YouTube ile reels için Birlikte İzle odaları da var.",
      },
      games: {
        title: "Oyun gecesi içinde",
        body: "Piyonlu ve savaş sisli haritalar, herkesin gözü önünde düşen 3D zarlar ve görüşmenin içinde büyü ve canavar ansiklopedisi.",
      },
      chat: {
        title: "Sohbet de tam istediğin gibi",
        body: "Konular, yanıtlar, tepkiler, özel emoji ve çıkartmalar, GIF'ler ve sesli mesajlar. Katılım bildirimli etkinlikler ve filtreli arama da var.",
      },
    },
    scenes: {
      movieNight: "Film gecesi",
      live: "CANLI",
      sharing: "Mira'nın ekranı, sesiyle",
      sameSecond: "Herkes aynı saniyede",
      upNext: "Sırada",
      rolled: "Kai 17 attı",
      chatKai: "9'da film? ekranımı paylaşırım",
      chatMira: "varım. atıştırmalık benden",
    },
    more: [
      { title: "Görüşmede", body: "Uzamsal ses ile oturma düzeni, sanal arka planlar ve oyun açıkken bile çalışan bas-konuş (masaüstü uygulamasında)." },
      { title: "Parti oyunları", body: "Beyaz tahta, Çiz ve Bil, tier listeleri, anketler ve ses efektleri paneli." },
      { title: "Discord botları", body: "discord.js ya da discord.py ile yazılmış botlar kod değiştirmeden bağlanır; Discord'da tuttuğun kanalları buraya yansıtan bir köprü de var." },
    ],
    themesLine: (count) => `${count} hazır tema ve CSS ile yazdığın kendi temaların. Profil kapakları, onur rozetleri ve her sunucuda ayrı takma ad.`,
    musicBotLead: "Müzik botu kendi başına",
    musicBotLink: "açık kaynak bir proje",
    musicBotTail: "ve Discord sesli kanallarında da çalıyor.",
  },
  tour: {
    controls: { label: "Tema turu", counter: "Tema turu · {i} / {n}", prev: "Önceki tema", next: "Sıradaki: {name}", show: "{name} temasını göster" },
    msn: {
      title: "Y2K Sohbet teması",
      intro:
        "Windows Live Messenger'ı örnek alan, Hoffle için baştan sona ikinci bir arayüz. Mesajlar “Mira diyor ki:” diye başlar, arkadaşın bağlanınca köşede bildirim çıkar, titreşim gönderince karşı tarafın penceresi sallanır.",
      points: [
        "Kendi gruplarınla bir kişi listesi ve sessiz liste",
        "Profil resimleri, kişisel ifadeler, göz kırpmalar ve el yazısı",
        "Y2K Bugün: kim çevrimiçi, okunmamış konuşmalar ve ne çalıyor",
      ],
      emoticons: "Gönderince resme dönüşen ifadeler",
      alt: "Y2K Sohbet temasında bir Hoffle kanalı: her mesajın başında “diyor ki:” ve Göz kırp, Ses klibi, El yazısı, Arka plan, Titreşim düğmeleri",
      toast: "oturum açtı.",
    },
    vampire: {
      intro: "Gotik bir gece yarısı: siyah kadife üstünde kan kırmızısı. Kanal adları ve sunucu başlıkları gotik harflerle yazılır ve hafifçe kırmızı parlar.",
      points: [
        "Kırmızı ışıltılı gotik başlıklar",
        "Kenar çubuklarında ve üye listesinde kadife geçişler",
        "Yazarken kırmızı parlayan mesaj kutusu",
      ],
      alt: "Hoffle'ın Vampir teması: kırmızı ışıltılı gotik harflerle Tuesday Crew sunucusu, bir arkadaş grubunun kanalı ve çevrimiçi altı kişi",
      toast: "dirildi.",
    },
    cyberpunk: {
      intro: "Neon bir sokak terminali: siyah üstünde asit sarısı ve camgöbeği, keskin kesik köşeler ve her şeyin üstünde belli belirsiz CRT çizgileri.",
      points: [
        "Kırmızı ve camgöbeği renk kaymalı başlıklar",
        "Sunucu simgelerinde, kanallarda ve mesaj kutusunda kesik köşeler",
        "Tek aralıklı camgöbeği etiketler ve zaman damgaları",
      ],
      alt: "Hoffle'ın Cyberpunk teması: siyah üstünde asit sarısı, seçili kanal kesik sarı bir sekme ve camgöbeği etiketler",
      toast: "sisteme girdi",
    },
    matrix: {
      intro: "Siyah üstünde fosfor yeşili, tek aralıklı yazı ve hafif saydam panellerin arkasından yağan dijital yağmur.",
      points: [
        "Camın arkasında dijital yağmur; azaltılmış hareket seçiliyse tek bir sabit kare",
        "Kanal adının sonunda yanıp sönen imleç",
        "Seçili kanal, terminalde işaretli bir satır gibi görünür",
      ],
      alt: "Hoffle'ın Matrix teması: dijital yağmurun üstünde fosfor yeşili tek aralıklı yazı",
      toast: ["Uyan,", "Sam Lounge'a katıldı."],
    },
  },
  compare: {
    title: "Hoffle ve Discord karşılaştırması",
    lead: "Discord'un ücretsiz planı ile Hoffle, rakamlarla yan yana. Büyük ve herkese açık topluluklar için Discord daha iyi bir seçim ve gerçek telefon uygulamaları var; Hoffle ise arkadaş grupları için yapıldı.",
    caption: "Hoffle ile Discord'un ücretsiz planının karşılaştırması",
    featureColumn: "Özellik",
    discord: "Discord (ücretsiz)",
    rows: [
      { label: "Fiyat", discord: "Ücretsiz; Nitro aylık 9,99 $ (ABD)", hoffle: "Ücretsiz, ücretli plan yok" },
      { label: "Ekran paylaşımı", discord: "30 fps'de 720p (Nitro ile 1080p60 ve üstü)", hoffle: "Sesiyle birlikte 60 fps'de 1080p'ye kadar" },
      { label: "Başka sunucularda özel emoji", discord: "Yalnızca Nitro ile", hoffle: "Ücretsiz" },
      { label: "Kaynak kodu", discord: "Kapalı", hoffle: "Açık kaynak, AGPL-3.0" },
      { label: "Kendin barındır", discord: "Hayır", hoffle: "Evet, Docker ile" },
      { label: "Botlar", discord: "Var", hoffle: "discord.js ve discord.py botları olduğu gibi bağlanır" },
      { label: "Telefon", discord: "iOS ve Android uygulamaları", hoffle: "Ana ekrana eklenen telefon tarayıcısı, bildirimleriyle" },
    ],
    source: "Discord rakamları discord.com/nitro ve Discord yardım merkezinden, Ekim 2026.",
    full: "Tam karşılaştırma →",
  },
  moving: {
    title: "Discord'dan mı geliyorsun?",
    lead: "Sunucunu da getir. Kanallar, kategoriler, roller ve kimin neyi göreceği tek seferde gelir, bot gerekmez.",
    steps: [
      "Discord'da Sunucu Ayarları → Sunucu Şablonu'nu aç ve linki kopyala.",
      "Hoffle'da + → Yeni Oluştur'a bas ve linki isim yerine yapıştır.",
      "Hoffle'ın verdiği hazır \"taşınıyoruz\" mesajını, davet linkiyle birlikte at.",
    ],
  },
  staying: {
    title: "Kalıcı olsun diye yapıldı.",
    lead: "Grubunu taşımak büyük bir adım. Hoffle tek bir kişinin projesi; o yüzden hem ayakta kalacak hem de seni hiçbir zaman kilitlemeyecek şekilde kuruldu.",
    points: [
      {
        title: "Beş dakikada bir yedekleniyor",
        body: "Her mesaj ve her dosya beş dakikada bir Almanya'daki ikinci bir sunucuya, her gece de ayrı bir diske kopyalanıyor.",
      },
      {
        title: "Kendi kendine ayakta kalıyor",
        body: "Ana sunucu cevap vermeyi bırakırsa Almanya'daki sunucu kendi kendine devralıyor, genelde üç dakika içinde.",
      },
      {
        title: "Senin verin senin",
        body: "Ayarlar → Şifre ve Güvenlik → Verilerimi indir ile paylaştığın her şeyi istediğin zaman tek bir dosya olarak alabilirsin.",
      },
      {
        title: "Hep açık kaynak",
        body: "Kod AGPL lisanslı; kimse kilitleyemez, ben bile. Grubun her zaman herhangi bir bilgisayarda kendi Hoffle'ıyla devam edebilir.",
      },
    ],
    status: "Canlı durum ve çalışma süresi",
  },
  download: {
    title: "Hoffle'ı indir",
    lead: "Bir şey kurman gerekmiyor: Hoffle Chrome, Edge, Firefox ve Safari'de çalışıyor. Görev çubuğunda ya da Dock'ta durmasını istersen iki yolu var.",
    browserTitle: "Tarayıcından yükle",
    browserBody:
      "Hoffle'ı Chrome ya da Edge'de aç ve Yükle'ye tıkla. Mac'te Safari'de: Dosya → Dock'a Ekle. Kurulum dosyası yok, onaylanacak bir şey yok ve kendini güncel tutuyor.",
    browserButton: "Hoffle'ı yükle",
    desktopTitle: "Ya da masaüstü uygulamasını indir",
    desktopBody: "Oyun açıkken de çalışan bas-konuş ve ekran paylaşırken bilgisayarının sesi bu uygulamayla geliyor.",
    smallerTitle: "Daha küçük sürümler",
    warningTitle: "Açarken uyarı mı görüyorsun?",
    rows: { windows: "Windows", macArm: "Mac (Apple çipli)", macIntel: "Mac (Intel)", linux: "Linux", lite: "Hoffle Lite", native: "Hoffle Native" },
    files: {
      windows: ".exe kurulum dosyası",
      macArm: ".dmg, M1 ve sonrası",
      macIntel: ".dmg, eski Mac'ler",
      linux: ".AppImage, Wayland ve X11",
      lite: "Windows ve Mac için çok daha küçük bir uygulama",
      native: "beta: en hafifi, 1 MB'tan küçük; Windows, Mac (Apple çipli) ve Linux için (Linux'ta henüz sesli arama yok)",
    },
    action: "İndir",
    version: (v) => `Sürüm ${v}, doğrudan hoffle.online'dan iniyor.`,
    windowsUnsigned:
      "Windows: ilk açılışta mavi bir “Windows bilgisayarınızı korudu” kutusu çıkabilir, çünkü uygulama henüz kod imzalı değil (bunun için uğraşıyorum). Ek bilgi'ye, sonra Yine de çalıştır'a tıkla. Ya da yukarıdan tarayıcıyla yükle; o hiç sormaz.",
    macUnsigned:
      "Mac: uygulamanın açılamadığını söylerse Sistem Ayarları → Gizlilik ve Güvenlik'e gir, aşağı kaydır ve Yine de Aç'a tıkla.",
    phoneTitle: "Telefonunda",
    phoneBody: "chat.hoffle.online'ı aç ve ana ekrana ekle. Bildirimleri de dahil bir uygulama gibi çalışır (iPhone'da önce ana ekrana ekle).",
    phoneAlt: "Telefonda Hoffle: Cozy temasında aynı kanal, mesaj kutusu altta",
  },
  selfHost: {
    title: "Kendi Hoffle sunucunu kur",
    body: "Hoffle boşta duran bir bilgisayarda, bir ev sunucusunda ya da Docker'lı küçük bir VPS'te çalışır. Açtığın ilk hesap sahibi olur; yedek almak da tek bir klasörü kopyalamaktan ibaret.",
    points: [
      "İlk çalıştırma için hiçbir ayar gerekmez",
      "LiveKit, müzik botu ya da TURN aktarıcıyı birer Docker profiliyle ekle",
      "Masaüstü uygulaması menüsünden senin sunucuna bağlanabilir",
    ],
    guide: "Adım adım kurulum rehberi (İngilizce)",
    after: "# sonra http://localhost:8730 adresini aç ve hesabını oluştur",
    copy: "Kopyala",
    copied: "Kopyalandı",
  },
  faq: {
    title: "Sorular",
    items: [
      { q: "Ücretsiz mi?", a: "Evet. Ücretli bir plan yok, kilitli hiçbir şey yok. Kod AGPL-3.0 lisanslı, yani açık kalacak." },
      {
        q: "Nasıl katılırım?",
        a: "chat.hoffle.online'da herkes ücretsiz hesap açabilir: aç, bir isim ve şifre seç, içeridesin. Bir arkadaşın sana davet bağlantısı gönderdiyse onu aç, doğrudan onun sunucusuna düşersin.",
      },
      {
        q: "Arkadaşlarımın bir şey kurması gerekiyor mu?",
        a: "Hayır, tarayıcıda çalışıyor. Masaüstü uygulaması oyunlarda çalışan bas-konuş, bilgisayar sesiyle ekran paylaşımı ve görev çubuğu bildirimleri ekliyor.",
      },
      {
        q: "Bir sesli görüşmeye kaç kişi sığar?",
        a: "chat.hoffle.online'da görüşmeler LiveKit üzerinden geçtiği için sabit bir sınır yok; önce sunucunun yükleme hızı biter. LiveKit'siz kendi sunucunda görüşmeler eşler arasıdır ve 8 kişiye kadar rahat çalışır.",
      },
      {
        q: "Telefon uygulaması var mı?",
        a: "Mağazalarda henüz yok. Telefonunda chat.hoffle.online'ı açıp ana ekrana ekle; bildirimleri de dahil, bir uygulama gibi çalışır. Google'ı ve Apple'ı işin içine katmak istemiyorsan Hoffle bildirimleri ücretsiz ntfy uygulamasıyla da gönderebilir.",
      },
      {
        q: "Mesajlarımı kim okuyabilir?",
        a: "Çoğu sohbet uygulamasında olduğu gibi sunucuyu çalıştıran kişi okuyabilir. chat.hoffle.online'da o kişi benim, Abdullah. İnsanların sohbetlerini karıştırmam; reklam ya da takipçi yok, hiçbir şey satılmıyor. Bu kişinin sen olmasını istersen kendi sunucunu kur.",
      },
      {
        q: "Nasıl ücretsiz kalıyor?",
        a: "Çalıştırması ucuz: bir ev sunucusu ve ücretsiz bir bulut makinesi yetiyor, ayakta kalmak için senin paranı beklemiyor. Ko-fi bağışları donanıma ve kod imzalamaya gidiyor.",
      },
      {
        q: "Hoffle kapanırsa ne olur?",
        a: "En az üç ay önceden hem uygulamada hem e-postayla haber alırsın; veri indirme son güne kadar açık kalır. Kod da açık olduğu için grubun kendi sunucusunda devam edebilir.",
      },
      {
        q: "Y2K Sohbet teması neyi değiştiriyor?",
        a: "Yalnızca renkleri değil, bütün düzeni: gruplu kişi listesi, her mesajın başında “diyor ki:”, profil resimleri, kişisel ifadeler, titreşimler, göz kırpmalar, el yazısı, sohbet arka planları, kendi sesleriyle oturum açma bildirimleri ve bir Y2K Bugün penceresi. Ayarlar → Görünüm'den seçebilirsin.",
      },
    ],
  },
  closing: {
    title: "Grubun bir link uzağında.",
    body: "Ücretsiz bir hesap aç, arkadaşlarına davet linki gönder, herkes içeride. Kurulacak bir şey yok.",
  },
  about: {
    body: "Hoffle'ı akşamlarının çoğunu Discord'daki bir sesli kanalda geçiren kendi arkadaş grubum için yapmaya başladım. Ben Abdullah, Hollanda'dan yapıyorum; içindeki fikirlerin çoğu da o arkadaşlarımdan geldi. Hata bildirimleri ve pull request'ler GitHub'da her zaman açık, ya da yukarıdaki #say-hi kanalında bir selam ver.",
    github: "GitHub'da Hoffle",
    kofi: "Ko-fi'de destek ol",
    sponsors: "GitHub Sponsors",
  },
};

export const LANDING_COPY: Record<LandingLang, LandingCopy> = { en, tr };
