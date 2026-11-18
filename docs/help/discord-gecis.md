# Discord'dan geçiş

## Hoffle'da tanıdık olanlar

Discord kullandıysan Hoffle'ın çoğu sana tanıdık gelecek. Kısa bir eşleştirme:

| Discord'da | Hoffle'da |
| --- | --- |
| Sunucu, kategori, yazı ve ses kanalı | Aynı adlarla: sunucu, kategori, yazı kanalı, ses odası |
| Duyuru kanalı, forum, sahne | Duyuru, forum ve sahne kanalları ([Sunucular](/help/sunucular#kanal-türleri)) |
| Roller ve kanal izinleri | Aynı mantık ([Roller ve izinler](/help/roller)) |
| AutoMod, denetim kaydı, zaman aşımı | Aynı adlarla ([Moderasyon](/help/moderasyon)) |
| Özel mesaj, grup DM, arkadaşlar | Aynı ([Arkadaşlar ve özel mesajlar](/help/arkadaslar)) |
| Ekran paylaşımı, ses tahtası | 1080p ve 60 fps'ye kadar, sesiyle birlikte ([Sesli sohbet](/help/sesli-sohbet)) |
| Müzik botları | Ses odasına doğrudan çalan kendi müzik botu ([Müzik botu](/help/muzik)) |
| Activities | Birlikte İzle, Reels, oyunlar ve 3D Oturma Odası |

Hoffle ücretsizdir, reklam göstermez ve kurulum gerektirmez: [chat.hoffle.online](https://chat.hoffle.online) tarayıcıda açılır. Ayrıntılı bir karşılaştırma için [Hoffle ve Discord](/tr/vs-discord) sayfasına bak.

## Bir Discord sunucusunu kopyalama

Discord sunucunun kanallarını, kategorilerini, rollerini ve izinlerini tek seferde Hoffle'a taşıyabilirsin. Bunun için bot gerekmez.

1. **Discord'da:** Sunucu Ayarları → **Sunucu Şablonu** bölümünü aç, bir şablon oluştur ve bağlantısını (`discord.new/…`) kopyala.
2. **Hoffle'da:** Sunucu çubuğundaki **+** düğmesine bas, **Create New**'u seç.
3. Ad kutusuna şablon bağlantısını yapıştır ve **Create Server**'a bas.

Hoffle kaç kategori, kanal ve rol kopyaladığını gösterir. Discord'da özel olan kanallar burada da özel olur. Hoffle'da henüz karşılığı olmayan kanal türleri atlanır ve bunlar da listelenir.

![Sunucu oluşturma penceresine şablon bağlantısı yapıştırılabilir](/help-media/img/sunucu-ekle-penceresi.webp)

Son adımda Hoffle, Discord sunucunun duyurularına yapıştırabileceğin hazır bir mesaj ve 1000 kişiye kadar çalışan bir davet bağlantısı verir. **Mesajı kopyala**'ya bas ve Discord'a yapıştır; üyelerin bağlantıya tıklayıp hesap açınca doğrudan yeni sunucuya gelir.

> Mesaj geçmişi şablonla taşınmaz; yalnızca sunucunun yapısı kopyalanır. Eski mesajların Discord'da kalır.

## Discord köprüsü: iki tarafı birlikte kullanmak

Herkes bir anda taşınmayacaksa **Discord köprüsü** seçtiğin kanalları iki yönlü aynalar. Discord'da yazılanlar Hoffle'da yazanın adı ve resmiyle görünür, Hoffle'da yazılanlar Discord'a gider. Yanıtlar, düzenlemeler, silmeler, tepkiler, dosyalar ve konular da karşıya geçer.

1. **Sunucu Ayarları → Entegrasyonlar**'da **Discord Bridge** kartındaki **Set up**'a bas.
2. Köprü botunu Discord sunucuna ekle (bunun için orada **Sunucuyu Yönet** yetkin olmalı).
3. Hoffle'ın gösterdiği komutu Discord sunucundaki herhangi bir kanala yaz: `/hoffle link <kod>`.
4. Hangi Discord kanalının hangi Hoffle kanalıyla eşleşeceğini seç. Sayfa, Discord yanıt verince kendiliğinden güncellenir.

![Discord köprüsü ayarları](/help-media/img/discord-kopru.webp)

İpuçları:
- Discord'daki herkesin okuyabildiği bir kanalı Hoffle'daki özel bir kanalla eşleştirirsen, o özel kanalı Discord'daki herkes okuyabilir hâle gelir. Hoffle bunu eşleştirirken uyarır.
- Bir taraftaki kopyayı silmek asıl mesajı da siler. Discord'da bunun için köprü botunun **Mesajları Yönet** yetkisi gerekir.
- Köprüyü istediğin zaman aynı yerden kapatabilirsin.

## Discord botlarını Hoffle'da çalıştırma

Hoffle, Discord'un bot arayüzünü (API v10) taklit eder. **discord.js** ya da **discord.py** ile yazılmış botlar, yalnızca bağlandıkları adres değiştirilerek Hoffle'da çalışır.

1. **Sunucu Ayarları → Entegrasyonlar → Your own bot → Open** ile (ya da `chat.hoffle.online/hangout/developers` adresinden) **Geliştirici Portalı**'nı aç.
2. **New bot** kutusuna bir ad yaz ve **Create**'e bas. Botun **token**'ını kopyala; yalnızca bir kez gösterilir.
3. **Invite link** bölümünde botun ihtiyaç duyduğu izinleri seç ve bağlantıyı kopyala. Bu bağlantıyla botu sunucuna eklersin.
4. Bot kodunda Discord adresini Hoffle'ınkiyle değiştir ve yeni token'ı kullan. Örnek kodlar [Bots belgesinde](/docs/bots#running-real-discord-bots) var.

![Geliştirici Portalı](/help-media/img/gelistirici-portali.webp)

Çalışanlar: mesajlar, eğik çizgi komutları (Hoffle'ın kendi `/` menüsünde görünür), düğmeler ve seçim menüleri, gömülü kartlar (embed), konular, tepkiler, dosyalar ve web kancaları.

Çalışmayanlar: **Ses kanalına bağlanan botlar** (Discord müzik botları gibi) Hoffle'da çalışmaz; onların yerine Hoffle'ın kendi [müzik botunu](/help/muzik) kullan. Modal pencereler ve otomatik tamamlama önerileri de henüz yok.
