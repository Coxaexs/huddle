import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  chatText,
  encodeVarInt,
  isPrivateHost,
  parseStatusResponse,
  queryMinecraft,
  readRconPackets,
  readVarInt,
  runRcon,
} from "@/lib/game-server";

const servers: net.Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

function listen(onSocket: (socket: net.Socket) => void): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer(onSocket);
    servers.push(server);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
  });
}

function statusPacket(json: unknown): Buffer {
  const text = Buffer.from(JSON.stringify(json), "utf8");
  const body = Buffer.concat([encodeVarInt(0), encodeVarInt(text.length), text]);
  return Buffer.concat([encodeVarInt(body.length), body]);
}

function rcon(id: number, type: number, body: string): Buffer {
  const text = Buffer.from(body, "utf8");
  const out = Buffer.alloc(14 + text.length);
  out.writeInt32LE(10 + text.length, 0);
  out.writeInt32LE(id, 4);
  out.writeInt32LE(type, 8);
  text.copy(out, 12);
  return out;
}

describe("game server addresses", () => {
  it("treats local, LAN and tailnet addresses as private", () => {
    for (const host of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.198", "172.20.0.2", "100.89.77.23", "169.254.1.1", "::1", "fd00::1", "nas", "box.local", "0.0.0.0"]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
    for (const host of ["mc.hypixel.net", "8.8.8.8", "172.32.0.1", "2001:db8::1"]) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });
});

describe("server list ping", () => {
  it("round-trips VarInts", () => {
    for (const value of [0, 1, 127, 128, 25565, 2097151, 767]) {
      expect(readVarInt(encodeVarInt(value))).toEqual([value, encodeVarInt(value).length]);
    }
    expect(readVarInt(Buffer.from([0x80]))).toBeNull();
  });

  it("waits for the whole response packet", () => {
    const full = statusPacket({ version: { name: "1.21" } });
    expect(parseStatusResponse(full.subarray(0, full.length - 3))).toBeNull();
    expect(parseStatusResponse(full)).toEqual({ version: { name: "1.21" } });
  });

  it("flattens a chat component MOTD", () => {
    expect(chatText({ text: "§aHello ", extra: [{ text: "world" }, "§l!"] })).toBe("Hello world!");
  });

  it("reads players from a real socket, even split across packets", async () => {
    const port = await listen((socket) => {
      socket.once("data", () => {
        const reply = statusPacket({
          version: { name: "Paper 1.21.1" },
          players: { online: 3, max: 10, sample: [{ name: "aria" }, { name: "juno" }] },
          description: { text: "Friends ", extra: [{ text: "only" }] },
        });
        socket.write(reply.subarray(0, 5));
        setTimeout(() => socket.write(reply.subarray(5)), 20);
      });
    });
    const status = await queryMinecraft("127.0.0.1", port, 2000);
    expect(status).toMatchObject({ online: true, playersOnline: 3, maxPlayers: 10, players: ["aria", "juno"], motd: "Friends only", version: "Paper 1.21.1" });
  });

  it("reports offline when nothing answers", async () => {
    const port = await listen((socket) => socket.end());
    expect((await queryMinecraft("127.0.0.1", port, 1000)).online).toBe(false);
  });
});

describe("rcon", () => {
  it("splits packets and keeps a partial one for later", () => {
    const both = Buffer.concat([rcon(1, 2, ""), rcon(2, 0, "There are 3 players")]);
    const { packets, rest } = readRconPackets(both.subarray(0, both.length - 4));
    expect(packets).toEqual([{ id: 1, type: 2, body: "" }]);
    expect(rest.length).toBeGreaterThan(0);
  });

  it("logs in and returns the command's answer", async () => {
    const port = await listen((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { packets, rest } = readRconPackets(buffer);
        buffer = rest;
        for (const p of packets) {
          if (p.type === 3) socket.write(Buffer.concat([rcon(p.id, 0, ""), rcon(p.body === "secret" ? p.id : -1, 2, "")]));
          if (p.type === 2) socket.write(rcon(p.id, 0, `ran: ${p.body}`));
        }
      });
    });
    expect(await runRcon("127.0.0.1", port, "secret", "list")).toBe("ran: list");
    await expect(runRcon("127.0.0.1", port, "wrong", "list")).rejects.toThrow("password");
  });
});
