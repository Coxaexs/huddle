# Müzik botu ve DJ modu

## Müzik botunu sunucuya ekleme

Hoffle'ın müzik botu **Hoffle Music**, ses odasına girip herkesin aynı anda duyduğu müziği çalar. Sunucuna eklemek için:

1. Bot davet bağlantısını aç. Bağlantıyı Hoffle topluluğunda ya da sunucu yöneticinden bulabilirsin; bağlantı `chat.hoffle.online/hangout/oauth2/authorize?client_id=…&scope=bot` biçimindedir.
2. **Sunucuya ekle** listesinden botu eklemek istediğin sunucuyu seç (yalnızca yönetici olduğun sunucular listelenir).
3. Botun istediği izinlere bak ve **Yetkilendir**'e bas.

::video muzik-botu-ekle | Hoffle Music botunu bir sunucuya eklemek

![Bot ekleme sayfası](/help-media/img/bot-ekle-1.webp)

Bot eklendikten sonra sohbette **Music + Watch** adıyla görünür. Birlikte İzle ve Birlikte Reels de bu botla çalışır.

## Şarkı açma

1. Bir ses odasına gir.
2. Herhangi bir yazı kanalında mesaj kutusuna `/play` yaz, ardından şarkının adını ya da bir YouTube veya Spotify bağlantısını ekle: `/play Çanakkale Türküsü`.
3. <kbd>Enter</kbd>'a bas. Bot odaya gelir ve şarkıyı çalmaya başlar; sohbette bir oynatıcı kartı belirir.

Bir şarkı çalarken yeniden `/play` yazarsan yeni şarkı **sıraya** eklenir. Sıradaki ilk şarkı olsun istersen `/playnext` kullan.

::video muzik-cal | Ses odasına girip /play ile şarkı açmak

![Çalan şarkının kartı](/help-media/img/muzik-caliyor.webp)

> `/play` komutunu bir yazı kanalının mesaj kutusuna yaz. Ses odasının sağındaki küçük sohbet kutusuna yazılan komutlar şimdilik düz mesaj olarak gider.

Kanal listesinde, ses bağlantısı kutusunun üstünde küçük bir **oynatıcı** belirir: şarkının adı, ilerleme çubuğu, duraklatma ve sonraki şarkı düğmeleri. Çapraz oklar tam ekran oynatıcıyı açar.

## Tam ekran oynatıcı

Oynatıcı kartındaki ya da küçük oynatıcıdaki çapraz oklara bas (ya da `/player` yaz). Solda şarkının kapağı, adı, ilerleme çubuğu ve şu düğmeler var: tekrar, baştan başlat, duraklat, sonraki şarkı ve sırayı karıştır. **Add to playlist** şarkıyı bir çalma listesine ekler. Sağda beş sekme bulunur:

- **Lyrics (Sözler):** Şarkı sözleri müzikle birlikte akar; çalan satır vurgulanır. Bir satıra basınca şarkı oraya atlar. **−0.5s** ve **+0.5s** sözleri geri ya da ileri kaydırır. **Word by word** sözleri kelime kelime doldurur. Yanlış sözler geldiyse **Wrong lyrics?** ile doğrusunu seç.
- **Up next (Sıradakiler):** Sıradaki şarkılar. **×** ile bir şarkıyı sıradan çıkar.
- **Search (Ara):** Şarkı ara; sonuçların yanındaki **Next** şarkıyı sıranın başına, liste simgesi sıranın sonuna ekler, **+** ise bir çalma listesine ekler.
- **Playlists (Çalma listeleri):** Sunucunun çalma listeleri. **New playlist** ile yeni liste açılır. Herkes liste açabilir; bir listeye şarkı eklemek için listenin sahibi ya da yönetici olmak gerekir.
- **DJ:** DJ setini başlatma ve şarkılar arası geçişler (aşağıda).

::video muzik-oynatici | Tam ekran oynatıcının sekmeleri: sözler, sıra, arama ve DJ

![Senkron şarkı sözleri](/help-media/img/oynatici-sozler.webp)

![Arama sonuçları](/help-media/img/oynatici-arama.webp)

## DJ modu

Oynatıcının **DJ** sekmesinde bot, odanın müziğini bir DJ gibi karıştırır: tempoyu eşleyerek geçişler, remiksler ve düşüşler yapar.

1. Tarzı seç:
   - **Real DJ:** Sırayı kendisi seçer, kendi remikslerini yapar.
   - **Auto DJ:** Senin sırandaki şarkıları sırayla, aralarına geçiş koyarak karıştırır.
2. **Vibe** (hava) seç: **Chill**, **Club** ya da **Hype**.
3. **Start the set**'e bas. Sıra kısaysa DJ, sete uygun şarkıları kendisi ekler.

Daha fazla kontrol istersen **Full DJ booth** düğmesi tam DJ kabinini açar: iki deste (deck), mikser, efektler, ton kilidi (key lock) ve geçiş düzenleyici (mix editor). Aynı kabini `/dj` komutu da açar.

![DJ sekmesi](/help-media/img/oynatici-dj.webp)

**Between songs (şarkılar arası)** bölümünde, DJ seti açık değilken bile çalışan iki anahtar var:

- **AutoMix:** Şarkılar birbirine tempo ve tona göre yumuşakça geçer (`/automix on`).
- **Smart Autoplay:** Sıra bitince benzer şarkılar çalmaya devam eder (`/autoplay on`).

**Mood radio** satırı (Heavy rock, Indie rock, Sad, Pop, Dreamy, Party, Türkçe, Chill) seçtiğin havada sonu gelmeyen bir radyo başlatır (`/radio party`).

## Müzik komutları

| Komut | Ne yapar |
| --- | --- |
| `/play <şarkı ya da bağlantı>` | Çalar ya da sıraya ekler. |
| `/playnext <şarkı>` | Sıranın başına ekler. |
| `/pause`, `/resume` | Duraklatır, devam ettirir. |
| `/skip`, `/skipto <sıra no>` | Sonraki şarkıya ya da sıradaki bir şarkıya geçer. |
| `/stop` | Durdurur ve sırayı boşaltır. |
| `/seek 1:30`, `/forward`, `/rewind`, `/replay` | Şarkıda ileri geri gider ya da baştan başlatır. |
| `/loop off`, `/loop track`, `/loop queue` | Şarkıyı ya da sırayı tekrarlar. |
| `/queue`, `/shuffle`, `/clear` | Sırayı gösterir, karıştırır, boşaltır. |
| `/remove <no>`, `/move <nereden> <nereye>`, `/removedupes` | Sırayı düzenler. |
| `/nowplaying` | Çalan şarkının kartını gösterir. |
| `/lyrics`, `/lyricsnow` | Şarkı sözleri; `/lyricsnow` yalnızca şu an çalan satırı gösterir. |
| `/grab` | Çalan şarkıyı sana özel mesaj olarak gönderir. |
| `/like`, `/dislike` | Bota zevkini öğretir; beğenmediğin şarkı otomatik çalmaya girmez. |
| `/history`, `/stats`, `/wrapped` | Odanın geçmişi, dinleme istatistikleri ve aylık özet. |
| `/volume <0-100>` | Odanın genel ses düzeyi (yöneticiler ve moderatörler). |
| `/disconnect` | Botu odadan gönderir. |
| `/web` | Müzik panelini açar. |
