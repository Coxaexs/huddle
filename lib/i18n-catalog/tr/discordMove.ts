import type { discordMove as en } from "../en/discordMove";

export const discordMove: Record<keyof typeof en, string> = {
  "discordMove.createHint": "Yeni sunucuna bir isim ver ya da bir Discord sunucusunun kanallarını, rollerini ve izinlerini kopyalamak için şablon linkini (discord.new/…) yapıştır.",
  "discordMove.createPlaceholder": "örn. Harika Sunucum, ya da discord.new/…",
  "discordMove.title": "{server} taşındı",
  "discordMove.summary": "Discord'dan {categories} kategori, {channels} kanal ve {roles} rol kopyalandı.",
  "discordMove.private": "Discord'da özeldi, burada da özel: {channels}",
  "discordMove.skipped": "Hoffle'da henüz karşılığı olmayan {count} kanal alınmadı.",
  "discordMove.tellThem": "Şimdi Discord'una haber ver",
  "discordMove.tellThemHint": "Bunu Discord sunucusunun duyurularına yapıştır. Link 1000 kişiye kadar çalışır.",
  "discordMove.message": "Hoffle'a taşınıyoruz! 🧇\nAynı kanallar, aynı roller; ücretsiz ve reklamsız.\nBuradan katıl: {link}\nAç, hesap oluştur, içeridesin. Kurulum yok.",
  "discordMove.copy": "Mesajı kopyala",
  "discordMove.done": "Tamam",
  "discordMove.inviteFailed": "Davet linki oluşturulamadı. Sunucu menüsünden bir tane oluştur.",
  "discordMove.fromTemplate": "Bir Discord sunucusunu kopyala",
  "discordMove.fromTemplateHint": "Discord'da: Sunucu Ayarları → Sunucu Şablonu → linki kopyala ve buraya yapıştır. Bot gerekmez.",
  "discordMove.templatePlaceholder": "https://discord.new/…",
  "discordMove.import": "Kanalları ve rolleri kopyala",
  "discordMove.importing": "Kopyalanıyor…",
};
