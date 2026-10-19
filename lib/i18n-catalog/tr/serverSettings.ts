import type { serverSettings as en } from "../en/serverSettings";

export const serverSettings: Record<keyof typeof en, string> = {
  "serverSettings.title": "Sunucu Ayarları",
  "serverSettings.tab.overview": "Genel Bakış",
  "serverSettings.tab.profile": "Sunucu Profili",
  "serverSettings.tab.roles": "Roller",
  "serverSettings.tab.emoji": "Emoji ve Çıkartmalar",
  "serverSettings.tab.stickers": "Çıkartmalar",
  "serverSettings.tab.soundboard": "Ses Panosu",
  "serverSettings.tab.access": "Erişim",
  "serverSettings.tab.welcome": "Karşılama Ekranı",
  "serverSettings.tab.safety": "Güvenlik ve AutoMod",
  "serverSettings.tab.automod": "AutoMod",
  "serverSettings.tab.auditLog": "Denetim Kaydı",
  "serverSettings.tab.integrations": "Entegrasyonlar",
  "serverSettings.tab.invites": "Davetler",
  "serverSettings.tab.bans": "Yasaklar",
  "serverSettings.tab.members": "Üyeler",
  "serverSettings.tab.templates": "Sunucu Şablonu",
  "serverSettings.group.expression": "İFADE",
  "serverSettings.group.people": "KİŞİLER",
  "serverSettings.group.apps": "UYGULAMALAR",
  "serverSettings.group.moderation": "MODERASYON",
  "serverSettings.deleteServer": "Sunucuyu Sil",
  "serverSettings.leaveServer": "Sunucudan Ayrıl",

  // Overview
  "serverOverview.serverName": "Sunucu Adı",
  "serverOverview.serverIcon": "Sunucu Simgesi",
  "serverOverview.changeIcon": "Simgeyi Değiştir",
  "serverOverview.removeIcon": "Simgeyi Kaldır",
  "serverOverview.description": "Sunucu Açıklaması",
  "serverOverview.save": "Değişiklikleri Kaydet",

  // Roles
  "serverRoles.title": "Roller",
  "serverRoles.createRole": "Rol Oluştur",
  "serverRoles.roleName": "Rol Adı",
  "serverRoles.roleColor": "Rol Rengi",
  "serverRoles.permissions": "İzinler",
  "serverRoles.membersWithRole": "Üyeler ({count})",
  "serverRoles.deleteRole": "Rolü Sil",

  // Emoji
  "serverEmoji.title": "Sunucu Emojileri",
  "serverEmoji.upload": "Emoji Yükle",
  "serverEmoji.slotsRemaining": "{count} boş yer kaldı",
  "serverEmoji.remove": "Emojiyi Kaldır",

  // Safety
  "serverSafety.title": "Güvenlik Kurulumu",
  "serverSafety.verification": "Doğrulama Düzeyi",
  "serverSafety.filter": "Uygunsuz İçerik Filtresi",

  // Audit Log
  "serverAudit.title": "Denetim Kaydı",
  "serverAudit.filterByUser": "Kullanıcıya göre filtrele",
  "serverAudit.filterByAction": "Eyleme göre filtrele",
  "serverAudit.empty": "Denetim kaydı bulunamadı.",

  // Bans
  "serverBans.title": "Yasaklar",
  "serverBans.empty": "Yasaklanmış kullanıcı yok.",
  "serverBans.unban": "Yasağı Kaldır",

  // Members
  "serverMembers.title": "Sunucu Üyeleri",
  "serverMembers.search": "Üyelerde ara",
  "serverMembers.total": "Toplam Üye — {count}",
};
