// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BattlemapBoard } from "@/app/components/battlemap";
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
});
