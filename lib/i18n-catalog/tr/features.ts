import type { features as en } from "../en/features";

export const features: Record<keyof typeof en, string> = {
  // MSN Chrome & Nudges
  "msn.nudge": "Titreşim Gönder!",
  "msn.nudged": "Bir titreşim gönderdin!",
  "msn.receivedNudge": "{name} sana bir titreşim gönderdi!",
  "msn.wink": "Göz Kırpmalar",
  "msn.winkSent": "Bir göz kırpma gönderdin: {name}.",
  "msn.winkReceived": "{name} sana bir göz kırpma gönderdi: {wink}.",
  "msn.winkPlay": "Oynat",
  "msn.emoticons": "İfadeler",
  "msn.handwriting": "El Yazısı",
  "msn.today": "MSN Bugün",
  "msn.voiceClip": "Ses Klibi Gönder",


  // Achievements
  "achievements.title": "Başarımlar",
  "achievements.unlocked": "Başarım Açıldı!",
  "achievements.progress": "{total} Başarımdan {current} Tanesi Açıldı",
  "achievements.locked": "Kilitli",
  "achievements.secret": "Gizli Başarım",

  // Games & Activities
  "games.title": "Birlikte Oyna",
  "games.chess": "Satranç",
  "games.checkers": "Dama",
  "games.tictactoe": "XOX",
  "games.connect4": "Hedef 4",
  "games.battleship": "Amiral Battı",
  "games.solo": "Tek Başına Oyna",
  "games.vsPlayer": "Arkadaşla Oyna",

  // Rota & Kanban Board
  "rota.title": "Nöbet Listesi",
  "rota.onDuty": "Şu an nöbette",
  "rota.nextUp": "Sıradaki",
  "rota.takeTurn": "Sırayı Al",
};
