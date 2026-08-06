/**
 * İlk kurulumda Siber ekranına konulan **örnek** yol haritası.
 *
 * Burası kasten genel tutulmuştur — kendi planını uygulamanın içinden
 * (Siber → faz/görev ekle) yazabilir ya da bu dosyayı kendi fazlarınla
 * değiştirip yeniden derleyebilirsin. Veri `data.json`'a bir kez tohumlanır;
 * sonrasında bu dosyayı değiştirmek mevcut veriye dokunmaz.
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
    title: 'Temel — bilgisayarı kullanan değil anlayan olmak',
    when: '~6 HAFTA',
    goal: 'Bu faz alan bilgisi değil, altyapı. Atlanırsa sonraki her şey üstüne oturmaz.',
    tasks: [
      { when: 'Hafta 1-2', title: 'Sanal makine kur ve bir Linux dağıtımı çalıştır', note: 'Günlük işlerin bir kısmını orada yapmaya başla.', tags: [] },
      { when: 'Hafta 1-2', title: 'Temel komut satırı kullanımını kas hafızasına al', note: 'Dosya gezinme, arama, izinler, paket yönetimi, süreçler. Ezber değil, kullanarak.', tags: [] },
      { when: 'Hafta 3-4', title: 'Ağ temelleri', note: 'IP, port, DNS, TCP/UDP, HTTP isteğinin akışı. Ölçü: bir siteye girdiğinde arka planda sırayla ne olduğunu anlatabilmek.', tags: ['KRİTİK'] },
      { when: 'Hafta 5-6', title: 'Bir betik diline giriş', note: 'Değişken, koşul, döngü, liste, sözlük, fonksiyon, dosya okuma/yazma. Fazlası şimdilik gereksiz.', tags: [] },
      { when: 'Hafta 6', title: 'Bitirme projesi: küçük bir otomasyon betiği', note: 'Bir dosyayı okuyup filtreleyen ~20 satırlık bir betiği tek başına yazabiliyorsan bu faz kapandı.', tags: ['KRİTİK'] },
    ],
  },
  {
    code: 'FAZ 1',
    title: 'İlk temas — düzenli pratik ve ilk sertifikalar',
    when: '~4 AY',
    goal: 'Realist ol: günde 1 saat, haftada 5 gün. Az ama kesintisiz, çok ama düzensizden iyidir.',
    tasks: [
      { when: 'Ay 1-2', title: 'Başlangıç seviyesi bir öğrenme yolu bitir', note: 'Uçtan uca bir müfredat seç ve yarıda bırakma.', tags: [] },
      { when: 'Ay 3-4', title: 'İlk pratik alıştırmaları çöz', note: 'İzlemekten uygulamaya geçtiğin nokta burası.', tags: [] },
      { when: 'SÜREKLİ', title: 'Her oturumdan sonra 3 cümlelik not yaz', note: 'Yazmadığın şeyi öğrenmiş sayılmazsın. Bu notlar ileride portfolyo malzemesi olur.', tags: ['ALIŞKANLIK'] },
      { when: 'Ay 4', title: 'Ücretsiz bir giriş sertifikası al', note: 'CV\'de somut bir çıktı bırakır.', tags: [] },
    ],
  },
  {
    code: 'FAZ 2',
    title: 'Uzmanlaşma — kendi lab ortamın',
    when: '~5 AY',
    goal: 'Artık "kurs izleyen" değil "iş yapan" olma dönemi. Oran: %30 izle, %70 elini kirlet.',
    tasks: [
      { when: 'LAB KUR', title: 'Kendi test ortamını ayağa kaldır', note: 'Birkaç sanal makineyi birbirine bağla, senaryo çalış, sonucu kendi kayıtlarından doğrula. Bu tek egzersiz onlarca sertifikadan değerli.', tags: ['EN DEĞERLİ İŞ'] },
      { when: 'SÜREKLİ', title: 'Yaptıklarını yaz ve yayınla', note: 'Kısa, sade, düzenli. Boş bir profil, profil yok demektir.', tags: [] },
      { when: 'DÖNEM SONU', title: 'Bir topluluğa katıl', note: 'Tek başına ilerlemek zor; soru sorabileceğin bir yer bul.', tags: [] },
    ],
  },
  {
    code: 'FAZ 3',
    title: 'Sektöre giriş',
    when: 'UZUN VADE',
    goal: 'Buradan sonra ücretsizin sınırı biter. Kabul et ve bütçe ayır.',
    tasks: [
      { when: 'ADIM 1', title: 'Sektörde tanınan bir sertifika hedefle', note: 'İK filtresini geçiren giriş bileti.', tags: [] },
      { when: 'ADIM 2', title: 'Staj / part-time başvurularını başlat', note: 'Başvuru dönemleri erken açılır; hazır olmak için son aya bırakma.', tags: ['KRİTİK'] },
      { when: 'ADIM 3', title: 'Portfolyonu düzenle', note: 'Projeler, notlar ve sertifikalar tek yerde toplansın.', tags: [] },
    ],
  },
];
