// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ForumBoard,
  postDate,
  postHeading,
  type ForumPost,
} from "@/app/components/forum-board";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);

function post(overrides: Partial<ForumPost> = {}): ForumPost {
  return {
    id: "m1",
    text: "How do I self-host this?",
    author: "Alice",
    avatar: "A",
    color: "#a78bfa",
    createdAt: "2024-03-05T12:00:00.000Z",
    threadCount: 0,
    ...overrides,
  };
}

const noop = () => {};

/** Renders the board with the props every case needs, so tests state only what they vary. */
function board(props: Partial<React.ComponentProps<typeof ForumBoard>> = {}) {
  return render(
    <ForumBoard
      posts={[]}
      channelName="help"
      canPost
      onOpenPost={noop}
      onNewPost={noop}
      {...props}
    />,
  );
}

describe("postHeading", () => {
  it("uses the first line as the title and the rest as the excerpt", () => {
    const result = postHeading(post({ text: "Big news\nWe shipped it today." }));
    expect(result.title).toBe("Big news");
    expect(result.excerpt).toBe("We shipped it today.");
  });

  it("collapses newlines inside a multi-line excerpt", () => {
    expect(postHeading(post({ text: "Title\nline one\nline two" })).excerpt).toBe(
      "line one line two",
    );
  });

  it("trims a heading that would overflow the card", () => {
    const { title } = postHeading(post({ text: "x".repeat(300) }));
    expect(title.length).toBeLessThanOrEqual(90);
    expect(title.endsWith("…")).toBe(true);
  });

  it("describes an attachment-only post rather than showing a blank card", () => {
    expect(postHeading(post({ text: "", image: "/i.png" })).title).toBe("Image");
    expect(postHeading(post({ text: "", audio: "/v.webm" })).title).toBe("Voice message");
    expect(
      postHeading(post({ text: "", file: { url: "/d.pdf", name: "notes.pdf", type: "pdf" } }))
        .title,
    ).toBe("notes.pdf");
  });

  it("falls back to a generic title for a post with nothing in it", () => {
    expect(postHeading(post({ text: "" })).title).toBe("Post");
  });

  it("treats whitespace-only text as no text", () => {
    expect(postHeading(post({ text: "   \n  " })).title).toBe("Post");
  });
});

describe("postDate", () => {
  it("formats a valid timestamp", () => {
    expect(postDate("2024-03-05T12:00:00.000Z")).toMatch(/Mar/);
  });

  it("returns nothing for a missing or unparseable timestamp", () => {
    // An Invalid Date would otherwise render as the literal text "Invalid Date".
    expect(postDate(undefined)).toBe("");
    expect(postDate("not a date")).toBe("");
  });
});

describe("ForumBoard", () => {
  it("has no axe violations with posts", async () => {
    const { container } = board({
      posts: [post(), post({ id: "m2", text: "Second", threadCount: 3 })],
    });
    await expectNoA11yViolations(container);
  });

  it("has no axe violations when empty", async () => {
    const { container } = board();
    await expectNoA11yViolations(container);
  });

  it("explains the empty state and how posts work", () => {
    board();
    expect(screen.getByText("No posts yet")).toBeTruthy();
    expect(screen.getByText(/starts its own thread/i)).toBeTruthy();
  });

  it("shows each post with its reply count", () => {
    board({ posts: [post({ threadCount: 4 })] });
    expect(screen.getByText("How do I self-host this?")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("names each card for a screen reader, including the reply count", () => {
    board({ posts: [post({ threadCount: 1 })] });
    // Singular, because "1 replies" is the kind of detail that makes a product
    // feel unfinished to anyone using a screen reader.
    expect(
      screen.getByRole("button", {
        name: "How do I self-host this?, by Alice, 1 reply",
      }),
    ).toBeTruthy();
  });

  it("opens the post's thread when a card is activated", () => {
    const onOpenPost = vi.fn();
    board({ posts: [post({ id: "abc" })], onOpenPost });
    fireEvent.click(screen.getByRole("button", { name: /How do I self-host/ }));
    expect(onOpenPost).toHaveBeenCalledWith("abc");
  });

  it("offers a New post action that focuses the composer", () => {
    const onNewPost = vi.fn();
    board({ onNewPost });
    fireEvent.click(screen.getByRole("button", { name: /New post/ }));
    expect(onNewPost).toHaveBeenCalled();
  });

  it("hides the New post action on a read-only board", () => {
    board({ canPost: false });
    expect(screen.queryByRole("button", { name: /New post/ })).toBeNull();
  });

  it("does not tell a read-only viewer to write the first post", () => {
    board({ canPost: false });
    expect(screen.queryByText(/Write the first one/)).toBeNull();
  });

  it("marks the thumbnail decorative, since the card is already named", () => {
    const { container } = board({ posts: [post({ image: "/i.png" })] });
    expect(container.querySelector(".forum-card-thumb")?.getAttribute("alt")).toBe("");
  });

  it("counts the posts in its summary line", () => {
    board({ posts: [post(), post({ id: "m2" })] });
    expect(screen.getByText(/2 posts/)).toBeTruthy();
  });

  it("keeps the board usable for many posts", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      post({ id: `m${i}`, text: `Post number ${i}` }),
    );
    board({ posts: many });
    expect(screen.getByText(/40 posts/)).toBeTruthy();
  });
});

