/**
 * A server's game server (Minecraft, Java edition): who is playing, shown in
 * the sidebar, and RCON for the people who manage it.
 *
 * Status is the Server List Ping over TCP and commands are RCON, both straight
 * from this process (workerd's node:net). Nothing goes through a third-party
 * status site, so a server on the home network works as well as a public one.
 * The address is set by someone with Manage Server; only instance admins may
 * point it at a private or local address, so a server owner cannot use the
 * status check to probe the machine Hoffle runs on.
 */
import net from "node:net";

export interface GameServerConfig {
  serverId: string;
  host: string;
  port: number;
  rconPort: number | null;
  rconPassword: string | null;
}

export interface GameServerStatus {
  online: boolean;
  host: string;
  port: number;
  motd: string;
  version: string | null;
  playersOnline: number;
  maxPlayers: number;
  /** The sample the server chooses to share; big servers send a dozen names at most. */
  players: string[];
  pingMs: number | null;
}

export const DEFAULT_MINECRAFT_PORT = 25565;
export const DEFAULT_RCON_PORT = 25575;
const STATUS_TTL_MS = 20_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

// ------------------------------------------------------------------ address

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/** A host this process should not be pointed at by a server owner. */
export function isPrivateHost(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!name || name === "localhost" || /\.(localhost|local|lan|home|internal|intranet)$/.test(name)) return true;
  const v4 = name.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT, Tailscale
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (name.includes(":")) {
    return name === "::" || name === "::1" || /^f[cd]/.test(name) || /^fe[89ab]/.test(name) || name.startsWith("::ffff:");
  }
  return !name.includes("."); // a bare name resolves on the local network
}

/** A usable host (name or IP literal) and port, or an error to show. */
export function checkAddress(host: string, port: number): string | null {
  const name = host.trim();
  const ip = /^\[?[0-9a-f:.]+\]?$/i.test(name);
  if (!name || (!ip && !HOSTNAME.test(name))) return "That is not a host name or IP address.";
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "Ports go from 1 to 65535.";
  return null;
}

// ---------------------------------------------------------- server list ping

export function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let rest = value >>> 0;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest) byte |= 0x80;
    bytes.push(byte);
  } while (rest);
  return Buffer.from(bytes);
}

/** [value, bytes read], or null when the buffer ends mid-number. */
export function readVarInt(buffer: Buffer, offset = 0): [number, number] | null {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buffer.length) return null;
    const byte = buffer[offset + i];
    value |= (byte & 0x7f) << (7 * i);
    if (!(byte & 0x80)) return [value >>> 0, i + 1];
  }
  throw new Error("VarInt too long");
}

function packet(id: number, body: Buffer): Buffer {
  const payload = Buffer.concat([encodeVarInt(id), body]);
  return Buffer.concat([encodeVarInt(payload.length), payload]);
}

/** Handshake (next state: status) followed by the status request. */
export function statusRequest(host: string, port: number): Buffer {
  const name = Buffer.from(host, "utf8");
  const portBytes = Buffer.from([(port >> 8) & 0xff, port & 0xff]);
  const handshake = packet(
    0x00,
    Buffer.concat([encodeVarInt(767), encodeVarInt(name.length), name, portBytes, encodeVarInt(1)]),
  );
  return Buffer.concat([handshake, packet(0x00, Buffer.alloc(0))]);
}

/** The status JSON once the whole response packet has arrived, else null. */
export function parseStatusResponse(buffer: Buffer): Record<string, unknown> | null {
  const length = readVarInt(buffer);
  if (!length) return null;
  const [size, sizeBytes] = length;
  if (buffer.length < sizeBytes + size) return null;
  let offset = sizeBytes;
  const id = readVarInt(buffer, offset);
  if (!id || id[0] !== 0x00) throw new Error("Not a status response");
  offset += id[1];
  const textLength = readVarInt(buffer, offset);
  if (!textLength) return null;
  offset += textLength[1];
  return JSON.parse(new TextDecoder().decode(buffer.subarray(offset, offset + textLength[0])));
}

/** The plain text of a chat component (the MOTD), without § colour codes. */
export function chatText(component: unknown): string {
  if (typeof component === "string") return component.replace(/§[0-9a-fk-or]/gi, "");
  if (!component || typeof component !== "object") return "";
  const node = component as { text?: unknown; extra?: unknown };
  const own = typeof node.text === "string" ? chatText(node.text) : "";
  const extra = Array.isArray(node.extra) ? node.extra.map(chatText).join("") : "";
  return own + extra;
}

export function statusFromJson(json: Record<string, unknown>, host: string, port: number, pingMs: number): GameServerStatus {
  const players = (json.players ?? {}) as { online?: unknown; max?: unknown; sample?: unknown };
  const version = (json.version ?? {}) as { name?: unknown };
  return {
    online: true,
    host,
    port,
    motd: chatText(json.description).replace(/\s+/g, " ").trim().slice(0, 200),
    version: typeof version.name === "string" ? version.name.slice(0, 60) : null,
    playersOnline: Number(players.online) || 0,
    maxPlayers: Number(players.max) || 0,
    players: Array.isArray(players.sample)
      ? players.sample
          .map((entry) => (entry && typeof entry === "object" ? (entry as { name?: unknown }).name : null))
          .filter((name): name is string => typeof name === "string" && !name.startsWith("§"))
          .slice(0, 20)
      : [],
    pingMs,
  };
}

