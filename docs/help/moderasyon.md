# Moderasyon ve güvenlik

## Bir üyeye müdahale etme

Üye listesinde birinin adına ya da sohbette adına sağ tıkla (telefonda basılı tut). Yetkin varsa menüde şunlar bulunur:

- **Takma adı düzenle (Edit nickname):** Kişinin yalnızca bu sunucuda görünen adını değiştirir.
- **Mesaj:** Kişiye doğrudan mesaj yazar.
- **Engelle:** Kişinin sana mesaj atmasını ve mesajlarını görmeni engeller. Bu yalnızca seni etkiler.
- **Benim için sustur:** Ses odasında bu kişinin sesini yalnızca senin için kapatır. Altındaki **Kullanıcı sesi** çubuğuyla sesini kısıp açabilirsin.
- **Sunucuda sustur:** Kişinin mikrofonunu odadaki herkes için kapatır.
- **Zaman aşımı:** Kişi seçtiğin süre boyunca (60 saniye, 5 dakika, 10 dakika, 1 saat, 1 gün ya da 1 hafta) yazamaz ve konuşamaz.
- **Sunucudan at:** Kişiyi sunucudan çıkarır. Yeni bir davetle geri gelebilir.
- **Sunucudan yasakla:** Kişiyi sunucudan çıkarır ve geri gelmesini engeller.

![Bir üyenin sağ tık menüsü](/help-media/img/uye-menusu.webp)

Yasaklanan kişileri görmek ve yasağı kaldırmak için **Sunucu Ayarları → Yasaklar** bölümünü aç.

## Mesaj silme ve toplu temizlik

Bir mesajın üzerine gelince sağ üstte beliren çöp kutusu simgesi mesajı siler. Kendi mesajlarını her zaman silebilirsin; başkalarınınkini silmek için **Mesajları Yönet** izni gerekir. Onay penceresini atlamak için silerken <kbd>Shift</kbd> tuşunu basılı tut.

Bir kanala çok sayıda spam geldiyse **Sunucu Ayarları → Güvenlik ve AutoMod** bölümündeki **Bulk Message Purge** ile son 10, 25, 50 ya da 100 mesajı bir kerede silebilirsin; istersen yalnızca bir kişinin mesajlarını seçebilirsin. Aynı işi kanalda `/purge 25 @kullanıcıadı` komutuyla da yapabilirsin.

## Baskın kilidi ve doğrulama düzeyi

**Sunucu Ayarları → Güvenlik ve AutoMod** bölümünde iki önemli ayar var:

- **Raid Lockdown Mode (Baskın kilidi):** Açınca sunucunun tüm davet bağlantıları ve herkese açık listeden katılım durdurulur. Sunucuna bir anda çok sayıda istenmeyen kişi geliyorsa kullan; durum geçince kapat.
- **Doğrulama Düzeyi:** Bir hesabın bu sunucuda yazabilmesi için gerekenler.
  - **Yok:** Herkes yazabilir.
  - **Düşük:** Hesabında doğrulanmış bir e-posta olmalı.
  - **Orta:** Doğrulanmış e-posta ve en az 5 dakikalık Hoffle hesabı.
  - **Yüksek:** Bunlara ek olarak en az 10 dakikadır bu sunucunun üyesi olmak.

Herhangi bir rolü olan üyeler doğrulama düzeyine takılmaz; birini beklemeden içeri almak istersen ona bir rol vermen yeter.

![Güvenlik ayarları](/help-media/img/ayar-guvenlik.webp)

## AutoMod

AutoMod, sunucuya gönderilen her mesajı kurallarına göre denetler ve uymayanları daha görünmeden durdurur. Moderatörler bu kurallara takılmaz; iki kişi arasındaki özel mesajlara da karışmaz.

**Kural eklemek için:**

1. **Sunucu Ayarları → AutoMod** bölümünü aç ve **Kural Oluştur** düğmesine bas.
2. **Kural türü** listesinden kuralın türünü seç:
   - **Blocked words:** Listelediğin kelimeleri içeren mesajları engeller (büyük-küçük harf fark etmez).
   - **Mention limit:** Bir mesajda en fazla kaç kişinin etiketlenebileceği.
   - **Links:** İzin verilenler listesinde olmayan bağlantıları engeller.
   - **Caps:** Çoğu büyük harfle yazılmış mesajları engeller.
   - **Repeat:** Aynı mesajın aynı kanalda tekrar tekrar gönderilmesini engeller.
3. **Eşleştiğinde** listesinden kural çiğnenince ne olacağını seç: yalnızca mesajı engellemek ya da mesajı engelleyip gönderen kişiye zaman aşımı vermek.
4. **Kural Oluştur** düğmesine bas.

![Yeni AutoMod kuralı](/help-media/img/automod-kural.webp)

## Denetim kaydı

**Sunucu Ayarları → Denetim Kaydı**, sunucuda yapılan yönetim işlemlerinin listesidir: kimin hangi kanalı açtığı ya da sildiği, rolleri kimin değiştirdiği, kimin atıldığı ya da yasaklandığı, davetlerin oluşturulup iptal edilmesi ve benzerleri. Bunu görmek için **Denetim Kaydını Görüntüle** izni gerekir.

![Denetim kaydı](/help-media/img/ayar-denetim.webp)

## Mesaj bildirme ve engelleme

Kuralları çiğneyen bir mesaj görürsen mesaja sağ tıkla ve **Mesajı Bildir**'i seç. Sunucudaki bildirimler o sunucunun moderatörlerine, özel mesajlardaki bildirimler Hoffle yöneticilerine gider. Hoffle, taciz eden kullanıcılara ve uygunsuz içeriğe karşı sıfır tolerans uygular.

Birinden hiç haber almak istemiyorsan adına sağ tıklayıp **Engelle**'yi seç. Engellediğin kişi sana doğrudan mesaj atamaz ve mesajları senin ekranında gizlenir.
