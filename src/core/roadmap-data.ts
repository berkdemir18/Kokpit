/**
 * Berk'in SOC Analisti yol haritası — "OPERASYON: SOC" sayfasından alındı.
 * Kaynak: masaüstündeki index.html (2026-08-03). İçerik Berk'e özel.
 */

export interface SeedTask {
  when: string;
  title: string;
  note: string;
  tags: string[];
}

export interface SeedPhase {
  code: string;
  title: string;
  when: string;
  goal: string;
  tasks: SeedTask[];
}

export const ROADMAP: SeedPhase[] = [
  {
    code: 'FAZ 0',
    title: 'Temel kazma — bilgisayarı "kullanan" değil "anlayan" olmak',
    when: 'AĞU–EYL 2026 · ~6 HAFTA',
    goal: 'Bu faz siber güvenlik öğrenmek değil . Altyapı atmak. Atlarsan sonraki her şey çöker. Günde 1.5–2 saat, haftada 5 gün. Toplam ~60 saat.',
    tasks: [
      { when: 'Hafta 1-2', title: 'VirtualBox + Ubuntu Desktop kur', note: 'Kurulum 20 dakikalık iş. Bundan sonra günlük işlerin bir kısmını orada yap.', tags: ['ÜCRETSİZ'] },
      { when: 'Hafta 1-2', title: '25 temel Linux komutunu kas hafızasına al', note: 'ls, cd, pwd, mkdir, rm, cp, mv, cat, less, head, tail, grep, find, chmod, chown, sudo, apt, ps, top, kill, df, du, nano, wget, curl — ezber değil, kullanarak.', tags: [] },
      { when: 'Hafta 1-2', title: 'OverTheWire — Bandit, seviye 0–15', note: 'Oyun formatında Linux öğretir. Tek başına en verimli kaynak. Ölçü: bir dosyayı fare kullanmadan bulup içinde kelime aratabiliyorsan tamam.', tags: ['ÜCRETSİZ'] },
      { when: 'Hafta 3-4', title: 'BTK Akademi — Siber Güvenliğe Giriş (Temel Seviye)', note: 'Türkçe, e-Devlet onaylı sertifika. Kavramları oturtur.', tags: ['ÜCRETSİZ'] },
      { when: 'Hafta 3-4', title: 'Ağ temellerinde şu 6 soruya cevap verebil', note: '1) IP nedir, public/private farkı? 2) Port nedir, 80/443/22/53 hangileri? 3) DNS tam olarak ne yapar? 4) TCP vs UDP? 5) HTTP isteği neye benzer? 6) Bir siteye girdiğimde arka planda sırayla ne olur? — Pratik: ping, nslookup, traceroute, netstat komutlarını kendi internetinde dene.', tags: ['KRİTİK'] },
      { when: 'Hafta 5-6', title: 'Python temeli — Kaggle Python kursu veya BTK Python', note: 'Sadece şunlar: değişken, if/else, döngü, liste, dictionary, fonksiyon, dosya okuma/yazma. Fazlası şimdilik gereksiz.', tags: ['ÜCRETSİZ'] },
      { when: 'Hafta 6', title: 'Bitirme projesi: log filtreleyen script', note: 'Bir metin dosyasını okuyup içinde "ERROR" geçen satırları ayrı dosyaya yazan ~20 satırlık Python. Bunu tek başına yazabiliyorsan Faz 0 kapandı.', tags: ['KRİTİK'] },
    ],
  },
  {
    code: 'FAZ 1',
    title: 'Sektöre ilk temas + ilk uluslararası sertifikalar',
    when: 'EKİ 2026 – OCA 2027 · 1. SINIF GÜZ',
    goal: 'Okul başladı, dersler var. Realist ol: günde 1 saat, haftada 5 gün. Az ama kesintisiz, çok ama düzensizden iyidir.',
    tasks: [
      { when: 'EKİM', title: 'Siber Vatan 2027 başvurusu', note: 'Haftada bir sibervatan.org kontrol. Seçilirsen 30 günlük online eğitim boyunca diğer her şeyi bırak, ona odaklan.', tags: ['EN ÖNCELİKLİ'] },
      { when: 'EKİ-KAS', title: 'TryHackMe — "Pre Security" yolu', note: '~20 saat. Ağ, Linux, Windows temelleri, web nasıl çalışır.', tags: ['ÜCRETSİZ'] },
      { when: 'KAS-ARA', title: 'TryHackMe — "Complete Beginner" yolu', note: '~40 saat. Burada ilk kez gerçek makine çözmeye başlarsın.', tags: ['ÜCRETSİZ'] },
      { when: 'SÜREKLİ', title: 'Her odadan sonra 3 cümlelik not yaz', note: 'Obsidian vault\'unda "Siber Güvenlik" klasörü aç. Yazmadığın şeyi öğrenmiş sayılmazsın. Bu aynı zamanda ileride CV/portfolyo malzemen olur.', tags: ['ALIŞKANLIK'] },
      { when: 'OCAK', title: 'Cisco NetAcad — Introduction to Cybersecurity', note: '~15 saat, sertifikalı, uluslararası tanınıyor. CV\'de BTK\'dan daha ciddi durur.', tags: ['ÜCRETSİZ'] },
      { when: 'OCAK', title: 'Cisco NetAcad — Networking Basics', note: '~30 saat, daha ağır. Ağ bilgini sağlamlaştırır — SOC işinin yarısı ağ trafiği okumak.', tags: ['ÜCRETSİZ'] },
    ],
  },
  {
    code: 'FAZ 2',
    title: 'Uzmanlaşma — Blue Team\'e giriş ve kendi lab\'ın',
    when: 'ŞUB – HAZ 2027 · 1. SINIF BAHAR',
    goal: 'Bu dönem artık "kurs izleyen" değil "iş yapan" oluyorsun. Oran: %30 izle, %70 elini kirlet.',
    tasks: [
      { when: 'TryHackMe — "SOC Level 1" yolu', title: '', note: 'Ayda bir Hot Wheels almazsan çıkar. Bu yatırıma değer. İçerik: log analizi, SIEM (Splunk), Wireshark, phishing analizi, Windows Event Log.', tags: ['~$14/AY'] },
      { when: 'KENDİ LAB\'INI KUR', title: '', note: 'VirtualBox\'ta 3 makine: Kali (saldırgan) + Windows 10 (kurban) + Ubuntu üstünde Wazuh (SIEM). Saldır, sonra log\'da o saldırıyı bul. Bu tek egzersiz 10 sertifikadan değerli. Ryzen 5 3600 + 16GB RAM ile 2 makineyi aynı anda rahat kaldırırsın; 3\'ü zorlarsa RAM upgrade\'ini öne al.', tags: ['EN DEĞERLİ İŞ'] },
      { when: 'BTK Akademi — Siber Güvenlik Analisti', title: '', note: 'Log kaynakları, SIEM, kurumsal siber savunma, hata matrisi, OSINT araçları işliyor. Tam bu döneme uygun, üstelik Türkçe.', tags: ['ÜCRETSİZ'] },
      { when: 'Google Cybersecurity Certificate (Coursera)', title: '', note: 'Normalde paralı ama Coursera\'nın Financial Aid formu var — dolduruyorsun, ~15 gün bekliyorsun, öğrenciler genelde onaylanıyor. 6 ay sürüyor, bu dönem başlat ki yaza yetişsin.', tags: ['FINANCIAL AID İLE ÜCRETSİZ'] },
      { when: 'Okulda siber güvenlik topluluğuna katıl / kur', title: '', note: 'Tek başına CTF\'e girmek zor. OSTİM\'de yoksa kurmak CV\'nde "kurucu" olarak durur.', tags: [] },
    ],
  },
  {
    code: 'FAZ 3',
    title: 'Kritik yaz — sektöre fiziksel giriş',
    when: 'HAZ – EYL 2027 · 1. SINIF SONU YAZ',
    goal: 'Bu yazı boş geçirirsen tam bir yıl kaybedersin. Diğer öğrenciler 3. sınıfta staj arıyor; sen 1. sınıf sonunda arayarak iki yıl öne geçiyorsun.',
    tasks: [
      { when: 'TÜBİTAK BİLGEM Siber Güvenlik Yaz Kampı', title: '', note: 'Üniversite öğrencilerine açık, seçmeli, Gebze\'de. Başvurular genelde nisan-mayıs açılıyor — mart\'tan itibaren takip et. Girersen CV\'nde parlar.', tags: ['ÜCRETSİZ'] },
      { when: 'Ankara staj taraması başlat', title: '', note: 'Aşağıdaki "STAJ HARİTASI" bölümüne bak. 1. sınıfta çoğu yerde resmî staj alamazsın ama "gönüllü/part-time öğrenmek istiyorum" diyene kimse hayır demiyor.', tags: ['KRİTİK'] },
      { when: 'İlk CTF\'ine gir', title: '', note: 'Kazanmak amaç değil, "girdim" demek amaç. CTFtime.org\'dan başlangıç seviyesi yarışmalar seçilebilir.', tags: [] },
      { when: 'GitHub profilini kur', title: '', note: 'Faz 0\'daki log script\'in + lab kurulum notların + TryHackMe writeup\'ların. Boş GitHub, GitHub yok demektir.', tags: [] },
    ],
  },
  {
    code: 'FAZ 4',
    title: 'Para harcama zamanı — sektör sertifikaları ve ilk iş',
    when: '2027–2030 · 2. SINIF VE SONRASI',
    goal: 'Buradan sonra ücretsizin sınırı biter. Kabul et ve bütçe ayır. İyi haber: bu noktada zaten part-time çalışıyor olabilirsin.',
    tasks: [
      { when: '2. SINIF', title: 'CompTIA Security+', note: 'Ücretsiz alternatifi yok. Sektörde giriş bileti, İK filtresini geçirir. 2. sınıf sonuna kadar biriktir.', tags: ['~$400'] },
      { when: '2-3. SINIF', title: 'Blue Team Level 1 (BTL1)', note: 'Security+\'tan daha pratik, tamamen uygulamalı, 24 saatlik gerçek incident response sınavı var. Blue Team gidiyorsan bu daha değerli.', tags: ['~$500'] },
      { when: '3. SINIF', title: 'Zorunlu staj — hedef büyük kurum', note: 'Artık 3. sınıf şartı olan yerlere de başvurabilirsin (SnipeSec vb. 3-4. sınıf istiyor).', tags: [] },
      { when: '3-4. SINIF', title: 'İlk iş: SOC L1 Analisti', note: 'Part-time / uzun dönem staj üzerinden geçiş en yaygın yol. Mezuniyeti beklemene gerek yok.', tags: [] },
      { when: '4. SINIF', title: 'Bitirme projeni güvenlik üzerine yap', note: 'YBS bölümünde bunu "bilgi güvenliği yönetim sistemi" gibi bir başlıkla yapabilirsin — hem bölüme uyar hem alanına.', tags: [] },
    ],
  },
  {
    code: 'EN',
    title: '6 aylık İngilizce protokolü — günde ekstra 20 dk',
    when: 'FAZ 0 İLE PARALEL',
    goal: '',
    tasks: [
      { when: 'Katman 1 · Teknik kelime', title: '— Anki', note: 'Ücretsiz. TryHackMe/dokümanda takıldığın her kelimeyi karta ekle. Günde 15 kart tekrar, 5 dakika. Genel İngilizce kelime listesi ezberleme — sadece işine yarayanı topla. 6 ayda ~600 teknik kelime birikir, bu alanın %90\'ını kapsar.', tags: [] },
      { when: 'Katman 2 · Pasif input', title: '— Mr. Robot\'a İngilizce altyazı', note: 'Zaten izliyorsun (S1E7). Türkçe altyazıyı kapat, İngilizce altyazı aç. İlk 2 bölüm işkence, sonra alışırsın. Bonus: dizinin teknik terimleri birebir senin alanın.', tags: [] },
      { when: 'Katman 3 · Aktif output', title: '— writeup\'ları İngilizce yaz', note: 'Her TryHackMe odasından sonra 3 cümlelik özeti İngilizce yaz. Kısa, kötü, hatalı olsun — önemli değil. Üretmek tüketmekten 5 kat hızlı öğretir. 6 ay sonra bunlar GitHub\'ında bir portfolyo olur, çift kazanç.', tags: ['EN ETKİLİ'] },
      { when: 'Gramer boşluğu için', title: '— sadece bir kaynak seç', note: 'Duolingo değil (oyunlaştırma seni B1\'de tutar). English Grammar in Use (Murphy) veya BBC Learning English. Haftada 2 ünite, fazlası değil. Gramer takıntısı yapma, alanında gramer hatası kimsenin umurunda değil.', tags: [] },
      { when: 'Konuşma', title: '— 2. sınıfta başlar, şimdi değil', note: 'Ücretsiz yollar: siber güvenlik Discord sunucuları (yazılı başlar, sesli devam eder), HelloTalk/Tandem. Ücretli konuşma dersine para vermeden önce TryHackMe aboneliğine ver.', tags: [] },
      { when: 'Ölçüm', title: '— EF SET (ücretsiz, 50 dk, sertifikalı)', note: 'Şimdi bir kere gir, seviyeni öğren. 6 ay sonra tekrar gir. İlerlemeyi ölçmezsen ilerleme hissi kaybolur ve bırakırsın — senin bilinen zayıf noktan bu.', tags: [] },
    ],
  },
  {
    code: 'TAKTİK',
    title: 'Nasıl başvurulur — 1. sınıf öğrencisi olarak',
    when: 'SÜREKLİ',
    goal: '',
    tasks: [
      { when: 'LinkedIn profilini bugün aç', title: '', note: 'Fotoğraf + "Yönetim Bilişim Sistemleri öğrencisi | Siber güvenlik" başlığı + tamamladığın sertifikalar. Türkiye\'de staj bulmanın %60\'ı LinkedIn üzerinden yürüyor. Şirketlerin İK\'larını takip et, ilanları oradan düşer.', tags: [] },
      { when: 'Soğuk e-posta at — ama doğru şekilde', title: '', note: '"Staj arıyorum" yazma, çöpe gider. Şunu yaz: kendi kurduğun lab\'ı 2 cümleyle anlat, GitHub linkini ver, "maaş beklemiyorum, yaz boyunca yanınızda öğrenmek istiyorum" de. Küçük firmalarda dönüş oranı şaşırtıcı yüksek.', tags: [] },
      { when: 'Takip kanalları', title: '', note: 'kariyer.net + LinkedIn Jobs + siberkume.org.tr + şirketlerin kendi kariyer sayfaları + youthall/Toptalent gibi staj platformları. Haftada bir tarama yap, bildirim kur.', tags: [] },
      { when: 'Zamanlama', title: '', note: 'Yaz stajı başvuruları Şubat–Nisan arası açılır. Haziran\'da başvurmaya kalkarsan her yer dolu olur. Şubat\'ta hazır ol.', tags: [] },
    ],
  },
];
