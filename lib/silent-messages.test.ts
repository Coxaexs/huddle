import { describe, expect, it } from "vitest";
import { hasSuppressNotifications, isSilentPayload, takeSilent } from "./silent-messages";

describe("silent messages", () => {
  it("takes a leading @silent off the message", () => {
    expect(takeSilent("@silent going to bed, gn")).toEqual({ content: "going to bed, gn", silent: true });
    expect(takeSilent("@SILENT\nnew line")).toEqual({ content: "new line", silent: true });
    expect(takeSilent("@silent")).toEqual({ content: "", silent: true });
  });

  it("leaves other messages alone", () => {
    expect(takeSilent("hey @silent you there")).toEqual({ content: "hey @silent you there", silent: false });
    expect(takeSilent("@silentbob hi")).toEqual({ content: "@silentbob hi", silent: false });
  });

  it("reads the payload mark and Discord's flag", () => {
    expect(isSilentPayload({ silent: true })).toBe(true);
    expect(isSilentPayload({ silent: "yes" })).toBe(false);
    expect(isSilentPayload(null)).toBe(false);
    expect(hasSuppressNotifications(4096)).toBe(true);
    expect(hasSuppressNotifications(4096 | 4)).toBe(true);
    expect(hasSuppressNotifications(4)).toBe(false);
    expect(hasSuppressNotifications(undefined)).toBe(false);
  });
});
