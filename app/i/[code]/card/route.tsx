import { ImageResponse } from "next/og";
import { loadInvitePreview, type InvitePreview } from "@/lib/invite-preview";
import { shownCounts } from "@/lib/member-counts";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

/**
 * /i/CODE/card: the picture WhatsApp, Discord, iMessage and the rest show
 * under an invite link (app/i/[code]/page.tsx points og:image here). Laid
 * out like a Discord profile: the server's banner across the top, its icon
 * overlapping it, then who invited you, the name and how many are in it. An
 * account invite shows the inviter's picture and Hoffle instead.
 */

const WIDTH = 1200;
const HEIGHT = 630;
const BANNER_HEIGHT = 300;
const ICON = 220;
const RING = 10;
const PAGE = "#14141c";
const BRAND = "#6a4ddb";
const MAX_PICTURE_BYTES = 4 * 1024 * 1024;

type Statics = { regular: ArrayBuffer; bold: ArrayBuffer; logo: string | null } | null;
let statics: Promise<Statics> | null = null;

/**
 * Fonts and the logo from the static files. Liberation Sans, because the Noto
 * that @vercel/og bundles has no Turkish İ, Ğ or Ş.
 */
function loadStatics(): Promise<Statics> {
  statics ??= (async () => {
    const assets = (bindings() as unknown as { ASSETS?: Fetcher }).ASSETS;
    if (!assets) return null;
    const get = async (path: string) => {
      const res = await assets.fetch(new Request(`https://assets.local/${path}`));
      return res.ok ? res.arrayBuffer() : null;
    };
    const [regular, bold, logo] = await Promise.all([
      get("pdfjs/standard_fonts/LiberationSans-Regular.ttf"),
      get("pdfjs/standard_fonts/LiberationSans-Bold.ttf"),
      get("icon-192.png"),
    ]);
    return regular && bold ? { regular, bold, logo: logo ? dataUrl("image/png", new Uint8Array(logo)) : null } : null;
  })().then((loaded) => {
    if (!loaded) statics = null; // try again next time
    return loaded;
  });
  return statics;
}

function dataUrl(type: string, bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

/**
 * An uploaded picture as a data: URL, straight from the bucket. Only PNG, JPEG
 * and SVG: the renderer can't draw WebP, so those fall back to the server's
 * colour.
 */
async function uploadedPicture(url: string | null | undefined): Promise<string | null> {
  const key = url?.match(/^(?:\/hangout)?\/api\/uploads\/([^/?#]+)$/)?.[1];
  const bucket = bindings().UPLOADS;
  if (!key || !bucket) return null;
  const object = await bucket.get(decodeURIComponent(key)).catch(() => null);
  if (!object || object.size > MAX_PICTURE_BYTES) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
  const type =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      ? "image/png"
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? "image/jpeg"
        : /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)
          ? "image/svg+xml"
          : null;
  return type ? dataUrl(type, bytes) : null;
}

function count(n: number, one: string, many: string) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function Badge({ picture, text, color, size, round }: { picture: string | null; text: string; color: string; size: number; round: boolean }) {
  const radius = round ? size / 2 : size * 0.26;
  if (picture) {
    return <img src={picture} width={size} height={size} style={{ width: size, height: size, borderRadius: radius, objectFit: "cover" }} />;
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: radius,
        background: color,
        color: "white",
        fontSize: size * (text.length > 2 ? 0.3 : 0.42),
        fontWeight: 700,
      }}
    >
      {text}
    </div>
  );
}

function Stat({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginRight: 40 }}>
      <div style={{ display: "flex", width: 20, height: 20, borderRadius: 10, background: color, marginRight: 14 }} />
      {text}
    </div>
  );
}

