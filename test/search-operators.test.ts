import { describe, expect, it } from "vitest";
import {
  buildMessageFilters,
  isEmptyQuery,
  parseSearchDate,
  parseSearchQuery,
  tokenize,
} from "@/lib/search-query";

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("hello   world")).toEqual(["hello", "world"]);
  });

  it("keeps a quoted run together and drops the quotes", () => {
    expect(tokenize('from:alice "hello world" done')).toEqual([
      "from:alice",
      "hello world",
      "done",
    ]);
  });

  it("handles an unbalanced quote without losing the rest", () => {
    expect(tokenize('"unterminated phrase')).toEqual(["unterminated phrase"]);
  });

  it("returns nothing for blank input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("parseSearchQuery", () => {
  it("treats a plain query as free text", () => {
    const query = parseSearchQuery("pizza night");
    expect(query.text).toBe("pizza night");
    expect(query.from).toEqual([]);
    expect(query.has).toEqual([]);
  });

  it("extracts from: and strips the @ people actually type", () => {
    const query = parseSearchQuery("from:@Alice lunch");
    expect(query.from).toEqual(["alice"]);
    expect(query.text).toBe("lunch");
  });

  it("accepts several from: values, repeated or comma-separated", () => {
    expect(parseSearchQuery("from:alice,bob hi").from).toEqual(["alice", "bob"]);
    expect(parseSearchQuery("from:alice from:bob hi").from).toEqual(["alice", "bob"]);
  });

  it("extracts in: with an optional # and lowercases it", () => {
    expect(parseSearchQuery("in:#General plans").in).toEqual(["general"]);
    expect(parseSearchQuery("in:general plans").in).toEqual(["general"]);
  });

  it("keeps only the has: values it understands", () => {
    expect(parseSearchQuery("has:image cat").has).toEqual(["image"]);
    expect(parseSearchQuery("has:link,image cat").has).toEqual(["link", "image"]);
    expect(parseSearchQuery("has:image,banana cat").has).toEqual(["image"]);
  });

  it("leaves a wholly unknown operator in the free text", () => {
    // Better a search that finds nothing than a filter silently ignored.
    const query = parseSearchQuery("has:banana cat");
    expect(query.has).toEqual([]);
    expect(query.text).toBe("has:banana cat");
  });

  it("leaves an operator with no value in the free text", () => {
    expect(parseSearchQuery("from: lunch").from).toEqual([]);
    expect(parseSearchQuery("from: lunch").text).toBe("from: lunch");
  });

  it("parses before:/after: into ISO bounds", () => {
    const query = parseSearchQuery("before:2024-02-01 after:2024-01-01 hi");
    expect(query.before).toBe("2024-02-01T00:00:00.000Z");
    expect(query.after).toBe("2024-01-01T00:00:00.000Z");
    expect(query.text).toBe("hi");
  });

  it("keeps the narrower bound when an operator repeats", () => {
    // A widening follow-up must not silently undo the tighter filter.
    const before = parseSearchQuery("before:2024-01-01 before:2025-01-01");
    expect(before.before).toBe("2024-01-01T00:00:00.000Z");

    const after = parseSearchQuery("after:2025-01-01 after:2024-01-01");
    expect(after.after).toBe("2025-01-01T00:00:00.000Z");
  });

  it("keeps an unparseable date in the free text", () => {
    const query = parseSearchQuery("before:soon hi");
    expect(query.before).toBeNull();
    expect(query.text).toBe("before:soon hi");
  });

  it("reads pinned: in its various spellings", () => {
    expect(parseSearchQuery("pinned:").pinned).toBe(true);
    expect(parseSearchQuery("pinned:true").pinned).toBe(true);
    expect(parseSearchQuery("pinned:yes").pinned).toBe(true);
    expect(parseSearchQuery("pinned:false").pinned).toBe(false);
    expect(parseSearchQuery("pinned:false").text).toBe("");
  });

  it("preserves quoted phrases in the free text", () => {
    expect(parseSearchQuery('from:alice "hello world"').text).toBe("hello world");
  });

  it("handles an empty or blank query", () => {
    for (const input of ["", "   "]) {
      const query = parseSearchQuery(input);
      expect(query.text).toBe("");
      expect(isEmptyQuery(query)).toBe(true);
    }
  });

  it("reports a filters-only query as non-empty", () => {
    expect(isEmptyQuery(parseSearchQuery("from:alice"))).toBe(false);
    expect(isEmptyQuery(parseSearchQuery("has:file"))).toBe(false);
    expect(isEmptyQuery(parseSearchQuery("pinned:true"))).toBe(false);
  });
});

