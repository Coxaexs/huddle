import type { safety as en } from "../en/safety";

export const safety: Record<keyof typeof en, string> = {
  // Ayarlar → Gizlilik ve Güvenlik
  "privacy.tab": "Gizlilik ve Güvenlik",
  "privacy.navDesc": "Sana kimlerin mesaj atabileceği ve Yayıncı Modu",
  "privacy.dmTitle": "Seninle kimler sohbet başlatabilir",
  "privacy.dmDesc": "Yeni sohbetler ve grup davetleri için geçerlidir. Zaten konuştuğun kişiler sana yazmaya devam edebilir.",
  "privacy.dm.everyone": "Herkes",
  "privacy.dm.servers": "Arkadaşlar ve sunucularındaki kişiler",
  "privacy.dm.friends": "Yalnızca arkadaşlar",
  "privacy.saved": "Kaydedildi.",
  "privacy.failed": "Kaydedilemedi.",
  "privacy.streamerTitle": "Yayıncı Modu",
  "privacy.streamerDesc": "E-postanı ve davet kodlarını bulanıklaştırır, bildirim pencerelerini susturur; böylece yayında görünmezler.",
  "privacy.streamer.off": "Kapalı",
  "privacy.streamer.auto": "Ekranımı paylaşırken açık",
  "privacy.streamer.on": "Her zaman açık",
  "streamer.badge": "Yayıncı Modu",

  // Sunucu Ayarları → Güvenlik Kurulumu → Doğrulama Düzeyi
  "verification.desc": "Bir hesabın burada yazabilmesi için gerekenler. Herhangi bir rolü olan üyeler bunu atlar; birini içeri almak için ona bir rol verebilirsin.",
  "verification.none": "Yok",
  "verification.none.desc": "Herkes yazabilir.",
  "verification.low": "Düşük",
  "verification.low.desc": "Hesabında doğrulanmış bir e-posta olmalı.",
  "verification.medium": "Orta",
  "verification.medium.desc": "Doğrulanmış e-posta ve 5 dakikadan uzun süredir Hoffle'da.",
  "verification.high": "Yüksek",
  "verification.high.desc": "Yukarıdakilerin hepsi ve 10 dakikadan uzun süredir bu sunucunun üyesi.",
  "verification.saved": "Doğrulama düzeyi kaydedildi.",
  "verification.failed": "Doğrulama düzeyi değiştirilemedi.",

  // Sunucu Ayarları → Davetler → Özel URL
  "vanity.title": "Özel URL",
  "vanity.desc": "Bu sunucu için akılda kalıcı bir davet kodu. Sen kaldırana kadar herkes için, kullanım sınırı olmadan çalışır.",
  "vanity.placeholder": "SUNUCUM",
  "vanity.save": "Kaydet",
  "vanity.remove": "Kaldır",
  "vanity.saved": "Özel URL kaydedildi.",
  "vanity.removed": "Özel URL kaldırıldı.",
  "vanity.failed": "Özel URL değiştirilemedi.",
  "vanity.copy": "Bağlantıyı kopyala",
  "vanity.copied": "Davet bağlantısı kopyalandı.",

  // Sunucu Ayarları → Roller → Rol Simgesi
  "roleIcon.title": "Rol Simgesi",
  "roleIcon.desc": "Simgesi olan en yüksek rolü bu olan üyelerin adının yanında gösterilir.",
  "roleIcon.emoji": "Emoji",
  "roleIcon.save": "Emojiyi kullan",
  "roleIcon.upload": "Görsel yükle",
  "roleIcon.remove": "Simgeyi kaldır",

  // Üye menüsü
  "serverAvatar.change": "Sunucu avatarını değiştir",
  "serverAvatar.remove": "Sunucu avatarını kaldır",

  // Yaş sınırlı kanallar
  "nsfw.mark": "Yaş sınırlı olarak işaretle",
  "nsfw.unmark": "Yaş sınırını kaldır",
  "nsfw.gateTitle": "Yaş sınırlı kanal",
  "nsfw.gateBody": "{channel} herkese uygun olmayan içerikler barındırabilir. Görüntülemek için 18 yaşında veya daha büyük olmalısın.",
  "nsfw.gateContinue": "18 yaşında veya daha büyüğüm",
  "nsfw.gateBack": "Geri dön",

  // Mesajı çevir
  "menu.translate": "Çevir",
  "translate.working": "Çevriliyor…",
  "translate.label": "Çeviri: {language}",
  "translate.hide": "Gizle",
  "translate.failed": "Bu mesaj çevrilemedi.",

  // Öncelikli Konuşmacı
  "priority.toggle": "Öncelikli Konuşmacı",
  "priority.on": "Öncelikli Konuşmacı açık: sen konuşurken diğer herkesin sesi kısılır",
};
