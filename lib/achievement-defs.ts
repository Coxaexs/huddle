/**
 * The achievement catalogue. Pure data, safe to import from client code; the
 * server-side evaluation lives in `achievements.ts`.
 *
 * Ids are stored in `user_achievements`, so never rename one. (voice-1h,
 * fish-first, fish-rare, nat20 and nat1 keep the ids an earlier version
 * awarded.) Labels,
 * descriptions, icons and tiers can change freely.
 */

/** Every number the evaluator can measure for a member. */
export type AchievementStat =
  // One pass over the member's own messages.
  | "messages_sent"
  | "replies"
  | "attachments"
  | "gifs"
  | "links"
  | "long_messages"
  | "edits"
  | "questions"
  | "threads"
  | "pinned_messages"
  | "channels_posted"
  | "night_owl"
  | "early_bird"
  | "weekend_messages"
  | "caps_messages"
  | "hello_world"
  | "midnight"
  // Per-day message counts.
  | "days_active"
  | "streak_days"
  | "max_per_day"
  // Voice.
  | "voice_seconds"
  // Reactions.
  | "reactions_given"
  | "unique_emojis"
  | "reactions_received"
  | "self_reactions"
  | "mentions_received"
  // People and servers.
  | "friends"
  | "dm_conversations"
  | "servers_joined"
  | "servers_created"
  // Community tools.
  | "polls_created"
  | "poll_votes"
  | "events_created"
  | "rsvps"
  | "qa_questions"
  | "reports_resolved"
  | "saved"
  | "reminders"
  // Making things.
  | "uploads"
  | "themes_published"
  | "theme_stars"
  | "webhooks"
  // The account itself.
  | "account_age_days"
  | "profile_complete"
  | "cosmetics"
  | "showcase_count"
  // Reported by the client when it happens (see achievement-marks).
  | "themes_tried"
  | "venues_visited"
  | "fish_species"
  | "fish_rare"
  | "fish_junk"
  | "konami"
  | "dice_nat20"
  | "dice_nat1"
  // Earned achievements, counted after everything else.
  | "achievements_earned";

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";

export type AchievementCategory =
  | "chat"
  | "time"
  | "voice"
  | "social"
  | "community"
  | "creator"
  | "explorer"
  | "secret";

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  /** Lucide icon name, mapped to a component by achievement-icons.tsx. */
  icon: string;
  tier: AchievementTier;
  category: AchievementCategory;
  /** Hidden until earned: the board shows only `hint`. */
  secret?: boolean;
  hint?: string;
  condition: { type: AchievementStat; threshold: number };
}

export const ACHIEVEMENT_CATEGORIES: Array<{ id: AchievementCategory; label: string }> = [
  { id: "chat", label: "Chatting" },
  { id: "time", label: "Dedication" },
  { id: "voice", label: "Voice" },
  { id: "social", label: "Social" },
  { id: "community", label: "Community" },
  { id: "creator", label: "Creator" },
  { id: "explorer", label: "Explorer" },
  { id: "secret", label: "Secrets" },
];

export const TIER_LABELS: Record<AchievementTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

/** How many achievements a member can pin to their profile. */
export const SHOWCASE_LIMIT = 5;

const HOUR = 60 * 60;

type Def = Omit<AchievementDef, "condition"> & { stat: AchievementStat; at: number };

