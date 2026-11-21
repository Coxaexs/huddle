# Botlar ve entegrasyonlar

## Entegrasyonlar sayfası

Bir sunucuya bot, besleme ya da başka bir servis bağlamak için **Sunucu Ayarları → Entegrasyonlar** bölümünü aç. Bunun için **Sunucuyu Yönet** izni gerekir.

![Entegrasyonlar sayfası](/help-media/img/entegrasyonlar-canli.webp)

Sayfanın üstündeki kartlar:

- **Beslemeler:** YouTube kanallarını, subreddit'leri, Bluesky hesaplarını, blogları ve GitHub sürümlerini bir kanala kendiliğinden düşürür.
- **Web kancaları:** Başka uygulamaların bir kanala mesaj göndermesi için gizli bir adres.
- **D&D Companion:** D&D botu: zar, büyü ve canavar kartları ([D&D](/help/dnd)) ve karakter kâğıtlarıyla savaş haritası olan web uygulaması ([Tavern](/help/tavern)).
- **Discord köprüsü:** Discord sunucusuyla iki yönlü kanal aynası ([Discord'dan geçiş](/help/discord-gecis#discord-köprüsü-iki-tarafı-birlikte-kullanmak)).
- **Kendi botun:** Kendi botunu yazmak için Geliştirici Portalı.

## Beslemeler (feeds)

Bir kaynağın yeni videoları, gönderileri ya da yazıları bir kanala kendiliğinden gelsin istersen:

1. **Beslemeler** bölümündeki kutuya kaynağın bağlantısını yapıştır: bir YouTube kanalı, bir subreddit, bir Bluesky hesabı, bir GitHub deposunun sürümleri ya da herhangi bir blog veya haber sitesi.
2. Yanındaki listeden gönderilerin düşeceği kanalı seç.
3. **Takip et**'e bas.

Kaynaklar 15 dakikada bir kontrol edilir. Bir sunucu en fazla 10 kaynak izleyebilir. Takibi bırakmak için listede kaynağın yanındaki silme düğmesine bas.

## Web kancaları (webhooks)

Web kancası, yalnızca bir kanala mesaj gönderebilen gizli bir adrestir. Discord web kancasına mesaj gönderebilen her şey (sürekli entegrasyon sistemleri, sunucu izleme araçları, Home Assistant, kendi betiklerin) Hoffle'a da gönderebilir.

1. **Web kancaları** bölümünde web kancasına bir ad ver (örneğin "GitHub") ve kanalı seç.
2. **Yeni web kancası**'na bas ve oluşan adresi kopyala.
3. Adresi mesaj gönderecek uygulamaya yapıştır.

GitHub, GitLab ya da Gitea/Forgejo için adresin sonuna sırasıyla `/github`, `/gitlab` ya da `/gitea` ekle; Slack biçiminde gönderen araçlar için `/slack` ekle. Bir sunucuda en fazla 15 web kancası olabilir. Adres bir şifre gibidir: sızdıysa yenisini oluştur.

![Web kancaları ve botlar](/help-media/img/entegrasyon-webhook.webp)

## Sunucudaki botlar

**Botlar** bölümü bu sunucuya eklenmiş botları listeler. Bir botu geçici olarak durdurmak için **Kapat**'a, tamamen çıkarmak için çöp kutusuna bas.

Hoffle'da üç tür bot vardır:

- **Hazır botlar:** [Müzik botu](/help/muzik) (müzik, DJ, Birlikte İzle) ve [D&D botu](/help/dnd). Müzik botu bir davet bağlantısıyla, D&D botu Entegrasyonlar sayfasındaki **Ekle** düğmesiyle eklenir. D&D botunun web uygulaması [Tavern](/help/tavern) bölümünde anlatılıyor.
- **Geliştirici Portalı'ndan yapılan botlar:** Herkes kendi botunu yapıp davet bağlantısıyla paylaşabilir. Bir bot yalnızca kendisini ekleyen sunuculara ulaşır ve yalnızca orada verilen izinleri kullanabilir. Hiçbir bot özel mesajlara erişemez, sunucunun sahibini atamaz ya da yasaklayamaz.
- **Discord botları:** discord.js ya da discord.py ile yazılmış botlar, yalnızca bağlandıkları adres değiştirilerek çalışır ([Discord'dan geçiş](/help/discord-gecis#discord-botlarını-hoffleda-çalıştırma)).

Bir botu eklerken ona kendinde olmayan bir izni veremezsin. Bot davet bağlantısı açıldığında bot hangi izinleri istediğini gösterir; yalnızca güvendiğin botları ekle.

## Kendi botunu yazmak

1. **Kendi botun → Aç** ile ya da `chat.hoffle.online/hangout/developers` adresinden **Geliştirici Portalı**'nı aç.
2. Botuna bir ad ver ve **Create**'e bas. **Token**'ı kopyala; yalnızca bir kez gösterilir, kaybedersen sıfırlarsın.
3. **Invite link** bölümünde botun ihtiyaç duyduğu izinleri seç ve bağlantıyı paylaş.
4. **Public bot** açıkken bağlantısı olan herkes botu ekleyebilir; kapalıyken yalnızca sen ekleyebilirsin.

![Geliştirici Portalı](/help-media/img/gelistirici-portali.webp)

Botlar eğik çizgi komutları kaydedebilir (Hoffle'ın `/` menüsünde görünür), düğmeli ve menülü mesajlar gönderebilir, hatta ses odasının **Aktiviteler** menüsüne kendi sayfalarını ekleyebilir. Ayrıntılı geliştirici belgesi: [hoffle.online/docs/bots](/docs/bots).

## Minecraft sunucusu bileşeni

Bir Minecraft sunucunuz varsa **Entegrasyonlar** sayfasının altındaki **Minecraft sunucusu** bölümüne sunucunun adresini ve portunu yaz. O zaman kanal listesinde, ses kontrollerinin üstünde **kimlerin oynadığı** görünür. **RCON** portunu ve şifresini de girersen, **Sunucuyu Yönet** izni olanlar sunucuya Hoffle'dan komut gönderebilir. **Kaydet** ile kaydet.

![Minecraft sunucusu bileşeni](/help-media/img/entegrasyon-minecraft.webp)
