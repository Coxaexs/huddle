# Roller ve izinler

## Rol nedir?

Rol, üyelere verdiğin bir etikettir. Bir rolün **rengi** üyenin adını o renge boyar, **simgesi** adının yanında görünür, **izinleri** ise o üyenin sunucuda neler yapabileceğini belirler. Bir üyenin birden fazla rolü olabilir; izinler toplanır.

Örnek sunucumuzda üç rol var: **Moderatör** (yeşil), **Zindan Efendisi** (kırmızı, D&D oyununu yöneten kişi) ve **Oyuncu** (turuncu).

Rolleri yönetmek için **Sunucu Ayarları → Roller** bölümünü aç. Bunu yalnızca sunucu sahibi ve **Rolleri Yönet** izni olanlar görebilir.

![Roller listesi](/help-media/img/rol-listesi.webp)

## Rol oluşturma

1. Kanal listesinin üstündeki sunucu adına tıkla ve **Sunucu Ayarları**'nı aç.
2. Soldan **Roller** bölümünü seç.
3. **Rol Oluştur** düğmesine bas, rolün adını yaz ve onayla. Yeni rol listenin en altına eklenir ve kendiliğinden seçilir.
4. Altta rolün düzenleme alanı açılır. Başka bir rolü düzenlemek için listede onun yanındaki kalem simgesine bas.
5. Ad kutusunun solundaki renkli kareye basıp bir **renk** seç.
6. İstersen **Rol Simgesi** bölümünde bir emoji yazıp **Emojiyi kullan** düğmesine bas ya da **Görsel yükle** ile küçük bir resim seç.
Değişiklikler kendiliğinden kaydedilir: renk, seçiciyi bıraktıktan kısa süre sonra; ad, kutudan çıkınca ya da <kbd>Enter</kbd>'a basınca. Kaydedilirken adın yanında kısa bir "Kaydediliyor…" yazısı görünür. Ad kutusunda <kbd>Esc</kbd>'e basarsan yazdığın ad geri alınır.

::video rol-olustur | Rol oluşturmak, renk ve simge vermek, izin açmak ve rolü üyelere vermek

![Rolün düzenleme alanı](/help-media/img/rol-duzenle.webp)

## İzinler

Rolün düzenleme alanında, **… için İzinleri Düzenle** başlığının altında izinlerin listesi var. Bir izni açmak ya da kapatmak için satırın sağındaki kutuya bas. **İzinler hemen kaydedilir**, ayrıca bir düğmeye basman gerekmez.

En sık kullanılanlar:

| İzin | Ne sağlar |
| --- | --- |
| **Yönetici** | Her izni verir ve kanal kısıtlamalarını aşar. Yalnızca çok güvendiğin kişilere ver. |
| **Sunucuyu Yönet** | Sunucunun adını, simgesini, afişini ve genel ayarlarını değiştirme. |
| **Rolleri Yönet** | Kendi en yüksek rolünün altındaki rolleri oluşturma, düzenleme ve verme. |
| **Kanalları Yönet** | Kanal ve kategori açma, düzenleme, silme. |
| **Denetim Kaydını Görüntüle** | Denetim kaydını görme. |
| **Emoji ve Çıkartmaları Yönet** | Sunucu emojisi ve çıkartması yükleme. |
| **Davet Oluştur** | Davet bağlantısı oluşturma. |
| **Takma Ad Değiştir** / **Takma Adları Yönet** | Kendi takma adını ya da başkalarınınkini değiştirme. |
| **Üyeleri At** / **Üyeleri Yasakla** | Üyeleri sunucudan atma ya da yasaklama. |
| **Mesaj Gönder** | Yazı kanallarına mesaj yazma. |
| **Dosya Ekle** | Resim ve dosya yükleme. |
| **@everyone ve @here Etiketle** | Herkesi etiketleme. |
| **Mesajları Yönet** | Başkalarının mesajlarını silme ve mesaj sabitleme. |
| **Bağlan** / **Konuş** | Ses odalarına girme ve konuşma. |
| **Görüntü ve Ekran Paylaşımı** | Kamera açma ve ekran paylaşma. |
| **Üyeleri Sustur** / **Üyeleri Sağırlaştır** / **Üyeleri Taşı** | Ses odalarında başkalarını susturma, sağırlaştırma ve odalar arasında taşıma. |
| **Öncelikli Konuşmacı** | Konuşurken diğerlerinin sesini kısan öncelikli konuşmacı modu. |
| **D&D Oturumlarını Kaydet** | Herkesin onayıyla D&D oturumu kaydı başlatma ve yönetme. |

