// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BattlemapBoard } from "@/app/components/battlemap";
import { apiFetch } from "@/app/lib/client";
import type { Battlemap } from "@/lib/battlemap";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/app/lib/client", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

afterEach(cleanup);

function mockMap(overrides: Partial<Battlemap> = {}): Battlemap {
  return {
    id: "map-1",
    channelId: "stage-1",
    name: "Dungeon Room",
    imageUrl: null,
    grid: 20,
    rows: 15,
    tokens: [
      {
        id: "tok-1",
        label: "Fighter",
        color: "#ef6b58",
        x: 5,
        y: 5,
        size: 1,
        ownerId: "user-alice",
        hp: 24,
        maxHp: 28,
        conditions: ["concentrating"],
        initiative: 17,
      },
      {
        id: "tok-2",
        label: "Goblin",
        color: "#49a35d",
        x: 8,
        y: 7,
        size: 1,
        hp: 7,
        maxHp: 7,
        conditions: ["poisoned"],
        initiative: 12,
      },
    ],
    strokes: [],
    fog: [],
    ...overrides,
  };
}

describe("BattlemapBoard Component & Upgrades", () => {
  it("renders the board with tokens, conditions, and hp", () => {
    const map = mockMap();
    render(
      <BattlemapBoard
        channelId="stage-1"
        map={map}
        gm={true}
        userId="user-alice"
        onClose={vi.fn()}
        onLocalToken={vi.fn()}
        onLocalStroke={vi.fn()}
        onAddMyToken={vi.fn()}
      />,
    );

    expect(screen.getByText("Dungeon Room")).toBeDefined();
    expect(screen.getByText("Fighter")).toBeDefined();
    expect(screen.getByText("Goblin")).toBeDefined();

    // Condition badges rendered on tokens
    expect(screen.getByText("CNC")).toBeDefined();
    expect(screen.getByText("POI")).toBeDefined();

    // HP displays
    expect(screen.getByText("24/28")).toBeDefined();
    expect(screen.getByText("7/7")).toBeDefined();
  });

  it("cycles grid snap mode between square, hex, and none", () => {
    const map = mockMap();
    render(
      <BattlemapBoard
        channelId="stage-1"
        map={map}
        gm={true}
        userId="user-alice"
        onClose={vi.fn()}
        onLocalToken={vi.fn()}
        onLocalStroke={vi.fn()}
        onAddMyToken={vi.fn()}
      />,
    );

    const snapBtn = screen.getByTitle(/Grid snap: SQUARE/);
    expect(snapBtn).toBeDefined();

    // Click to cycle to HEX
    fireEvent.click(snapBtn);
    expect(screen.getByTitle(/Grid snap: HEX/)).toBeDefined();

    // Click to cycle to NONE
    fireEvent.click(screen.getByTitle(/Grid snap: HEX/));
    expect(screen.getByTitle(/Grid snap: NONE/)).toBeDefined();

    // Click to cycle back to SQUARE
    fireEvent.click(screen.getByTitle(/Grid snap: NONE/));
    expect(screen.getByTitle(/Grid snap: SQUARE/)).toBeDefined();
  });

  it("toggles the initiative tracker sidebar and displays combatants sorted by initiative", () => {
    const map = mockMap();
    render(
      <BattlemapBoard
        channelId="stage-1"
        map={map}
        gm={true}
        userId="user-alice"
        onClose={vi.fn()}
        onLocalToken={vi.fn()}
        onLocalStroke={vi.fn()}
        onAddMyToken={vi.fn()}
      />,
    );

    const trackerBtn = screen.getByTitle("Initiative & Encounter Tracker");
    fireEvent.click(trackerBtn);

    // Sidebar open
    expect(screen.getByText("Initiative Tracker")).toBeDefined();
    expect(screen.getByText("Round 1")).toBeDefined();
    expect(screen.getByText(/Next Turn/)).toBeDefined();

    // Combatants ordered by initiative: Fighter (17), Goblin (12)
    expect(screen.getByText("⚡ 17")).toBeDefined();
    expect(screen.getByText("⚡ 12")).toBeDefined();
  });

  it("advances turns and increments rounds when clicking Next Turn", () => {
    const map = mockMap();
    render(
      <BattlemapBoard
        channelId="stage-1"
        map={map}
        gm={true}
        userId="user-alice"
        onClose={vi.fn()}
        onLocalToken={vi.fn()}
        onLocalStroke={vi.fn()}
        onAddMyToken={vi.fn()}
      />,
    );

    const trackerBtn = screen.getByTitle("Initiative & Encounter Tracker");
    fireEvent.click(trackerBtn);

    const nextTurnBtn = screen.getByText("Next Turn");

    // First turn: starts round 1, active turn on Fighter (highest initiative)
    fireEvent.click(nextTurnBtn);
    expect(screen.getByText("Turn")).toBeDefined();

    // Second turn: advances to Goblin
    fireEvent.click(nextTurnBtn);

    // Third turn: wraps around to Fighter and increments to Round 2
    fireEvent.click(nextTurnBtn);
    expect(screen.getByText("Round 2")).toBeDefined();
  });

  it("syncs shared initiative turns via sharedInitiative and onSetInitiative", () => {
    const map = mockMap();
    const onSetInitiative = vi.fn();
    render(
      <BattlemapBoard
        channelId="stage-1"
        map={map}
        gm={true}
        userId="user-alice"
        onClose={vi.fn()}
        onLocalToken={vi.fn()}
        onLocalStroke={vi.fn()}
        onAddMyToken={vi.fn()}
        sharedInitiative={{
          entries: [
            { id: "bm-tok-1", name: "Fighter", value: 17, pawnId: "bm-tok1" },
            { id: "bm-tok-2", name: "Goblin", value: 12, pawnId: "bm-tok2" },
          ],
          turn: 0,
          round: 3,
        }}
        onSetInitiative={onSetInitiative}
      />,
    );

    fireEvent.click(screen.getByTitle("Initiative & Encounter Tracker"));
    expect(screen.getByText("Round 3")).toBeDefined();
    fireEvent.click(screen.getByText("Next Turn"));
    expect(onSetInitiative).toHaveBeenCalledWith({
      entries: [
        { id: "bm-tok-1", name: "Fighter", value: 17, pawnId: "bm-tok1" },
        { id: "bm-tok-2", name: "Goblin", value: 12, pawnId: "bm-tok2" },
      ],
      turn: 1,
      round: 3,
    });
    fireEvent.click(screen.getByTitle("Reset encounter"));
    expect(onSetInitiative).toHaveBeenCalledWith(null);
  });

  it("submits drawn fog rectangle on pointerup (fogDraftRef fix)", () => {
    vi.mocked(apiFetch).mockClear();
    const map = mockMap();
    const { container } = render(
      <BattlemapBoard
        channelId="stage-1"
        map={map}
        gm={true}
        userId="user-alice"
        onClose={vi.fn()}
        onLocalToken={vi.fn()}
        onLocalStroke={vi.fn()}
        onAddMyToken={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Fog of war (drag to hide an area)"));
    const board = container.querySelector(".battlemap-board") as HTMLElement;
    board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 150, right: 200, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });

    fireEvent.pointerDown(board, { button: 0, clientX: 20, clientY: 15 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 60 });
    fireEvent.pointerUp(window);

    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
      "/api/battlemap",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"action":"add-fog"'),
      }),
    );
  });

  it("measures feet in ruler mode, places AoE templates, and triggers concentration prompt on damage", () => {
    vi.mocked(apiFetch).mockClear();
    const map = mockMap({
      tokens: [
        {
          id: "tok-conc",
          label: "Wizard",
          color: "#68a8ff",
          x: 4,
          y: 4,
          ownerId: "user-alice",
          hp: 20,
          maxHp: 20,
          conditions: ["concentrating"],
        },
        {
          id: "tok-mob",
          label: "Bugbear",
          color: "#ef4444",
          x: 8,
          y: 8,
          ownerId: null,
          hp: 10,
          maxHp: 27,
          hpTier: { label: "Bloodied", color: "#f97316" },
        },
        {
          id: "tok-hidden",
          label: "Secret Assassin",
          color: "#991b1b",
          x: 12,
          y: 12,
          ownerId: null,
          hidden: true,
        },
      ],
    });
    const { container } = render(
      <BattlemapBoard
        channelId="stage-1"
        map={map}
        gm={true}
        userId="user-alice"
        onClose={vi.fn()}
        onLocalToken={vi.fn()}
        onLocalStroke={vi.fn()}
        onAddMyToken={vi.fn()}
      />,
    );

    // Distance ruler in feet
    fireEvent.click(screen.getByTitle("Measure distance (feet)"));
    const board = container.querySelector(".battlemap-board") as HTMLElement;
    board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 150, right: 200, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(board, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window);
    expect(screen.getByText(/ft$/)).toBeTruthy();

    // AoE template placement
    fireEvent.click(screen.getByTitle("Spell AoE templates"));
    fireEvent.click(screen.getByRole("button", { name: "Cone" }));
    fireEvent.pointerDown(board, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(window, { clientX: 90, clientY: 50 });
    fireEvent.pointerUp(window);
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
      "/api/battlemap",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"action":"add-area"'),
      }),
    );

    // Trigger Concentration check prompt when hurting a concentrating token
    fireEvent.click(screen.getByTitle("Initiative & Encounter Tracker"));
    const minusButtons = screen.getAllByTitle("-1 HP");
    fireEvent.click(minusButtons[0]);
    expect(screen.getByText(/CON Save DC 10/)).toBeTruthy();
  });

  it("masks monster HP to tier label and hides GM-hidden tokens for non-GMs", () => {
    const map = mockMap({
      hpVisibility: "tier",
      tokens: [
        {
          id: "tok-mob",
          label: "Goblin",
          color: "#ef4444",
          x: 6,
          y: 6,
          ownerId: null,
          hpTier: { label: "Bloodied", color: "#f97316" },
        },
        {
          id: "tok-hidden",
          label: "Invisible Stalker",
          color: "#64748b",
          x: 10,
          y: 10,
          ownerId: null,
          hidden: true,
        },
      ],
    });
    render(
      <BattlemapBoard
        channelId="stage-1"
        map={map}
        gm={false}
        userId="user-bob"
        onClose={vi.fn()}
        onLocalToken={vi.fn()}
        onLocalStroke={vi.fn()}
        onAddMyToken={vi.fn()}
      />,
    );

    expect(screen.getByText("Bloodied")).toBeTruthy();
    expect(screen.queryByText("Invisible Stalker")).toBeNull();
  });
});
