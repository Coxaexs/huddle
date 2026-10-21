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
  nav: { features: string; themes: string; download: string; staying: string; docs: string; open: string; otherLang: string; otherLangShort: string; otherLangLabel: string };
  footer: { madeBy: string; notDiscord: string; webApp: string; download: string; docs: string; selfHost: string; faq: string; status: string; terms: string; privacy: string };
  hero: { title: string; body: string; open: string; downloadFor: (os: string) => string; downloadGeneric: string; onPhone: string };
  live: {
    lead: string;
    tryRoll: string;
    anyTheme: string;
    frameTitle: string;
    name: { titleRoll: string; titleSend: string; lead: string; label: string; placeholder: string; cancel: string; sending: string; roll: string; send: string; offline: string; badName: string; failed: string };
    join: { title: string; partOfThing: string | null; partOfPlain: string; joinTitle: string; joinBody: string; create: string; hostTitle: string; hostBody: string; guide: string };
  };
  /** Shown only once the community's invite (COMMUNITY_INVITE) exists. */
  community: { line: (members: number, online: number) => string; button: string };
  features: { title: string; lead: string; groups: { title: string; items: string[]; lead?: "musicBot" | "themes" }[]; musicBotLink: string; musicBotLead: string; musicBotTail: string };
  themesLine: (count: number, names: string) => string;
  tour: {
    /** Strings for the client-side slideshow: {i}, {n} and {name} are filled in there. */
    controls: { label: string; counter: string; prev: string; next: string; show: string };
    msn: { title: string; intro: string; points: string[]; emoticons: string; alt: string; toast: string };
    vampire: { intro: string; points: string[]; alt: string; toast: string };
    cyberpunk: { intro: string; points: string[]; alt: string; toast: string };
    matrix: { intro: string; points: string[]; alt: string; toast: [string, string] };
  };
  compare: { title: string; lead: string; caption: string; featureColumn: string; discord: string; rows: { label: string; discord: string; hoffle: string }[]; source: string };
  staying: { title: string; lead: string; points: { title: string; body: string }[]; status: string };
  download: {
    title: string;
    lead: string;
    browserTitle: string;
    browserBody: string;
    browserButton: string;
    desktopTitle: string;
    desktopBody: string;
    rows: { windows: string; macArm: string; macIntel: string; linux: string; lite: string };
    files: { windows: string; macArm: string; macIntel: string; linux: string; lite: string };
    action: string;
    version: (v: string) => string;
    windowsUnsigned: string;
    macUnsigned: string;
    phoneTitle: string;
    phoneBody: string;
    phoneAlt: string;
  };
  voice: { title: string; lead: string; points: { title: string; body: string }[] };
  selfHost: { title: string; body: string; points: string[]; guide: string; after: string; copy: string; copied: string };
  faq: { title: string; items: { q: string; a: string }[] };
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
    staying: "Will it last?",
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
    title: "A chat app for small groups, with voice, screen sharing and game night built in.",
    body:
      "I started Hoffle for my own friend group, who spent most evenings in a Discord call. It has the things we used every night: voice, 1080p screen sharing with sound, a music bot, and D&D tools. It's free and open source, and it works right in your browser.",
    open: "Open Hoffle",
    downloadFor: (os) => `Download for ${os}`,
    downloadGeneric: "Get the desktop app",
    onPhone: "Open it on your phone",
  },
  live: {
    lead: "This channel is live.",
    tryRoll: "Say hi, ask me something (I read all of it), or try",
    anyTheme: "In any theme:",
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
      `There's also the Hoffle community, where people who use Hoffle hang out, swap themes and find people to play with: ${members} ${members === 1 ? "member" : "members"}, ${online} online right now.`,
    button: "Join the community",
  },
  features: {
    title: "Features",
    lead: "All of this is in the app today, for everyone.",
    musicBotLead: "A music bot with one shared queue, synced so everyone hears the same second of the song. It's",
    musicBotLink: "its own open-source project",
    musicBotTail: "and also plays in Discord voice channels.",
    groups: [
      {
        title: "Voice and screen sharing",
        items: [
          "Noise suppression runs on your own device, so fans, keyboards and the TV stay out of the call.",
          "Screen share up to 1080p at 60 fps with the game or film audio, plus 24 fps film modes that stay smooth.",
          "Push-to-talk that keeps working while a game has focus (desktop app).",
          "Spatial audio seating and virtual backgrounds.",
        ],
      },
      {
        title: "Music and watching together",
        lead: "musicBot",
        items: [
          "A two-deck DJ booth, lyrics, and Watch Together rooms for YouTube and reels.",
          "A whiteboard, Draw & Guess, tier lists, polls and a soundboard.",
        ],
      },
      {
        title: "D&D",
        items: [
          "Battlemaps with tokens and fog of war.",
          "3D dice with physics, rolled where everyone can see them.",
          "A spell and monster compendium inside the call.",
        ],
      },
      {
        title: "Chat",
        items: [
          "Threads, replies, reactions, custom emoji and stickers, GIFs and voice messages.",
          "Link previews, events with RSVPs, and search with filters.",
        ],
      },
      {
        title: "Discord bots",
        items: [
          "Hoffle speaks the Discord bot API, so bots written with discord.js or discord.py connect without code changes.",
          "A bridge mirrors channels you still keep on Discord.",
        ],
      },
      {
        title: "Themes",
        lead: "themes",
        items: ["Profile banners, pride badges and a nickname per server."],
      },
    ],
  },
  themesLine: (count, names) => `${count} built in: ${names}. Plus themes you write in CSS and share.`,
  tour: {
    controls: { label: "Theme tour", counter: "Theme tour · {i} of {n}", prev: "Previous theme", next: "Next: {name}", show: "Show {name}" },
    msn: {
      title: "The MSN Messenger theme",
      intro:
        "A full second interface for Hoffle, modelled on Windows Live Messenger. It changes the layout and behaviour, not only the colours: messages read “Mira says:”, friends signing in show a toast, and a nudge shakes the other person's window.",
      points: [
        "A contact list with your own groups, and a quiet list",
        "Display pictures, personal emoticons, winks and handwriting",
        "Statuses like Be Right Back and Out to Lunch",
        "A sound for each event, picked in its Sounds settings",
        "MSN Today: who's around, unread conversations and what's playing",
      ],
      emoticons: "Emoticons that turn into pictures when you send them",
      alt: "A Hoffle channel in the MSN Messenger theme, with “says:” before each message and a Winks, Voice Clip, Handwriting, Backgrounds and Nudge toolbar",
      toast: "has just signed in.",
    },
    vampire: {
      intro: "Gothic midnight: blood red on black velvet. Channel names and server titles are set in blackletter and glow faintly red.",
      points: [
        "Blackletter headings with a red glow",
        "Velvet gradients down the sidebars and member list",
        "The message box glows red while you type",
        "Red text selection, and a matching scrollbar",
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
        "Faint CRT scanlines across the whole app",
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
        "Monospace everywhere",
      ],
      alt: "Hoffle's Matrix theme: phosphor green monospace text over digital rain",
      toast: ["Wake up,", "Sam has joined the Lounge."],
    },
  },
  compare: {
    title: "Compared to Discord",
    lead: "Discord's free plan next to Hoffle, in numbers. Discord is the better choice for big public communities and has proper phone apps; Hoffle is made for groups of friends.",
    caption: "Hoffle compared with Discord's free plan",
    featureColumn: "Feature",
    discord: "Discord (free)",
    rows: [
      { label: "Price", discord: "Free; Nitro is $9.99 a month (US)", hoffle: "Free, no paid tier" },
      { label: "Screen share", discord: "720p at 30 fps (1080p60 and up with Nitro)", hoffle: "Up to 1080p at 60 fps, with audio" },
      { label: "File uploads", discord: "10 MB per file", hoffle: "8 MB images, 20 MB PDFs, 40 MB video clips" },
      { label: "Mic quality", discord: "64 kbps default, up to 96 kbps", hoffle: "64 kbps Opus with packet redundancy" },
      { label: "Custom emoji in other servers", discord: "Nitro only", hoffle: "Free" },
      { label: "People in one voice room", discord: "Up to 99 (25 with video)", hoffle: "No set limit; the server's upload is the limit, about 4 Mbps per 1080p viewer" },
      { label: "Source code", discord: "Closed", hoffle: "Open source, AGPL-3.0" },
      { label: "Host it yourself", discord: "No", hoffle: "Yes, with Docker" },
      { label: "Bots", discord: "Yes", hoffle: "discord.js and discord.py bots connect unchanged" },
      { label: "Phone", discord: "iOS and Android apps", hoffle: "Phone browser, added to the home screen, with notifications" },
    ],
    source: "Discord figures are from discord.com/nitro and Discord's help centre, October 2026. Hoffle's upload limits are those of chat.hoffle.online.",
  },
  staying: {
    title: "Is this going to stick around?",
    lead:
      "Fair question before you move your group over. Hoffle is one person's project, so here's how it's run and what happens when something breaks.",
    points: [
      {
        title: "Backed up every five minutes",
        body: "Every message and upload is copied to a second server in Germany every five minutes, and to a separate disk every night.",
      },
      {
        title: "A backup server takes over by itself",
        body: "Hoffle runs on a server at my place. If it stops answering, the one in Germany takes over on its own, usually within three minutes, and hands everything back when the main one is up again.",
      },
      {
        title: "Your stuff is yours",
        body: "Settings → Password & Security → Download my data gives you everything you've posted, as one file, whenever you like.",
      },
      {
        title: "Nobody can lock it up",
        body: "The code is open source (AGPL), so not even I can close it off. If chat.hoffle.online ever went away, your group could carry on with its own Hoffle on any PC.",
      },
      {
        title: "No surprise shutdown",
        body: "If I ever close chat.hoffle.online, you'll hear it at least three months ahead, in the app and by email, and data downloads stay open until the last day.",
      },
      {
        title: "Cheap to keep running",
        body: "It runs on a home server and a free cloud machine, so it doesn't need your money to stay up. Ko-fi tips go to hardware and code-signing.",
      },
    ],
    status: "Live status and uptime",
  },
  download: {
    title: "Download",
    lead: "You don't need to install anything: Hoffle works in Chrome, Edge, Firefox and Safari. If you'd like it in your taskbar or dock, there are two ways.",
    browserTitle: "Install it from your browser",
    browserBody:
      "Open Hoffle in Chrome or Edge and click Install. In Safari on a Mac: File → Add to Dock. On a phone: Share → Add to Home Screen. No installer, nothing to approve, and it keeps itself up to date.",
    browserButton: "Install Hoffle",
    desktopTitle: "Or get the desktop app",
    desktopBody: "It adds push-to-talk that works while a game has focus, and your computer's sound when you share your screen.",
    rows: { windows: "Windows", macArm: "Mac (Apple chip)", macIntel: "Mac (Intel)", linux: "Linux", lite: "Hoffle Lite" },
    files: {
      windows: ".exe installer",
      macArm: ".dmg, M1 and newer",
      macIntel: ".dmg, older Macs",
      linux: ".AppImage, Wayland and X11",
      lite: "a much smaller app for Windows and Mac",
    },
    action: "Download",
    version: (v) => `Version ${v}, downloaded straight from hoffle.online.`,
    windowsUnsigned:
      "Windows: the first time, a blue “Windows protected your PC” box may show up, because the app isn't code-signed yet (that's being sorted). Click More info, then Run anyway. Or install from the browser above, which never asks.",
    macUnsigned:
      "Mac: if it says the app can't be opened, go to System Settings → Privacy & Security, scroll down and click Open Anyway.",
    phoneTitle: "On your phone",
    phoneBody:
      "Open chat.hoffle.online and add it to your home screen. Notifications work too: allow them when Hoffle asks (on an iPhone, add it to the home screen first). Rather keep Google and Apple out of it? Hoffle can send them through the free ntfy app instead.",
    phoneAlt: "Hoffle on a phone: the same channel in the Cozy theme with the message box at the bottom",
  },
  voice: {
    title: "How voice works",
    lead:
      "Since October 2026, calls on chat.hoffle.online run through LiveKit, an open-source media server. Before that, every call was peer-to-peer, which got heavy past about 8 people or when several people watched one screen share. Self-hosted servers can turn it on with a Docker profile and three settings.",
    points: [
      {
        title: "Everyone uploads once",
        body: "You send your mic and screen to the server once and it forwards them, so a room isn't capped at the 6 to 8 people a peer-to-peer call can carry.",
      },
      {
        title: "A slow connection only affects itself",
        body: "Screen shares are sent in two sizes. A viewer on a weak connection gets the smaller one, and the sharer and everyone else keep the full picture.",
      },
      {
        title: "Modes for films and for desktops",
        body: "Film modes run at 24 fps and give up resolution before frames, so movies don't stutter. Desktop modes keep text sharp and give up frames first.",
      },
      {
        title: "Fewer dropouts",
        body: "Mic audio is sent with spare packets, so a lost one is rebuilt instead of heard as a gap. If the media server can't be reached, the call falls back to peer-to-peer.",
      },
    ],
  },
  selfHost: {
    title: "Run your own",
    body: "Hoffle runs on a spare PC, a home server or a small VPS with Docker. The first account you create becomes the owner. Accounts, messages and uploads all live in one state folder, so a backup is a copy of that folder.",
    points: [
      "No configuration needed for a first run",
      "LiveKit for bigger voice rooms: --profile livekit",
      "The full music bot: --profile musicbot",
      "A TURN relay for friends on strict networks: --profile turn",
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
        a: "Not in the stores yet. Open chat.hoffle.online on your phone and add it to your home screen; it then works like an app, notifications included.",
      },
      {
        q: "Who can read my messages?",
        a: "Like with most chat apps, whoever runs the server can. On chat.hoffle.online that's me, Abdullah. I don't go through people's chats, there are no ads or trackers, and nothing gets sold. If you'd rather it be you, host your own.",
      },
      {
        q: "What if Hoffle shuts down?",
        a: "You'd get at least three months' notice, you can download your data at any time, and because the code is open your group can keep going on its own server. There's more about this under “Is this going to stick around?” above.",
      },
      {
        q: "What does the MSN Messenger theme change?",
        a: "The whole layout, not only the colours: a contact list with groups, “says:” before each message, display pictures, personal emoticons, nudges, winks, handwriting, chat backgrounds, sign-in toasts with their own sounds, and an MSN Today window. Pick it in Settings → Appearance.",
      },
    ],
  },
  about: {
    body: "Hoffle is made by me, Abdullah, in the Netherlands. Most of the ideas in it came from the friends who use it. Bug reports and pull requests are welcome on GitHub, or just say hi in #say-hi up top.",
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
    staying: "Kalıcı mı?",
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
    title: "Küçük gruplar için bir sohbet uygulaması. Sesli sohbet, ekran paylaşımı ve oyun gecesi içinde.",
    body:
      "Hoffle'ı akşamlarının çoğunu Discord'daki bir sesli kanalda geçiren kendi arkadaş grubum için yaptım. Her akşam kullandığımız her şey içinde: sesli sohbet, sesli 1080p ekran paylaşımı, müzik botu ve D&D araçları. Ücretsiz, açık kaynak ve doğrudan tarayıcında çalışıyor.",
    open: "Hoffle'ı aç",
    downloadFor: (os) => `${os} için indir`,
    downloadGeneric: "Masaüstü uygulamasını indir",
    onPhone: "Telefonunda aç",
  },
  live: {
    lead: "Bu kanal canlı.",
    tryRoll: "Selam ver, bir şey sor (hepsini okuyorum) ya da şunu dene:",
    anyTheme: "İstediğin temada:",
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
      `Bir de Hoffle topluluğu var: Hoffle kullananlar orada takılıyor, tema paylaşıyor, birlikte oynayacak birilerini buluyor. ${members} üye, şu an ${online} kişi çevrimiçi.`,
    button: "Topluluğa katıl",
  },
  features: {
    title: "Özellikler",
    lead: "Bunların hepsi bugün uygulamada, herkes için.",
    musicBotLead: "Herkesin şarkının aynı saniyesini duyduğu, ortak sıralı bir müzik botu. Kendi başına",
    musicBotLink: "açık kaynak bir proje",
    musicBotTail: "ve Discord sesli kanallarında da çalıyor.",
    groups: [
      {
        title: "Sesli sohbet ve ekran paylaşımı",
        items: [
          "Gürültü engelleme senin cihazında çalışır; fan, klavye ve televizyon sesi konuşmaya karışmaz.",
          "Oyunun ya da filmin sesiyle birlikte 60 fps'de 1080p'ye kadar ekran paylaşımı, akıcı kalan 24 fps film modlarıyla.",
          "Oyun açıkken bile çalışan bas-konuş (masaüstü uygulamasında).",
          "Uzamsal ses ile oturma düzeni ve sanal arka planlar.",
        ],
      },
      {
        title: "Birlikte müzik ve izleme",
        lead: "musicBot",
        items: [
          "İki desteli DJ kabini, şarkı sözleri ve YouTube ile reels için Birlikte İzle odaları.",
          "Beyaz tahta, Çiz ve Bil, tier listeleri, anketler ve ses efektleri paneli.",
        ],
      },
      {
        title: "D&D",
        items: [
          "Piyonlu ve savaş sisli haritalar.",
          "Herkesin görebileceği yerde atılan, fiziği olan 3D zarlar.",
          "Görüşmenin içinde büyü ve canavar ansiklopedisi.",
        ],
      },
      {
        title: "Sohbet",
        items: [
          "Konular, yanıtlar, tepkiler, özel emoji ve çıkartmalar, GIF'ler ve sesli mesajlar.",
          "Bağlantı önizlemeleri, katılım bildirimli etkinlikler ve filtreli arama.",
        ],
      },
      {
        title: "Discord botları",
        items: [
          "Hoffle Discord'un bot API'sini destekliyor; discord.js ya da discord.py ile yazılmış botlar kod değiştirmeden bağlanır.",
          "Discord'da tuttuğun kanalları buraya yansıtan bir köprü de var.",
        ],
      },
      {
        title: "Temalar",
        lead: "themes",
        items: ["Profil kapakları, onur rozetleri ve her sunucuda ayrı takma ad."],
      },
    ],
  },
  themesLine: (count, names) => `${count} hazır tema: ${names}. Bir de CSS ile yazıp paylaşabildiğin kendi temaların.`,
  tour: {
    controls: { label: "Tema turu", counter: "Tema turu · {i} / {n}", prev: "Önceki tema", next: "Sıradaki: {name}", show: "{name} temasını göster" },
    msn: {
      title: "MSN Messenger teması",
      intro:
        "Windows Live Messenger'ı örnek alan, Hoffle için baştan sona ikinci bir arayüz. Yalnızca renkleri değil, düzeni ve davranışı da değiştirir: mesajlar “Mira diyor ki:” diye başlar, arkadaşın bağlanınca köşede bildirim çıkar, titreşim gönderince karşı tarafın penceresi sallanır.",
      points: [
        "Kendi gruplarınla bir kişi listesi ve sessiz liste",
        "Profil resimleri, kişisel ifadeler, göz kırpmalar ve el yazısı",
        "Hemen Dönerim ve Yemekteyim gibi durumlar",
        "Her olay için Sesler ayarından seçilen bir ses",
        "MSN Bugün: kim çevrimiçi, okunmamış konuşmalar ve ne çalıyor",
      ],
      emoticons: "Gönderince resme dönüşen ifadeler",
      alt: "MSN Messenger temasında bir Hoffle kanalı: her mesajın başında “diyor ki:” ve Göz kırp, Ses klibi, El yazısı, Arka plan, Titreşim düğmeleri",
      toast: "oturum açtı.",
    },
    vampire: {
      intro: "Gotik bir gece yarısı: siyah kadife üstünde kan kırmızısı. Kanal adları ve sunucu başlıkları gotik harflerle yazılır ve hafifçe kırmızı parlar.",
      points: [
        "Kırmızı ışıltılı gotik başlıklar",
        "Kenar çubuklarında ve üye listesinde kadife geçişler",
        "Yazarken kırmızı parlayan mesaj kutusu",
        "Kırmızı metin seçimi ve ona uyan kaydırma çubuğu",
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
        "Bütün uygulamada hafif CRT çizgileri",
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
        "Her yerde tek aralıklı yazı",
      ],
      alt: "Hoffle'ın Matrix teması: dijital yağmurun üstünde fosfor yeşili tek aralıklı yazı",
      toast: ["Uyan,", "Sam Lounge'a katıldı."],
    },
  },
  compare: {
    title: "Discord ile karşılaştırma",
    lead: "Discord'un ücretsiz planı ile Hoffle, rakamlarla yan yana. Büyük ve herkese açık topluluklar için Discord daha iyi bir seçim ve gerçek telefon uygulamaları var; Hoffle ise arkadaş grupları için yapıldı.",
    caption: "Hoffle ile Discord'un ücretsiz planının karşılaştırması",
    featureColumn: "Özellik",
    discord: "Discord (ücretsiz)",
    rows: [
      { label: "Fiyat", discord: "Ücretsiz; Nitro aylık 9,99 $ (ABD)", hoffle: "Ücretsiz, ücretli plan yok" },
      { label: "Ekran paylaşımı", discord: "30 fps'de 720p (Nitro ile 1080p60 ve üstü)", hoffle: "Sesiyle birlikte 60 fps'de 1080p'ye kadar" },
      { label: "Dosya yükleme", discord: "Dosya başına 10 MB", hoffle: "Resim 8 MB, PDF 20 MB, video klip 40 MB" },
      { label: "Mikrofon kalitesi", discord: "Varsayılan 64 kbps, en fazla 96 kbps", hoffle: "Yedek paketli 64 kbps Opus" },
      { label: "Başka sunucularda özel emoji", discord: "Yalnızca Nitro ile", hoffle: "Ücretsiz" },
      { label: "Bir sesli odada kaç kişi", discord: "En fazla 99 (görüntülü 25)", hoffle: "Sabit sınır yok; sınırı sunucunun yükleme hızı belirler, 1080p izleyen kişi başına yaklaşık 4 Mbps" },
      { label: "Kaynak kodu", discord: "Kapalı", hoffle: "Açık kaynak, AGPL-3.0" },
      { label: "Kendin barındır", discord: "Hayır", hoffle: "Evet, Docker ile" },
      { label: "Botlar", discord: "Var", hoffle: "discord.js ve discord.py botları olduğu gibi bağlanır" },
      { label: "Telefon", discord: "iOS ve Android uygulamaları", hoffle: "Ana ekrana eklenen telefon tarayıcısı, bildirimleriyle" },
    ],
    source: "Discord rakamları discord.com/nitro ve Discord yardım merkezinden, Ekim 2026. Hoffle'ın yükleme sınırları chat.hoffle.online içindir.",
  },
  staying: {
    title: "Bu iş kalıcı mı?",
    lead:
      "Grubunu taşımadan önce sorulacak en doğru soru. Hoffle tek bir kişinin projesi; o yüzden nasıl çalıştırıldığını ve bir şey bozulunca ne olduğunu açıkça yazıyorum.",
    points: [
      {
        title: "Beş dakikada bir yedekleniyor",
        body: "Her mesaj ve her dosya beş dakikada bir Almanya'daki ikinci bir sunucuya, her gece de ayrı bir diske kopyalanıyor.",
      },
      {
        title: "Yedek sunucu kendiliğinden devralıyor",
        body: "Hoffle evimdeki bir sunucuda çalışıyor. Cevap vermeyi bırakırsa Almanya'daki sunucu kendi kendine devralıyor, genelde üç dakika içinde; ana sunucu geri gelince her şeyi ona geri veriyor.",
      },
      {
        title: "Senin verin senin",
        body: "Ayarlar → Şifre ve Güvenlik → Verilerimi indir ile paylaştığın her şeyi istediğin zaman tek bir dosya olarak alabilirsin.",
      },
      {
        title: "Kimse kilitleyemez",
        body: "Kod açık kaynak (AGPL); ben bile kapatamam. chat.hoffle.online bir gün kapansa bile grubun herhangi bir bilgisayarda kendi Hoffle'ıyla devam edebilir.",
      },
      {
        title: "Habersiz kapanma yok",
        body: "chat.hoffle.online'ı kapatmaya karar verirsem en az üç ay önceden hem uygulamada hem e-postayla duyururum; veri indirme son güne kadar açık kalır.",
      },
      {
        title: "Ayakta tutmak ucuz",
        body: "Bir ev sunucusu ve ücretsiz bir bulut makinesinde çalışıyor; ayakta kalmak için senin paranı beklemiyor. Ko-fi bağışları donanıma ve kod imzalamaya gidiyor.",
      },
    ],
    status: "Canlı durum ve çalışma süresi",
  },
  download: {
    title: "İndir",
    lead: "Bir şey kurman gerekmiyor: Hoffle Chrome, Edge, Firefox ve Safari'de çalışıyor. Görev çubuğunda ya da Dock'ta durmasını istersen iki yolu var.",
    browserTitle: "Tarayıcından yükle",
    browserBody:
      "Hoffle'ı Chrome ya da Edge'de aç ve Yükle'ye tıkla. Mac'te Safari'de: Dosya → Dock'a Ekle. Telefonda: Paylaş → Ana Ekrana Ekle. Kurulum dosyası yok, onaylanacak bir şey yok ve kendini güncel tutuyor.",
    browserButton: "Hoffle'ı yükle",
    desktopTitle: "Ya da masaüstü uygulamasını indir",
    desktopBody: "Oyun açıkken de çalışan bas-konuş ve ekran paylaşırken bilgisayarının sesi bu uygulamayla geliyor.",
    rows: { windows: "Windows", macArm: "Mac (Apple çipli)", macIntel: "Mac (Intel)", linux: "Linux", lite: "Hoffle Lite" },
    files: {
      windows: ".exe kurulum dosyası",
      macArm: ".dmg, M1 ve sonrası",
      macIntel: ".dmg, eski Mac'ler",
      linux: ".AppImage, Wayland ve X11",
      lite: "Windows ve Mac için çok daha küçük bir uygulama",
    },
    action: "İndir",
    version: (v) => `Sürüm ${v}, doğrudan hoffle.online'dan iniyor.`,
    windowsUnsigned:
      "Windows: ilk açılışta mavi bir “Windows bilgisayarınızı korudu” kutusu çıkabilir, çünkü uygulama henüz kod imzalı değil (bunun için uğraşıyorum). Ek bilgi'ye, sonra Yine de çalıştır'a tıkla. Ya da yukarıdan tarayıcıyla yükle; o hiç sormaz.",
    macUnsigned:
      "Mac: uygulamanın açılamadığını söylerse Sistem Ayarları → Gizlilik ve Güvenlik'e gir, aşağı kaydır ve Yine de Aç'a tıkla.",
    phoneTitle: "Telefonunda",
    phoneBody:
      "chat.hoffle.online'ı aç ve ana ekrana ekle. Bildirimler de çalışıyor: Hoffle sorunca izin ver (iPhone'da önce ana ekrana ekle). Google'ı ve Apple'ı işin içine katmak istemiyorsan Hoffle bildirimleri ücretsiz ntfy uygulamasıyla da gönderebilir.",
    phoneAlt: "Telefonda Hoffle: Cozy temasında aynı kanal, mesaj kutusu altta",
  },
  voice: {
    title: "Sesli sohbet nasıl çalışıyor",
    lead:
      "Ekim 2026'dan beri chat.hoffle.online'daki görüşmeler açık kaynak bir medya sunucusu olan LiveKit üzerinden geçiyor. Önceden her görüşme eşler arasıydı; 8 kişiyi geçince ya da birkaç kişi aynı ekran paylaşımını izleyince ağırlaşıyordu. Kendi sunucunu kuranlar bunu bir Docker profili ve üç ayarla açabilir.",
    points: [
      {
        title: "Herkes bir kez yüklüyor",
        body: "Mikrofonunu ve ekranını sunucuya bir kez gönderiyorsun, o da herkese dağıtıyor. Böylece oda, eşler arası bir görüşmenin taşıyabildiği 6-8 kişiyle sınırlı kalmıyor.",
      },
      {
        title: "Yavaş bağlantı yalnızca kendini etkiliyor",
        body: "Ekran paylaşımı iki boyutta gönderiliyor. Zayıf bağlantıdaki izleyici küçüğünü alıyor; paylaşan kişi ve diğerleri tam görüntüde kalıyor.",
      },
      {
        title: "Film ve masaüstü için ayrı modlar",
        body: "Film modları 24 fps'de çalışır ve gerekirse kare atlamak yerine çözünürlüğü düşürür, filmler takılmaz. Masaüstü modları yazıyı net tutar, gerekirse önce kare hızını düşürür.",
      },
      {
        title: "Daha az kopma",
        body: "Mikrofon sesi yedek paketlerle gidiyor; kaybolan bir paket boşluk olarak duyulmak yerine yeniden oluşturuluyor. Medya sunucusuna ulaşılamazsa görüşme eşler arası moda geçiyor.",
      },
    ],
  },
  selfHost: {
    title: "Kendi sunucunu kur",
    body: "Hoffle boşta duran bir bilgisayarda, bir ev sunucusunda ya da Docker'lı küçük bir VPS'te çalışır. Açtığın ilk hesap sahibi olur. Hesaplar, mesajlar ve dosyalar tek bir state klasöründe durur; yedek almak o klasörü kopyalamaktan ibaret.",
    points: [
      "İlk çalıştırma için hiçbir ayar gerekmez",
      "Büyük sesli odalar için LiveKit: --profile livekit",
      "Tam müzik botu: --profile musicbot",
      "Katı ağlardaki arkadaşlar için TURN aktarıcı: --profile turn",
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
        a: "Mağazalarda henüz yok. Telefonunda chat.hoffle.online'ı açıp ana ekrana ekle; bildirimleri de dahil, bir uygulama gibi çalışır.",
      },
      {
        q: "Mesajlarımı kim okuyabilir?",
        a: "Çoğu sohbet uygulamasında olduğu gibi sunucuyu çalıştıran kişi okuyabilir. chat.hoffle.online'da o kişi benim, Abdullah. İnsanların sohbetlerini karıştırmam; reklam ya da takipçi yok, hiçbir şey satılmıyor. Bu kişinin sen olmasını istersen kendi sunucunu kur.",
      },
      {
        q: "Hoffle kapanırsa ne olur?",
        a: "En az üç ay önceden haber alırsın, verini istediğin an indirebilirsin ve kod açık olduğu için grubun kendi sunucusunda devam edebilir. Ayrıntısı yukarıda, “Bu iş kalıcı mı?” bölümünde.",
      },
      {
        q: "MSN Messenger teması neyi değiştiriyor?",
        a: "Yalnızca renkleri değil, bütün düzeni: gruplu kişi listesi, her mesajın başında “diyor ki:”, profil resimleri, kişisel ifadeler, titreşimler, göz kırpmalar, el yazısı, sohbet arka planları, kendi sesleriyle oturum açma bildirimleri ve bir MSN Bugün penceresi. Ayarlar → Görünüm'den seçebilirsin.",
      },
    ],
  },
  about: {
    body: "Hoffle'ı Hollanda'dan ben, Abdullah, yapıyorum. İçindeki fikirlerin çoğu onu kullanan arkadaşlarımdan geldi. Hata bildirimleri ve pull request'ler GitHub'da her zaman açık, ya da yukarıdaki #say-hi kanalında bir selam ver.",
    github: "GitHub'da Hoffle",
    kofi: "Ko-fi'de destek ol",
    sponsors: "GitHub Sponsors",
  },
};

export const LANDING_COPY: Record<LandingLang, LandingCopy> = { en, tr };
