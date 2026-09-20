import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

import { generateBotToken, authenticateBot } from "./bot-auth";
import { setBindings } from "./storage";

describe("Bot Authentication & Token Management", () => {
  it("generates tokens with hfl_bot_ prefix and high entropy", () => {
    const token1 = generateBotToken();
    const token2 = generateBotToken();

    expect(token1).toMatch(/^hfl_bot_[a-f0-9]{48}$/);
    expect(token2).toMatch(/^hfl_bot_[a-f0-9]{48}$/);
    expect(token1).not.toBe(token2);
  });

  it("authenticates master BOT_TOKEN with Bot or Bearer scheme", async () => {
    setBindings({ BOT_TOKEN: "master-secret-token" });

    const reqBot = new Request("http://localhost/api/v1/users/@me", {
      headers: { Authorization: "Bot master-secret-token" },
    });
    const bot1 = await authenticateBot(reqBot);
    expect(bot1).not.toBeNull();
    expect(bot1?.isMaster).toBe(true);
    expect(bot1?.id).toBe("system-bot");

    const reqBearer = new Request("http://localhost/api/v1/users/@me", {
      headers: { Authorization: "Bearer master-secret-token" },
    });
    const bot2 = await authenticateBot(reqBearer);
    expect(bot2).not.toBeNull();
    expect(bot2?.isMaster).toBe(true);
  });

  it("returns null when no authorization header is provided or token is invalid", async () => {
    setBindings({ BOT_TOKEN: "master-secret-token" });

    const noAuth = new Request("http://localhost/api/v1/users/@me");
    expect(await authenticateBot(noAuth)).toBeNull();

    const wrongAuth = new Request("http://localhost/api/v1/users/@me", {
      headers: { Authorization: "Bot wrong-token" },
    });
    expect(await authenticateBot(wrongAuth)).toBeNull();
  });

  it("authenticates server-specific bot token from database", async () => {
    const token = generateBotToken();
    const mockDb = {
      prepare: (query: string) => ({
        all: async () => ({ results: [] }),
        run: async () => ({}),
        first: async () => ({ count: 1 }),
        bind: (...args: any[]) => ({
          run: async () => ({}),
          all: async () => ({ results: [] }),
          first: async () => {
            if (args[0] === token) {
              return {
                id: "bot-123",
                server_id: "server-456",
                name: "Tavern Dice Bot",
                avatar: "🎲",
                kind: "dnd",
                enabled: 1,
              };
            }
            return null;
          },
        }),
      }),
      batch: async () => [],
    } as unknown as D1Database;

    setBindings({ DB: mockDb, BOT_TOKEN: "different-master-token" });

    const req = new Request("http://localhost/api/v1/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });

    const bot = await authenticateBot(req);
    expect(bot).not.toBeNull();
    expect(bot?.id).toBe("bot-123");
    expect(bot?.serverId).toBe("server-456");
    expect(bot?.name).toBe("Tavern Dice Bot");
    expect(bot?.isMaster).toBe(false);
  });
});
