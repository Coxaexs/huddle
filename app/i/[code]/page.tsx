import type { Metadata } from "next";
import { headers } from "next/headers";
import { InvitePage, inviteLang, inviteMetaText } from "../../components/invite-page";
import { APP_URL } from "../../components/site-chrome";
import { isLandingHost } from "../../lib/landing-host";
import { loadInvitePreview } from "@/lib/invite-preview";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

type Params = { params: Promise<{ code: string }> };

async function preview(code: string) {
  const db = bindings().DB;
  if (!db) return null;
  await ensureSchema(db);
  return loadInvitePreview(db, decodeURIComponent(code));
}

/** Where "Join" goes: the app on this host, or chat.hoffle.online from the landing domain. */
async function appBase() {
  const host = (await headers()).get("host");
  return isLandingHost(host) ? APP_URL : "";
}

function absolute(url: string | null, origin: string) {
  if (!url) return null;
  try {
    return new URL(url, origin).toString();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const found = await preview(code);
  const { title, tabTitle, description } = inviteMetaText(found);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "hoffle.online";
  const origin = `${requestHeaders.get("x-forwarded-proto") || "https"}://${host}`;
  const image = absolute(found?.server?.iconUrl || found?.server?.bannerUrl || null, origin);
  return {
    // The layout adds " · Hoffle" to the tab title.
    title: tabTitle,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: "Hoffle",
      type: "website",
      // A square server icon shows as a thumbnail; without one, Hoffle's own card.
      images: image ? [{ url: image, width: 256, height: 256 }] : [{ url: "/og.png", width: 1200, height: 630 }],
    },
    twitter: { card: image ? "summary" : "summary_large_image", title, description },
  };
}

export default async function InviteRoute({ params }: Params) {
  const { code } = await params;
  const found = await preview(code);
  const base = await appBase();
  const lang = inviteLang((await headers()).get("accept-language"));
  const joinUrl = `${base}/?invite=${encodeURIComponent(found?.code || code)}`;
  return <InvitePage preview={found} joinUrl={joinUrl} appUrl={base || "/"} lang={lang} />;
}
