// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RailFolder, RailQuickDms, RailServer } from "@/app/components/chat/rail";
import type { PublicServer } from "@/lib/servers";
import type { DmSummary } from "@/app/lib/chat/types";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);

function server(id: string, name: string, channels: Array<{ id: string; kind: string; name?: string }> = []) {
  return { id, name, icon: "", color: "#a78bfa", channels: channels.map((c) => ({ name: c.id, ...c })) } as unknown as PublicServer;
}

const roomy = server("s1", "Dragon Club", [
  { id: "general", kind: "text" },
  { id: "tavern", kind: "voice", name: "Tavern" },
]);

function railServer(props: Partial<React.ComponentProps<typeof RailServer>> = {}) {
  const all = {
    server: roomy,
    isActive: false,
    unread: {},
    voiceRooms: {},
    dragging: false,
    dropMode: null,
    dragProps: {},
    onOpen: vi.fn(),
    onMenu: vi.fn(),
    ...props,
  };
  return { ...render(<RailServer {...all} />), ...all };
}

describe("RailServer", () => {
  it("shows initials and opens on click", () => {
    const { onOpen } = railServer();
    const button = screen.getByRole("button", { name: "Dragon Club" });
    expect(button.textContent).toContain("DC");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalled();
  });

  it("badges mentions, marks unread, and lists who is in voice", () => {
    const { container } = railServer({
      unread: { general: { unread: true, count: 3, mentions: 2 } },
      voiceRooms: { tavern: [{ displayName: "Alice" }, { displayName: "Bob" }] as never },
    });
    expect(container.querySelector(".rail-badge")?.textContent).toBe("2");
    expect(container.querySelector(".rail-unread-pill")).toBeTruthy();
    expect(container.querySelector(".rail-voice-badge")?.getAttribute("title")).toBe("🔊 Tavern: Alice, Bob");
  });

  it("shows the active pill instead of unread when active", () => {
    const { container } = railServer({ isActive: true, unread: { general: { unread: true, count: 1, mentions: 0 } } });
    expect(container.querySelector(".rail-active-pill")).toBeTruthy();
    expect(container.querySelector(".rail-unread-pill")).toBeNull();
  });

  it("opens its menu on right-click, and reflects drag state", () => {
    const { onMenu, container } = railServer({ dragging: true, dropMode: "merge" });
    fireEvent.contextMenu(screen.getByRole("button", { name: "Dragon Club" }), { clientX: 10, clientY: 20 });
    expect(onMenu).toHaveBeenCalledWith(10, 20);
    const item = container.querySelector(".rail-item")!;
    expect(item.className).toContain("dragging");
    expect(item.className).toContain("drop-merge");
  });

  it("has no accessibility violations", async () => {
    const { container } = railServer();
    await expectNoA11yViolations(container);
  });
});

describe("RailFolder", () => {
  const members = [server("a", "Alpha"), server("b", "Beta")];
  function folder(props: Partial<React.ComponentProps<typeof RailFolder>> = {}) {
    const all = {
      folder: { id: "f1", name: "", color: "#ffaa00", serverIds: ["a", "b"] } as never,
      folderServers: members,
      open: false,
      activeServerId: null,
      unread: {},
      dropMerge: false,
      dropProps: {},
      onToggle: vi.fn(),
      onMenu: vi.fn(),
      renderServer: (s: PublicServer) => <span key={s.id} data-testid="server">{s.name}</span>,
      ...props,
    };
    return { ...render(<RailFolder {...all} />), ...all };
  }

  it("is a closed grid named after its servers, and toggles", () => {
    const { onToggle } = folder();
    const button = screen.getByRole("button", { name: "Alpha, Beta folder, closed" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByTestId("server")).toHaveLength(0);
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });

  it("draws its servers when open", () => {
    folder({ open: true });
    expect(screen.getAllByTestId("server").map((n) => n.textContent)).toEqual(["Alpha", "Beta"]);
  });

  it("highlights a merge drop", () => {
    const { container } = folder({ dropMerge: true });
    expect(container.querySelector(".rail-item")?.className).toContain("drop-merge");
  });
});

describe("RailQuickDms", () => {
  const dm = (n: number): DmSummary =>
    ({ channelId: `dm-${n}`, user: { id: `u${n}`, displayName: `Friend ${n}`, avatar: "F", color: "#123456" }, lastMessage: null, lastAt: null }) as never;

  it("shows at most four, with unread counts, and opens one", () => {
    const onOpen = vi.fn();
    render(
      <RailQuickDms
        dms={[1, 2, 3, 4, 5].map(dm)}
        inDmHome={false}
        activeChannelId={null}
        unread={{ "dm-2": { unread: true, count: 4, mentions: 0 } }}
        voiceRooms={{}}
        presenceOf={() => "online"}
        onOpen={onOpen}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Friend 2, 4 unread" }));
    expect(onOpen).toHaveBeenCalledWith("dm-2");
  });
});