async function Card({ preview, logo }: { preview: InvitePreview; logo: string | null }) {
  const { server, inviter } = preview;
  const counts = server ? shownCounts(server) : null;
  const [banner, icon, avatar] = await Promise.all([
    uploadedPicture(server?.bannerUrl),
    uploadedPicture(server?.iconUrl),
    uploadedPicture(inviter?.avatarUrl),
  ]);
  const accent = server?.color || BRAND;
  const inviterName = inviter?.displayName || "";
  const inviterLetter = inviter?.avatar || inviterName.slice(0, 1).toUpperCase() || "H";
  const name = server ? server.name : "Hoffle";
  const nameSize = name.length > 26 ? 56 : name.length > 16 ? 66 : 80;
  const textLeft = 72 + ICON + RING * 2 + 40;

  return (
    <div style={{ display: "flex", width: WIDTH, height: HEIGHT, position: "relative", background: PAGE, fontFamily: "Liberation Sans" }}>
      {banner ? (
        <img
          src={banner}
          width={WIDTH}
          height={BANNER_HEIGHT}
          style={{ position: "absolute", top: 0, left: 0, width: WIDTH, height: BANNER_HEIGHT, objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: WIDTH,
            height: BANNER_HEIGHT,
            display: "flex",
            background: `linear-gradient(120deg, ${accent} 0%, ${accent}aa 55%, ${PAGE} 100%)`,
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          top: 32,
          right: 40,
          display: "flex",
          alignItems: "center",
          padding: "10px 22px 10px 12px",
          borderRadius: 40,
          background: "rgba(12,12,18,0.72)",
          color: "white",
          fontSize: 30,
          fontWeight: 700,
        }}
      >
        {logo ? (
          <img src={logo} width={40} height={40} style={{ width: 40, height: 40, borderRadius: 10, marginRight: 12 }} />
        ) : null}
        Hoffle
      </div>

      <div
        style={{
          position: "absolute",
          top: BANNER_HEIGHT - ICON / 2 - RING - 30,
          left: 72,
          display: "flex",
          padding: RING,
          borderRadius: server ? (ICON + RING * 2) * 0.28 : (ICON + RING * 2) / 2,
          background: PAGE,
        }}
      >
        {server ? (
          <Badge picture={icon} text={server.icon} color={accent} size={ICON} round={false} />
        ) : (
          <Badge picture={avatar} text={inviterLetter} color={inviter?.color || BRAND} size={ICON} round />
        )}
      </div>

      <div
        style={{
          position: "absolute",
          top: BANNER_HEIGHT + 28,
          left: textLeft,
          right: 64,
          bottom: 48,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", color: "rgba(255,255,255,0.8)", fontSize: 32, marginBottom: 8 }}>
          {server && inviter ? (
            <div style={{ display: "flex", marginRight: 16 }}>
              <Badge picture={avatar} text={inviterLetter} color={inviter.color || BRAND} size={48} round />
            </div>
          ) : null}
          {inviter ? `${inviterName} invited you to${server ? " join" : ""}` : server ? "You're invited to join" : "You're invited to"}
        </div>
        <div style={{ display: "flex", color: "white", fontSize: nameSize, fontWeight: 700, lineHeight: 1.1, lineClamp: 2 }}>{name}</div>
        <div style={{ display: "flex", alignItems: "center", color: "rgba(255,255,255,0.72)", fontSize: 30, marginTop: 16 }}>
          {counts?.members != null ? (
            <>
              {counts.online !== null && <Stat color="#3ba55d" text={count(counts.online, "Online", "Online")} />}
              <Stat color="rgba(255,255,255,0.5)" text={count(counts.members, "Member", "Members")} />
            </>
          ) : (
            "Voice, screen sharing, music and game night with friends."
          )}
        </div>
      </div>
    </div>
  );
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const db = bindings().DB;
  if (!db) return new Response("Not found", { status: 404 });
  await ensureSchema(db);
  const preview = await loadInvitePreview(db, decodeURIComponent(code));
  if (!preview) return new Response("Not found", { status: 404 });

  const loaded = await loadStatics();
  return new ImageResponse(await Card({ preview, logo: loaded?.logo ?? null }), {
    width: WIDTH,
    height: HEIGHT,
    emoji: "twemoji",
    fonts: loaded
      ? [
          { name: "Liberation Sans", data: loaded.regular, weight: 400, style: "normal" },
          { name: "Liberation Sans", data: loaded.bold, weight: 700, style: "normal" },
        ]
      : undefined,
    headers: { "Cache-Control": "public, max-age=600" },
  });
}
