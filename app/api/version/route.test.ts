import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/version", () => {
  it("names the build and is never cached", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    // Tests run outside a vite build, so there is no stamp.
    expect(await response.json()).toEqual({ build: "dev" });
  });
});
