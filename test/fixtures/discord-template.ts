/** A small server shaped like a real template: @everyone is role 0, ids are small numbers. */
export const TEMPLATE_GUILD = {
  roles: [
    { id: 0, name: "@everyone", color: 0, permissions: "2248473465835073" },
    { id: 2, name: "Players", color: 7013355, permissions: "0" },
    { id: 3, name: "Game Master", color: 16711684, permissions: "8" },
    { id: 4, name: "Mods", color: 0, permissions: String((1n << 13n) | (1n << 1n)) },
  ],
  channels: [
    { id: 1, type: 0, name: "rules", parent_id: null, position: 0 },
    { id: 10, type: 4, name: "Text", parent_id: null, position: 0 },
    { id: 11, type: 0, name: "general", parent_id: 10, position: 2 },
    {
      id: 12, type: 0, name: "gm-room", parent_id: 10, position: 3,
      permission_overwrites: [
        { id: 0, type: 0, allow: "0", deny: "1024" },
        { id: 3, type: 0, allow: "1024", deny: "0" },
        { id: 999, type: 1, allow: "1024", deny: "0" },
      ],
    },
    { id: 13, type: 2, name: "Table", parent_id: 10, position: 0 },
    { id: 14, type: 11, name: "a-thread", parent_id: 11, position: 0 },
    { id: 20, type: 4, name: "Voice", parent_id: null, position: 1 },
    { id: 21, type: 13, name: "Stage", parent_id: 20, position: 0 },
    { id: 22, type: 0, name: "slow", parent_id: 20, position: 5, rate_limit_per_user: 30, nsfw: true, topic: "take it easy" },
  ],
};
