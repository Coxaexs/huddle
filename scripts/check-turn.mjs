#!/usr/bin/env node
/**
 * Checks a STUN/TURN server the way a browser does, and says out loud what a
 * broken relay looks like from the outside.
 *
 * Voice is peer-to-peer, so the relay only matters to people whose networks
 * refuse a direct connection — and every way it can be wrong is silent. A TURN
 * server that answers but advertises a private or stale relay address (an
 * `external-ip` left pointing at yesterday's ISP address) finishes the
 * handshake and then carries no media, so the only symptom is that some friends
 * cannot hear each other while everyone else sounds fine.
 *
 * Per server it:
 *   1. resolves the name, so a stale DNS record cannot hide,
 *   2. sends a STUN binding request, proving the control port is reachable and
 *      showing the address the far side sees us from,
 *   3. allocates a TURN relay with long-term credentials, exactly as a browser
 *      does when ICE gathers a relay candidate,
 *   4. compares the relay address it was handed against the address it reached.
 *      They have to match, and the relay address has to be publicly routable,
 *      or no peer can ever send anything to it.
 *
 * Usage:
 *   node scripts/check-turn.mjs --ice-servers "$HUDDLE_ICE_SERVERS"
 *   node scripts/check-turn.mjs "turn:turn.example.com:3478?transport=udp" \
 *     --username hoffle --credential secret
 *
 * Options:
 *   --ice-servers <json>   the same JSON array HUDDLE_ICE_SERVERS holds
 *   --host --port --transport udp|tcp|tls --username --credential
 *   --expect <address>     relay address to expect (default: the host reached)
 *   --timeout <ms>         per request, default 5000
 *   --json                 machine-readable output
 *   --insecure             skip certificate checks for turns:
 *
 * Exit code 0 means every relay looked usable from this network.
 */
import dgram from "node:dgram";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns/promises";
import crypto from "node:crypto";

const COOKIE = 0x2112a442;
const DEFAULT_TIMEOUT = 5000;

// The STUN/TURN attributes this script reads.
const ATTR = {
  MESSAGE_INTEGRITY: 0x0008,
  ERROR_CODE: 0x0009,
  LIFETIME: 0x000d,
  REALM: 0x0014,
  NONCE: 0x0015,
  XOR_RELAYED: 0x0016,
  REQUESTED_TRANSPORT: 0x0019,
  XOR_MAPPED: 0x0020,
  SOFTWARE: 0x8022,
  USERNAME: 0x0006,
};
const REQUESTED_UDP = Buffer.from([17, 0, 0, 0]);

function pad4(length) {
  return (4 - (length % 4)) % 4;
}

function attribute(type, value) {
  const header = Buffer.alloc(4);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(value.length, 2);
  return Buffer.concat([header, value, Buffer.alloc(pad4(value.length))]);
}

function stunMessage(type, transactionId, body) {
  const header = Buffer.alloc(20);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(body.length, 2);
  header.writeUInt32BE(COOKIE, 4);
  transactionId.copy(header, 8);
  return Buffer.concat([header, body]);
}

/** Attributes are 4-byte aligned, so a walk has to skip the padding. */
function parseAttributes(buffer) {
  const out = new Map();
  let offset = 20;
  while (offset + 4 <= buffer.length) {
    const type = buffer.readUInt16BE(offset);
    const length = buffer.readUInt16BE(offset + 2);
    const value = buffer.subarray(offset + 4, offset + 4 + length);
    if (!out.has(type)) out.set(type, []);
    out.get(type).push(value);
    offset += 4 + length + pad4(length);
  }
  return out;
}

function xorAddress(value) {
  if (!value || value.length < 8 || value[1] !== 1) return null;
  const magic = Buffer.alloc(4);
  magic.writeUInt32BE(COOKIE, 0);
  const ip = Buffer.from(value.subarray(4, 8).map((byte, index) => byte ^ magic[index]));
  return { address: ip.join("."), port: value.readUInt16BE(2) ^ (COOKIE >>> 16) };
}

function errorCodeOf(attributes) {
  const value = attributes.get(ATTR.ERROR_CODE)?.[0];
  if (!value || value.length < 4) return null;
  return { code: value[2] * 100 + value[3], reason: value.subarray(4).toString("utf8") };
}

