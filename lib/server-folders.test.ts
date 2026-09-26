import { describe, expect, it } from "vitest";
import { createFolder, moveToFolder, railEntries, removeFromFolders } from "./server-folders";

const servers = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("server folders", () => {
  it("places a folder where its first server sits", () => {
    const entries = railEntries(servers, [
      { id: "f", name: "", color: "#000000", serverIds: ["d", "b"] },
    ]);
    expect(entries.map((e) => (e.kind === "server" ? e.server.id : `folder:${e.folder.id}`)))
      .toEqual(["a", "folder:f", "c"]);
    const folder = entries[1];
    expect(folder.kind === "folder" && folder.servers.map((s) => s.id)).toEqual(["b", "d"]);
  });

  it("shows a folder with one remaining server as that server", () => {
    const entries = railEntries(servers, [
      { id: "f", name: "", color: "#000000", serverIds: ["b", "gone"] },
    ]);
    expect(entries.every((e) => e.kind === "server")).toBe(true);
    expect(entries).toHaveLength(4);
  });

  it("moves servers between folders and drops empty ones", () => {
    let folders = createFolder([], "a", "b", "f1");
    folders = createFolder(folders, "c", "d", "f2");
    folders = moveToFolder(folders, "a", "f2");
    expect(folders.find((f) => f.id === "f2")?.serverIds).toEqual(["c", "d", "a"]);
    folders = removeFromFolders(folders, "b");
    expect(folders.map((f) => f.id)).toEqual(["f2"]);
  });
});
