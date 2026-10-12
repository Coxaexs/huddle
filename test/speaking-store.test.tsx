// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { createSpeakingStore, useSpeaking } from "@/app/lib/speaking-store";

afterEach(cleanup);

describe("speaking store", () => {
  it("notifies subscribers only when the set of talkers changes", () => {
    const store = createSpeakingStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(new Set(["a"]));
    store.set(new Set(["a"]));
    expect(listener).toHaveBeenCalledTimes(1);
    store.set(new Set(["a", "b"]));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get().has("b")).toBe(true);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createSpeakingStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.set(new Set(["a"]));
    expect(listener).not.toHaveBeenCalled();
  });

  it("re-renders only the component that reads it", () => {
    const store = createSpeakingStore();
    let parentRenders = 0;
    let leafRenders = 0;
    function Leaf() {
      leafRenders += 1;
      return <p>{[...useSpeaking(store)].join(",") || "quiet"}</p>;
    }
    function Parent() {
      parentRenders += 1;
      return <Leaf />;
    }
    const view = render(<Parent />);
    expect(view.getByText("quiet")).toBeTruthy();
    act(() => store.set(new Set(["self"])));
    expect(view.getByText("self")).toBeTruthy();
    expect(parentRenders).toBe(1);
    expect(leafRenders).toBe(2);
  });
});