function text(value) {
  return value ? value.toString("utf8") : "";
}

/**
 * Private, loopback, link-local, CGNAT and unique-local addresses cannot carry
 * media in from another network. A relay that hands one of these out is the
 * single most common way a TURN setup looks healthy and relays nothing.
 * Exported so a test can pin the list.
 */
export function addressVerdict(address) {
  const ipv4 = String(address).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0) return "unspecified";
    if (a === 10) return "private (10.0.0.0/8)";
    if (a === 127) return "loopback";
    if (a === 169 && b === 254) return "link-local";
    if (a === 172 && b >= 16 && b <= 31) return "private (172.16.0.0/12)";
    if (a === 192 && b === 168) return "private (192.168.0.0/16)";
    if (a === 100 && b >= 64 && b <= 127) return "carrier-grade NAT (100.64.0.0/10)";
    if (a >= 224) return "multicast or reserved";
    return null;
  }
  const lower = String(address).toLowerCase();
  if (lower === "::" || lower === "::1") return "loopback";
  if (lower.startsWith("fe80")) return "link-local";
  if (lower.startsWith("fc") || lower.startsWith("fd")) return "unique-local (fc00::/7)";
  return null;
}

export function splitHostPort(value, fallbackPort) {
  const bracketed = value.match(/^\[(.+)\]:(\d+)$/);
  if (bracketed) return [bracketed[1], Number(bracketed[2])];
  const colon = value.lastIndexOf(":");
  if (colon === -1) return [value, fallbackPort];
  return [value.slice(0, colon), Number(value.slice(colon + 1))];
}

/**
 * Splits whatever has arrived on a TCP or TLS connection into whole messages.
 *
 * Over a stream, STUN messages are not framed — the length in the message's own
 * header is what says where it ends, and a ChannelData message (which only ever
 * travels server to client here) is the one shape that carries its own length
 * in a two-byte prefix. Getting this wrong means a TURN server that answers
 * over UDP appears unreachable over TCP, which is the transport friends behind
 * an HTTPS-only network depend on.
 *
 * Returns the whole messages found and whatever is left over for the next read.
 */
export function splitFrames(buffer) {
  const frames = [];
  let offset = 0;
  for (;;) {
    if (buffer.length - offset < 4) break;
    const first = buffer.readUInt16BE(offset);
    const channelData = first >= 0x4000 && first <= 0x7fff;
    const header = channelData ? 4 : 20;
    const length = buffer.readUInt16BE(offset + 2);
    if (buffer.length - offset < header + length) break;
    frames.push(buffer.subarray(offset, offset + header + length));
    offset += header + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

/** Parses one `urls` entry from an RTCIceServer. */
export function parseIceUrl(raw) {
  const match = String(raw).match(/^(turns?|stun):([^?/]+)(?:\?transport=(udp|tcp))?$/i);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  const [host, port] = splitHostPort(match[2], scheme === "turns" ? 5349 : 3478);
  const asked = (match[3] || (scheme === "turns" ? "tcp" : "udp")).toLowerCase();
  // A browser keeps turn over UDP unless the URL says otherwise; turns: can
  // only ever be TCP, and stun: is only ever a binding check.
  const kind = scheme === "stun" ? "udp" : scheme === "turns" ? "tls" : asked === "tcp" ? "tcp" : "udp";
  return { scheme, host, port, kind, url: String(raw) };
}

/**
 * One connection to the server for the whole exchange.
 *
 * A TURN nonce is bound to the source address and port, so asking on a fresh
 * socket each time earns a 438 Wrong Nonce instead of a relay: the 401 that
 * hands out the nonce and the allocate that uses it have to travel over the
 * same socket, exactly as a browser's ICE agent does it.
 */
async function openSession(target, options) {
  if (target.kind === "udp") {
    const socket = dgram.createSocket("udp4");
    // A zero-byte send first: it resolves routing and opens the NAT mapping, so
    // a name that resolves but cannot be reached fails here and not later.
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("timed out")), options.timeout);
      socket.send(Buffer.from([0]), target.port, target.address, (error) => {
        clearTimeout(deadline);
        if (error) reject(error);
        else resolve();
      });
    });
    return {
      send: (request) =>
        new Promise((resolve, reject) => {
          const deadline = setTimeout(() => reject(new Error("timed out")), options.timeout);
          const done = (error, data) => {
            clearTimeout(deadline);
            socket.off("message", onMessage);
            socket.off("error", onError);
            if (error) reject(error);
            else resolve(data);
          };
          const onMessage = (data) => done(null, data);
          const onError = (error) => done(error);
          socket.once("message", onMessage);
          socket.once("error", onError);
          socket.send(request, target.port, target.address);
        }),
      close: () => socket.close(),
    };
  }

  const socket =
    target.kind === "tls"
      ? tls.connect({
          host: target.address,
          port: target.port,
          // The certificate is issued for the name clients use, so that is what
          // has to be presented and verified — never the address it resolved to.
          servername: net.isIP(target.host) ? undefined : target.host,
          rejectUnauthorized: !options.insecure,
        })
      : net.connect({ host: target.address, port: target.port });

  // Over TCP and TLS, STUN messages are not framed at all: the length in their
  // own header is what delimits them. ChannelData messages are the exception —
  // they carry a two-byte channel and a two-byte length — and this script never
  // sends those, but the server may, so both shapes are reassembled here.
  let buffered = Buffer.alloc(0);
  const waiting = [];
  socket.on("data", (chunk) => {
    const { frames, rest } = splitFrames(Buffer.concat([buffered, chunk]));
    buffered = rest;
    for (const frame of frames) waiting.shift()?.(frame);
  });

  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("timed out connecting")), options.timeout);
    socket.once(target.kind === "tls" ? "secureConnect" : "connect", () => {
      clearTimeout(deadline);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
  });

  return {
    // A STUN message goes out exactly as it is: the framing belongs to the
    // header, not to the connection.
    send: (request) => {
      const answer = new Promise((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error("timed out")), options.timeout * 2);
        waiting.push((frame) => {
          clearTimeout(deadline);
          resolve(frame);
        });
      });
      socket.write(request);
      return answer;
    },
    close: () => socket.destroy(),
  };
}

