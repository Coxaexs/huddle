import { describe, expect, it } from "vitest";
import {
  askGemini,
  buildUserTurn,
  modelList,
  parseDuckResults,
  stripWebPrefix,
  trimHistory,
  wantsWeb,
} from "./ai";

describe("wantsWeb", () => {
  it("searches for time-sensitive questions", () => {
    expect(wantsWeb("who won the latest F1 race?")).toBe(true);
    expect(wantsWeb("bitcoin price")).toBe(true);
    expect(wantsWeb("what happened in 2026 elections")).toBe(true);
  });
  it("skips questions the model can answer alone", () => {
    expect(wantsWeb("how do spell slots work in 5e?")).toBe(false);
    expect(wantsWeb("write a haiku about cats")).toBe(false);
  });
  it("honours web: and noweb: prefixes", () => {
    expect(wantsWeb("web: how do spell slots work")).toBe(true);
    expect(wantsWeb("noweb: latest news")).toBe(false);
    expect(stripWebPrefix("web:  hello")).toBe("hello");
  });
});

describe("parseDuckResults", () => {
  const html = `
    <div class="result results_links results_links_deep result--ad">
      <a rel="nofollow" class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a>
    </div>
    <div class="result results_links results_links_deep web-result ">
      <h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=x">Example <b>A</b></a></h2>
      <a class="result__snippet" href="x">First &amp; <b>best</b> result</a>
    </div>
    <div class="result results_links results_links_deep web-result ">
      <a rel="nofollow" class="result__a" href="javascript:alert(1)">Bad</a>
    </div>`;
  it("unwraps links, strips tags and drops ads and odd schemes", () => {
    expect(parseDuckResults(html)).toEqual([
      { url: "https://example.com/a", title: "Example A", snippet: "First & best result" },
    ]);
  });
});

describe("trimHistory", () => {
  it("merges same-role turns, keeps the tail and starts with the user", () => {
    const turns = trimHistory([
      { role: "model", text: "orphan" },
      { role: "user", text: "a" },
      { role: "user", text: "b" },
      { role: "model", text: "x".repeat(900) },
    ]);
    expect(turns[0]).toEqual({ role: "user", text: "a\nb" });
    expect(turns[1].text.length).toBe(500);
  });
});

describe("buildUserTurn", () => {
  it("numbers results for citation", () => {
    const turn = buildUserTurn("q?", [{ title: "T", url: "https://t.dev", snippet: "s" }]);
    expect(turn).toContain("[1] T (https://t.dev): s");
    expect(turn.endsWith("Question: q?")).toBe(true);
  });
});

describe("askGemini", () => {
  const ok = (text: string) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  it("falls through to the next model when one is out of quota", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      return seen.length === 1
        ? new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 })
        : ok("hi");
    }) as unknown as typeof fetch;
    const answer = await askGemini({
      apiKey: "k",
      models: ["m1", "m2"],
      history: [],
      question: "q",
      fetchImpl,
    });
    expect(answer).toEqual({ text: "hi", model: "m2" });
    expect(seen[1]).toContain("/models/m2:generateContent");
  });
  it("reports running out of quota on every model as 429", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 429 })) as unknown as typeof fetch;
    await expect(
      askGemini({ apiKey: "k", models: ["m1"], history: [], question: "q", fetchImpl }),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("parses the model list", () => {
    expect(modelList(" models/a , b ")).toEqual(["a", "b"]);
    expect(modelList("")).toHaveLength(2);
  });
});
