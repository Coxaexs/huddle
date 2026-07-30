import { createServer } from "node:http";
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright-core";

const token = process.env.RECORDER_SERVICE_TOKEN || "";
const huddleBase = (process.env.HUDDLE_BASE_URL || "http://127.0.0.1:8730/hangout").replace(/\/+$/, "");
const publicUrl = (process.env.RECORDER_PUBLIC_URL || "http://127.0.0.1:8742").replace(/\/+$/, "");
const captureOrigin = process.env.RECORDER_CAPTURE_ORIGIN || new URL(huddleBase).origin;
const storageRoot = path.resolve(process.env.RECORDER_STORAGE || "./recordings");
const chromiumExecutable = process.env.CHROMIUM_EXECUTABLE;
const ffmpegExecutable = process.env.FFMPEG_EXECUTABLE || "ffmpeg";
const transcriptionExecutable = process.env.TRANSCRIPTION_EXECUTABLE || "";
const port = Math.max(1, Math.min(65535, Number(process.env.RECORDER_PORT) || 8742));
const sessions = new Map();

if (token.length < 24) {
  throw new Error("RECORDER_SERVICE_TOKEN must be at least 24 characters.");
}
await mkdir(storageRoot, { recursive: true });

function safeId(value) {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : null;
}

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(token);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": captureOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(response, status, body) {
  response.writeHead(status, { ...corsHeaders(), "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function bodyBuffer(request, limit = 32 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function bodyJson(request) {
  const data = await bodyBuffer(request, 2 * 1024 * 1024);
  return data.length ? JSON.parse(data.toString("utf8")) : {};
}

async function atomicJson(filename, value) {
  const part = `${filename}.part`;
  await writeFile(part, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(part, filename);
}

async function callback(payload) {
  try {
    const response = await fetch(`${huddleBase}/api/recordings/recorder`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error("Huddle recorder callback failed", response.status);
    }
  } catch (error) {
    console.error("Huddle recorder callback unavailable", error instanceof Error ? error.message : error);
  }
}

async function diskFreeBytes() {
  try {
    const info = await statfs(storageRoot);
    return Number(info.bavail) * Number(info.bsize);
  } catch {
    return null;
  }
}

async function runFfmpeg(input, outputPart) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegExecutable,
      [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-i",
        input,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        outputPart,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let diagnostics = "";
    child.stderr.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-12_000);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${diagnostics}`));
    });
  });
}

async function runAudioFfmpeg(input, outputPart) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegExecutable,
      [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-i",
        input,
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-f",
        "ipod",
        outputPart,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let diagnostics = "";
    child.stderr.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-12_000);
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`FFmpeg audio exited ${code}: ${diagnostics}`)),
    );
  });
}

async function runThumbnail(input, outputPart) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegExecutable,
      [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-ss",
        "1",
        "-i",
        input,
        "-frames:v",
        "1",
        "-vf",
        "scale=1280:-2",
        "-c:v",
        "mjpeg",
        "-f",
        "image2",
        outputPart,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let diagnostics = "";
    child.stderr.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-12_000);
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Thumbnail generation exited ${code}: ${diagnostics}`)),
    );
  });
}

