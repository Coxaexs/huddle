/** Modals and dialogs: create channel, create server, invite modal, quick switcher, delete confirmations. */
export const dialogs = {
  // Create Channel Dialog
  "createChannel.title": "Create Channel",
  "createChannel.type": "CHANNEL TYPE",
  "createChannel.text": "Text",
  "createChannel.textDesc": "Post images, stickers, opinions, and puns",
  "createChannel.voice": "Voice",
  "createChannel.voiceDesc": "Hang out together with voice, video, and screen share",
  "createChannel.forum": "Forum",
  "createChannel.forumDesc": "Organized discussions with dedicated threads and topics",
  "createChannel.nameLabel": "CHANNEL NAME",
  "createChannel.namePlaceholder": "new-channel",
  "createChannel.cancel": "Cancel",
  "createChannel.create": "Create Channel",

  // Create Server Dialog
  "createServer.title": "Create a server",
  "createServer.desc": "Your server is where you and your friends hang out. Make yours and start talking.",
  "createServer.nameLabel": "SERVER NAME",
  "createServer.namePlaceholder": "My awesome server",
  "createServer.cancel": "Cancel",
  "createServer.create": "Create",

  // Invite Modal
  "inviteModal.title": "Invite friends to {server}",
  "inviteModal.shareLink": "Send a server invite link to a friend",
  "inviteModal.copy": "Copy",
  "inviteModal.copied": "Copied",
  "inviteModal.linkExpires": "Your invite link never expires.",
  "inviteModal.qrCode": "QR Code",
  "inviteModal.scanQr": "Scan this QR code on mobile to join",

  // Quick Switcher
  "quickSwitcher.placeholder": "Where would you like to go?",
  "quickSwitcher.channels": "Channels",
  "quickSwitcher.users": "Direct Messages",
  "quickSwitcher.noResults": "No results found.",
  "quickSwitcher.navigate": "to navigate",
  "quickSwitcher.select": "to select",
  "quickSwitcher.close": "to close",

  // Confirmations & Prompts
  "dialog.confirm": "Confirm",
  "dialog.cancel": "Cancel",
  "dialog.save": "Save",
  "dialog.delete": "Delete",
  "dialog.leave": "Leave",
  "dialog.close": "Close dialog",
  "dialog.ok": "OK",
} as const;
