// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ForumBoard, type ForumPost } from "@/app/components/forum-board";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);

const tags = [
  { id: "bug", name: "Bug", emoji: "🐛" },
  { id: "idea", name: "Idea" },
  { id: "solved", name: "Solved", moderated: true },
];

function post(id: string, text: string, tagIds: string[], userId = "alice"): ForumPost {
  return {
    id, text, author: "Alice", avatar: "A", color: "#a78bfa", userId,
    createdAt: "2026-11-05T12:00:00.000Z", threadCount: 0, payload: { forumTags: tagIds },
  };
}

const posts = [post("p1", "Crash on join", ["bug"]), post("p2", "Dark mode please", ["idea"], "bob"), post("p3", "Fixed thing", ["bug", "solved"])];

function board(props: Partial<React.ComponentProps<typeof ForumBoard>> = {}) {
  return render(
    <ForumBoard posts={posts} channelName="feedback" canPost onOpenPost={() => {}} onNewPost={() => {}} tags={tags} {...props} />,
  );
}

describe("ForumBoard tags", () => {
  it("shows each post's tags and has no axe violations", async () => {
    const { container } = board({ onDraftTagsChange: () => {} });
    expect(container.querySelectorAll(".forum-card .forum-tag")).toHaveLength(4);
    await expectNoA11yViolations(container);
  });

  it("filters the board by tag, and shows all again", () => {
    board();
    const filters = screen.getByRole("group", { name: "Show posts with these tags" });
    fireEvent.click(Array.from(filters.querySelectorAll("button")).find((b) => b.textContent === "Idea")!);
    expect(screen.queryByText("Crash on join")).toBeNull();
    expect(screen.getByText("Dark mode please")).toBeTruthy();
    expect(screen.getByText(/1 of 3 posts/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("Crash on join")).toBeTruthy();
  });

  it("lets you pick tags for your next post, without moderated ones unless you moderate", () => {
    const onDraftTagsChange = vi.fn();
    const { rerender } = board({ onDraftTagsChange, draftTags: ["bug"] });
    const group = screen.getByRole("group", { name: "Tags for your next post" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["🐛 Bug", "Idea"]);
    fireEvent.click(Array.from(group.querySelectorAll("button")).find((b) => b.textContent === "Idea")!);
    expect(onDraftTagsChange).toHaveBeenCalledWith(["bug", "idea"]);
    rerender(
      <ForumBoard posts={posts} channelName="feedback" canPost onOpenPost={() => {}} onNewPost={() => {}} tags={tags} onDraftTagsChange={onDraftTagsChange} canModerate />,
    );
    const modGroup = screen.getByRole("group", { name: "Tags for your next post" });
    expect(modGroup.textContent).toContain("Solved");
  });

  it("lets the author retag their own post, but not someone else's", async () => {
    const onSetPostTags = vi.fn(async () => {});
    board({ currentUserId: "alice", onSetPostTags });
    expect(screen.getByRole("button", { name: "Change tags on Crash on join" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change tags on Dark mode please" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change tags on Fixed thing" }));
    const editor = screen.getByRole("group", { name: "Tags on Fixed thing" });
    const solved = Array.from(editor.querySelectorAll("button")).find((b) => b.textContent === "Solved")!;
    expect((solved as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(Array.from(editor.querySelectorAll("button")).find((b) => b.textContent === "Idea")!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onSetPostTags).toHaveBeenCalledWith("p3", ["bug", "solved", "idea"]));
  });

  it("lets channel managers edit the tag list", async () => {
    const onSaveTags = vi.fn(async () => {});
    board({ canManageTags: true, onSaveTags });
    fireEvent.click(screen.getByRole("button", { name: /Edit tags/ }));
    fireEvent.change(screen.getByLabelText("Name of tag 2"), { target: { value: "Feature" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Solved" }));
    fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
    await vi.waitFor(() =>
      expect(onSaveTags).toHaveBeenCalledWith([
        { id: "bug", name: "Bug", emoji: "🐛" },
        { id: "idea", name: "Feature" },
      ]),
    );
  });
});
