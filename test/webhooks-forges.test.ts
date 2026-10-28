import { describe, expect, it } from "vitest";
import { giteaToExecute, gitlabToExecute } from "@/lib/webhooks";

describe("gitlabToExecute", () => {
  const project = { path_with_namespace: "team/app", web_url: "https://gitlab.com/team/app" };

  it("turns a push into a commit list with a compare link", () => {
    const body = gitlabToExecute("Push Hook", {
      ref: "refs/heads/main",
      before: "aaa",
      after: "bbb",
      user_username: "ada",
      project,
      total_commits_count: 2,
      commits: [
        { id: "1234567890", message: "Fix login\n\nlong text", author: { name: "Ada" } },
        { id: "abcdef1234", message: "Add tests", author: { name: "Bo" } },
      ],
    })!;
    const embed = (body.embeds as Array<Record<string, unknown>>)[0];
    expect(body.username).toBe("GitLab");
    expect(embed.title).toBe("[team/app:main] 2 new commits");
    expect(embed.url).toBe("https://gitlab.com/team/app/-/compare/aaa...bbb");
    expect(embed.description).toContain("`12345678` Fix login — Ada");
  });

  it("reports merges and failed pipelines, and skips the noise", () => {
    const merged = gitlabToExecute("Merge Request Hook", {
      project,
      user: { username: "ada" },
      object_attributes: { action: "merge", iid: 7, title: "New menu", url: "https://gitlab.com/team/app/-/merge_requests/7" },
    })!;
    expect((merged.embeds as Array<Record<string, unknown>>)[0].title).toBe("[team/app] Merge request merged: !7 New menu");
    expect(gitlabToExecute("Merge Request Hook", { project, object_attributes: { action: "update" } })).toBeNull();
    const failed = gitlabToExecute("Pipeline Hook", { project, object_attributes: { status: "failed", ref: "main", id: 99 } })!;
    expect((failed.embeds as Array<Record<string, unknown>>)[0].url).toBe("https://gitlab.com/team/app/-/pipelines/99");
    expect(gitlabToExecute("Pipeline Hook", { project, object_attributes: { status: "success" } })).toBeNull();
    expect(gitlabToExecute("Wiki Page Hook", { project })).toBeNull();
  });
});

describe("giteaToExecute", () => {
  it("reads Gitea's GitHub-shaped push with compare_url", () => {
    const body = giteaToExecute(
      "push",
      {
        ref: "refs/heads/main",
        compare_url: "https://git.example.com/me/app/compare/a...b",
        repository: { full_name: "me/app" },
        sender: { login: "me" },
        commits: [{ id: "0123456789", message: "Hello", author: { username: "me" } }],
      },
      "Forgejo",
    )!;
    expect(body.username).toBe("Forgejo");
    const embed = (body.embeds as Array<Record<string, unknown>>)[0];
    expect(embed.url).toBe("https://git.example.com/me/app/compare/a...b");
    expect(embed.title).toBe("[me/app:main] 1 new commit");
  });
});
