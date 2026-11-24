/**
 * Curated starter server templates shared across Create Server, Onboarding, and
 * Server Settings -> Templates, plus public /discover category constants.
 */

import type { ServerLayout } from "./server-layout";

export const DISCOVER_CATEGORIES = [
  "community",
  "gaming",
  "dnd",
  "study",
  "creative",
  "tech",
  "music",
  "other",
] as const;

export type DiscoverCategory = (typeof DISCOVER_CATEGORIES)[number];

export function isDiscoverCategory(value: unknown): value is DiscoverCategory {
  return (
    typeof value === "string" &&
    (DISCOVER_CATEGORIES as readonly string[]).includes(value)
  );
}

export interface ServerTemplateDef {
  id: string;
  titleKey:
    | "template.gaming.title"
    | "template.dnd.title"
    | "template.community.title"
    | "template.study.title"
    | "template.friends.title"
    | "template.creator.title"
    | "template.devteam.title"
    | "template.bookclub.title";
  descKey:
    | "template.gaming.desc"
    | "template.dnd.desc"
    | "template.community.desc"
    | "template.study.desc"
    | "template.friends.desc"
    | "template.creator.desc"
    | "template.devteam.desc"
    | "template.bookclub.desc";
  icon: string;
  color: string;
  discoverCategory: DiscoverCategory;
  /** Optional role name automatically linked to `server_dnd_settings.gm_role_id`. */
  gmRoleName?: string;
  layout: ServerLayout;
}