describe("parseSearchDate", () => {
  it("widens a date-only value to UTC midnight", () => {
    expect(parseSearchDate("2024-03-05")).toBe("2024-03-05T00:00:00.000Z");
  });

  it("passes a full timestamp through unchanged", () => {
    expect(parseSearchDate("2024-03-05T12:30:00.000Z")).toBe(
      "2024-03-05T12:30:00.000Z",
    );
  });

  it("returns null for anything it cannot parse", () => {
    expect(parseSearchDate("tomorrow")).toBeNull();
    expect(parseSearchDate("2024-13-45")).toBeNull();
    expect(parseSearchDate("")).toBeNull();
  });
});

describe("buildMessageFilters", () => {
  const sql = (input: string) => buildMessageFilters(parseSearchQuery(input));

  it("produces no predicates for a plain query", () => {
    expect(sql("hello")).toEqual({ clauses: [], params: [] });
  });

  it("matches an author by display name or username", () => {
    const { clauses, params } = sql("from:alice");
    expect(clauses).toHaveLength(1);
    // Display name is captured on the message; username survives a rename.
    expect(clauses[0]).toContain("m.author = ?");
    expect(clauses[0]).toContain("users WHERE username_lower = ?");
    expect(params).toEqual(["alice", "alice"]);
  });

  it("matches a channel by id or by name", () => {
    const { clauses, params } = sql("in:general");
    expect(clauses[0]).toContain("m.channel_id = ?");
    expect(clauses[0]).toContain("m.channel = ?");
    expect(params).toEqual(["general", "general"]);
  });

  it("maps each has: filter to the column that satisfies it", () => {
    expect(sql("has:link").clauses[0]).toContain("m.link IS NOT NULL");
    expect(sql("has:audio").clauses[0]).toContain("m.audio_url IS NOT NULL");
    expect(sql("has:file").clauses[0]).toContain("m.attachment_key IS NOT NULL");
    // An "image" excludes PDFs, which are the one attachment type that is not one.
    expect(sql("has:image").clauses[0]).toContain("lower(m.attachment_key) NOT LIKE '%.pdf'");
  });

  it("bound the date range with exclusive before and inclusive after", () => {
    const { clauses, params } = sql("before:2024-02-01 after:2024-01-01");
    expect(clauses[0]).toBe("m.created_at < ?");
    expect(clauses[1]).toBe("m.created_at >= ?");
    expect(params).toEqual(["2024-02-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z"]);
  });

  it("filters pinned messages", () => {
    expect(sql("pinned:true").clauses).toEqual(["m.pinned_at IS NOT NULL"]);
  });

  it("combines every filter with params in clause order", () => {
    const { clauses, params } = sql(
      "from:alice in:general has:file before:2024-02-01 pinned:true dinner",
    );
    expect(clauses).toHaveLength(5);
    // Param order must line up with placeholder order or the query binds wrong.
    expect(params).toEqual([
      "alice",
      "alice",
      "general",
      "general",
      "2024-02-01T00:00:00.000Z",
    ]);
  });

  it("only ever emits predicates against the messages alias", () => {
    const { clauses } = sql("from:alice in:general has:image pinned:true after:2024-01-01");
    for (const clause of clauses) {
      // The buildMessageFilters contract: every predicate is safe to AND onto a
      // query that selects from messages AS m.
      if (clause.includes("m.") || clause.startsWith("(m.")) continue;
      throw new Error(`clause does not target alias m: ${clause}`);
    }
    expect(clauses.length).toBeGreaterThan(0);
  });
});