/**
 * Walks the path a browser walks: a binding request first, then an allocate
 * that learns the realm and nonce from a 401 and retries with
 * MESSAGE-INTEGRITY (RFC 5766 §4). `target.address` is already resolved.
 *
 * Everything here returns rather than throws, so a failure halfway through
 * still reports what the earlier steps learned.
 */
export async function probeRelay(target, options) {
  const result = {
    url: target.url,
    host: target.host,
    port: target.port,
    transport: target.kind,
  };

  let session;
  try {
    session = await openSession(target, options);
  } catch (error) {
    result.error = error.message;
    return result;
  }

  // A lost datagram looks exactly like a closed port, so ask more than once
  // where a retry is harmless. Everything travels over the one session, which
  // is also what keeps a TURN nonce valid.
  const send = async (payload, attempts = 1) => {
    let last = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return { reply: await session.send(payload) };
      } catch (error) {
        last = error;
      }
    }
    return { error: last };
  };

  try {
    const binding = await send(stunMessage(0x0001, crypto.randomBytes(12), Buffer.alloc(0)));
    if (binding.error) {
      result.error = binding.error.message;
      return result;
    }
    result.bind =
      xorAddress(parseAttributes(binding.reply).get(ATTR.XOR_MAPPED)?.[0])?.address || null;

    // A plain STUN server implements no TURN and ignores an allocate, so a
    // binding request is the whole check for stun: entries.
    if (target.scheme === "stun") return result;

    const requested = Buffer.concat([
      attribute(ATTR.REQUESTED_TRANSPORT, REQUESTED_UDP),
      attribute(ATTR.SOFTWARE, Buffer.from("huddle-check-turn")),
    ]);

    // Two trips: an unauthenticated allocate to be handed a realm and nonce,
    // then the same allocation with MESSAGE-INTEGRITY. A server is allowed to
    // rotate the nonce, in which case it says so and the dance starts again.
    for (let round = 0; round < 2; round += 1) {
      const first = await send(stunMessage(0x0003, crypto.randomBytes(12), requested), 3);
      if (first.error) {
        result.error = `${first.error.message} to an allocate`;
        return result;
      }
      let attributes = parseAttributes(first.reply);
      let error = errorCodeOf(attributes);

      if (error?.code === 438 && round === 0) continue;
      if (error && error.code !== 401) {
        result.error = `${error.code} ${error.reason}`;
        return result;
      }
      if (!error) {
        // Some servers are configured without credentials at all.
        const relay = xorAddress(attributes.get(ATTR.XOR_RELAYED)?.[0]);
        result.relay = relay ? `${relay.address}:${relay.port}` : null;
        result.lifetime = attributes.get(ATTR.LIFETIME)?.[0]?.readUInt32BE(0) ?? null;
        return result;
      }
      if (!options.username || !options.credential) {
        result.error = "401 Unauthorized, and no --username/--credential was given";
        return result;
      }

      const realm = text(attributes.get(ATTR.REALM)?.[0]);
      const nonce = attributes.get(ATTR.NONCE)?.[0] ?? Buffer.alloc(0);
      const key = crypto
        .createHash("md5")
        .update(`${options.username}:${realm}:${options.credential}`)
        .digest();
      const body = Buffer.concat([
        requested,
        attribute(ATTR.USERNAME, Buffer.from(options.username)),
        attribute(ATTR.REALM, Buffer.from(realm)),
        attribute(ATTR.NONCE, nonce),
      ]);
      const header = Buffer.alloc(20);
      header.writeUInt16BE(0x0003, 0);
      // The HMAC covers the header whose length already counts the
      // MESSAGE-INTEGRITY attribute: 24 bytes of header plus value.
      header.writeUInt16BE(body.length + 24, 2);
      header.writeUInt32BE(COOKIE, 4);
      crypto.randomBytes(12).copy(header, 8);
      const integrity = crypto.createHmac("sha1", key).update(Buffer.concat([header, body])).digest();
      const granted = await send(
        Buffer.concat([header, body, attribute(ATTR.MESSAGE_INTEGRITY, integrity)]),
      );
      if (granted.error) {
        result.error = granted.error.message;
        return result;
      }
      attributes = parseAttributes(granted.reply);
      error = errorCodeOf(attributes);
      result.realm = realm;

      if (error?.code === 438) continue;
      if (error) {
        result.error = `${error.code} ${error.reason}`;
        return result;
      }

      const relay = xorAddress(attributes.get(ATTR.XOR_RELAYED)?.[0]);
      result.relay = relay ? `${relay.address}:${relay.port}` : null;
      result.lifetime = attributes.get(ATTR.LIFETIME)?.[0]?.readUInt32BE(0) ?? null;
      result.software = text(attributes.get(ATTR.SOFTWARE)?.[0]) || null;
      return result;
    }

    result.error = "the server kept rejecting the credentials (438 Wrong Nonce)";
    return result;
  } finally {
    session.close();
  }
}

