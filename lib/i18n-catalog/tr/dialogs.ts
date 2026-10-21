import type { dialogs as en } from "../en/dialogs";

export const dialogs: Record<keyof typeof en, string> = {
  // Create Channel Dialog
  "createChannel.title": "Kanal Oluştur",
  "createChannel.type": "KANAL TÜRÜ",
  "createChannel.text": "Metin",
  "createChannel.textDesc": "Görseller, çıkartmalar, fikirler ve espriler paylaş",
  "createChannel.voice": "Ses",
  "createChannel.voiceDesc": "Ses, görüntü ve ekran paylaşımı ile birlikte vakit geçir",
  "createChannel.forum": "Forum",
  "createChannel.forumDesc": "Özel konular ve başlıklarla düzenli tartışmalar yap",
  "createChannel.nameLabel": "KANAL ADI",
  "createChannel.namePlaceholder": "yeni-kanal",
  "createChannel.cancel": "İptal",
  "createChannel.create": "Kanal Oluştur",

  // Create Server Dialog
  "createServer.title": "Bir sunucu oluştur",
  "createServer.desc": "Sunucun, arkadaşlarınla takıldığın yerdir. Kendininkini oluştur ve sohbete başla.",
  "createServer.nameLabel": "SUNUCU ADI",
  "createServer.namePlaceholder": "Harika sunucum",
  "createServer.cancel": "İptal",
  "createServer.create": "Oluştur",

  // Invite Modal
  "inviteModal.title": "Arkadaşlarını {server} sunucusuna davet et",
  "inviteModal.shareLink": "Ya da bir arkadaşına sunucu davet bağlantısı gönder",
  "inviteModal.copy": "Kopyala",
  "inviteModal.copied": "Kopyalandı",
  "inviteModal.linkExpires": "Davet bağlantının süresi asla dolmaz.",
  "inviteModal.landIn": "Davet edilenler şu kanala gelecek:",
  "inviteModal.search": "Arkadaş ara",
  "inviteModal.invite": "Davet et",
  "inviteModal.sent": "Gönderildi",
  "inviteModal.member": "Katıldı",
  "inviteModal.noFriends": "Henüz arkadaşın yok. Aşağıdaki bağlantıyı kopyalayıp istediğin yere gönder.",
  "inviteModal.noMatch": "Bu aramaya uyan arkadaş yok.",
  "inviteModal.failed": "Davet oluşturulamadı.",
  "inviteModal.usesLeft.one": "Davet bağlantın {count} kişi daha için geçerli.",
  "inviteModal.usesLeft.other": "Davet bağlantın {count} kişi daha için geçerli.",
  "inviteModal.edit": "Davet bağlantısını düzenle.",
  "inviteModal.settings": "Sunucu davet bağlantısı ayarları",
  "inviteModal.maxUses": "En fazla kullanım sayısı",
  "inviteModal.usesOption.one": "{count} kullanım",
  "inviteModal.usesOption.other": "{count} kullanım",
  "inviteModal.generate": "Yeni Bağlantı Oluştur",
  "inviteModal.qrCode": "QR Kodu",
  "inviteModal.scanQr": "Katılmak için mobilde bu QR kodunu tara",

  // Quick Switcher
  "quickSwitcher.placeholder": "Nereye gitmek istersin?",
  "quickSwitcher.channels": "Kanallar",
  "quickSwitcher.users": "Doğrudan Mesajlar",
  "quickSwitcher.noResults": "Sonuç bulunamadı.",
  "quickSwitcher.navigate": "gezin",
  "quickSwitcher.select": "seç",
  "quickSwitcher.close": "kapat",

  // Confirmations & Prompts
  "dialog.confirm": "Onayla",
  "dialog.cancel": "İptal",
  "dialog.save": "Kaydet",
  "dialog.delete": "Sil",
  "dialog.leave": "Ayrıl",
  "dialog.close": "Kapat",
  "dialog.ok": "Tamam",
};
