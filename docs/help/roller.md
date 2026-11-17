# Roller ve izinler

## Rol nedir?

Rol, üyelere verdiğin bir etikettir. Bir rolün **rengi** üyenin adını o renge boyar, **simgesi** adının yanında görünür, **izinleri** ise o üyenin sunucuda neler yapabileceğini belirler. Bir üyenin birden fazla rolü olabilir; izinler toplanır.

Örnek sunucumuzda üç rol var: **Moderatör** (yeşil), **Zindan Efendisi** (kırmızı, D&D oyununu yöneten kişi) ve **Oyuncu** (turuncu).

Rolleri yönetmek için **Sunucu Ayarları → Roller** bölümünü aç. Bunu yalnızca sunucu sahibi ve **Manage Roles** izni olanlar görebilir.

![Roller listesi](/help-media/img/rol-listesi.webp)

## Rol oluşturma

1. Kanal listesinin üstündeki sunucu adına tıkla ve **Sunucu Ayarları**'nı aç.
2. Soldan **Roller** bölümünü seç.
3. **Create Role** düğmesine bas, rolün adını yaz ve onayla.
4. Listede yeni rolün yanındaki kalem simgesine bas. Altta rolün düzenleme alanı açılır.
5. Ad kutusunun solundaki renkli kareye basıp bir **renk** seç.
6. İstersen **Rol Simgesi** bölümünde bir emoji yazıp **Emojiyi kullan** düğmesine bas ya da **Görsel yükle** ile küçük bir resim seç.
7. Renk, ad ve simge için **Save changes** düğmesine bas.

::video rol-olustur | Rol oluşturmak, renk ve simge vermek, izin açmak ve rolü üyelere vermek

![Rolün düzenleme alanı](/help-media/img/rol-duzenle.webp)

## İzinler

Rolün düzenleme alanında, **Edit Permissions for …** başlığının altında izinlerin listesi var. Bir izni açmak ya da kapatmak için satırın sağındaki kutuya bas. **İzinler hemen kaydedilir**, ayrıca bir düğmeye basman gerekmez.

En sık kullanılanlar:

| İzin | Ne sağlar |
| --- | --- |
| **Administrator** | Her izni verir ve kanal kısıtlamalarını aşar. Yalnızca çok güvendiğin kişilere ver. |
| **Manage Server** | Sunucunun adını, simgesini, afişini ve genel ayarlarını değiştirme. |
| **Manage Roles** | Kendi en yüksek rolünün altındaki rolleri oluşturma, düzenleme ve verme. |
| **Manage Channels** | Kanal ve kategori açma, düzenleme, silme. |
| **View Audit Log** | Denetim kaydını görme. |
| **Manage Emojis & Stickers** | Sunucu emojisi ve çıkartması yükleme. |
| **Create Invites** | Davet bağlantısı oluşturma. |
| **Change Nickname** / **Manage Nicknames** | Kendi takma adını ya da başkalarınınkini değiştirme. |
| **Kick Members** / **Ban Members** | Üyeleri sunucudan atma ya da yasaklama. |
| **Send Messages** | Yazı kanallarına mesaj yazma. |
| **Attach Files** | Resim ve dosya yükleme. |
| **Mention @everyone & @here** | Herkesi etiketleme. |
| **Manage Messages** | Başkalarının mesajlarını silme ve mesaj sabitleme. |
| **Connect** / **Speak** | Ses odalarına girme ve konuşma. |
| **Video & Screen Share** | Kamera açma ve ekran paylaşma. |
| **Mute Members** / **Deafen Members** / **Move Members** | Ses odalarında başkalarını susturma, sağırlaştırma ve odalar arasında taşıma. |
| **Priority Speaker** | Konuşurken diğerlerinin sesini kısan öncelikli konuşmacı modu. |
| **Record D&D Sessions** | Herkesin onayıyla D&D oturumu kaydı başlatma ve yönetme. |

![İzinler listesi](/help-media/img/rol-izinleri.webp)

## Herkes için varsayılan izinler

Rol listesinin üstündeki **Default Permissions** (*@everyone*) satırı, sunucudaki **herkesin** sahip olduğu izinlerdir. Örneğin herkesin davet oluşturabilmesini istiyorsan **Create Invites** iznini burada aç; yalnızca belirli kişilerin yapabilmesini istiyorsan burada kapatıp o kişilere ait bir rolde aç.

![@everyone için varsayılan izinler](/help-media/img/varsayilan-izinler.webp)

## Rol verme ve geri alma

**Roller sayfasından:** Rol düzenleme alanının en altındaki **Assign roles** bölümünde her üyenin altında sunucunun rolleri sıralanır. Bir role basınca o rol üyeye verilir ve rolün rengiyle çerçevelenir; yeniden basınca geri alınır.

![Rol verme](/help-media/img/rol-ver.webp)

**Üyeler sayfasından:** **Sunucu Ayarları → Üyeler** bölümünde her üyenin sağındaki **+** düğmesiyle rol ekleyebilir, rolün yanındaki **×** ile kaldırabilirsin. Bu sayfa her üyenin hangi davet bağlantısıyla geldiğini de gösterir.

![Üyeler sayfası](/help-media/img/ayar-uyeler.webp)

## Rol sırası

Listede üstte duran rol daha yüksektir. Bunun iki sonucu var:

- Bir üyenin adı, **en yüksek renkli rolünün** rengiyle görünür.
- **Manage Roles** izni olan biri yalnızca **kendi en yüksek rolünün altındaki** rolleri düzenleyip verebilir. Böylece kimse kendine ya da bir arkadaşına kendisinden güçlü bir rol veremez.

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