/** Resolves a URL, probes it, and turns the result into a verdict. */
async function checkOne(target, options) {
  const label = target.url || `${target.host}:${target.port}`;
  const result = {
    url: label,
    host: target.host,
    port: target.port,
    transport: target.kind,
    names: [],
    ok: false,
  };

  let resolved;
  try {
    const found = await dns.lookup(target.host, { all: true, verbatim: true });
    resolved = found.find((entry) => entry.family === 4) || found[0];
  } catch (error) {
    result.names.push(`could not resolve ${target.host}: ${error.message}`);
    return result;
  }
  result.address = resolved.address;
  result.url = `${label} -> ${resolved.address}`;

  let outcome;
  try {
    outcome = await probeRelay(
      { ...target, address: resolved.address },
      {
        ...options,
        // Credentials belong to the entry they were listed in.
        username: target.username ?? options.username,
        credential: target.credential ?? options.credential,
      },
    );
  } catch (error) {
    result.names.push(error.message);
    result.names.push("nothing answered here: forward the port and allow it through the firewall");
    return result;
  }

  result.bind = outcome.bind;
  result.relay = outcome.relay;
  result.lifetime = outcome.lifetime;
  result.software = outcome.software;
  if (outcome.realm) result.realm = outcome.realm;

  if (outcome.error) {
    result.names.push(`TURN said: ${outcome.error}`);
    if (outcome.error.startsWith("401")) {
      result.names.push("the username, credential or realm does not match the server");
    }
    if (outcome.error.startsWith("438")) {
      result.names.push("the server kept rotating its nonce; run it again");
    }
    if (outcome.error.startsWith("7")) {
      result.names.push("the server could not open a relay: its min-port/max-port range is blocked or full");
    }
    return result;
  }

  if (target.scheme === "stun") {
    result.ok = Boolean(outcome.bind);
    if (!result.ok) result.names.push("no STUN response");
    return result;
  }

  if (!outcome.relay) {
    result.names.push("the server answered but handed out no relay address");
    return result;
  }

  const relayAddress = outcome.relay.slice(0, outcome.relay.lastIndexOf(":"));
  const expected = options.expect || resolved.address;
  const bad = addressVerdict(relayAddress);
  if (bad) {
    result.names.push(`relay address ${relayAddress} is ${bad}, so no peer can reach it`);
    result.names.push("set external-ip=<public ip>/<private ip> (and relay-ip if there are several addresses)");
    return result;
  }
  if (expected && relayAddress !== expected) {
    result.names.push(`relay address ${relayAddress} is not the address we reached (${expected})`);
    result.names.push("external-ip is stale or wrong: every peer handed this address will fail to connect");
    return result;
  }

  result.ok = true;
  return result;
}

