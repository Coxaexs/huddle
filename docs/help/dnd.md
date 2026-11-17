# D&D ve masa oyunları

## D&D araçlarını açma

Hoffle'da D&D ve benzeri masa oyunları için zar, savaş haritası, inisiyatif takibi ve bir büyü-canavar ansiklopedisi bulunur. Bunlar **D&D Bot** tarafından yanıtlanır:

1. **Sunucu Ayarları → Entegrasyonlar** bölümünü aç.
2. **D&D Companion** kartındaki **Add** düğmesine bas.

Sunucunda D&D araçlarını hiç istemiyorsan **Sunucu Ayarları → Erişim** bölümündeki **D&D & Tabletop** modülünü kapatabilirsin; komutlar ve düğmeler gizlenir.

![Entegrasyonlar sayfası](/help-media/img/ayar-entegrasyonlar.webp)

## Zar atma

Herhangi bir kanala `/roll` ve zar gösterimini yaz:

| Yazdığın | Ne olur |
| --- | --- |
| `/roll d20` | Bir yirmi yüzlü zar atar. |
| `/roll d20+5 Saldırı` | d20 atar, 5 ekler ve sonucu "Saldırı" etiketiyle gösterir. |
| `/roll 2d6+3 kılıç` | İki altı yüzlü zar atıp 3 ekler. |
| `/roll d20+3 Gizlilik adv` | **Avantajlı** atış: iki d20 atar, yüksek olanı alır. |
| `/roll d20 dis` | **Dezavantajlı** atış: iki d20 atar, düşük olanı alır. |
| `/roll 2d6+3 kılıç crit` | **Kritik** vuruş: hasar zarlarını iki kat atar (eklenen sayı katlanmaz). |

Zarlar kanaldaki herkesin ekranında 3D olarak yuvarlanır, sonuç da bir kart olarak kanala düşer. Karttaki **Roll again** düğmesi aynı atışı tekrarlar.

::video zar-at | Saldırı ve avantajlı gizlilik zarı atmak

![Zar sonuçları](/help-media/img/zar-sonuc.webp)

**Gizli zar:** `/gmroll d20+4 algı` sonucu yalnızca sana gösterir. Oyunu yöneten kişi (DM) için idealdir.