export function queryMinecraft(host: string, port: number, timeoutMs = 4000): Promise<GameServerStatus> {
  const offline: GameServerStatus = { online: false, host, port, motd: "", version: null, playersOnline: 0, maxPlayers: 0, players: [], pingMs: null };
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let done = false;
    const finish = (status: GameServerStatus) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(status);
    };
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => finish(offline));
    socket.on("error", () => finish(offline));
    socket.on("close", () => finish(offline));
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_RESPONSE_BYTES) return finish(offline);
      try {
        const json = parseStatusResponse(buffer);
        if (json) finish(statusFromJson(json, host, port, Date.now() - started));
      } catch {
        finish(offline);
      }
    });
    socket.connect(port, host, () => socket.write(statusRequest(host, port)));
  });
}

const statusCache = new Map<string, { at: number; status: GameServerStatus }>();

/** A server's status, asked at most every STATUS_TTL_MS however many sidebars poll. */
export async function cachedStatus(config: GameServerConfig, now = Date.now()): Promise<GameServerStatus> {
  const key = `${config.serverId}|${config.host}|${config.port}`;
  const hit = statusCache.get(key);
  if (hit && now - hit.at < STATUS_TTL_MS) return hit.status;
  const status = await queryMinecraft(config.host, config.port);
  statusCache.set(key, { at: now, status });
  if (statusCache.size > 500) statusCache.delete(statusCache.keys().next().value!);
  return status;
}

// ---------------------------------------------------------------------- rcon

function rconPacket(id: number, type: number, body: string): Buffer {
  const text = Buffer.from(body, "utf8");
  const out = Buffer.alloc(14 + text.length);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setInt32(0, 10 + text.length, true);
  view.setInt32(4, id, true);
  view.setInt32(8, type, true);
  out.set(text, 12);
  return out; // the two trailing zero bytes are already there
}

/** Splits complete RCON packets off the front of `buffer`. */
export function readRconPackets(buffer: Buffer): { packets: Array<{ id: number; type: number; body: string }>; rest: Buffer } {
  const packets: Array<{ id: number; type: number; body: string }> = [];
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const size = view.getInt32(offset, true);
    if (size < 10 || size > 4110) throw new Error("Bad RCON packet");
    if (buffer.length - offset - 4 < size) break;
    packets.push({
      id: view.getInt32(offset + 4, true),
      type: view.getInt32(offset + 8, true),
      body: new TextDecoder().decode(buffer.subarray(offset + 12, offset + 4 + size - 2)),
    });
    offset += 4 + size;
  }
  return { packets, rest: buffer.subarray(offset) };
}

/** Runs one RCON command and returns what the server answered. */
export function runRcon(host: string, port: number, password: string, command: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let authed = false;
    let done = false;
    const finish = (error: Error | null, text = "") => {
      if (done) return;
      done = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(text);
    };
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => finish(new Error("The game server did not answer.")));
    socket.on("error", () => finish(new Error("Could not reach the game server's RCON port.")));
    socket.on("close", () => finish(new Error("The game server closed the RCON connection.")));
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      let parsed;
      try {
        parsed = readRconPackets(buffer);
      } catch (error) {
        return finish(error as Error);
      }
      buffer = parsed.rest;
      for (const reply of parsed.packets) {
        if (!authed) {
          if (reply.type !== 2) continue; // an empty response packet may come first
          if (reply.id === -1) return finish(new Error("The RCON password was refused."));
          authed = true;
          socket.write(rconPacket(2, 2, command));
        } else if (reply.id === 2) {
          return finish(null, reply.body);
        }
      }
    });
    socket.connect(port, host, () => socket.write(rconPacket(1, 3, password)));
  });
}

// ------------------------------------------------------------------- storage

export async function getGameServer(db: D1Database, serverId: string): Promise<GameServerConfig | null> {
  const row = await db
    .prepare("SELECT server_id, host, port, rcon_port, rcon_password FROM server_game_servers WHERE server_id = ?")
    .bind(serverId)
    .first<{ server_id: string; host: string; port: number; rcon_port: number | null; rcon_password: string | null }>();
  return row
    ? { serverId: row.server_id, host: row.host, port: row.port, rconPort: row.rcon_port, rconPassword: row.rcon_password }
    : null;
}

export async function saveGameServer(db: D1Database, config: GameServerConfig): Promise<void> {
  await db
    .prepare(
      `INSERT INTO server_game_servers (server_id, host, port, rcon_port, rcon_password, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(server_id) DO UPDATE SET host = ?2, port = ?3, rcon_port = ?4, rcon_password = ?5, updated_at = ?6`,
    )
    .bind(config.serverId, config.host, config.port, config.rconPort, config.rconPassword, Date.now())
    .run();
}

export async function deleteGameServer(db: D1Database, serverId: string): Promise<void> {
  await db.prepare("DELETE FROM server_game_servers WHERE server_id = ?").bind(serverId).run();
}