export const SERVER_TEMPLATES: ServerTemplateDef[] = [
  {
    id: "gaming",
    titleKey: "template.gaming.title",
    descKey: "template.gaming.desc",
    icon: "🎮",
    color: "#5865f2",
    discoverCategory: "gaming",
    layout: {
      categories: [
        {
          name: "Information",
          channels: [
            { name: "welcome-and-rules", kind: "announcement", topic: "Server rules and announcements" },
            { name: "clips-and-highlights", kind: "text", topic: "Share your best gaming clips and screenshots" },
          ],
        },
        {
          name: "Hangout",
          channels: [
            { name: "lounge", kind: "text", topic: "General chat and squad finder" },
            { name: "memes", kind: "text", topic: "Memes and off-topic" },
          ],
        },
        {
          name: "Voice Rooms",
          channels: [
            { name: "Lobby", kind: "voice" },
            { name: "Squad 1", kind: "voice" },
            { name: "Squad 2", kind: "voice" },
          ],
        },
      ],
      roles: [
        { name: "Moderator", color: "#5865f2" },
        { name: "Regulars", color: "#2ecc71" },
      ],
    },
  },
  {
    id: "dnd",
    titleKey: "template.dnd.title",
    descKey: "template.dnd.desc",
    icon: "🐉",
    color: "#e67e22",
    discoverCategory: "dnd",
    gmRoleName: "Game Master",
    layout: {
      categories: [
        {
          name: "Campaign Lore",
          channels: [
            { name: "announcements", kind: "announcement", topic: "Session schedules and world updates" },
            { name: "world-lore-and-npcs", kind: "forum", topic: "Locations, factions, and NPC dossiers" },
            { name: "session-recaps", kind: "text", topic: "Session logs and adventure recaps" },
          ],
        },
        {
          name: "Tabletop",
          channels: [
            { name: "tavern-chat", kind: "text", topic: "In-character and out-of-character banter" },
            { name: "dice-and-sheets", kind: "text", topic: "Roll dice with /roll and look up spells with /spell" },
            { name: "The Table", kind: "voice" },
            { name: "GM Whisper Room", kind: "voice" },
          ],
        },
      ],
      roles: [
        { name: "Game Master", color: "#e67e22" },
        { name: "Adventurer", color: "#9b59b6" },
      ],
    },
  },
  {
    id: "community",
    titleKey: "template.community.title",
    descKey: "template.community.desc",
    icon: "🌐",
    color: "#7b63e6",
    discoverCategory: "community",
    layout: {
      categories: [
        {
          name: "Start here",
          channels: [
            { name: "welcome-and-rules", kind: "announcement", topic: "Read this first: what this place is and the few rules" },
            { name: "say-hi", kind: "text", topic: "New here? Tell us who you are and what you play" },
          ],
        },
        {
          name: "Hang out",
          channels: [
            { name: "general", kind: "text", topic: "Anything goes (within the rules)" },
            { name: "looking-for-group", kind: "text", topic: "Find people for a game, a D&D table or a movie night" },
            { name: "show-your-setup", kind: "text", topic: "Themes, profiles, battlemaps: show it off" },
            { name: "Lounge", kind: "voice" },
            { name: "Game night", kind: "voice" },
          ],
        },
        {
          name: "Help",
          channels: [
            { name: "questions", kind: "text", topic: "Stuck on something? Ask here" },
            { name: "feedback-and-bugs", kind: "forum", topic: "One post per bug or idea, with steps or a screenshot" },
          ],
        },
      ],
      roles: [
        { name: "Helper", color: "#2ecc71" },
        { name: "Moderator", color: "#e67e22" },
      ],
    },
  },
  {
    id: "study",
    titleKey: "template.study.title",
    descKey: "template.study.desc",
    icon: "📚",
    color: "#3498db",
    discoverCategory: "study",
    layout: {
      categories: [
        {
          name: "Study Hall",
          channels: [
            { name: "goals-and-checkins", kind: "text", topic: "Share your daily goals and celebrate finishing them" },
            { name: "resources-and-notes", kind: "forum", topic: "Helpful links, cheat sheets, and study guides" },
            { name: "pomodoro-timer", kind: "text", topic: "Coordinate silent sprint sessions" },
          ],
        },
        {
          name: "Focus Rooms",
          channels: [
            { name: "Quiet Focus", kind: "voice" },
            { name: "Screen Share Desk", kind: "voice" },
          ],
        },
      ],
      roles: [{ name: "Study Buddy", color: "#3498db" }],
    },
  },
  {
    id: "friends",
    titleKey: "template.friends.title",
    descKey: "template.friends.desc",
    icon: "☕",
    color: "#ec4899",
    discoverCategory: "community",
    layout: {
      categories: [
        {
          name: "Group Chat",
          channels: [
            { name: "kitchen-table", kind: "text", topic: "Day-to-day updates, memes, and photos" },
            { name: "weekend-plans", kind: "text", topic: "Use When2Meet polls to pick hangouts" },
            { name: "watch-party", kind: "text", topic: "Movie & show recommendations" },
          ],
        },
        {
          name: "Hangouts",
          channels: [
            { name: "Living Room", kind: "voice" },
            { name: "Late Night", kind: "voice" },
          ],
        },
      ],
      roles: [{ name: "Crew", color: "#ec4899" }],
    },
  },
  {
    id: "creator",
    titleKey: "template.creator.title",
    descKey: "template.creator.desc",
    icon: "🎬",
    color: "#f43f5e",
    discoverCategory: "creative",
    layout: {
      categories: [
        {
          name: "Updates",
          channels: [
            { name: "go-live-alerts", kind: "announcement", topic: "New uploads, streams, and schedules" },
            { name: "community-qna", kind: "forum", topic: "Ask questions for future videos and streams" },
          ],
        },
        {
          name: "Green Room",
          channels: [
            { name: "general", kind: "text", topic: "Chat with fellow fans" },
            { name: "fan-art-and-clips", kind: "text", topic: "Share creations, edits, and art" },
            { name: "Main Stage", kind: "stage" },
            { name: "Afterparty", kind: "voice" },
          ],
        },
      ],
      roles: [
        { name: "Moderator", color: "#f43f5e" },
        { name: "Supporter", color: "#fbbf24" },
      ],
    },
  },
  {
    id: "devteam",
    titleKey: "template.devteam.title",
    descKey: "template.devteam.desc",
    icon: "💻",
    color: "#10b981",
    discoverCategory: "tech",
    layout: {
      categories: [
        {
          name: "Engineering",
          channels: [
            { name: "standups", kind: "text", topic: "Daily blockers and shipping updates" },
            { name: "architecture-rfcs", kind: "forum", topic: "Design proposals and technical specs" },
            { name: "bug-triage", kind: "text", topic: "Incoming issues and repro steps" },
          ],
        },
        {
          name: "Calls",
          channels: [
            { name: "Daily Huddle", kind: "voice" },
            { name: "Pairing Desk", kind: "voice" },
          ],
        },
      ],
      roles: [
        { name: "Maintainer", color: "#10b981" },
        { name: "Contributor", color: "#38bdf8" },
      ],
    },
  },
  {
    id: "bookclub",
    titleKey: "template.bookclub.title",
    descKey: "template.bookclub.desc",
    icon: "📖",
    color: "#a855f7",
    discoverCategory: "other",
    layout: {
      categories: [
        {
          name: "Reading Room",
          channels: [
            { name: "current-pick", kind: "announcement", topic: "This month's book & reading milestones" },
            { name: "spoilers-discussion", kind: "text", topic: "Chapter thoughts and spoilers inside" },
            { name: "book-nominations", kind: "forum", topic: "Pitch next month's read" },
          ],
        },
        {
          name: "Clubhouse",
          channels: [
            { name: "Book Meetup", kind: "voice" },
            { name: "Stage Q&A", kind: "stage" },
          ],
        },
      ],
      roles: [
        { name: "Host", color: "#a855f7" },
        { name: "Reader", color: "#c084fc" },
      ],
    },
  },
];

export function findServerTemplate(id: string | null | undefined): ServerTemplateDef | null {
  if (!id) return null;
  return SERVER_TEMPLATES.find((tpl) => tpl.id === id) ?? null;
}

/**
 * Persists template-specific server metadata (`discover_category`, plus auto-linking
 * `gm_role_id` in `server_dnd_settings` for D&D templates).
 */
export async function wireTemplateExtras(
  db: D1Database,
  serverId: string,
  template: ServerTemplateDef,
): Promise<void> {
  await db
    .prepare("UPDATE servers SET discover_category = ? WHERE id = ?")
    .bind(template.discoverCategory, serverId)
    .run()
    .catch(() => undefined);

  if (template.gmRoleName) {
    const role = await db
      .prepare("SELECT id FROM roles WHERE server_id = ? AND LOWER(name) = LOWER(?) LIMIT 1")
      .bind(serverId, template.gmRoleName)
      .first<{ id: string }>()
      .catch(() => null);
    if (role) {
      await db
        .prepare(
          `INSERT INTO server_dnd_settings (server_id, gm_role_id, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(server_id) DO UPDATE SET
             gm_role_id = excluded.gm_role_id,
             updated_at = excluded.updated_at`,
        )
        .bind(serverId, role.id, Date.now())
        .run()
        .catch(() => undefined);
    }
  }
}
