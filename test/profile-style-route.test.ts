import { beforeEach, describe, expect, it, vi } from "vitest";

// Saving a profile style end to end through PATCH /api/settings/profile,
// with a stand-in D1 that records what the route writes.

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/hub-client", () => ({ publishMemberUpdate: vi.fn(async () => {}) }));

const writes: { sql: string; args: unknown[] }[] = [];
const fakeDb = {
  prepare(sql: string) {
    return {
      bind(...args: unknown[]) {
        return {
          run: async () => {
            writes.push({ sql, args });
            return { success: true };
          },
          first: async () => null,
          all: async () => ({ results: [] }),
        };
      },
      first: async () => null,
      all: async () => ({ results: [] }),
    };
  },
};
vi.mock("@/lib/storage", () => ({ bindings: () => ({ DB: fakeDb }) }));

let storedStyle = "{}";
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    currentUser: vi.fn(async () => ({
      id: "u-kiwi",
      username: "kiwi",
      display_name: "mewis",
      avatar: "M",
      avatar_url: null,
      banner_url: null,
      bio: "",
      pronouns: "",
      tagline: "",
      custom_status: null,
      pride_badges: "[]",
      spotify_activity: null,
      activity: null,
      lastfm_username: null,
      social_links: "[]",
      avatar_frame: "none",
      profile_effect: "none",
      nameplate: "none",
      profile_frame: "none",
      profile_style: storedStyle,
      color: "#e0245e",
      is_admin: 0,
      status: "online",
      custom_css: null,
      custom_theme: null,
      quick_reactions: "[]",
      hidden_emojis: "[]",
      created_at: "2025-06-01T00:00:00Z",
    })),
  };
});

const { PATCH } = await import("@/app/api/settings/profile/route");

async function save(body: unknown) {
  const response = await PATCH(
    new Request("http://localhost/hangout/api/settings/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const write = writes.at(-1)!;
  const column = write.sql.split("SET ")[1].split(" WHERE")[0].split(", ").map((part) => part.split(" = ")[0]);
  return {
    status: response.status,
    json: (await response.json()) as { user: { profileStyle: unknown } },
    stored: write.args[column.indexOf("profile_style")] as string,
  };
}

describe("PATCH /api/settings/profile with a profile style", () => {
  beforeEach(() => {
    writes.length = 0;
    storedStyle = "{}";
  });

  it("stores the cleaned style and hands it back on the user", async () => {
    const { status, json, stored } = await save({
      profileStyle: { font: "pixel", effect: "neon", nameColors: ["#FF3CAC", "#00ff00"], theme: ["#3A0F6B", "#ff3cac"], finish: "holo", ring: "orbit", bogus: "<script>" },
    });
    expect(status).toBe(200);
    const expected = { font: "pixel", effect: "neon", nameColors: ["#ff3cac"], theme: ["#3a0f6b", "#ff3cac"], finish: "holo", ring: "orbit" };
    expect(JSON.parse(stored)).toEqual(expected);
    expect(json.user.profileStyle).toEqual(expected);
  });

  it("keeps the saved style when the request doesn't mention it", async () => {
    storedStyle = JSON.stringify({ font: "gothic", ring: "flame" });
    const { stored, json } = await save({ bio: "hello" });
    expect(JSON.parse(stored)).toEqual({ font: "gothic", ring: "flame" });
    expect(json.user.profileStyle).toEqual({ font: "gothic", ring: "flame" });
  });

  it("clears the style when sent an empty or junk one", async () => {
    storedStyle = JSON.stringify({ font: "gothic" });
    expect(JSON.parse((await save({ profileStyle: {} })).stored)).toEqual({});
    expect(JSON.parse((await save({ profileStyle: "rainbow" })).stored)).toEqual({});
  });

  it("survives a corrupt stored value", async () => {
    storedStyle = "{not json";
    const { status, stored } = await save({ bio: "still saves" });
    expect(status).toBe(200);
    expect(JSON.parse(stored)).toEqual({});
  });
});
