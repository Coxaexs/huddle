import { describe, expect, it } from "vitest";
import { issueResumeTicket, resumedJoinedAt, verifyResumeTicket } from "./resume-ticket";

describe("resume tickets", () => {
  it("verifies for the user and connection it was issued to", async () => {
    const ticket = await issueResumeTicket("k", "user-1", "conn-1");
    expect(await verifyResumeTicket("k", "user-1", "conn-1", ticket)).toBe(true);
  });

  it("refuses another user, another connection, another key or garbage", async () => {
    const ticket = await issueResumeTicket("k", "user-1", "conn-1");
    expect(await verifyResumeTicket("k", "user-2", "conn-1", ticket)).toBe(false);
    expect(await verifyResumeTicket("k", "user-1", "conn-2", ticket)).toBe(false);
    expect(await verifyResumeTicket("other", "user-1", "conn-1", ticket)).toBe(false);
    expect(await verifyResumeTicket("k", "user-1", "conn-1", "")).toBe(false);
    expect(await verifyResumeTicket("k", "user-1", "conn-1", ticket.slice(1))).toBe(false);
  });
});

describe("resumedJoinedAt", () => {
  const now = 1_000_000_000_000;
  it("keeps a recent past clock", () => {
    expect(resumedJoinedAt(now - 60_000, now)).toBe(now - 60_000);
  });
  it("rejects future, ancient and non-numbers", () => {
    expect(resumedJoinedAt(now + 1, now)).toBeNull();
    expect(resumedJoinedAt(now - 25 * 3600_000, now)).toBeNull();
    expect(resumedJoinedAt("1", now)).toBeNull();
    expect(resumedJoinedAt(undefined, now)).toBeNull();
  });
});
