// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MessageBody } from "@/app/components/message-body";

afterEach(cleanup);

function times(text: string) {
  const { container } = render(<MessageBody text={text} />);
  return { container, times: [...container.querySelectorAll("time")] };
}

describe("Discord timestamps in MessageBody", () => {
  it("turns <t:…> into a time in the viewer's zone, defaulting to date and time", () => {
    const { times: found } = times("Session starts <t:1762372800:D> at <t:1762372800:t>, see you <t:1762372800>!");
    expect(found).toHaveLength(3);
    for (const time of found) expect(time.getAttribute("datetime")).toBe("2025-11-05T20:00:00.000Z");
    expect(found[0].textContent).toMatch(/2025/);
    expect(found[1].textContent).not.toMatch(/2025/);
    expect(found[2].textContent).toMatch(/2025/);
    expect(found[0].title).toMatch(/2025/);
  });

  it("shows relative times as relative", () => {
    const soon = Math.floor(Date.now() / 1000) + 2 * 3600;
    const { times: found } = times(`Raid <t:${soon}:R>`);
    expect(found[0].textContent).toMatch(/2 hours/);
  });

  it("leaves anything that is not a timestamp as text", () => {
    const { container, times: found } = times("<t:abc> <t:123:X> <t:99999999999999>");
    expect(found).toHaveLength(0);
    expect(container.textContent).toContain("<t:abc>");
    expect(container.textContent).toContain("<t:99999999999999>");
  });
});
