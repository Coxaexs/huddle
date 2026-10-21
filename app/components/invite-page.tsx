import type { InvitePreview } from "@/lib/invite-preview";
import { SiteShell } from "./site-chrome";

/**
 * /i/CODE: where an invite link lands. It says who invited you to what before
 * anything asks for an account, and the same words go into the link preview
 * (see app/i/[code]/page.tsx). People coming from a friend's message are
 * usually on a phone and have never heard of Hoffle, so it also says, once,
 * what Hoffle is.
 */

export type InviteLang = "en" | "tr";

const COPY = {
  en: {
    invitedYou: (name: string) => `${name} invited you to`,
    invitedPlain: "You've been invited to",
    toHoffle: "join them on Hoffle",
    members: (n: number) => `${n} ${n === 1 ? "member" : "members"}`,
    online: (n: number) => `${n} online`,
    join: (server: string) => `Join ${server}`,
    joinHoffle: "Accept invite",
    what: "Hoffle is a free chat app for friend groups: voice, screen sharing, music and game night. It works in your browser, nothing to install.",
    already: "Already have an account? The same button signs you in.",
    gone: "This invite doesn't work any more",
    goneBody: "It may have expired or been used up. Ask whoever sent it for a new one.",
    open: "Open Hoffle",
    about: "What's Hoffle?",
  },
  tr: {
    invitedYou: (name: string) => `${name} seni davet etti:`,
    invitedPlain: "Davet edildin:",
    toHoffle: "Hoffle'da onlara katıl",
    members: (n: number) => `${n} üye`,
    online: (n: number) => `${n} çevrimiçi`,
    join: (server: string) => `${server} sunucusuna katıl`,
    joinHoffle: "Daveti kabul et",
    what: "Hoffle arkadaş grupları için ücretsiz bir sohbet uygulaması: sesli sohbet, ekran paylaşımı, müzik ve oyun geceleri. Tarayıcıda çalışır, bir şey kurman gerekmez.",
    already: "Zaten hesabın var mı? Aynı düğmeyle giriş yaparsın.",
    gone: "Bu davet artık geçerli değil",
    goneBody: "Süresi dolmuş ya da kullanım hakkı bitmiş olabilir. Gönderen kişiden yenisini iste.",
    open: "Hoffle'ı aç",
    about: "Hoffle nedir?",
  },
} as const;

export function inviteLang(acceptLanguage: string | null): InviteLang {
  const first = (acceptLanguage || "").split(",")[0]?.trim().toLowerCase() || "";
  return first.startsWith("tr") ? "tr" : "en";
}

export function inviteMetaText(preview: InvitePreview | null) {
  if (!preview) {
    return { title: "Invite expired · Hoffle", tabTitle: "Invite expired", description: "This Hoffle invite doesn't work any more." };
  }
  const who = preview.inviter?.displayName;
  if (preview.server) {
    const { name, memberCount, onlineCount } = preview.server;
    const counts = `${memberCount} ${memberCount === 1 ? "member" : "members"}, ${onlineCount} online.`;
    return {
      // "Join Hoffle on Hoffle" for the community server reads oddly.
      title: /hoffle/i.test(name) ? `Join ${name}` : `Join ${name} on Hoffle`,
      tabTitle: `Join ${name}`,
      description: who ? `${who} invited you. ${counts}` : counts,
    };
  }
  return {
    title: who ? `${who} invited you to Hoffle` : "You're invited to Hoffle",
    tabTitle: "You're invited",
    description: "A free chat app for friend groups: voice, screen sharing, music and game night, in your browser.",
  };
}

function ServerIcon({ server }: { server: NonNullable<InvitePreview["server"]> }) {
  if (server.iconUrl) {
    return <img src={server.iconUrl} alt="" width={88} height={88} className="h-22 w-22 rounded-[26px] object-cover shadow-md" />;
  }
  return (
    <span
      aria-hidden
      className="grid h-22 w-22 place-items-center rounded-[26px] text-[44px] shadow-md"
      style={{ background: server.color }}
    >
      {server.icon}
    </span>
  );
}

const button =
  "inline-flex h-12 w-full items-center justify-center rounded-xl bg-(--violet-fill) px-5 text-[16px] font-semibold text-white transition hover:bg-(--violet-fill-hover)";

export function InvitePage({ preview, joinUrl, appUrl, lang }: { preview: InvitePreview | null; joinUrl: string; appUrl: string; lang: InviteLang }) {
  const t = COPY[lang];
  return (
    <SiteShell bare lang={lang}>
      <main className="grid min-h-[calc(100dvh-64px)] place-items-center px-4 py-12">
        <div className="w-full max-w-[420px] rounded-3xl border border-(--line) bg-(--card) p-7 text-center shadow-[0_30px_80px_-40px_rgba(40,28,80,.45)] sm:p-9">
          {preview ? (
            <>
              {preview.server && (
                <div className="flex justify-center">
                  <ServerIcon server={preview.server} />
                </div>
              )}
              <p className="mt-5 text-[15px] text-(--ink-2)">
                {preview.inviter ? t.invitedYou(preview.inviter.displayName) : t.invitedPlain}
              </p>
              <h1 className="lp-display mt-1 text-[30px] leading-tight">
                {preview.server ? preview.server.name : t.toHoffle}
              </h1>
              {preview.server && (
                <p className="mt-2 flex items-center justify-center gap-4 text-[14px] text-(--muted)">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-[#3ba55d]" />
                    {t.online(preview.server.onlineCount)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-(--muted)" />
                    {t.members(preview.server.memberCount)}
                  </span>
                </p>
              )}
              {preview.server?.description && (
                <p className="mx-auto mt-4 max-w-[34ch] text-[15px] leading-relaxed text-(--ink-2)">{preview.server.description}</p>
              )}
              <a href={joinUrl} className={`${button} mt-7`}>
                {preview.server ? t.join(preview.server.name) : t.joinHoffle}
              </a>
              <p className="mt-3 text-[13px] text-(--muted)">{t.already}</p>
              <p className="mt-6 border-t border-(--line) pt-5 text-left text-[14px] leading-relaxed text-(--ink-2)">{t.what}</p>
            </>
          ) : (
            <>
              <h1 className="lp-display text-[26px] leading-tight">{t.gone}</h1>
              <p className="mt-3 leading-relaxed text-(--ink-2)">{t.goneBody}</p>
              <a href={appUrl} className={`${button} mt-7`}>{t.open}</a>
            </>
          )}
        </div>
        <a href="https://hoffle.online" className="mt-6 text-sm font-semibold text-(--muted) underline-offset-4 hover:text-(--ink) hover:underline">
          {t.about}
        </a>
      </main>
    </SiteShell>
  );
}
