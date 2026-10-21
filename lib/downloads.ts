/**
 * The desktop apps, served from this Hoffle instead of GitHub.
 *
 * CI publishes each desktop build as a GitHub Release (tag desktop-vX.Y.Z).
 * `syncDownloads` copies the installers people actually pick from the newest
 * one into the UPLOADS bucket under downloads/<tag>/, and writes a manifest
 * the landing page and /download/<platform> read. Older copies are deleted
 * once a newer release is in. It runs from scripts/sync-downloads.sh (an
 * hourly timer on the server) or an admin's POST to /api/admin/downloads.
 *
 * If nothing has been copied yet, the links fall back to the GitHub release.
 */

export const DOWNLOAD_PREFIX = "downloads/";
const MANIFEST_KEY = `${DOWNLOAD_PREFIX}manifest.json`;
export const RELEASES_REPO = "Coxaexs/huddle";
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`;

/** R2 wants every multipart part but the last to be the same size. */
const PART_BYTES = 16 * 1024 * 1024;

export type DownloadPlatform = "windows" | "windows-lite" | "mac-arm64" | "mac-intel" | "mac-lite" | "linux";

/** Which release asset each download is, by file name. */
const ASSET_PATTERNS: Record<DownloadPlatform, RegExp> = {
  windows: /^Hoffle[ .-]Setup[ .-][\d.]+\.exe$/i,
  "windows-lite": /^Hoffle[ .]Lite_[\d.]+_x64-setup\.exe$/i,
  "mac-arm64": /^Hoffle-[\d.]+-arm64\.dmg$/i,
  "mac-intel": /^Hoffle-[\d.]+\.dmg$/i,
  "mac-lite": /^Hoffle[ .]Lite_[\d.]+_universal\.dmg$/i,
  linux: /^Hoffle-[\d.]+\.AppImage$/i,
};

export const DOWNLOAD_PLATFORMS = Object.keys(ASSET_PATTERNS) as DownloadPlatform[];

export function isDownloadPlatform(value: string): value is DownloadPlatform {
  return value in ASSET_PATTERNS;
}

export interface DownloadFile {
  platform: DownloadPlatform;
  name: string;
  size: number;
  key: string;
  /** "sha256:…", as GitHub lists it for the asset. */
  digest: string | null;
}

export interface DownloadManifest {
  tag: string;
  version: string;
  publishedAt: string;
  syncedAt: string;
  files: DownloadFile[];
  /** From the release's SIGNING.json, which CI writes when it signed the builds. */
  signed: { windows: boolean; mac: boolean };
}

export async function readDownloadManifest(bucket: R2Bucket | undefined): Promise<DownloadManifest | null> {
  if (!bucket) return null;
  try {
    const object = await bucket.get(MANIFEST_KEY);
    if (!object) return null;
    return (await object.json()) as DownloadManifest;
  } catch {
    return null;
  }
}

/** The public path a download is served at (app/download/file/…). */
export function downloadFilePath(file: Pick<DownloadFile, "key">): string {
  return `/download/file/${file.key.slice(DOWNLOAD_PREFIX.length)}`;
}

interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
  digest?: string | null;
}

interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: ReleaseAsset[];
}

const GITHUB_HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "hoffle-download-mirror",
};

async function latestDesktopRelease(): Promise<Release> {
  const response = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=15`, {
    headers: GITHUB_HEADERS,
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the release list.`);
  const releases = (await response.json()) as Release[];
  const release = releases.find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith("desktop-v"));
  if (!release) throw new Error("No desktop release on GitHub yet.");
  return release;
}

/** Streams one release asset into the bucket in fixed-size parts, so memory stays at one part. */
async function copyAsset(bucket: R2Bucket, asset: ReleaseAsset, key: string): Promise<void> {
  const response = await fetch(asset.browser_download_url, { headers: { "user-agent": GITHUB_HEADERS["user-agent"] } });
  if (!response.ok || !response.body) throw new Error(`GitHub answered ${response.status} for ${asset.name}.`);
  const upload = await bucket.createMultipartUpload(key, {
    httpMetadata: { contentType: contentTypeFor(asset.name), contentDisposition: `attachment; filename="${asset.name}"` },
  });
  const parts: R2UploadedPart[] = [];
  let buffer = new Uint8Array(PART_BYTES);
  let filled = 0;
  let total = 0;
  const flush = async (bytes: Uint8Array) => {
    parts.push(await upload.uploadPart(parts.length + 1, bytes));
  };
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let offset = 0;
      while (offset < value.byteLength) {
        const take = Math.min(PART_BYTES - filled, value.byteLength - offset);
        buffer.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === PART_BYTES) {
          await flush(buffer);
          buffer = new Uint8Array(PART_BYTES);
          filled = 0;
        }
      }
      total += value.byteLength;
    }
    if (filled > 0 || parts.length === 0) await flush(buffer.slice(0, filled));
    if (total !== asset.size) throw new Error(`${asset.name} came out as ${total} bytes, GitHub said ${asset.size}.`);
    await upload.complete(parts);
  } catch (error) {
    await upload.abort().catch(() => undefined);
    throw error;
  }
}

function contentTypeFor(name: string): string {
  if (name.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (name.endsWith(".dmg")) return "application/x-apple-diskimage";
  return "application/octet-stream";
}

async function readSigning(release: Release): Promise<DownloadManifest["signed"]> {
  const asset = release.assets.find((a) => a.name === "SIGNING.json");
  if (!asset) return { windows: false, mac: false };
  try {
    const response = await fetch(asset.browser_download_url, { headers: { "user-agent": GITHUB_HEADERS["user-agent"] } });
    const data = (await response.json()) as { windows?: unknown; mac?: unknown };
    return { windows: data.windows === true, mac: data.mac === true };
  } catch {
    return { windows: false, mac: false };
  }
}

export interface SyncResult {
  changed: boolean;
  manifest: DownloadManifest;
  copied: string[];
  removed: number;
}

/** Copies the newest desktop release in, unless it is already here (or `force`). */
export async function syncDownloads(bucket: R2Bucket, { force = false } = {}): Promise<SyncResult> {
  const release = await latestDesktopRelease();
  const current = await readDownloadManifest(bucket);
  const files: DownloadFile[] = [];
  const copied: string[] = [];
  for (const platform of DOWNLOAD_PLATFORMS) {
    const asset = release.assets.find((a) => ASSET_PATTERNS[platform].test(a.name));
    if (!asset) continue;
    const key = `${DOWNLOAD_PREFIX}${release.tag_name}/${asset.name}`;
    const have = await bucket.head(key);
    if (force || !have || have.size !== asset.size) {
      await copyAsset(bucket, asset, key);
      copied.push(asset.name);
    }
    files.push({ platform, name: asset.name, size: asset.size, key, digest: asset.digest || null });
  }
  if (!files.length) throw new Error(`Release ${release.tag_name} has none of the installers this page offers.`);

  const signed = await readSigning(release);
  const unchanged =
    !copied.length &&
    current?.tag === release.tag_name &&
    current.files.length === files.length &&
    current.signed.windows === signed.windows &&
    current.signed.mac === signed.mac;
  const manifest: DownloadManifest = unchanged
    ? current!
    : {
        tag: release.tag_name,
        version: release.tag_name.replace(/^desktop-v/, ""),
        publishedAt: release.published_at,
        syncedAt: new Date().toISOString(),
        files,
        signed,
      };
  if (!unchanged) {
    await bucket.put(MANIFEST_KEY, JSON.stringify(manifest, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  // Anything under downloads/ that this manifest doesn't list is an older release.
  const keep = new Set([MANIFEST_KEY, ...files.map((f) => f.key)]);
  let removed = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: DOWNLOAD_PREFIX, cursor });
    const stale = page.objects.map((o) => o.key).filter((key) => !keep.has(key));
    if (stale.length) {
      await bucket.delete(stale);
      removed += stale.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return { changed: !unchanged, manifest, copied, removed };
}
