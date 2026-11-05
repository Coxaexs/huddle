import { describe, expect, it } from "vitest";
import type { Member, PublicUser } from "@/lib/users";
import { dmMemberList } from "./dm-members";
import type { DmSummary } from "./types";

const NOW = "2026-11-05T12:00:00.000Z";

const me: PublicUser = {
  id: "kiwi",
  username: "kiwi",
  displayName: "mewis",
  avatar: "K",
  avatarUrl: null,
  color: "#aa00ff",
  isAdmin: false,
  canInvite: true,
  profileEffect: "bats",
  nameplate: "vampire",
  bannerUrl: "/uploads/banner.png",
  email: "kiwi@example.com",
};

const flo: Member = {
  id: "flo",
  username: "flo",
  displayName: "Flo",
  avatar: "F",
  color: "#00aaff",
  lastSeenAt: "2026-11-04T20:00:00.000Z",
  profileEffect: "warp",
  nameplate: "ronin",
  profileStyle: { motion: "tilt" } as Member["profileStyle"],
};

function dm(user: DmSummary["user"], group?: DmSummary["group"]): DmSummary {
  return { channelId: "c1", user, lastMessage: null, lastAt: null, group };
}

describe("dmMemberList", () => {
  it("lists you once in notes to self", () => {
    const self = { ...flo, ...me, lastSeenAt: NOW } as unknown as Member;
    const list = dmMemberList(me, dm(self), NOW);
    expect(list.map((member) => member.id)).toEqual(["kiwi"]);
  });

  it("keeps both people's profile customizations in a DM", () => {
    const [mine, theirs] = dmMemberList(me, dm(flo), NOW);
    expect(mine).toMatchObject({ id: "kiwi", profileEffect: "bats", nameplate: "vampire", bannerUrl: "/uploads/banner.png" });
    expect(theirs).toMatchObject({ id: "flo", profileEffect: "warp", nameplate: "ronin", profileStyle: { motion: "tilt" } });
    // Their real last-seen time, not "just now".
    expect(theirs.lastSeenAt).toBe("2026-11-04T20:00:00.000Z");
  });

  it("never puts private account settings on your member row", () => {
    const [mine] = dmMemberList(me, null, NOW);
    expect(JSON.stringify(mine)).not.toContain("kiwi@example.com");
  });

  it("uses your fresh session profile inside a group and keeps the others as sent", () => {
    const staleMe: Member = { id: "kiwi", username: "kiwi", displayName: "old", avatar: "K", color: "#000", lastSeenAt: NOW };
    const group = dm(
      { id: "c1", username: "Party", displayName: "Party", avatar: "👥", color: "#5865f2", lastSeenAt: NOW },
      { name: "Party", ownerId: "kiwi", members: [staleMe, flo] },
    );
    const list = dmMemberList(me, group, NOW);
    expect(list.map((member) => member.id)).toEqual(["kiwi", "flo"]);
    expect(list[0]).toMatchObject({ displayName: "mewis", profileEffect: "bats" });
    expect(list[1]).toBe(flo);
  });
});
