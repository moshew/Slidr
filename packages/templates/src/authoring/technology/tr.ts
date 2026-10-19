import type { TechnologyCopies } from './copy';

export const tr: TechnologyCopies = {
  anan: {
    footer: 'Nativ Pay · Mimari incelemesi',
    hero: [
      'Ödemeler artık',
      '3 bölgede',
      'Ödeme çekirdeği, kesinti olmadan üç etkin bölgeye taşınıyor.',
    ],
    section: ['Tek bir bölge', 'Oradaki bir arıza tüm ödemeleri durduruyordu.'],
    agenda: {
      title: 'Bugün neleri ele alacağız?',
      lead: [
        'Ödeme çekirdeğimiz için tek bölgenin neden yetersiz kaldığını konuşacağız.',
        'Ardından, üç etkin bölgeye kesintisiz geçişin nasıl yapıldığını göreceğiz.',
      ],
      points: [
        ['Gerekçe: ', 'Tek bir arıza bütün ödemeleri durduruyordu.'],
        ['Mimari: ', 'Her bölge tüm yükü tek başına taşıyabiliyor.'],
        ['Geçiş: ', 'Aralık ayında geri alınabilir dört aşama.'],
        ['Sonuçlar: ', 'Erişilebilirlik, p95 gecikmesi ve aylık maliyet.'],
      ],
    },
    figures: {
      title: '90 gün, sıfır duruş',
      subtitle: 'Geçiş sırasında hizmet kesintisi, dakika',
      labels: ['Taşınan hizmet sayısı', 'p95 gecikmesindeki değişim', 'Aynı anda etkin bölge'],
      body: '90 günde yedi dakikadan az kısmi hizmet kaybı.',
    },
    features: {
      title: 'Üç bölge, tek çekirdek',
      heads: ['Her zaman etkin', 'Eşzamanlı tek kayıt', 'Sağlığa göre yönlendirme'],
      bodies: [
        'Her bölge gerçek ödemeleri işler.',
        'Her ödeme önce iki bölgede kaydedilir.',
        'İstek, en yakın sağlıklı bölgeye gider.',
      ],
    },
    timeline: {
      title: 'Dört aşama, sıfır kesinti',
      heads: ['İç deneme', 'İlk işletmeler', 'Trafiğin yarısı', 'Herkes'],
      bodies: [
        '1 Aralık: çalışanlar, otomatik geri dönüş.',
        '8 Aralık: gönüllü 2.000 işletme.',
        '15 Aralık: yükün %50’si yeni bölgelerde.',
        '22 Aralık: eski bölge artık üç bölgeden biri.',
      ],
    },
    process: {
      title: 'Bir ödemenin 180 ms süren yolu',
      steps: ['Uç ağ', 'Yük dengeleyici', 'Hizmet', 'Kayıt defteri', 'Çoğaltma'],
    },
    comparison: {
      title: 'Bir bölgeden üç bölgeye',
      before: 'Tek bölge, soğuk yedek',
      after: 'Üç etkin bölge',
      old: [
        'Elle geçiş: dört saat',
        'Yedek gerçek trafik almıyordu',
        'Tek arıza tüm ödemeleri durduruyordu',
      ],
      next: [
        'Arızalı bölge 30 sn içinde devre dışı',
        'Her bölge gerçek trafik taşıyor',
        'Arıza en fazla üçte birini etkiliyor',
      ],
    },
    chart: {
      title: 'Milisaniye cinsinden p95 gecikmesi',
      note: 'Uç ağda ölçüldü, Temmuz–Aralık 2026.',
      series: 'p95',
      body: [
        'Yakın bölgeler sayesinde gecikmede %38 düşüş.',
        'Milyon ödeme başına maliyette %21 düşüş.',
      ],
    },
    table: {
      title: 'Sayılarla üç bölge',
      note: '10 Ocak 2027 itibarıyla 30 günlük ortalamalar.',
      headers: ['Bölge', 'Konum', 'Trafik payı', 'p95', 'Erişilebilirlik'],
      labels: ['Tel Aviv', 'Frankfurt', 'İrlanda', 'Üç bölge', 'Toplam'],
    },
    photo: [
      'Üç bölge, 42 hizmet,',
      'tek harita',
      'Her hizmet her bölgede çalışır. Her bölge tüm yükü taşıyabilir.',
    ],
    quote: [
      'Geçiş gecesi grafiklere bakıp bir şey olmasını bekledik. Hiçbir şey olmadı. Zaten amacımız buydu.',
      'Geçiş gecesi nöbetçi SRE',
    ],
    team: {
      title: 'Geçişi gerçekleştiren ekip',
      bios: [
        'Üç bölgeye geçişi yönetti.',
        'Kılavuzları ve otomatik geri dönüşü yazdı.',
        'Ortak kayıt defterini eşzamanlı tuttu.',
        'Sağlığa göre yönlendirmeyi kurdu.',
      ],
      roles: ['Platform lideri', 'Güvenilirlik', 'Veri', 'Ağ'],
    },
    closing: {
      title: ['Çok', 'teşekkürler!'],
      lines: [
        'Geçiş kılavuzu tüm ekiplere açık.',
        'Gelecek çeyrek: Kuzey Amerika’da dördüncü bölge.',
        'Sorularınızı veriler üzerinden yanıtlayabiliriz.',
      ],
    },
  },
  shvav: {
    footer: 'Zrima Labs · WM-10 · EVT incelemesi',
    hero: ['On yıl,', 'tek pil', 'WM-10 akıllı su sayacı: prototipten üretime.'],
    section: ['Güç bütçesi', 'Her mikroamper, on yıl boyunca önemli.'],
    agenda: {
      title: 'Bu incelemenin soruları',
      lead: [
        'Nisanda DVT’ye geçişi dört ölçülebilir yanıt belirleyecek.',
        'Her sorunun ekip içinde bir sorumlusu var.',
      ],
      points: [
        ['Enerji: ', 'Tek pil, soğukta bile on yıl dayanır mı?'],
        ['Maliyet: ', '10.000 adetlik siparişte bir kartın bedeli.'],
        ['Saha: ', 'Ocaktan beri çalışan 60 sayacın öğrettikleri.'],
        ['Üretim: ', 'İlk siparişten önce tamamlanacak işler.'],
      ],
    },
    figures: {
      title: 'Akım nereye gidiyor?',
      subtitle: 'Bir tam günün ortalama akım tüketimi',
      labels: ['Derin uyku akımı', 'Tek AA lityum pil', 'Güvenlik payıyla pil ömrü, yıl'],
      body: '15 dakikada bir ölçüm, günde bir kablosuz iletim.',
    },
    features: {
      title: 'Üç parça, tek bütçe',
      heads: ['Uyuyan işlemci', 'Günde bir iletim', 'Temassız ölçüm'],
      bodies: [
        '40 ms uyanır, ölçer ve yeniden uyur.',
        'Günde bir mesaj, 1,2 sn yayın.',
        'Aşınan parça olmadan ultrasonik ölçüm.',
      ],
    },
    timeline: {
      title: 'EVT’den seri üretime',
      heads: ['Mühendislik örneği', 'Tasarım doğrulama', 'Üretim doğrulama', 'Seri üretim'],
      bodies: [
        'Ocak 2027: sahada 60 sayaç.',
        'Nisan 2027: 200 dayanıklılık testi birimi.',
        'Haziran 2027: hattan çıkan 1.000 birim.',
        'Eylül 2027: çeyrekte 10.000 birim.',
      ],
    },
    process: {
      title: 'Sudan buluta',
      steps: ['Sensör', 'Yükselteç / ADC', 'İşlemci', 'Telsiz', 'Bulut'],
    },
    comparison: {
      title: 'B ve C revizyonları',
      before: 'Rev. B · prototip',
      after: 'Rev. C · EVT kartı',
      old: ['Altı katman, 52 bileşen', 'Ayrı NB-IoT telsiz yongası', '4,1 yıl pil ömrü'],
      next: ['Dört katman, 38 bileşen', 'İşlemci içinde LoRa telsiz', '10,8 yıl pil ömrü'],
    },
    chart: {
      title: 'Osiloskopta tek bir iletim',
      note: 'Laboratuvar birimi 17, Mart 2027. Akım: mA.',
      series: 'mA',
      body: ['Günde bir kez, 1,2 saniye yayın.', 'Pilot okumalarının %99,3’ü buluta ulaşıyor.'],
    },
    table: {
      title: 'Bir kartın maliyeti',
      note: 'Mart 2027 teklifleri, 10.000 adet için.',
      headers: ['Ref.', 'Bileşen', 'Adet', 'Birim fiyat', 'Toplam'],
      labels: [
        'LoRa içeren işlemci',
        'Ultrasonik ön uç',
        'AA lityum pil',
        'Dört katmanlı kart',
        'Pasif bileşenler',
        'Kart başına toplam',
      ],
    },
    photo: [
      'Her kart test edilir,',
      'sonra kapatılır',
      'Sekiz kart, akım, telsiz ve sensör testlerini 40 saniyede tamamlar.',
    ],
    quote: [
      'Sayaçları en ıslak kuyulara yerleştirdik. İki ay sonra hepsi hâlâ her sabah veri gönderiyor.',
      'Pilot su idaresinin operasyon sorumlusu',
    ],
    team: {
      title: 'Kartı geliştiren ekip',
      bios: [
        'Rev. C’yi şemadan EVT’ye taşıdı.',
        'Anteni su altında ayarladı.',
        'Zamanın %99,9’unda uyuyan yazılımı geliştirdi.',
        'Üretim test istasyonunu kurdu.',
      ],
      roles: ['Donanım lideri', 'RF ve anten', 'Gömülü yazılım', 'Üretim'],
    },
    closing: {
      title: ['Üretime', 'hazırız'],
      lines: [
        '200 DVT birimi nisanda üretime giriyor.',
        'Pilot için iki su idaresi daha arıyoruz.',
        'Kartı inceleyebilir, sorularınızı sorabilirsiniz.',
      ],
    },
  },
  mutzar: {
    footer: 'Zrima 2.0 · Lansman gecesi',
    hero: [
      'Operasyonlar',
      'otomatik pilotta',
      'Zrima 2.0 araçlarınızı bağlar, tekrarlanan işleri üstlenir.',
    ],
    section: ['Neler yeni?', 'İstediğiniz üç özellik ve bir sürpriz.'],
    agenda: {
      title: 'Bu akşamın programı',
      lead: [
        'Zrima 2.0’ın yeniliklerini ve kararlarımızı otuz dakikada anlatacağız.',
        'Ardından canlı demo: boş sayfadan kendi çalışan bir iş akışına.',
      ],
      points: [
        ['Düzenleyici: ', 'Tüm adımlar tek tuvalde, yapay zekâ desteğiyle.'],
        ['Beta: ', '4.200 ekibin ürettikleri ve talepleri.'],
        ['Planlar: ', 'Ücretsizden Business’a üç seçenek.'],
        ['Yol haritası: ', 'Şubatta mobil onaylar, 2027’de ortak akışlar.'],
      ],
    },
    figures: {
      title: 'Sayılarla beta',
      subtitle: 'Betada otomatik yürütülen iş akışları',
      labels: [
        'Açık betadaki ekipler',
        'Sipariş işleme süresinde düşüş',
        'Üç aylık erişilebilirlik',
      ],
      body: 'Ekipler ilk haftalarında ortalama 14 iş akışı oluşturdu.',
    },
    features: {
      title: 'Üç yeni yetenek',
      heads: ['Yapay zekâ ajanları', '400 entegrasyon', 'Adıma özel erişim'],
      bodies: [
        'Talepleri ayırır, yanıtlar veya bir kişiye aktarır.',
        'Finanstan depoya: iki dakikada bağlantı.',
        'Her adımda en az yetki, her işlem için kayıt.',
      ],
    },
    timeline: {
      title: '1.0 sürümünden 3.0’a',
      heads: ['Temel', 'Düzenleyici ve AI', 'Mobil uygulama', 'Ortak akışlar'],
      bodies: [
        '2025: 40 entegrasyon, basit akışlar.',
        'Aralık 2026: düzenleyici, AI, 400 entegrasyon.',
        'Şubat 2027: telefonda onaylar ve bildirimler.',
        '2027 sonu: müşteriler ve tedarikçiler tek akışta.',
      ],
    },
    process: {
      title: '15 dakikada ilk iş akışı',
      steps: ['Kaydol', 'Bağla', 'Davet et', 'Otomatikleştir', 'Raporla'],
    },
    comparison: {
      title: 'Bir sipariş, iki dünya',
      before: 'Altı araç, 40 dakika',
      after: 'Bir akış, 4 dakika',
      old: [
        'Araçlar arasında elle veri kopyalama',
        'Telefonla onay peşinde koşma',
        'Hataları ay sonunda fark etme',
      ],
      next: [
        'Veriler kendiliğinden aktarılır',
        'Bildirimden tek dokunuşla onay',
        'İstisnalar anında yakalanır',
      ],
    },
    chart: {
      title: 'Ekipler geliyor ve kalıyor',
      note: 'Haziran–Kasım 2026 kullanım verileri.',
      series: 'İş akışları',
      body: [
        'Hazirandan beri etkin akışlarda 13 kat büyüme.',
        'Ekiplerin %92’si 60 gün sonra hâlâ etkin.',
      ],
    },
    table: {
      title: 'Üç plan, tek ürün',
      note: '31 Ocak 2027’ye kadar kayıt olanlara lansman fiyatları.',
      headers: ['İçerik', 'Free', 'Pro', 'Business'],
      labels: [
        'Etkin akışlar',
        'Aylık çalıştırma',
        'Yapay zekâ ajanları',
        'Yetkiler ve SSO',
        'Kişi başı aylık fiyat',
        'Ücretsiz',
        'Sınırsız',
        'Temel',
        'Tam',
      ],
    },
    photo: [
      'Tüm operasyonlar',
      'tek panoda',
      'Sipariş, stok, tedarikçi ve talepler ortak bir ekranda, gerçek zamanlı.',
    ],
    quote: [
      'Önceden her siparişi altı sisteme kopyalardık. Artık ekibim yalnızca istisnalarla ilgileniyor, gerisi akıyor.',
      'Spor mağazaları zinciri operasyon sorumlusu · beta müşterisi',
    ],
    team: {
      title: 'Zrima’yı geliştirenler',
      bios: [
        'Üç lojistik şirketinde operasyon yönetti.',
        'Günde iki milyon çalıştırmanın motorunu kurdu.',
        'Düzenleyici ve yapay zekâ ajanlarını yönetiyor.',
        '2.0’ı kırk operasyon ekibiyle tasarladı.',
      ],
      roles: ['Genel müdür', 'Teknoloji lideri', 'Ürün lideri', 'Tasarım lideri'],
    },
    closing: {
      title: ['Akışı', 'başlatın'],
      lines: [
        'zrima.example üzerinden ücretsiz hesap açın.',
        'Standımızda saat 22.00’ye kadar canlı demo.',
        'Ocak sonuna kadar %30 lansman indirimi.',
      ],
    },
  },
};
