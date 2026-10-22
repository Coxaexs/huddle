import { describe, expect, it } from "vitest";
import {
  applyOverwrites,
  CHANNEL_DEFAULTS,
  isPrivateChannel,
  mayView,
  OVERWRITE_MASK,
  sanitizeOverwrites,
  type ChannelOverwrite,
  type MemberAccess,
} from "./channel-permissions";
import { ALL_PERMISSIONS, Permission } from "./permissions";

const member = (roleIds: string[] = [], mask = 0): MemberAccess => ({ unlimited: false, mask, roleIds: new Set(roleIds) });
const VIEW = Permission.VIEW_CHANNEL;
const SEND = Permission.SEND_MESSAGES;
const privateTo = (...roles: string[]): ChannelOverwrite[] => [
  { targetType: "everyone", targetId: "", allow: 0, deny: VIEW },
  ...roles.map((id) => ({ targetType: "role" as const, targetId: id, allow: VIEW, deny: 0 })),
];

describe("applyOverwrites", () => {
  it("gives every member the defaults in a channel without overwrites", () => {
    expect(applyOverwrites(member(), [], "u1")).toBe(CHANNEL_DEFAULTS);
    expect(mayView(applyOverwrites(member(), [], "u1"))).toBe(true);
  });

  it("keeps server-wide grants on top of the defaults", () => {
    const p = applyOverwrites(member([], Permission.MANAGE_MESSAGES), [], "u1");
    expect(p & Permission.MANAGE_MESSAGES).toBeTruthy();
  });

  it("hides a private channel from everyone but the roles let in", () => {
    const gate = privateTo("gm");
    expect(mayView(applyOverwrites(member(), gate, "u1"))).toBe(false);
    expect(mayView(applyOverwrites(member(["player"]), gate, "u1"))).toBe(false);
    expect(mayView(applyOverwrites(member(["gm"]), gate, "u1"))).toBe(true);
  });

  it("lets one member in by name", () => {
    const gate: ChannelOverwrite[] = [
      { targetType: "everyone", targetId: "", allow: 0, deny: VIEW },
      { targetType: "member", targetId: "u2", allow: VIEW, deny: 0 },
    ];
    expect(mayView(applyOverwrites(member(), gate, "u1"))).toBe(false);
    expect(mayView(applyOverwrites(member(), gate, "u2"))).toBe(true);
  });

  it("lets a member overwrite beat their roles, and roles beat @everyone", () => {
    const gate: ChannelOverwrite[] = [
      { targetType: "everyone", targetId: "", allow: 0, deny: SEND },
      { targetType: "role", targetId: "speaker", allow: SEND, deny: 0 },
      { targetType: "member", targetId: "u3", allow: 0, deny: SEND },
    ];
    expect(applyOverwrites(member(), gate, "u1") & SEND).toBe(0);
    expect(applyOverwrites(member(["speaker"]), gate, "u2") & SEND).toBe(SEND);
    expect(applyOverwrites(member(["speaker"]), gate, "u3") & SEND).toBe(0);
  });

  it("counts a member's roles together: an allow on one beats a deny on another", () => {
    const gate: ChannelOverwrite[] = [
      { targetType: "role", targetId: "muted", allow: 0, deny: SEND },
      { targetType: "role", targetId: "mod", allow: SEND, deny: 0 },
    ];
    expect(applyOverwrites(member(["muted"]), gate, "u1") & SEND).toBe(0);
    expect(applyOverwrites(member(["muted", "mod"]), gate, "u1") & SEND).toBe(SEND);
  });

  it("never limits owners, global admins or ADMINISTRATOR", () => {
    const gate = privateTo();
    expect(applyOverwrites({ unlimited: true, mask: 0, roleIds: new Set() }, gate, "owner")).toBe(ALL_PERMISSIONS);
    expect(applyOverwrites(member([], Permission.ADMINISTRATOR), gate, "u1")).toBe(ALL_PERMISSIONS);
  });

  it("can take a role's server-wide grant away in one channel", () => {
    const gate: ChannelOverwrite[] = [{ targetType: "everyone", targetId: "", allow: 0, deny: Permission.MENTION_EVERYONE }];
    expect(applyOverwrites(member([], Permission.MENTION_EVERYONE), gate, "u1") & Permission.MENTION_EVERYONE).toBe(0);
  });
});

describe("isPrivateChannel", () => {
  it("is true only when @everyone cannot see the channel", () => {
    expect(isPrivateChannel(privateTo("gm"))).toBe(true);
    expect(isPrivateChannel([{ targetType: "everyone", targetId: "", allow: 0, deny: SEND }])).toBe(false);
    expect(isPrivateChannel([{ targetType: "role", targetId: "x", allow: 0, deny: VIEW }])).toBe(false);
  });
});

describe("sanitizeOverwrites", () => {
  const known = { roleIds: new Set(["r1"]), memberIds: new Set(["u1"]) };

  it("keeps known targets and overwritable bits only", () => {
    const out = sanitizeOverwrites(
      [
        { targetType: "everyone", targetId: "", allow: 0, deny: VIEW | Permission.ADMINISTRATOR },
        { targetType: "role", targetId: "r1", allow: VIEW | Permission.MANAGE_SERVER, deny: 0 },
        { targetType: "role", targetId: "nope", allow: VIEW, deny: 0 },
        { targetType: "member", targetId: "u1", allow: SEND, deny: 0 },
        { targetType: "member", targetId: "stranger", allow: SEND, deny: 0 },
        { targetType: "everything", targetId: "", allow: VIEW, deny: 0 },
      ],
      known,
    );
    expect(out).toEqual([
      { targetType: "everyone", targetId: "", allow: 0, deny: VIEW },
      { targetType: "role", targetId: "r1", allow: VIEW, deny: 0 },
      { targetType: "member", targetId: "u1", allow: SEND, deny: 0 },
    ]);
  });

  it("drops empty rows and duplicates, and an allow wins over the same deny", () => {
    const out = sanitizeOverwrites(
      [
        { targetType: "role", targetId: "r1", allow: 0, deny: 0 },
        { targetType: "member", targetId: "u1", allow: SEND, deny: SEND | VIEW },
        { targetType: "member", targetId: "u1", allow: VIEW, deny: 0 },
      ],
      known,
    );
    expect(out).toEqual([{ targetType: "member", targetId: "u1", allow: SEND, deny: VIEW }]);
  });

  it("never stores bits outside what an overwrite may set", () => {
    const [row] = sanitizeOverwrites([{ targetType: "everyone", targetId: "", allow: 0, deny: -1 }], known);
    expect(row.deny & ~OVERWRITE_MASK).toBe(0);
  });

  it("ignores anything that is not a list", () => {
    expect(sanitizeOverwrites("nope", known)).toEqual([]);
    expect(sanitizeOverwrites(null, known)).toEqual([]);
  });
});