function parseArgs(argv) {
  const options = { timeout: DEFAULT_TIMEOUT, insecure: false, json: false, urls: [], iceServers: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    switch (arg) {
      case "--ice-servers": options.iceServers.push(next()); break;
      case "--host": options.host = next(); break;
      case "--port": options.port = Number(next()); break;
      case "--transport": options.transport = next(); break;
      case "--username": options.username = next(); break;
      case "--credential": options.credential = next(); break;
      case "--expect": options.expect = next(); break;
      case "--timeout": options.timeout = Number(next()); break;
      case "--json": options.json = true; break;
      case "--insecure": options.insecure = true; break;
      case "--help": case "-h": options.help = true; break;
      default:
        if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
        options.urls.push(arg);
    }
  }
  if (options.host) {
    const scheme = options.transport === "tls" ? "turns" : "turn";
    const transport = options.transport === "tcp" ? "?transport=tcp" : "";
    options.urls.push(`${scheme}:${options.host}:${options.port || 3478}${transport}`);
  }
  return options;
}

/** Every turn:/turns:/stun: entry in an HUDDLE_ICE_SERVERS JSON array. */
export function targetsFromIceServers(raw) {
  const targets = [];
  for (const server of JSON.parse(raw)) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    for (const url of urls) {
      const entry = parseIceUrl(url);
      if (!entry) continue;
      targets.push({ ...entry, username: server.username, credential: server.credential });
    }
  }
  return targets;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Checks a STUN/TURN server the way a browser does; see the header of this file.");
    return 0;
  }

  let targets = options.urls.map(parseIceUrl).filter(Boolean);
  for (const raw of options.iceServers) {
    try {
      targets = targets.concat(targetsFromIceServers(raw));
    } catch (error) {
      console.error(`--ice-servers is not valid JSON: ${error.message}`);
      return 2;
    }
  }
  if (!targets.length) {
    console.error('Nothing to check. Pass a turn:/turns:/stun: URL, or --ice-servers "$HUDDLE_ICE_SERVERS".');
    return 2;
  }

  const results = [];
  for (const target of targets) {
    results.push(await checkOne(target, options));
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const result of results) {
      console.log(result.url);
      if (result.bind) console.log(`  seen from us     ${result.bind}`);
      if (result.relay) console.log(`  relay handed out ${result.relay}`);
      if (result.software) console.log(`  server           ${result.software}`);
      if (result.lifetime) console.log(`  lifetime         ${result.lifetime}s`);
      for (const name of result.names) console.log(`  ! ${name}`);
      console.log(`  ${result.ok ? "OK" : "FAILED"}`);
      console.log("");
    }
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length) {
    console.error(
      `${failed.length} of ${results.length} failed. While that is true, anyone who needs the relay cannot hear each other.`,
    );
    return 1;
  }
  console.log(`All ${results.length} entries answered and advertised a usable address.`);
  return 0;
}

// Only run the CLI when invoked directly, so the helpers stay importable.
if (process.argv[1] && process.argv[1].endsWith("check-turn.mjs")) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(2);
    });
}