async function runTranscription(input, outputPart) {
  if (!transcriptionExecutable) return false;
  await new Promise((resolve, reject) => {
    // The configured executable receives exactly two arguments and is never
    // invoked through a shell: media input and WebVTT output.
    const child = spawn(transcriptionExecutable, [input, outputPart], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let diagnostics = "";
    child.stderr.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-12_000);
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Transcription exited ${code}: ${diagnostics}`)),
    );
  });
  return true;
}

async function sessionManifest(sessionId) {
  const response = await fetch(
    `${huddleBase}/api/recordings/recorder?sessionId=${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`Could not read final session manifest (${response.status}).`);
  }
  return response.json();
}

function chapterTime(milliseconds) {
  const total = Math.max(0, Math.floor(Number(milliseconds) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function checksum(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

class CaptureSession {
  constructor(state) {
    this.id = state.id;
    this.state = state;
    this.directory = path.join(storageRoot, state.id);
    this.chunkDirectory = path.join(this.directory, "chunks");
    this.stemDirectory = path.join(this.directory, "stems");
    this.browser = null;
    this.page = null;
    this.heartbeat = null;
    this.finalizing = false;
    this.prepared = false;
    this.stemNames = new Map();
  }

  async prepare() {
    if (this.prepared) return;
    await mkdir(this.chunkDirectory, { recursive: true });
    await mkdir(this.stemDirectory, { recursive: true });
    await atomicJson(path.join(this.directory, "session.json"), {
      id: this.id,
      createdAt: new Date().toISOString(),
      state: this.state,
    });
    this.prepared = true;
  }

  async launch() {
    await this.prepare();
    this.browser = await chromium.launch({
      headless: true,
      executablePath: chromiumExecutable || undefined,
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--disable-dev-shm-usage",
      ],
    });
    const context = await this.browser.newContext({
      viewport: {
        width: this.state.resolution === "1280x720" ? 1280 : 1920,
        height: this.state.resolution === "1280x720" ? 720 : 1080,
      },
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    this.page = await context.newPage();
    this.page.on("console", (message) => {
      if (message.type() === "error") console.error(`[capture ${this.id}]`, message.text());
    });
    const url = `${huddleBase}/recorder/${encodeURIComponent(this.id)}?service=${encodeURIComponent(publicUrl)}`;
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await this.page.waitForFunction(() => window.huddleRecorderReady === true, null, {
      timeout: 30_000,
    });
  }

  async control(action, state = this.state) {
    this.state = state;
    if (!this.page) throw new Error("Capture page is not running.");
    await this.page.evaluate(
      async ({ action: nextAction, state: nextState }) => {
        if (!window.huddleRecorderControl) throw new Error("Recorder control is unavailable.");
        await window.huddleRecorderControl(nextAction, nextState);
      },
      { action, state },
    );
  }

  async start() {
    try {
      await this.launch();
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await this.control("start");
      await callback({ sessionId: this.id, status: "recording", diskFreeBytes: await diskFreeBytes() });
      this.heartbeat = setInterval(() => void this.sendHeartbeat(), 5_000);
    } catch (error) {
      await this.fail("capture-start", error);
    }
  }

  async pause(state) {
    this.state = state;
    await this.control("pause", state);
    await this.sendHeartbeat();
  }

  async resume(state) {
    this.state = state;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await this.control("resume", state);
    await callback({ sessionId: this.id, status: "recording", diskFreeBytes: await diskFreeBytes() });
  }

  async update(state, action) {
    this.state = state;
    await this.control(action, state);
    await atomicJson(path.join(this.directory, "session.json"), {
      id: this.id,
      updatedAt: new Date().toISOString(),
      state,
    });
  }

  async saveChunk(sequence, data) {
    await this.prepare();
    const name = `${String(sequence).padStart(9, "0")}.webm.part`;
    const target = path.join(this.chunkDirectory, name);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  }

  async saveStemChunk(userId, displayName, sequence, data) {
    await this.prepare();
    const directory = path.join(this.stemDirectory, userId);
    await mkdir(directory, { recursive: true });
    this.stemNames.set(userId, displayName);
    const name = `${String(sequence).padStart(9, "0")}.webm.part`;
    const target = path.join(directory, name);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  }

  async byteCount() {
    try {
      const names = await readdir(this.chunkDirectory);
      let total = 0;
      for (const name of names) {
        if (!name.endsWith(".webm.part")) continue;
        total += (await stat(path.join(this.chunkDirectory, name))).size;
      }
      return total;
    } catch {
      return 0;
    }
  }

  async sendHeartbeat() {
    await callback({
      sessionId: this.id,
      estimatedBytes: await this.byteCount(),
      diskFreeBytes: await diskFreeBytes(),
    });
  }

  async stop(state) {
    if (this.finalizing) return;
    this.finalizing = true;
    this.state = state;
    clearInterval(this.heartbeat);
    try {
      await this.control("stop", state);
      await this.browser?.close();
      this.browser = null;
      const names = (await readdir(this.chunkDirectory))
        .filter((name) => name.endsWith(".webm.part"))
        .sort();
      if (!names.length) throw new Error("No media chunks were written.");
      const webmPart = path.join(this.directory, "session.webm.part");
      await writeFile(webmPart, Buffer.alloc(0), { mode: 0o600 });
      for (const name of names) {
        await appendFile(webmPart, await readFile(path.join(this.chunkDirectory, name)));
      }
      const webm = path.join(this.directory, "session.webm");
      await rename(webmPart, webm);
      const mp4Part = path.join(this.directory, "session.mp4.part");
      const mp4 = path.join(this.directory, "session.mp4");
      await runFfmpeg(webm, mp4Part);
      await rename(mp4Part, mp4);
      const manifest = await sessionManifest(this.id);
      const metadata = path.join(this.directory, "metadata.json");
      await atomicJson(metadata, {
        ...manifest,
        finalizedAt: new Date().toISOString(),
        source: "session.webm",
        composed: "session.mp4",
      });
      const markers = (manifest.events || []).filter(
        (event) => event.kind === "marker",
      );
      const chapters = [
        `0:00 ${manifest.recording?.title || state.title}`,
        ...markers
          .filter((event) => event.payload?.kind !== "highlight")
          .map(
            (event) =>
              `${chapterTime(event.atMs)} ${event.payload?.name || "Chapter"}`,
          ),
      ];
      const chapterFile = path.join(this.directory, "chapters.txt");
      await writeFile(chapterFile, `${chapters.join("\n")}\n`, { mode: 0o600 });
      const highlightFile = path.join(this.directory, "highlights.json");
      await atomicJson(
        highlightFile,
        markers
          .filter((event) => event.payload?.kind === "highlight")
          .map((event) => ({
            atMs: event.atMs,
            name: event.payload?.name || "Highlight",
          })),
      );
      const thumbnailPart = path.join(this.directory, "thumbnail.jpg.part");
      const thumbnail = path.join(this.directory, "thumbnail.jpg");
      await runThumbnail(mp4, thumbnailPart);
      await rename(thumbnailPart, thumbnail);
      const outputs = await Promise.all(
        [
          ["original", webm, "video/webm"],
          ["youtube", mp4, "video/mp4"],
          ["metadata", metadata, "application/json"],
          ["chapters", chapterFile, "text/plain"],
          ["highlights", highlightFile, "application/json"],
          ["thumbnail", thumbnail, "image/jpeg"],
        ].map(async ([kind, filename, contentType]) => ({
          kind,
          filename: path.basename(filename),
          contentType,
          bytes: (await stat(filename)).size,
          checksum: await checksum(filename),
        })),
      );
      if (state.separateAudio) {
        for (const userId of await readdir(this.stemDirectory)) {
          if (!safeId(userId)) continue;
          const directory = path.join(this.stemDirectory, userId);
          const chunks = (await readdir(directory))
            .filter((name) => name.endsWith(".webm.part"))
            .sort();
          if (!chunks.length) continue;
          const sourcePart = path.join(directory, "stem.webm.part");
          await writeFile(sourcePart, Buffer.alloc(0), { mode: 0o600 });
          for (const chunk of chunks) {
            await appendFile(sourcePart, await readFile(path.join(directory, chunk)));
          }
          const source = path.join(directory, "stem.webm");
          await rename(sourcePart, source);
          const label = (this.stemNames.get(userId) || userId)
            .normalize("NFKD")
            .replace(/[^\w.-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || userId;
          const audioPart = path.join(this.stemDirectory, `${label}.m4a.part`);
          const audio = path.join(this.stemDirectory, `${label}.m4a`);
          await runAudioFfmpeg(source, audioPart);
          await rename(audioPart, audio);
          outputs.push({
            kind: "audio-stem",
            filename: path.relative(this.directory, audio),
            contentType: "audio/mp4",
            bytes: (await stat(audio)).size,
            checksum: await checksum(audio),
          });
        }
      }
      if (transcriptionExecutable) {
        try {
          const subtitlePart = path.join(this.directory, "subtitles.vtt.part");
          const subtitle = path.join(this.directory, "subtitles.vtt");
          if (await runTranscription(webm, subtitlePart)) {
            await rename(subtitlePart, subtitle);
            outputs.push({
              kind: "subtitles",
              filename: path.basename(subtitle),
              contentType: "text/vtt",
              bytes: (await stat(subtitle)).size,
              checksum: await checksum(subtitle),
            });
          }
        } catch (error) {
          await callback({
            sessionId: this.id,
            diagnostic: {
              level: "warning",
              code: "transcription-failed",
              message: error instanceof Error ? error.message.slice(0, 1000) : String(error),
            },
          });
        }
      }
      await callback({ sessionId: this.id, status: "completed", outputs, estimatedBytes: await this.byteCount(), diskFreeBytes: await diskFreeBytes() });
    } catch (error) {
      await this.fail("finalization", error);
    } finally {
      sessions.delete(this.id);
    }
  }

  async fail(code, error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[recorder ${this.id}] ${code}: ${message}`);
    clearInterval(this.heartbeat);
    await this.browser?.close().catch(() => undefined);
    await callback({
      sessionId: this.id,
      status: "failed",
      error: message.slice(0, 500),
      diagnostic: { level: "error", code, message: message.slice(0, 1000) },
    });
  }
}

async function recoverIncompleteSessions() {
  for (const id of await readdir(storageRoot)) {
    if (!safeId(id)) continue;
    const directory = path.join(storageRoot, id);
    const chunkDirectory = path.join(directory, "chunks");
    try {
      const chunks = (await readdir(chunkDirectory))
        .filter((name) => name.endsWith(".webm.part"))
        .sort();
      if (!chunks.length || (await readdir(directory)).includes("session.mp4")) continue;
      const recoveredPart = path.join(directory, "recovered.webm.part");
      await writeFile(recoveredPart, Buffer.alloc(0), { mode: 0o600 });
      for (const name of chunks) {
        await appendFile(recoveredPart, await readFile(path.join(chunkDirectory, name)));
      }
      const recoveredWebm = path.join(directory, "recovered.webm");
      await rename(recoveredPart, recoveredWebm);
      const recoveredMp4Part = path.join(directory, "recovered.mp4.part");
      await runFfmpeg(recoveredWebm, recoveredMp4Part);
      await rename(recoveredMp4Part, path.join(directory, "recovered.mp4"));
      await callback({
        sessionId: id,
        status: "completed",
        diagnostic: {
          level: "warning",
          code: "crash-recovery",
          message: "Recovered playable media from chunks left by an interrupted recorder.",
        },
      });
    } catch (error) {
      await callback({
        sessionId: id,
        status: "failed",
        error: "Incomplete recording could not be recovered automatically.",
        diagnostic: {
          level: "error",
          code: "recovery-failed",
          message: error instanceof Error ? error.message.slice(0, 1000) : String(error),
        },
      });
    }
  }
}

async function archiveSession(id, reason) {
  const source = path.join(storageRoot, id);
  const trash = path.join(storageRoot, ".trash");
  await mkdir(trash, { recursive: true });
  const target = path.join(
    trash,
    `${id}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  await rename(source, target);
  await callback({
    sessionId: id,
    event: {
      kind: "retention.deleted",
      payload: { reason },
    },
  });
}

async function enforceRetention() {
  for (const id of await readdir(storageRoot)) {
    if (!safeId(id) || sessions.has(id)) continue;
    try {
      const metadata = JSON.parse(
        await readFile(path.join(storageRoot, id, "metadata.json"), "utf8"),
      );
      const finalizedAt = new Date(metadata.finalizedAt || 0).getTime();
      const retentionDays = Math.max(
        1,
        Number(metadata.recording?.retentionDays) || 90,
      );
      if (
        finalizedAt > 0 &&
        Date.now() - finalizedAt >= retentionDays * 86_400_000
      ) {
        await archiveSession(id, "retention");
      }
    } catch {
      // Incomplete sessions are handled by recovery, not retention.
    }
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders());
      response.end();
      return;
    }
    const url = new URL(request.url || "/", publicUrl);
    if (url.pathname === "/health") {
      json(response, 200, { ok: true, activeSessions: sessions.size });
      return;
    }
    if (!authorized(request)) {
      json(response, 401, { error: "Unauthorized." });
      return;
    }
    const stemMatch = url.pathname.match(
      /^\/v1\/sessions\/([^/]+)\/stems\/([^/]+)\/chunks$/,
    );
    if (request.method === "POST" && stemMatch) {
      const stemSessionId = safeId(decodeURIComponent(stemMatch[1]));
      const userId = safeId(decodeURIComponent(stemMatch[2]));
      const session = stemSessionId ? sessions.get(stemSessionId) : null;
      const sequence = Number(url.searchParams.get("sequence"));
      if (
        !session ||
        !userId ||
        !Number.isSafeInteger(sequence) ||
        sequence < 0
      ) {
        json(response, 400, { error: "Invalid stem chunk." });
        return;
      }
      const displayName = decodeURIComponent(
        String(request.headers["x-participant-name"] || userId),
      ).slice(0, 80);
      await session.saveStemChunk(
        userId,
        displayName,
        sequence,
        await bodyBuffer(request),
      );
      json(response, 202, { ok: true });
      return;
    }
    const match = url.pathname.match(/^\/v1\/sessions\/([^/]+)(?:\/([^/]+))?$/);
    const id = match ? safeId(decodeURIComponent(match[1])) : null;
    const action = match?.[2] || "";
    if (!id) {
      json(response, 404, { error: "Not found." });
      return;
    }
    const session = sessions.get(id);
    if (request.method === "GET" && !action) {
      if (!session) {
        json(response, 404, { error: "Session is not active." });
        return;
      }
      json(response, 200, { state: session.state });
      return;
    }
    if (request.method === "POST" && action === "chunks") {
      if (!session) {
        json(response, 404, { error: "Session is not active." });
        return;
      }
      const sequence = Number(url.searchParams.get("sequence"));
      if (!Number.isSafeInteger(sequence) || sequence < 0) {
        json(response, 400, { error: "Invalid chunk sequence." });
        return;
      }
      await session.saveChunk(sequence, await bodyBuffer(request));
      json(response, 202, { ok: true });
      return;
    }
    if (request.method === "POST" && action === "events") {
      if (!session) {
        json(response, 404, { error: "Session is not active." });
        return;
      }
      const event = await bodyJson(request);
      if (event.kind !== "automatic.scene") {
        json(response, 400, { error: "Unsupported automatic event." });
        return;
      }
      await callback({
        sessionId: id,
        event: {
          kind: event.kind,
          payload: event.payload && typeof event.payload === "object" ? event.payload : {},
        },
      });
      json(response, 202, { ok: true });
      return;
    }
    if (request.method === "POST" && action === "delete") {
      if (session) {
        json(response, 409, { error: "Stop the active recorder before deletion." });
        return;
      }
      await archiveSession(id, "user-request");
      json(response, 200, { ok: true });
      return;
    }
    if (request.method === "POST" && ["start", "pause", "resume", "stop", "scene", "direction"].includes(action)) {
      const payload = await bodyJson(request);
      const state = payload.state;
      if (!state || state.id !== id || state.channelId == null) {
        json(response, 400, { error: "Invalid public recording state." });
        return;
      }
      if (action === "start") {
        if (session) {
          json(response, 409, { error: "Session is already active." });
          return;
        }
        const next = new CaptureSession(state);
        sessions.set(id, next);
        json(response, 202, { ok: true });
        void next.start();
        return;
      }
      if (!session) {
        json(response, 409, { error: "Recorder session is not running." });
        return;
      }
      if (action === "pause") {
        await session.pause(state);
        json(response, 200, { ok: true });
      } else if (action === "stop") {
        // Stop browser media writes before acknowledging Huddle. Finalization
        // continues asynchronously after the privacy-critical stop succeeds.
        await session.control("stop", state);
        json(response, 202, { ok: true });
        void session.stop(state);
      } else {
        json(response, 202, { ok: true });
        if (action === "resume") {
          void session.resume(state).catch((error) => session.fail("resume", error));
        } else {
          void session.update(state, action).catch((error) => session.fail(action, error));
        }
      }
      return;
    }
    json(response, 404, { error: "Not found." });
  } catch (error) {
    console.error("Recorder request failed", error);
    json(response, 500, { error: error instanceof Error ? error.message : "Recorder request failed." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Huddle recorder service listening on ${publicUrl}`);
  void recoverIncompleteSessions();
  void enforceRetention();
  setInterval(() => void enforceRetention(), 60 * 60 * 1000).unref();
});