const DEFS: Def[] = [
  // ---- Chatting ----
  { id: "first-steps", label: "First Steps", description: "Send your first message.", icon: "MessageSquare", tier: "bronze", category: "chat", stat: "messages_sent", at: 1 },
  { id: "warming-up", label: "Warming Up", description: "Send 50 messages.", icon: "MessageSquare", tier: "bronze", category: "chat", stat: "messages_sent", at: 50 },
  { id: "chatterbox", label: "Chatterbox", description: "Send 100 messages.", icon: "MessagesSquare", tier: "silver", category: "chat", stat: "messages_sent", at: 100 },
  { id: "conversationalist", label: "Conversationalist", description: "Send 500 messages.", icon: "MessagesSquare", tier: "silver", category: "chat", stat: "messages_sent", at: 500 },
  { id: "big-talker", label: "Big Talker", description: "Send 1,000 messages.", icon: "Megaphone", tier: "gold", category: "chat", stat: "messages_sent", at: 1000 },
  { id: "wordsmith", label: "Wordsmith", description: "Send 5,000 messages.", icon: "Feather", tier: "gold", category: "chat", stat: "messages_sent", at: 5000 },
  { id: "living-legend", label: "Living Legend", description: "Send 10,000 messages.", icon: "Crown", tier: "platinum", category: "chat", stat: "messages_sent", at: 10000 },
  { id: "good-point", label: "Good Point", description: "Reply to a message.", icon: "Reply", tier: "bronze", category: "chat", stat: "replies", at: 1 },
  { id: "thread-weaver", label: "Thread Weaver", description: "Reply to 100 messages.", icon: "Reply", tier: "silver", category: "chat", stat: "replies", at: 100 },
  { id: "show-and-tell", label: "Show and Tell", description: "Share a file or picture.", icon: "Image", tier: "bronze", category: "chat", stat: "attachments", at: 1 },
  { id: "gallery-curator", label: "Gallery Curator", description: "Share 50 files or pictures.", icon: "Image", tier: "silver", category: "chat", stat: "attachments", at: 50 },
  { id: "gif-wizard", label: "GIF Wizard", description: "Send 25 GIFs.", icon: "Wand2", tier: "silver", category: "chat", stat: "gifs", at: 25 },
  { id: "link-dropper", label: "Link Dropper", description: "Share 25 links.", icon: "Link", tier: "bronze", category: "chat", stat: "links", at: 25 },
  { id: "essayist", label: "Essayist", description: "Write a message over 500 characters.", icon: "Scroll", tier: "silver", category: "chat", stat: "long_messages", at: 1 },
  { id: "novelist", label: "Novelist", description: "Write 10 messages over 500 characters.", icon: "BookOpen", tier: "gold", category: "chat", stat: "long_messages", at: 10 },
  { id: "second-thoughts", label: "Second Thoughts", description: "Edit 10 of your messages.", icon: "Pencil", tier: "bronze", category: "chat", stat: "edits", at: 10 },
  { id: "curious-mind", label: "Curious Mind", description: "Ask 50 questions.", icon: "CircleHelp", tier: "silver", category: "chat", stat: "questions", at: 50 },
  { id: "deep-diver", label: "Deep Diver", description: "Post 10 messages in threads.", icon: "Waves", tier: "bronze", category: "chat", stat: "threads", at: 10 },
  { id: "pin-worthy", label: "Pin-worthy", description: "Have one of your messages pinned.", icon: "Pin", tier: "silver", category: "chat", stat: "pinned_messages", at: 1 },
  { id: "hall-of-fame", label: "Hall of Fame", description: "Have 10 of your messages pinned.", icon: "Trophy", tier: "gold", category: "chat", stat: "pinned_messages", at: 10 },
  { id: "channel-surfer", label: "Channel Surfer", description: "Post in 5 different channels.", icon: "Compass", tier: "bronze", category: "chat", stat: "channels_posted", at: 5 },
  { id: "everywhere", label: "Everywhere at Once", description: "Post in 25 different channels.", icon: "Orbit", tier: "gold", category: "chat", stat: "channels_posted", at: 25 },
  { id: "marathon", label: "Marathon Talker", description: "Send 100 messages in a single day.", icon: "Zap", tier: "gold", category: "chat", stat: "max_per_day", at: 100 },

  // ---- Dedication ----
  { id: "weekender", label: "Regular", description: "Be active on 7 different days.", icon: "Calendar", tier: "bronze", category: "time", stat: "days_active", at: 7 },
  { id: "monthly-regular", label: "Monthly Regular", description: "Be active on 30 different days.", icon: "CalendarDays", tier: "silver", category: "time", stat: "days_active", at: 30 },
  { id: "centurion", label: "Centurion", description: "Be active on 100 different days.", icon: "Medal", tier: "gold", category: "time", stat: "days_active", at: 100 },
  { id: "year-of-hoffle", label: "A Year of Hoffle", description: "Be active on 365 different days.", icon: "Gem", tier: "platinum", category: "time", stat: "days_active", at: 365 },
  { id: "hat-trick", label: "Hat Trick", description: "Chat 3 days in a row.", icon: "Flame", tier: "bronze", category: "time", stat: "streak_days", at: 3 },
  { id: "on-a-roll", label: "On a Roll", description: "Chat 7 days in a row.", icon: "Flame", tier: "silver", category: "time", stat: "streak_days", at: 7 },
  { id: "unstoppable", label: "Unstoppable", description: "Chat 30 days in a row.", icon: "Rocket", tier: "gold", category: "time", stat: "streak_days", at: 30 },
  { id: "night-owl", label: "Night Owl", description: "Send 25 messages between 1 and 5 AM.", icon: "Moon", tier: "silver", category: "time", stat: "night_owl", at: 25 },
  { id: "early-bird", label: "Early Bird", description: "Send 25 messages between 5 and 8 AM.", icon: "Sunrise", tier: "silver", category: "time", stat: "early_bird", at: 25 },
  { id: "weekend-warrior", label: "Weekend Warrior", description: "Send 100 messages on weekends.", icon: "PartyPopper", tier: "bronze", category: "time", stat: "weekend_messages", at: 100 },
  { id: "settled-in", label: "Settled In", description: "Have your account for 30 days.", icon: "Coffee", tier: "bronze", category: "time", stat: "account_age_days", at: 30 },
  { id: "one-year-club", label: "One Year Club", description: "Have your account for a year.", icon: "Cake", tier: "gold", category: "time", stat: "account_age_days", at: 365 },

  // ---- Voice ----
  { id: "hello-mic", label: "Is This Thing On?", description: "Spend 5 minutes in voice chat.", icon: "Mic", tier: "bronze", category: "voice", stat: "voice_seconds", at: 5 * 60 },
  { id: "voice-1h", label: "Voice Newcomer", description: "Spend 1 hour in voice chat.", icon: "Mic", tier: "bronze", category: "voice", stat: "voice_seconds", at: HOUR },
  { id: "voice-regular", label: "Voice Regular", description: "Spend 10 hours in voice chat.", icon: "Headphones", tier: "silver", category: "voice", stat: "voice_seconds", at: 10 * HOUR },
  { id: "voice-veteran", label: "Voice Veteran", description: "Spend 100 hours in voice chat.", icon: "Headphones", tier: "gold", category: "voice", stat: "voice_seconds", at: 100 * HOUR },
  { id: "radio-host", label: "Radio Host", description: "Spend 500 hours in voice chat.", icon: "Radio", tier: "platinum", category: "voice", stat: "voice_seconds", at: 500 * HOUR },

  // ---- Social ----
  { id: "reactor", label: "Reactor", description: "React to a message.", icon: "Smile", tier: "bronze", category: "social", stat: "reactions_given", at: 1 },
  { id: "hype-machine", label: "Hype Machine", description: "Give 100 reactions.", icon: "Heart", tier: "silver", category: "social", stat: "reactions_given", at: 100 },
  { id: "emoji-storm", label: "Emoji Storm", description: "Give 1,000 reactions.", icon: "Sparkles", tier: "gold", category: "social", stat: "reactions_given", at: 1000 },
  { id: "emoji-sommelier", label: "Emoji Sommelier", description: "React with 25 different emoji.", icon: "Sparkles", tier: "silver", category: "social", stat: "unique_emojis", at: 25 },
  { id: "crowd-pleaser", label: "Crowd Pleaser", description: "Get 10 reactions from others.", icon: "Laugh", tier: "bronze", category: "social", stat: "reactions_received", at: 10 },
  { id: "fan-favourite", label: "Fan Favourite", description: "Get 100 reactions from others.", icon: "Star", tier: "silver", category: "social", stat: "reactions_received", at: 100 },
  { id: "icon", label: "Icon", description: "Get 1,000 reactions from others.", icon: "Crown", tier: "gold", category: "social", stat: "reactions_received", at: 1000 },
  { id: "popular", label: "Popular", description: "Get mentioned 25 times.", icon: "AtSign", tier: "silver", category: "social", stat: "mentions_received", at: 25 },
  { id: "friendly", label: "Friendly", description: "Make your first friend.", icon: "Handshake", tier: "bronze", category: "social", stat: "friends", at: 1 },
  { id: "inner-circle", label: "Inner Circle", description: "Have 10 friends.", icon: "Users", tier: "silver", category: "social", stat: "friends", at: 10 },
  { id: "party-animal", label: "Party Animal", description: "Have 25 friends.", icon: "PartyPopper", tier: "gold", category: "social", stat: "friends", at: 25 },
  { id: "slide-into-dms", label: "Slide Into DMs", description: "Open 5 direct-message conversations.", icon: "MessageCircle", tier: "bronze", category: "social", stat: "dm_conversations", at: 5 },
  { id: "new-horizons", label: "New Horizons", description: "Join a second server.", icon: "Compass", tier: "bronze", category: "social", stat: "servers_joined", at: 2 },
  { id: "social-butterfly", label: "Social Butterfly", description: "Join 5 servers.", icon: "Users", tier: "silver", category: "social", stat: "servers_joined", at: 5 },
  { id: "globetrotter", label: "Globetrotter", description: "Join 10 servers.", icon: "Map", tier: "gold", category: "social", stat: "servers_joined", at: 10 },
  { id: "founder", label: "Founder", description: "Create your own server.", icon: "Castle", tier: "silver", category: "social", stat: "servers_created", at: 1 },

  // ---- Community ----
  { id: "pollster", label: "Pollster", description: "Start a poll.", icon: "Vote", tier: "bronze", category: "community", stat: "polls_created", at: 1 },
  { id: "democracy", label: "Democracy Enjoyer", description: "Start 10 polls.", icon: "Landmark", tier: "silver", category: "community", stat: "polls_created", at: 10 },
  { id: "civic-duty", label: "Civic Duty", description: "Vote in 10 polls.", icon: "Vote", tier: "bronze", category: "community", stat: "poll_votes", at: 10 },
  { id: "party-planner", label: "Party Planner", description: "Schedule an event.", icon: "CalendarHeart", tier: "silver", category: "community", stat: "events_created", at: 1 },
  { id: "rsvpd", label: "RSVP'd", description: "Respond to 5 events.", icon: "CalendarCheck", tier: "bronze", category: "community", stat: "rsvps", at: 5 },
  { id: "inquisitive", label: "Inquisitive", description: "Ask 5 questions in a Q&A.", icon: "CircleHelp", tier: "bronze", category: "community", stat: "qa_questions", at: 5 },
  { id: "archivist", label: "Archivist", description: "Save 10 messages for later.", icon: "Bookmark", tier: "bronze", category: "community", stat: "saved", at: 10 },
  { id: "never-forget", label: "Never Forget", description: "Set 5 reminders or scheduled messages.", icon: "BellRing", tier: "bronze", category: "community", stat: "reminders", at: 5 },
  { id: "helpful-hand", label: "Helpful Hand", description: "Resolve 5 member reports as a moderator.", icon: "CheckCircle2", tier: "silver", category: "community", stat: "reports_resolved", at: 5 },
  { id: "peacekeeper", label: "Peacekeeper", description: "Resolve 50 member reports as a moderator.", icon: "Shield", tier: "gold", category: "community", stat: "reports_resolved", at: 50 },

  // ---- Creator ----
  { id: "artisan", label: "Artisan", description: "Upload a custom emoji or sticker.", icon: "Brush", tier: "silver", category: "creator", stat: "uploads", at: 1 },
  { id: "sticker-factory", label: "Sticker Factory", description: "Upload 10 custom emoji or stickers.", icon: "Brush", tier: "gold", category: "creator", stat: "uploads", at: 10 },
  { id: "theme-designer", label: "Theme Designer", description: "Publish a custom theme.", icon: "Palette", tier: "silver", category: "creator", stat: "themes_published", at: 1 },
  { id: "trendsetter", label: "Trendsetter", description: "Collect 10 stars on your themes.", icon: "Star", tier: "gold", category: "creator", stat: "theme_stars", at: 10 },
  { id: "automaton", label: "Automaton", description: "Create a webhook.", icon: "Webhook", tier: "silver", category: "creator", stat: "webhooks", at: 1 },
  { id: "looking-sharp", label: "Looking Sharp", description: "Fill in your bio, pronouns, tagline, avatar and banner.", icon: "Shirt", tier: "bronze", category: "creator", stat: "profile_complete", at: 5 },
  { id: "dressed-to-impress", label: "Dressed to Impress", description: "Wear 3 profile cosmetics at once.", icon: "Gem", tier: "silver", category: "creator", stat: "cosmetics", at: 3 },
  { id: "show-off", label: "Show-off", description: "Pin an achievement to your profile.", icon: "Medal", tier: "bronze", category: "creator", stat: "showcase_count", at: 1 },

  // ---- Explorer ----
  { id: "window-shopper", label: "Window Shopper", description: "Try 3 different themes.", icon: "Palette", tier: "bronze", category: "explorer", stat: "themes_tried", at: 3 },
  { id: "chameleon", label: "Chameleon", description: "Try 8 different themes.", icon: "Palette", tier: "silver", category: "explorer", stat: "themes_tried", at: 8 },
  { id: "master-of-disguise", label: "Master of Disguise", description: "Try 15 different themes.", icon: "Drama", tier: "gold", category: "explorer", stat: "themes_tried", at: 15 },
  { id: "housewarming", label: "Housewarming", description: "Step into a 3D room.", icon: "Landmark", tier: "bronze", category: "explorer", stat: "venues_visited", at: 1 },
  { id: "tourist", label: "Tourist", description: "Visit all five 3D rooms.", icon: "Footprints", tier: "gold", category: "explorer", stat: "venues_visited", at: 5 },
  { id: "fish-first", label: "Gone Fishing", description: "Catch something at the meadow jetty.", icon: "Fish", tier: "bronze", category: "explorer", stat: "fish_species", at: 1 },
  { id: "angler", label: "Angler", description: "Catch 8 different kinds of fish.", icon: "Anchor", tier: "silver", category: "explorer", stat: "fish_species", at: 8 },
  { id: "fish-rare", label: "The Big One", description: "Land a rare or legendary fish.", icon: "Shell", tier: "gold", category: "explorer", stat: "fish_rare", at: 1 },
  { id: "nat20", label: "Natural 20", description: "Roll a natural 20.", icon: "Dices", tier: "silver", category: "explorer", stat: "dice_nat20", at: 1 },
  { id: "nat1", label: "Critical Fail", description: "Roll a natural 1. It happens to the best of us.", icon: "Skull", tier: "bronze", category: "explorer", stat: "dice_nat1", at: 1 },
  { id: "collector", label: "Collector", description: "Earn 10 achievements.", icon: "Medal", tier: "silver", category: "explorer", stat: "achievements_earned", at: 10 },
  { id: "overachiever", label: "Overachiever", description: "Earn 25 achievements.", icon: "Trophy", tier: "gold", category: "explorer", stat: "achievements_earned", at: 25 },
  { id: "completionist", label: "Completionist", description: "Earn 50 achievements.", icon: "Crown", tier: "platinum", category: "explorer", stat: "achievements_earned", at: 50 },

  // ---- Secrets ----
  { id: "indoor-voice", label: "INDOOR VOICE", description: "Send a message in ALL CAPS.", hint: "Some things are better said loudly.", icon: "Megaphone", tier: "bronze", category: "secret", secret: true, stat: "caps_messages", at: 1 },
  { id: "hello-world", label: "Hello, World", description: "Say \"hello world\".", hint: "Every programmer's first words.", icon: "Type", tier: "bronze", category: "secret", secret: true, stat: "hello_world", at: 1 },
  { id: "midnight-snack", label: "Midnight Snack", description: "Send a message at exactly midnight.", hint: "The clock strikes twelve…", icon: "Clock", tier: "silver", category: "secret", secret: true, stat: "midnight", at: 1 },
  { id: "self-five", label: "Self Five", description: "React to your own message.", hint: "Be your own biggest fan.", icon: "HandHeart", tier: "bronze", category: "secret", secret: true, stat: "self_reactions", at: 1 },
  { id: "old-boot", label: "One Person's Trash", description: "Fish up some junk.", hint: "Not everything in the pond is a fish.", icon: "Footprints", tier: "bronze", category: "secret", secret: true, stat: "fish_junk", at: 1 },
  { id: "konami", label: "Up Up Down Down", description: "Enter the Konami code.", hint: "↑ ↑ ↓ ↓ ← → ← → …", icon: "Gamepad2", tier: "gold", category: "secret", secret: true, stat: "konami", at: 1 },
];

/** Every achievement Hoffle can award. Thresholds are cumulative lifetime totals. */
export const ACHIEVEMENTS: AchievementDef[] = DEFS.map(({ stat, at, ...rest }) => ({
  ...rest,
  condition: { type: stat, threshold: at },
}));

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((d) => [d.id, d]));

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_BY_ID.get(id);
}

export function allAchievements(): AchievementDef[] {
  return [...ACHIEVEMENTS];
}

/** Known achievement ids only, deduplicated, at most SHOWCASE_LIMIT. */
export function normalizeShowcase(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !ACHIEVEMENT_BY_ID.has(item) || out.includes(item)) continue;
    out.push(item);
    if (out.length >= SHOWCASE_LIMIT) break;
  }
  return out;
}

/** Client-reported marks: each kind is a set of distinct values per member. */
export const MARK_KINDS = ["theme", "venue", "fish", "fish_rare", "fish_junk", "secret", "dice"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
