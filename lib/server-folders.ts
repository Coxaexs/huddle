/**
 * Server folders on the rail, Discord-style. A folder sits where its first
 * server (in rail order) would be and holds its servers in rail order, so the
 * existing per-person server ordering keeps working unchanged underneath.
 */
export interface ServerFolder {
  id: string;
  name: string;
  color: string;
  serverIds: string[];
}

export type RailEntry<S extends { id: string }> =
  | { kind: "server"; server: S }
  | { kind: "folder"; folder: ServerFolder; servers: S[] };

/** Lays out the rail: loose servers and folders, in server order. */
export function railEntries<S extends { id: string }>(
  servers: S[],
  folders: ServerFolder[],
): RailEntry<S>[] {
  const folderOf = new Map<string, ServerFolder>();
  for (const folder of folders) {
    for (const id of folder.serverIds) folderOf.set(id, folder);
  }
  const placed = new Set<string>();
  const entries: RailEntry<S>[] = [];
  for (const server of servers) {
    const folder = folderOf.get(server.id);
    if (!folder) {
      entries.push({ kind: "server", server });
      continue;
    }
    if (placed.has(folder.id)) continue;
    placed.add(folder.id);
    const inFolder = servers.filter((s) => folderOf.get(s.id)?.id === folder.id);
    // A folder left holding a single server (you left the others) shows as
    // that plain server rather than a one-item folder.
    if (inFolder.length === 1) entries.push({ kind: "server", server: inFolder[0] });
    else entries.push({ kind: "folder", folder, servers: inFolder });
  }
  return entries;
}

/** Puts `serverId` into `folderId` (taking it out of any other folder). */
export function moveToFolder(
  folders: ServerFolder[],
  serverId: string,
  folderId: string,
): ServerFolder[] {
  return removeFromFolders(folders, serverId).map((folder) =>
    folder.id === folderId
      ? { ...folder, serverIds: [...folder.serverIds, serverId] }
      : folder,
  );
}

/** Takes a server out of whatever folder holds it; empty folders go away. */
export function removeFromFolders(
  folders: ServerFolder[],
  serverId: string,
): ServerFolder[] {
  return folders
    .map((folder) => ({
      ...folder,
      serverIds: folder.serverIds.filter((id) => id !== serverId),
    }))
    .filter((folder) => folder.serverIds.length > 0);
}

/** Starts a folder from two servers: `target` stays put, `dragged` joins it. */
export function createFolder(
  folders: ServerFolder[],
  targetId: string,
  draggedId: string,
  id: string,
): ServerFolder[] {
  const rest = removeFromFolders(removeFromFolders(folders, targetId), draggedId);
  return [...rest, { id, name: "", color: "#5865f2", serverIds: [targetId, draggedId] }];
}
