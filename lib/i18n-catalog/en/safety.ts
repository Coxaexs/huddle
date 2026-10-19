/**
 * Privacy and safety: who can message you, Streamer Mode, server verification
 * levels, age-restricted channels, vanity invites, role icons, server
 * avatars, message translation and Priority Speaker.
 */
export const safety = {
  // Settings → Privacy & Safety
  "privacy.tab": "Privacy & Safety",
  "privacy.navDesc": "Who can message you, and Streamer Mode",
  "privacy.dmTitle": "Who can start a conversation with you",
  "privacy.dmDesc": "Applies to new conversations and group invites. People you already talk to can keep messaging you.",
  "privacy.dm.everyone": "Everyone",
  "privacy.dm.servers": "Friends and people in your servers",
  "privacy.dm.friends": "Friends only",
  "privacy.saved": "Saved.",
  "privacy.failed": "Could not save that.",
  "privacy.streamerTitle": "Streamer Mode",
  "privacy.streamerDesc": "Blurs your email and invite codes and keeps notification popups quiet, so they don't show up on stream.",
  "privacy.streamer.off": "Off",
  "privacy.streamer.auto": "On while I share my screen",
  "privacy.streamer.on": "Always on",
  "streamer.badge": "Streamer Mode",

  // Server Settings → Safety Setup → Verification Level
  "verification.desc": "What an account needs before it can post here. Members with any role skip this, so you can let someone in by giving them a role.",
  "verification.none": "None",
  "verification.none.desc": "Anyone can post.",
  "verification.low": "Low",
  "verification.low.desc": "Must have a verified email on their account.",
  "verification.medium": "Medium",
  "verification.medium.desc": "Verified email, and on Hoffle for longer than 5 minutes.",
  "verification.high": "High",
  "verification.high.desc": "All of the above, and a member of this server for longer than 10 minutes.",
  "verification.saved": "Verification level saved.",
  "verification.failed": "Could not change the verification level.",

  // Server Settings → Invites → Vanity URL
  "vanity.title": "Vanity URL",
  "vanity.desc": "An easy-to-remember invite code for this server. Like other invites it works for up to 1,000 joins; remove it and set it again to start the count over.",
  "vanity.placeholder": "MY-SERVER",
  "vanity.save": "Save",
  "vanity.remove": "Remove",
  "vanity.saved": "Vanity URL saved.",
  "vanity.removed": "Vanity URL removed.",
  "vanity.failed": "Could not change the vanity URL.",
  "vanity.copy": "Copy link",
  "vanity.copied": "Invite link copied.",

  // Server Settings → Roles → Role Icon
  "roleIcon.title": "Role Icon",
  "roleIcon.desc": "Shown beside the names of members whose highest role with an icon is this one.",
  "roleIcon.emoji": "Emoji",
  "roleIcon.save": "Use emoji",
  "roleIcon.upload": "Upload image",
  "roleIcon.remove": "Remove icon",

  // Member menu
  "serverAvatar.change": "Change server avatar",
  "serverAvatar.remove": "Remove server avatar",

  // Age-restricted channels
  "nsfw.mark": "Mark as age-restricted",
  "nsfw.unmark": "Remove age restriction",
  "nsfw.gateTitle": "Age-restricted channel",
  "nsfw.gateBody": "{channel} may contain content that isn't suitable for everyone. You need to be 18 or older to view it.",
  "nsfw.gateContinue": "I'm 18 or older",
  "nsfw.gateBack": "Go back",

  // Translate a message
  "menu.translate": "Translate",
  "translate.working": "Translating…",
  "translate.label": "Translated to {language}",
  "translate.hide": "Hide",
  "translate.failed": "Could not translate this message.",

  // Priority Speaker
  "priority.toggle": "Priority Speaker",
  "priority.on": "Priority Speaker is on: everyone else is quieter while you talk",
} as const;
