# D&D Companion (Tavern)

## Tavern nedir?

**Tavern**, D&D botunun web uygulamasıdır. Hoffle'daki zar ve büyü kartlarının yanında tam bir oyun masası sunar:

- karakter kâğıtları,
- savaş haritası (sanal masa),
- dünya haritası,
- kurallar ansiklopedisi (Compendium),
- müzik ve ses efektleri (Bard),
- oyunu yöneten kişi (DM) için yapay zekâ yardımcısı (Oracle).

Bilgisayarda, telefonda ve iPad'de çalışır. iPad'de Apple Pencil ile haritaya çizebilirsin. Tavern'in arayüzü şimdilik İngilizcedir; bu bölüm her düğmeyi ekranda göründüğü adıyla anlatır.

Tavern'de yapılan her şey Hoffle'daki masayla aynı oyundur. Tavern'de atılan zar Hoffle'da da görünür. Savaş haritasındaki jetonlar 3D Oturma Odası'ndaki masada piyon olur. İnisiyatif sırası her yerde aynıdır (ayrıntılar aşağıda, [Hoffle masasıyla bağlantı](#hoffle-masasıyla-bağlantı) bölümünde).

## Tavern'e girmek

Sunucunda D&D botu olmalı ([D&D araçlarını açma](/help/dnd#dd-araçlarını-açma)). Sonra:

1. Kanaldaki bir **D&D Bot** mesajına (örneğin bir zar sonucuna) sağ tıkla. Telefonda mesaja basılı tut.
2. Açılan menüden birini seç:
   - **Open Character Sheet:** karakter kâğıdını açar.
   - **Open Tavern VTT:** savaş haritasını açar.
   - **Open Bard Audio:** müzik panelini açar.

Tavern yeni bir sekmede açılır ve seni Hoffle hesabınla kendiliğinden tanır; ayrı bir şifre yoktur. Giriş 30 gün hatırlanır.

![D&D botunun menüsü](/help-media/img/dnd-bot-menusu.webp)

Hoffle'daki savaş haritasında ve 3D Oturma Odası'nın masa görünümündeki **Open Tavern** (↗) düğmesi de seni Tavern'e götürür.

Hoffle'da bir sunucuda kanalları yönetebilen kişiler Tavern'e **oyun yöneticisi (DM)** olarak girer. DM, sol menüde fazladan bir **Game Master → Party** bölümü, harita ve dünya için de ek araçlar görür. Diğer herkes oyuncu olarak girer.

## Karakter oluşturma

Henüz bir karakterin yoksa **Character** sayfasında **Create a character**'a bas. Karakter altı adımda oluşturulur. Üstteki adım düğmeleriyle istediğin adıma dönebilirsin. En altta can (**HP**), zırh (**AC**), inisiyatif (**INIT**) ve hız (**SPEED**) her seçimde yeniden hesaplanır.

1. **Basics:** Karakterin adı, kural sürümü ve başlangıç seviyesi. Kural sürümü üç seçenekten biridir:
   - **D&D 5e (2014):** klasik kurallar.
   - **D&D 5.5e (2024):** yeni kurallar; yetenek artışları geçmişten gelir.
   - **D&D 3.5e:** eski sürüm.
2. **Class:** Sınıf (Fighter, Wizard, Rogue…). Her kartta sınıfın kısa tanımı ve can zarı yazar. İstersen bir alt sınıf da seç.
3. **Origin:** Tür (Human, Elf, Dwarf…; listede olmayan bir tür için **Another species**), geçmiş (**Background**), yönelim (**Alignment**), isteğe bağlı yetenekler (**Feats**) ve karakterin hikâyesi (**Backstory**).
4. **Abilities:** Yetenek puanları. Üç yol var:
   - **Standard array:** hazır puanlar sınıfına göre yerleştirilir.
   - **Roll 4d6:** puanları zarla atarsın.
   - **Enter manually:** puanları kendin yazarsın.

   Bir yeteneğin altındaki bir değere tıklarsan o değer, onu tutan yetenekle yer değiştirir.
5. **Skills & gear:** Sınıfının izin verdiği becerileri, zırhını ve silahını seç. Büyücülerin başlangıç büyüleri burada listelenir.
6. **Review:** Her şeyi son kez kontrol et ve **Create character**'a bas.

::video dnd-karakter-olustur | Elf bir büyücü olan Lira'yı adım adım oluşturmak

**Yapay zekâyla doldurmak:** İlk adımdaki **Describe your hero and let AI fill the sheet** kutusuna karakterini kendi dilinde (Türkçe de olur) birkaç cümleyle anlat ve **Fill it in**'e bas. Yapay zekâ adı, sınıfı, türü, puanları, becerileri ve hikâyeyi doldurur. Doldurduğu her alan **AI** etiketiyle işaretlenir ve hepsini değiştirebilirsin.

**PDF'ten almak:** Doldurulmuş bir karakter kâğıdı PDF'in varsa sağ üstteki **Import PDF**'e geç ve dosyayı yükle.

## Karakter kâğıdı

![Karakter kâğıdı](/help-media/img/dnd-karakter-sayfasi.webp)

- **Hit Points:** Kutuya bir sayı yazıp **Damage** (hasar) ya da **Heal** (iyileşme) düğmesine bas; can çubuğu buna göre değişir.
- **Armor**, **Initiative**, **Speed**, **Proficiency** ve **Passive Perception** (pasif algı) kendiliğinden hesaplanır.
- **Conditions:** **Add** ile *zehirlenmiş*, *sersemlemiş* gibi durumlar eklenir.
- **Abilities:** Bir yetenek kutusuna tıklamak o yetenekle zar atar. Zar sonucu herkesin gördüğü masa kaydına (**Table log**) ve Hoffle'daki masaya düşer.
- **Skills** ve **Saving throws:** Uzman olduğun beceriler ve kurtarma atışları, bonuslarıyla birlikte.
- Alttaki sekmeler:
  - **Combat:** saldırılar.
  - **Spells:** büyüler ve büyü yuvaları.
  - **Inventory:** eşyalar.
  - **Features:** sınıf ve tür özellikleri, hikâye.
- **Edit** ile kâğıdı düzenlersin. Sol üstteki karakter seçicisinden başka bir karakterine geçer ya da yeni bir tane oluşturursun.

Seviye atlamak için Hoffle ya da Discord'da `/levelup` yaz. DM, **Party** sayfasındaki **Level** düğmesini de kullanabilir.

### Masa kaydı ve zar düğmeleri

Sağdaki **Table log** paneli herkesin zarlarını ve mesajlarını gösterir; doğal 20 ve doğal 1 ayrıca işaretlenir. Altındaki **d4**…**d100** düğmeleri tek tıkla zar atar. Kutuya `2d6+3` gibi bir ifade yazarak zar atabilir ya da düz bir cümle yazıp karakterinin ağzından konuşabilirsin. Paneli **×** ile kapatır, sol alttaki panel düğmesiyle yeniden açarsın.

## Savaş haritası

**Battle map** sayfası oyunun sanal masasıdır. Herkes aynı haritayı görür; DM ne gösterirse oyuncular onu görür.

![Savaş haritası: Lira, bir iskelet ve bir zombi, sağda inisiyatif sırası](/help-media/img/dnd-savas-haritasi.webp "Harita: The Lich's Tomb, mbround18/vtt-maps, CC BY-SA 4.0")

### Haritaya çıkmak

- **Put Lira on map** (düğmede kendi karakterinin adı yazar) karakterini haritaya koyar.
- Jetonu taşımak için üstüne tıkla, sonra boş bir zemine tıkla; ya da jetonu sürükle.
- Oyuncular yalnızca kendi karakterlerini taşıyabilir. DM her jetonu taşıyabilir.

### Haritanın araç çubuğu

Haritanın solundaki dikey çubuk. Bir aracın adını görmek için üstünde bekle.

| Araç | Ne yapar |
| --- | --- |
| **Select & move tokens** (ok) | Jeton seçer ve taşır. |
| **Pan view** (el) | Haritayı kaydırır. Fare tekerleği ya da iki parmak yakınlaştırır. |
| **Draw** (kalem) ve **Erase** (silgi) | Haritanın üstüne çizer ve çizimi siler. |
| Cetvel | İki nokta arasındaki mesafeyi feet olarak ölçer. |
| **Laser pointer** | Herkese bir noktayı gösterir; ikinci ekranda da görünür. |
| **Spell AoE template** (alev) | Küre, koni, küp ya da çizgi biçiminde büyü alanı yerleştirir. |
| **Reveal / Paint Fog of War** (göz) | Savaş sisini açar ve boyar (DM). |
| **Props & Trees** | Ağaç, kaya, fıçı gibi nesneler yerleştirir (DM). |
| **Terrain, Walls & Doors** | Arazi, duvar ve kapı çizer (DM). |
| **Magic Map Edit** (sihirli değnek) | Apple Pencil ile bir bölgeyi daire içine al, yapay zekâ o bölgeyi yeniden çizsin (DM). |
| **Undo**, **Redo**, yakınlaştırma, **Fit map** | Geri al, yinele, yakınlaştır-uzaklaştır ve haritayı ekrana sığdır. |

**iPad ve Apple Pencil:**

- İki parmakla sıkıştırarak yakınlaştırırsın.
- Kalemle çizer ya da sis boyarsın; parmakla haritayı kaydırırsın.
- İki parmakla dokunmak geri alır, üç parmakla dokunmak yineler.
- Bir jetona basılı tutmak hızlı işlemler menüsünü açar.

### Canavar eklemek ve inisiyatif (DM)

Sağdaki **Combat** sekmesinde:

- **Add to the fight:** Goblin, Skeleton, Lich gibi hazır canavarlar kategorilere ayrılmış olarak gelir (**Raiders**, **Humanoids**, **Undead**, **Beasts**, **Bosses**). Arama kutusuna yazarak herhangi bir 5e canavarını bulabilirsin. Canavar, haritanın ortasındaki boş bir kareye konur.
- **Initiative:**
  - **Roll for Lira** kendi karakterin için inisiyatif atar.
  - **Roll for the 2 monsters on the map** haritadaki bütün canavarlar için atar.
  - **Monster or NPC** kutusu ve **Add** ile listeye elle biri eklenir.
  - Sıradaki kişi **Turn** ile işaretlenir. **Next turn** sırayı ilerletir, **‹** bir geri alır, **End combat** savaşı bitirir.

  Bu sıra Hoffle, Discord ve 3D masa ile ortaktır.

### Jeton paneli

Bir jetona tıklayınca sağda onun paneli açılır:

- **Hit** ve **Heal:** kutuya yazdığın kadar hasar verir ya da iyileştirir.
- **Size:** jetonu 1×, 2× ya da 3× büyüklükte yapar.
- **Hide:** jetonu oyunculardan gizler (DM).
- **Elevation:** jetonun yüksekliği (uçan yaratıklar için).
- **Conditions:** *kör*, *zehirli*, *sersem* gibi durum rozetleri.
- **Token art:** jetonun resmi. Bir 5e canavar adı yazabilir ya da kendi resmini yükleyebilirsin.
- **GM Notes:** yalnızca DM'in gördüğü notlar (gizli AC, direnç, taktik).
- **Remove from map:** jetonu haritadan kaldırır.

Panel **Close** ile kapanır.

![Jeton paneli](/help-media/img/dnd-jeton-paneli.webp "Harita: The Lich's Tomb, mbround18/vtt-maps, CC BY-SA 4.0")

::video dnd-jeton-sis | Zombiyi koridora taşımak, 6 hasar vermek, koridoru sisle örtmek ve bir kısmını açmak (harita: The Lich's Tomb, mbround18/vtt-maps, CC BY-SA 4.0)

**Savaş sisi**, DM'in ekranında yarı saydam görünür; oyuncuların ve ortak ekranın gördüğü haritada ise simsiyahtır. Oyuncular sisin altını göremez.

### Haritalar ve ızgara (DM)

**Maps & Grid** paneli:

- **Active Map Settings:** Izgara türü (**Square Grid**, **Hex Grid**, **No Grid**), sütun sayısı, bir karenin kaç feet olduğu ve ızgaranın kaydırılması. **Bard Audio Cue on Show** kutusuna `combat` gibi bir ruh hâli ya da sahne adı yazarsan harita gösterildiğinde müzik ona geçer. **Save Grid & Scene** ile kaydet.
- **All Maps:** Kayıtlı haritalar. **Show** bir haritayı herkese gösterir, çöp kutusu siler. Hazır sekiz harita gelir: han, kamp, cüce ocağı, nehir kapısı, korsan koyu, ayı mağarası, dağ kasabası ve lich mezarı.
- **Yeni harita:** Bir ad ver, sonra iki yoldan birini seç:
  - **Upload an image** ile kendi görselini yükle.
  - **Blank battlefield** ile hazır bir zemin seç (**Dungeon**, **Forest**, **Tavern**, **Cave**, **Snow**) ve **Create and show**'a bas.

![Haritalar ve ızgara](/help-media/img/dnd-haritalar.webp "Harita: River Gatehouse, mbround18/vtt-maps, CC BY-SA 4.0")

**Import** başka programlarda hazırlanmış haritaları yükler: Universal VTT (`.dd2vtt`, duvarları, kapıları ve ışıklarıyla), Tiled (`.tmj`), Azgaar ve Watabou haritaları. **AI Encounter** ise kısa bir tarifle ("gece ağaçların arasından goblin pususu" gibi) bir karşılaşma kurar: canavarları, taktikleri ve ganimeti hazırlar.

Sağdaki **Props** sekmesi haritadaki nesneleri, **Mapmaker** sekmesi arazi ve duvar ayarlarını içerir.

## Dünya haritası

**World** sayfası kıtanın haritasıdır. Karakterler bu haritada şehirden şehre yolculuk eder.

- **Put Lira on the map** karakterini haritaya koyar. Haritada bir yere tıklarsan karakterin oraya yürür; herkes yürüyüşü canlı görür.
- Bir şehre tıklayınca bilgisi açılır:
  - **Enter:** şehre girer.
  - **Travel here:** karakterini oraya yürütür.

  Bir şehre çift tıklamak doğrudan içine girer.
- Şehrin içinde handı, dükkânları, tapınağı gibi yerler listelenir. **Back to world** ile dünyaya dönersin.
- **Where's the party** paneli kimin nerede olduğunu gösterir. Cetvel aracı mesafeyi mil olarak ölçer.

::video dnd-dunya | Lira'yı haritaya koymak, yürütmek ve Thornwood köyüne girmek (harita: Map of Elindrafel, Wikimedia Commons, CC BY-SA 4.0)

![Dünya haritası](/help-media/img/dnd-dunya-haritasi.webp "Map of Elindrafel, Wikimedia Commons, CC BY-SA 4.0")

DM için ek düğmeler:

- **Edit pins:** şehir, han, dükkân, zindan, NPC, canavar yuvası ve görev işaretleri ekler. İşaretleri sürükleyerek taşır, tıklayarak adını ve açıklamasını değiştirirsin.
- **World Maps:** başka bir dünya haritası seçer ya da yükler.
- **AI Populate:** haritaya yapay zekâyla yerler ekler.
- **Cast World:** dünya haritasını ortak ekrana gönderir.

## Compendium: kurallar ansiklopedisi

**Compendium** sayfasının iki bölümü var.

- **Browse:** Büyüleri (**Spells**), canavarları (**Monsters**), eşyaları (**Items**), sınıfları, alt sınıfları, türleri ve yetenekleri (**Feats**) arar.
  - Üstteki **5e / 3.5e** düğmesi kural sürümünü değiştirir.
  - Bir büyünün sayfasındaki **Learn with Lira** düğmesi o büyüyü karakterine ekler.
- **Oracle:** Yapay zekâ destekli DM yardımcısı (aşağıda).

![Compendium'da Fireball büyüsü](/help-media/img/dnd-compendium.webp)

## Oracle: yapay zekâ DM yardımcısı

Oracle, oyunun o anki durumunu bilir: açık haritayı, inisiyatif sırasını, dünyayı ve kampanya notlarını. Ona dört şekilde ulaşırsın:

- Her sayfanın sağ altındaki **Oracle** düğmesinden,
- ya da **Compendium → Oracle** bölümündeki dört sekmeden:
  - **Co-DM Chat:** Kurallar (**Rules**), hikâye (**Story & RP**), taktik (**Tactics**) ya da yüksek sesle okunacak anlatım (**Read-Aloud**) için soru sor. Hazır örnek sorular da vardır.
  - **Quick Generators:** Hızlıca bir NPC, bir han, ganimet ya da anlatım metni üretir.
  - **Art & Map Forge:** Sahne resmi, savaş haritası, dünya haritası, karakter portresi ya da haritaya konacak saydam nesne çizer. Üretilen harita doğrudan masaya konabilir.
  - **Campaign Lorebook:** Kampanyanın notları. Kişiler, yerler, sırlar ve ipuçları buraya yazılır. Oracle bu notları kendiliğinden okur; **GM Secret** olarak işaretlenenleri oyuncular görmez.

![Oracle](/help-media/img/dnd-oracle.webp)

Oracle'ın çalışması için bir yapay zekâ anahtarı gerekir: Gemini, DeepSeek ya da OpenAI uyumlu bir servis. Anahtar sol alttaki dişli düğmesinden, **Settings → AI assistant** bölümünde girilir. Sunucuda zaten bir anahtar tanımlıysa ayrıca girmen gerekmez.

## Bard: müzik ve ses efektleri

**Bard** sayfası masanın müziğini, ortam seslerini ve efektlerini yönetir. **Listen here**'a basan herkes aynı şeyi duyar. Sol alttaki **Listen to the table** düğmesi de dinlemeyi her sayfadan açıp kapatır.

![Bard](/help-media/img/dnd-bard.webp)

- **Scenes:** Han, zindan, orman, ejderha ini gibi yirmi hazır sahne. Her sahnenin kendi ortam sesleri ve üç müzik listesi vardır.
- Müzik listeleri üç ruh hâline göredir: **Explore** (keşif), **Combat** (savaş) ve **Victory** (zafer).
- **Follow initiative** açıkken müzik kendiliğinden değişir: ilk inisiyatif atışında savaş müziğine geçer, savaş bitince bir süre zafer müziği çalar, sonra keşfe döner.
- **Intensity** yalnızca müziğin sesini, **Table** herkesin duyduğu toplam sesi ayarlar. **Stop all** her şeyi durdurur.
- Ortam sesleri katman katman eklenir (en fazla 8), her birinin kendi ses düğmesi vardır. Silah, büyü, darbe gibi efektler tek tıkla çalar; doğal 20, büyük hasar ya da bir canavarın düşmesi gibi olaylar da efektleri kendiliğinden tetikler.

Bard'ı Hoffle'daki ses odasına da getirebilirsin: odadayken `/bard join` yaz. Böylece odadaki herkes müziği sesli sohbetin içinde duyar. `/bard leave` ile gönderirsin; oda boşalınca bir dakika sonra kendiliğinden ayrılır.

## Party: grubun özeti (DM)

**Game Master → Party** sayfası masadaki herkesi bir arada gösterir:

- Üstte kahraman sayısı, ortalama seviye, grubun toplam canı ve düşenlerin sayısı.
- Her karakter kartında can, zırh, inisiyatif, pasif algı, hız, büyü yuvaları ve karakterin dünya haritasında nerede olduğu.
- Kartlardaki **Damage** ve **Heal** düğmeleri hasar ve iyileşme işler. **Level** karakteri bir seviye atlatır.
- Diğer düğmeler:
  - **Roll initiative for all:** herkes için inisiyatif atar.
  - **Lorebook & Recap:** kampanya notlarını açar; son zarlardan, savaşlardan ve notlardan bir oturum özeti çıkarır.
  - **Playing now / All characters:** yalnızca oynayanları ya da bütün karakterleri gösterir.

![Party sayfası](/help-media/img/dnd-party.webp)

## iPad ve ortak ekran

Savaş haritasındaki ya da dünya haritasındaki **2nd Screen** düğmesi **iPad Companion & 2nd Screen** penceresini açar. İki sekmesi var.

**iPad / Apple Pencil VTT (Your Session):**

- QR kodu iPad'in kamerasıyla okut. Tavern, savaş haritası açık ve Apple Pencil hazır olarak açılır.
- Safari'de **Paylaş → Ana Ekrana Ekle** dersen bir uygulama gibi açılır.
- Bu bağlantı senin kendi oturumundur, kimseyle paylaşma.

![iPad bağlantısı](/help-media/img/dnd-ikinci-ekran.webp)

**TV / Shared Display:**

- Bu bağlantıyı masadaki televizyonda, projeksiyonda ya da oyuncuların tabletinde aç.
- DM'in sırlarını göstermez ve savaş sisi orada tamamen kapalıdır.
- Bağlantı sızarsa **Rotate link** ile yenile.

![TV bağlantısı](/help-media/img/dnd-tv-ekrani.webp)

Aynı penceredeki diğer ayarlar:

- **Live sync:** ortak ekranın hangi haritayı göstereceğini seçer (**Show Battle Map** / **Show World Map**). **Follow GM zoom & pan** açıksa ekran, DM nereye bakıyorsa oraya bakar.
- **Push Handout / Clue:** oyunculara bir ipucu gösterir. Bir başlık, istersen bir resim adresi ve metin yaz, sonra **Show on 2nd screen**'e bas. Ortak ekranda haritanın önünde bir kart olarak çıkar. **Dismiss handout** ile kaldırırsın.

![Ortak ekranda bir ipucu kartı](/help-media/img/dnd-tv-ipucu.webp)

Ortak ekranın altındaki düğmeler:

- **Auto:** DM'i takip eder.
- **Battle** ve **World:** haritalardan birini sabitler.
- **Free Pan:** ekranda serbestçe gezmeni sağlar.
- **Full VTT:** tam Tavern'e geçer.

Hoffle'ın kendi ikinci ekranı da Tavern'i bir bölmede gösterebilir: [İkinci ekran](/help/ikinci-ekran).

## Hoffle masasıyla bağlantı

Tavern ile Hoffle aynı oyunu oynar:

- **Karakterler:** Hoffle'da bir ses odasının masasına oturunca etkin karakterin masadaki karakter kartın olur. Kâğıttaki değişiklikler masaya yansır. Masada değiştirdiğin can ve harcadığın büyü yuvaları da kâğıda geri döner.
- **Zarlar:** Tavern'de attığın zar masada senin yerinden atılır. Masada `/roll` ile attığın zar da Tavern'in masa kaydına düşer.
- **Jetonlar:** Tavern haritasındaki her jeton 3D masada bir piyondur. Birini koymak, taşımak, yaralamak ya da kaldırmak öbür tarafta da aynısını yapar.
- **İnisiyatif:** Tavern'in, Discord'un, Hoffle'ın `/initiative` komutunun ve 3D masanın sırası tek bir listedir.
- **DM ekranı:** Tavern'deki DM, masadaki DM ekranını da alır.

Masa düzeni ve DM koltuğu için [D&D ve masa oyunları](/help/dnd#masa-düzeni-ve-dm-koltuğu) bölümüne bak.

## Ayarlar

Sol alttaki dişli düğmesi Tavern'in ayarlarını açar:

- **Theme:** açık ya da koyu görünüm.
- **AI assistant:** Oracle'ın kullanacağı servis (Gemini, DeepSeek ya da OpenAI uyumlu bir adres) ve anahtarın.
- **Discord log channel:** Web'de atılan zarların ve can değişikliklerinin yazılacağı Discord kanalı (DM).
- **Music bot:** Müzik botuna şarkı gönderme.

Aynı yerden çıkış yapabilir, hangi hesapla ve DM mi oyuncu mu olarak girdiğini görebilirsin.
