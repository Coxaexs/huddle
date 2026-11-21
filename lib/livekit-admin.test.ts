import { describe, expect, it, vi } from "vitest";
import type { RoomServiceClient } from "livekit-server-sdk";
import { permitInLiveKit } from "./livekit-admin";

const client = (found: boolean) =>
  ({
    updateParticipant: vi.fn(() => (found ? Promise.resolve({}) : Promise.reject(new Error("not found")))),
  }) as unknown as RoomServiceClient;

describe("permitInLiveKit", () => {
  it("is true when the region the participant sits on takes the change", async () => {
    const elsewhere = client(false);
    const here = client(true);
    await expect(permitInLiveKit([elsewhere, here], "room", "user|conn", { canPublish: true })).resolves.toBe(true);
    expect(here.updateParticipant).toHaveBeenCalledWith("room", "user|conn", { permission: { canPublish: true } });
  });

  it("is false when the participant is connected nowhere, or no region is configured", async () => {
    await expect(permitInLiveKit([client(false), client(false)], "room", "user|conn", {})).resolves.toBe(false);
    await expect(permitInLiveKit([], "room", "user|conn", {})).resolves.toBe(false);
  });
});
