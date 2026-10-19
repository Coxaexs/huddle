import type { commands as en } from "../en/commands";

export const commands: Record<keyof typeof en, string> = {
  "command.roll.desc": "/roll 2d20+5 gibi gösterimlerle zar at",
  "command.shrug.desc": "Mesajının sonuna ¯\\_(ツ)_/¯ ekler",
  "command.tableflip.desc": "Mesajının sonuna (╯°□°)╯︵ ┻━┻ ekler",
  "command.unflip.desc": "Mesajının sonuna ┬─┬ノ( º _ ºノ) ekler",
  "command.me.desc": "Rol yapma ya da eylemler için metni vurgulu gösterir",
  "command.tts.desc": "Mesajını kanalda sesli olarak okur",
  "command.clear.desc": "Yerel görünümündeki mesajları temizler",
  "command.help.desc": "Kullanılabilir komutları ve nasıl kullanılacaklarını gösterir",
  "command.nick.desc": "Bu sunucudaki takma adını değiştir",
  "command.topic.desc": "Kanal konusunu görüntüle ya da ayarla",
  "command.poll.desc": "Kanalda etkileşimli bir anket oluştur",
  "command.play.desc": "Ses kanalında çal ya da sıraya ekle",
  "command.playnext.desc": "Parçayı sıradaki şarkı olarak ekle",
  "command.pause.desc": "Oynatmayı duraklat",
  "command.resume.desc": "Oynatmaya devam et",
  "command.skip.desc": "Sonraki parçaya geç",
  "command.skipto.desc": "Doğrudan sıradaki bir parçaya atla",
  "command.stop.desc": "Durdur ve sırayı temizle",
  "command.disconnect.desc": "Müzik botunun bağlantısını kes",
  "command.queue.desc": "Sırada ne olduğunu göster",
  "command.nowplaying.desc": "Oynatıcıyı ilerleme çubuğuyla göster",
  "command.loop.desc": "Parçayı ya da sırayı tekrarla",

  // Server error messages
  "serverError.rateLimited": "Çok hızlı mesaj gönderiyorsun. Lütfen yavaşla!",
  "serverError.permissionDenied": "Bu eylemi gerçekleştirmek için iznin yok.",
  "serverError.channelNotFound": "Kanal bulunamadı.",
  "serverError.serverNotFound": "Sunucu bulunamadı.",
  "serverError.userNotFound": "Kullanıcı bulunamadı.",
  "serverError.invalidPayload": "Geçersiz istek. Lütfen girişini kontrol et.",

  // Slash menu UI
  "commands.label": "Komutlar",
  "commands.empty": "Bununla eşleşen bir komut yok.",
  "commands.needsVoice": "ses kanalı gerekir",
  "commands.group.music": "Müzik",
  "commands.group.discordMusic": "Discord müziği",
  "commands.group.rooms": "Odalar",
  "commands.group.dnd": "D&D",
  "commands.group.huddle": "Huddle",
  "commands.group.bots": "Botlar",
};

