// @vitest-environment jsdom
import { memo, useCallback } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useStableFns } from "@/app/hooks/use-stable-fns";

afterEach(cleanup);

let childRenders = 0;
const Child = memo(function Child(props: { label: string; onPing: () => string; live: () => string }) {
  childRenders += 1;
  return <p>{`${props.label}:${props.onPing()}:${props.live()}`}</p>;
});

function Parent({ label, tick, live }: { label: string; tick: number; live: string }) {
  // `tick` stands in for hot parent state the child doesn't care about.
  // Live functions are the caller's to memoise, as roleColorFor/prefFor are.
  const liveFn = useCallback(() => live, [live]);
  const shared = useStableFns({ label, onPing: () => `ping${tick}`, live: liveFn }, ["live"]);
  return <Child {...shared} />;
}

describe("useStableFns", () => {
  it("keeps handlers stable so a memoised child skips unrelated renders", () => {
    childRenders = 0;
    const view = render(<Parent label="a" tick={0} live="x" />);
    expect(childRenders).toBe(1);
    view.rerender(<Parent label="a" tick={1} live="x" />);
    expect(childRenders).toBe(1);
  });

  it("calls the newest version of a handler", () => {
    let seen = "";
    function Probe({ n }: { n: number }) {
      const { go } = useStableFns({ go: () => (seen = `n${n}`) });
      seen === "" && go();
      return <button onClick={go}>go</button>;
    }
    const view = render(<Probe n={1} />);
    const first = view.getByText("go");
    view.rerender(<Probe n={2} />);
    first.click();
    expect(seen).toBe("n2");
  });

  it("re-renders the child when a live function or data prop changes", () => {
    childRenders = 0;
    const view = render(<Parent label="a" tick={0} live="x" />);
    view.rerender(<Parent label="a" tick={0} live="y" />);
    expect(childRenders).toBe(2);
    view.rerender(<Parent label="b" tick={0} live="y" />);
    expect(childRenders).toBe(3);
  });
});