**Vampire: The Masquerade (V5):** `/v 7 h2 d3 Güç + Dövüş` 7 zarlık havuzla, 2 Açlık zarıyla ve zorluk 3'le atar; `/gmv` aynısını gizli atar; `/rouse h2` Rouse kontrolü yapar. Sunucunun oyun sistemini Vampire V5'e çevirmek için aşağıdaki [Masa ayarları](#masa-ayarları) bölümüne bak.

## 3D zarlarını kişiselleştirme

**Ayarlar → Zarlar ve Masaüstü** bölümünde kendi zarlarının görünüşünü seçersin:

- **3D Dice Style:** Hazır zar takımları (Dice Bag, Amber Resin, Shadowflame, Ocean Epoxy, Matrix, Vampire…).
- **Dice Base Colour:** Zarın rengi.
- **Dice Material:** Plastik, ağır metal, oyma ahşap ya da yakut cam. Malzeme hem parlaklığı hem de zarın çıkardığı sesi değiştirir.
- **Dice Surface Texture:** Mermer, ahşap damarı, ejderha pulu, buz, yıldızlar ve daha fazlası.
- **Critical rolls:** Doğal 1 ve doğal 20 geldiğinde malzemeye göre özel bir an oynar (cam kırılır, ahşap çiçek açar gibi). Buradaki düğmelerle deneyebilirsin.

![Zar ayarları](/help-media/img/ayar-zarlar.webp)

## Büyü, canavar ve eşya ansiklopedisi

D&D 5e kurallarından bir şeye bakmak için:

| Komut | Örnek |
| --- | --- |
| `/spell` | `/spell fireball` |
| `/monster` | `/monster goblin` |
| `/item` | `/item longsword` |
| `/feat` | `/feat alert` |
| `/race` | `/race half-orc` |
| `/class` | `/class paladin` |
| `/subclass` | `/subclass oath of vengeance` |

Sonuç kanala bir kart olarak gelir: büyünün seviyesi, menzili, süresi, hasarı ve açıklaması; canavarın zırh sınıfı, can puanı, hızı, yetenekleri ve saldırıları. 2024 kurallarını görmek için sonuna `2024` ekle (`/spell fireball 2024`). Adlar İngilizce yazılır.

::video buyu-canavar | Fireball büyüsüne ve goblin canavarına bakmak

![Büyü kartı](/help-media/img/buyu-karti.webp)

![Canavar kartı](/help-media/img/canavar-karti.webp)

## Savaş haritası

Savaş haritası bir ses odasında açılır ve odadaki herkes aynı haritayı görür.

1. Oyun için bir ses odasına gir (örneğin **Zindan**).
2. Odanın üst çubuğunda **harita**'ya bas.
3. Haritaya bir ad ver ve **Next**'e bas.
4. Arka planı seç: **Blank Grid** (boş kareli zemin) ya da **Upload Image** (kendi harita görselin).

Harita açılınca üstte bir araç çubuğu belirir:

- **Move tokens** (el): Jetonları sürükleyerek taşır.
- **Paint** (kalem): Haritaya çizer; duvar, yol ya da işaret için.
- **Fog of war** (bulut): Sürükleyerek bir alanı sisle gizler. Oyuncular sisin altını göremez.
- **Zoom** düğmeleri, **Fit to screen** ve **Expand map size**.
- **Grid snap:** Jetonların kareye (ya da altıgene) oturmasını açıp kapatır.
- **Initiative & Encounter Tracker:** İnisiyatif takibi (aşağıda).
- **Put my character on the map:** Kendi karakter jetonunu koyar.
- **Add a monster or fixture:** Goblin, ork, iskelet, ejderha gibi canavarlar ya da sandık, kapı, meşale gibi nesneler ekler.
- **Clear paint:** Çizimleri siler.
- **Close the map for everyone** (×): Haritayı herkes için kapatır.

::video savas-haritasi | Boş bir harita açmak, canavar ve karakter jetonu koymak, çizmek ve sis eklemek

![Jetonlar yerleştirilmiş harita](/help-media/img/harita-yerlesim.webp)

## İnisiyatif takibi

Haritadaki **Initiative & Encounter Tracker** düğmesi, haritadaki herkesi ve her canavarı bir listede toplar:

- **Roll** her satır için inisiyatif atar; **Roll All d20** hepsini birden atar.
- **Start combat** savaşı başlatır; **Next Turn** sırayı bir sonrakine geçirir. Hangi turda olduğunuz üstte yazar.
- Her satırda can puanı (**HP**) vardır; **–** ve **+** ile hasar ve iyileşme işlenir. **+ Cond** ile *zehirlenmiş*, *sersemlemiş* gibi durumlar eklenir.

Sunucu ayarlarında bir **savaş müziği** seçtiysen, savaş başlayınca odanın müziği ona geçer, bitince geri döner.

![İnisiyatif takibi](/help-media/img/inisiyatif.webp)

## Masa düzeni ve DM koltuğu

Odanın **masa** görünümünde herkes yuvarlak bir masanın etrafında oturur. Alt çubuğun en solundaki **Masan** düğmesinden **Dungeon Master** listesinde oyunu yöneten kişiyi seç: DM senin tam karşına oturur. Uzamsal sesi açarsan herkesin sesi masadaki yerinden gelir; böylece kimin konuştuğunu gözünü kapatsan bile anlarsın. Ayrıntılar [Sesli sohbet](/help/sesli-sohbet#uzamsal-ses-ve-masa-düzeni) bölümünde.

## Masa ayarları

**Sunucu Ayarları → Entegrasyonlar** sayfasının altındaki **Tabletop** bölümünde:

- **Game system:** **D&D 5e** ya da **Vampire V5**. "My character" penceresinin hangi karakter kâğıdını açacağını ve zarları kimin yanıtlayacağını belirler.
- **Rules for lookups:** `/spell` ve `/monster` komutlarının varsayılan olarak **2014 SRD** mi yoksa **2024 kurallarını** mı göstereceği.
- **Combat music / Exploration:** Savaş başlayınca ve bitince çalacak müzik (bir çalma listesi bağlantısı ya da arama sözcükleri). **Save music** ile kaydet.
- **Homebrew:** **Import JSON** ile kendi büyülerini, canavarlarını ve eşyalarını ekle; aynı komutlarla aranırlar.

![Tabletop ayarları](/help-media/img/ayar-tabletop.webp)

## Oturum kaydı

**Record D&D Sessions** izni olan biri, ses odasındaki bir D&D oturumunu kaydetmeye başlatabilir. Kayıt yalnızca odadakilerin **onayıyla** başlar ve herkese kayıt yapıldığı açıkça gösterilir. Bu izni yalnızca oyunu yöneten kişiye vermen önerilir.