![İzinler listesi](/help-media/img/rol-izinleri.webp)

## Herkes için varsayılan izinler

Rol listesinin üstündeki **Varsayılan İzinler** (*@everyone*) satırı, sunucudaki **herkesin** sahip olduğu izinlerdir. Örneğin herkesin davet oluşturabilmesini istiyorsan **Davet Oluştur** iznini burada aç; yalnızca belirli kişilerin yapabilmesini istiyorsan burada kapatıp o kişilere ait bir rolde aç.

![@everyone için varsayılan izinler](/help-media/img/varsayilan-izinler.webp)

## Rol verme ve geri alma

**Roller sayfasından:** Rol düzenleme alanının en altındaki **Rol ata** bölümünde her üyenin altında sunucunun rolleri sıralanır. Bir role basınca o rol üyeye verilir ve rolün rengiyle çerçevelenir; yeniden basınca geri alınır.

![Rol verme](/help-media/img/rol-ver.webp)

**Üyeler sayfasından:** **Sunucu Ayarları → Üyeler** bölümünde her üyenin sağındaki **+** düğmesiyle rol ekleyebilir, rolün yanındaki **×** ile kaldırabilirsin. Bu sayfa her üyenin hangi davet bağlantısıyla geldiğini de gösterir.

![Üyeler sayfası](/help-media/img/ayar-uyeler.webp)

## Rol sırası

Listede üstte duran rol daha yüksektir. Bunun iki sonucu var:

- Bir üyenin adı, **en yüksek renkli rolünün** rengiyle görünür.
- **Rolleri Yönet** izni olan biri yalnızca **kendi en yüksek rolünün altındaki** rolleri düzenleyip verebilir. Böylece kimse kendine ya da bir arkadaşına kendisinden güçlü bir rol veremez.

Sırayı değiştirmek için rolü adının solundaki tutamaçtan (⋮⋮) tutup listede yukarı ya da aşağı sürükle. Bırakacağın yer ince bir çizgiyle gösterilir. Klavyeyle de olur: tutamaca <kbd>Tab</kbd> ile gel ve <kbd>↑</kbd> / <kbd>↓</kbd> tuşlarıyla rolü bir basamak taşı. Sıra hemen kaydedilir. Sürükleme, arama kutusu boşken çalışır. Sunucu sahibi olmayan biri yalnızca kendi en yüksek rolünün altındaki rollerin yerini değiştirebilir.

## Özel kanallar ve kanal izinleri

Bir kanalı yalnızca belirli rollerin ya da kişilerin görmesini istiyorsan (örneğin yalnızca D&D oyuncularının gördüğü bir kanal):

1. Kanala sağ tıkla ve **İzinler**'i seç.
2. En üstteki **Özel kanal** kutusunu işaretle. Artık kanalı yalnızca aşağıda **Kanalı görme** izni verilen roller ve kişiler görür (yöneticiler ve sunucu sahibi her zaman görür).
3. **Rol ya da kişi ekle**'ye bas, rolün ya da kişinin adını yazıp seç.
4. Seçtiğin rol için izinlerin yanındaki **✓** düğmesine bas: en azından **Kanalı görme**, yazabilmeleri için de **Mesaj gönderme**.
5. **Kaydet** düğmesine bas.

Özel kanalların adının yanında küçük bir kilit simgesi görünür.

::video ozel-kanal | #zindan-masası kanalını yalnızca Oyuncu rolüne açmak

![Kanal izinleri penceresi](/help-media/img/ozel-kanal-ayari.webp)

Her iznin yanında üç seçenek var:

- **✓ (izin ver):** Bu rol ya da kişi bu kanalda bunu yapabilir.
- **– (varsayılan):** Sunucudaki rolleri ne diyorsa o geçerli olur.
- **× (yasakla):** Rolü ne derse desin bu kanalda bunu yapamaz. Örneğin bir duyuru kanalında herkese **Mesaj gönderme** için × verip yalnızca moderatörlere ✓ verebilirsin.
