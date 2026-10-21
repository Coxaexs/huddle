import { describe, expect, it } from "vitest";
import { membersText, shownCounts, SHOW_MEMBERS_FROM, SHOW_ONLINE_FROM } from "./member-counts";

describe("shownCounts", () => {
  it("leaves out a small server's numbers", () => {
    expect(shownCounts({ memberCount: 1, onlineCount: 1 })).toEqual({ members: null, online: null });
    expect(shownCounts({ memberCount: SHOW_MEMBERS_FROM - 1, onlineCount: 8 })).toEqual({ members: null, online: null });
  });

  it("shows members once there are enough, and online only when a few are on", () => {
    expect(shownCounts({ memberCount: SHOW_MEMBERS_FROM, onlineCount: SHOW_ONLINE_FROM - 1 })).toEqual({
      members: SHOW_MEMBERS_FROM,
      online: null,
    });
    expect(shownCounts({ memberCount: 40, onlineCount: SHOW_ONLINE_FROM })).toEqual({ members: 40, online: SHOW_ONLINE_FROM });
  });
});

describe("membersText", () => {
  it("says member for one", () => {
    expect(membersText(1)).toBe("1 member");
    expect(membersText(1200)).toBe("1,200 members");
  });
});
