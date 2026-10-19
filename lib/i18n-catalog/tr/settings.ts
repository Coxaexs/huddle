import type { settings as en } from "../en/settings";

export const settings: Record<keyof typeof en, string> = {
  "settings.language.partialTag": "kısmi",
  "settings.language.partialNote": "“Kısmi” işaretli diller yalnızca kısmen çevrildi; geri kalanı İngilizce görünür.",
  "settings.language.detected": "Hoffle bunu tarayıcından seçti. Seçimin bu cihazda hatırlanır.",
  "settings.nav.language": "Dil",
  "settings.nav.language.desc": "Hoffle'ın kullandığı dil",
};
