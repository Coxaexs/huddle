import { describe, expect, it } from "vitest";
import { deterministicArchiveMessageId, parseDiscordArchive } from "./discord-archive";

describe("DiscordChatExporter JSON archive parser", () => {
  it("parses messages, attachments, and embed summaries safely and deterministically", async () => {
    const parsed = parseDiscordArchive({
      channel: { name: "Session Notes #1" },
      messages: [
        {
          id: "9001",
          timestamp: "2026-01-15T19:30:00Z",
          content: "Welcome to the tavern!",
          author: { name: "gandalf", nickname: "Gandalf the Grey" },
          attachments: [{ fileName: "map.png", url: "https://cdn.discordapp.com/attachments/1/map.png" }],
          embeds: [{ title: "Quest", description: "Find the ring" }],
        },
        {
          id: "9002",
          content: "   ",
          author: { name: "empty" },
        },
      ],
    });

    expect(parsed.channelName).toBe("session-notes-1");
    expect(parsed.skipped).toBe(1);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].author).toBe("Gandalf the Grey");
    expect(parsed.messages[0].content).toContain("Welcome to the tavern!");
    expect(parsed.messages[0].content).toContain("[Attachment: map.png]");
    expect(parsed.messages[0].content).toContain("[Embed] Quest — Find the ring");

    const idA = await deterministicArchiveMessageId("chan-1", "9001");
    const idB = await deterministicArchiveMessageId("chan-1", "9001");
    const idOther = await deterministicArchiveMessageId("chan-2", "9001");
    expect(idA).toBe(idB);
    expect(idA).not.toBe(idOther);
  });

  it("caps overly long archives and rejects malformed non-archive payloads", () => {
    expect(() => parseDiscordArchive([])).toThrow();
    expect(() => parseDiscordArchive({})).toThrow();

    const many = Array.from({ length: 12 }, (_, idx) => ({
      id: `m-${idx}`,
      content: `Line ${idx}`,
      author: { name: "User" },
    }));
    const capped = parseDiscordArchive({ messages: many }, 5);
    expect(capped.messages).toHaveLength(5);
    expect(capped.skipped).toBe(7);
  });
});
