import type { TechnologyCopies } from './copy';

export const id: TechnologyCopies = {
  anan: {
    footer: 'Nativ Pay · Tinjauan arsitektur',
    hero: [
      'Pembayaran di',
      '3 wilayah',
      'Inti pembayaran pindah ke tiga wilayah aktif tanpa henti layanan.',
    ],
    section: ['Satu wilayah', 'Satu gangguan di sana menghentikan semua pembayaran.'],
    agenda: {
      title: 'Yang kita bahas hari ini',
      lead: [
        'Mengapa satu wilayah tidak lagi cukup untuk inti pembayaran kami.',
        'Bagaimana kami pindah ke tiga wilayah aktif tanpa menghentikan layanan.',
      ],
      points: [
        ['Alasan: ', 'Satu gangguan menghentikan semua pembayaran.'],
        ['Arsitektur: ', 'Setiap wilayah mampu menanggung seluruh beban.'],
        ['Migrasi: ', 'Empat tahap pada Desember, semuanya bisa dibatalkan.'],
        ['Hasil: ', 'Ketersediaan, latensi p95, dan biaya bulanan.'],
      ],
    },
    figures: {
      title: '90 hari tanpa berhenti',
      subtitle: 'Menit henti layanan selama migrasi',
      labels: ['Layanan yang dipindahkan', 'Perubahan latensi p95', 'Wilayah aktif bersamaan'],
      body: 'Kurang dari tujuh menit layanan terbatas dalam 90 hari.',
    },
    features: {
      title: 'Tiga wilayah, satu inti',
      heads: ['Selalu aktif', 'Satu buku besar sinkron', 'Rute sesuai kondisi'],
      bodies: [
        'Setiap wilayah memproses pembayaran nyata.',
        'Setiap pembayaran disimpan di dua wilayah lebih dulu.',
        'Permintaan menuju wilayah sehat terdekat.',
      ],
    },
    timeline: {
      title: 'Empat tahap tanpa gangguan',
      heads: ['Uji internal', 'Pedagang awal', 'Separuh trafik', 'Semua pengguna'],
      bodies: [
        '1 Desember: staf saja, pemulihan otomatis.',
        '8 Desember: 2.000 pedagang sukarela.',
        '15 Desember: 50% beban di wilayah baru.',
        '22 Desember: wilayah lama menjadi satu dari tiga.',
      ],
    },
    process: {
      title: 'Perjalanan pembayaran dalam 180 ms',
      steps: ['Tepi jaringan', 'Pembagi beban', 'Layanan', 'Buku besar', 'Replikasi'],
    },
    comparison: {
      title: 'Dari satu wilayah ke tiga',
      before: 'Satu wilayah, cadangan pasif',
      after: 'Tiga wilayah aktif',
      old: [
        'Alih layanan manual: empat jam',
        'Cadangan tak menerima trafik nyata',
        'Satu gangguan menghentikan semua pembayaran',
      ],
      next: [
        'Wilayah rusak keluar dari rute dalam 30 dtk',
        'Setiap wilayah melayani trafik nyata',
        'Gangguan berdampak paling banyak sepertiga',
      ],
    },
    chart: {
      title: 'Latensi p95 dalam milidetik',
      note: 'Diukur di tepi jaringan, Juli–Desember 2026.',
      series: 'p95',
      body: [
        'Latensi turun 38% berkat wilayah yang lebih dekat.',
        'Biaya per sejuta pembayaran turun 21%.',
      ],
    },
    table: {
      title: 'Tiga wilayah dalam angka',
      note: 'Rata-rata 30 hari per 10 Januari 2027.',
      headers: ['Wilayah', 'Lokasi', 'Porsi trafik', 'p95', 'Ketersediaan'],
      labels: ['Tel Aviv', 'Frankfurt', 'Irlandia', 'Tiga wilayah', 'Total'],
    },
    photo: [
      'Tiga wilayah, 42 layanan,',
      'satu peta',
      'Setiap layanan berjalan di semua wilayah. Setiap wilayah mampu menanggung seluruh beban.',
    ],
    quote: [
      'Pada malam migrasi, kami menatap grafik dan menunggu sesuatu terjadi. Tidak terjadi apa-apa. Itulah tujuannya.',
      'SRE yang bertugas pada malam migrasi',
    ],
    team: {
      title: 'Tim di balik migrasi',
      bios: [
        'Memimpin migrasi ke tiga wilayah.',
        'Membuat panduan dan pemulihan otomatis.',
        'Menjaga buku besar tetap sinkron.',
        'Membangun rute sesuai kondisi.',
      ],
      roles: ['Pemimpin platform', 'Keandalan', 'Data', 'Jaringan'],
    },
    closing: {
      title: ['Terima', 'kasih!'],
      lines: [
        'Panduan migrasi terbuka untuk semua tim.',
        'Kuartal depan: wilayah keempat di Amerika Utara.',
        'Kami siap membahas data dan menjawab pertanyaan.',
      ],
    },
  },
  shvav: {
    footer: 'Zrima Labs · WM-10 · Tinjauan EVT',
    hero: ['Sepuluh tahun,', 'satu baterai', 'Meter air pintar WM-10, dari prototipe ke produksi.'],
    section: ['Anggaran daya', 'Setiap mikroampere berarti selama sepuluh tahun.'],
    agenda: {
      title: 'Pertanyaan dalam tinjauan ini',
      lead: [
        'Empat jawaban terukur menentukan tahap DVT pada April.',
        'Setiap pertanyaan memiliki penanggung jawab dalam tim.',
      ],
      points: [
        ['Daya: ', 'Apakah satu baterai tahan sepuluh tahun saat dingin?'],
        ['Biaya: ', 'Harga satu papan untuk pesanan 10.000 unit.'],
        ['Lapangan: ', 'Pelajaran dari 60 meter yang aktif sejak Januari.'],
        ['Produksi: ', 'Hal yang perlu selesai sebelum pesanan pertama.'],
      ],
    },
    figures: {
      title: 'Ke mana arus mengalir',
      subtitle: 'Arus rata-rata selama satu hari penuh',
      labels: ['Arus tidur lelap', 'Satu baterai litium AA', 'Tahun daya tahan dengan cadangan'],
      body: 'Mengukur tiap 15 menit, mengirim sekali sehari.',
    },
    features: {
      title: 'Tiga bagian, satu anggaran',
      heads: ['Prosesor yang tidur', 'Radio sekali sehari', 'Pengukuran tanpa kontak'],
      bodies: [
        'Bangun 40 ms, mengukur, lalu tidur lagi.',
        'Satu pesan sehari, 1,2 dtk mengudara.',
        'Ultrasonik tanpa komponen yang aus.',
      ],
    },
    timeline: {
      title: 'Dari EVT ke produksi massal',
      heads: ['Prototipe teknik', 'Validasi desain', 'Validasi produksi', 'Produksi massal'],
      bodies: [
        'Januari 2027: 60 meter di lapangan.',
        'April 2027: 200 unit untuk uji ketahanan.',
        'Juni 2027: 1.000 unit dari lini produksi.',
        'September 2027: 10.000 per kuartal.',
      ],
    },
    process: {
      title: 'Dari air ke komputasi awan',
      steps: ['Sensor', 'Penguat dan ADC', 'Prosesor', 'Radio', 'Awan'],
    },
    comparison: {
      title: 'Revisi B dan revisi C',
      before: 'Rev. B · prototipe',
      after: 'Rev. C · papan EVT',
      old: [
        'Enam lapisan, 52 komponen',
        'Radio NB-IoT pada cip terpisah',
        'Baterai bertahan 4,1 tahun',
      ],
      next: [
        'Empat lapisan, 38 komponen',
        'Radio LoRa di dalam prosesor',
        'Baterai bertahan 10,8 tahun',
      ],
    },
    chart: {
      title: 'Satu transmisi di osiloskop',
      note: 'Unit laboratorium 17, Maret 2027. Arus dalam mA.',
      series: 'mA',
      body: ['Mengudara 1,2 detik, sekali sehari.', '99,3% hasil ukur pilot sampai ke awan.'],
    },
    table: {
      title: 'Biaya satu papan',
      note: 'Penawaran Maret 2027 untuk 10.000 unit.',
      headers: ['Ref.', 'Komponen', 'Jml.', 'Harga satuan', 'Total'],
      labels: [
        'Prosesor dengan LoRa',
        'Rangkaian ultrasonik',
        'Baterai litium AA',
        'Papan empat lapisan',
        'Komponen pasif',
        'Total per papan',
      ],
    },
    photo: [
      'Setiap papan diuji',
      'sebelum disegel',
      'Delapan papan menjalani uji arus, radio, dan sensor dalam 40 detik.',
    ],
    quote: [
      'Kami memilih lubang meter paling basah. Dua bulan kemudian, semuanya masih melapor setiap pagi.',
      'Kepala operasi perusahaan air peserta pilot',
    ],
    team: {
      title: 'Tim pembuat papan',
      bios: [
        'Membawa revisi C dari skema ke EVT.',
        'Menyetel antena di bawah air.',
        'Membuat firmware yang tidur 99,9% waktu.',
        'Membangun stasiun uji produksi.',
      ],
      roles: ['Pemimpin perangkat keras', 'RF dan antena', 'Perangkat tegar', 'Manufaktur'],
    },
    closing: {
      title: ['Siap untuk', 'produksi'],
      lines: [
        '200 unit DVT masuk lini produksi pada April.',
        'Kami mencari dua perusahaan air untuk pilot berikutnya.',
        'Papan sedang diedarkan. Silakan ajukan pertanyaan.',
      ],
    },
  },
  mutzar: {
    footer: 'Zrima 2.0 · Malam peluncuran',
    hero: [
      'Operasi dengan',
      'pilot otomatis',
      'Zrima 2.0 menghubungkan alat kerja dan menangani pekerjaan rutin.',
    ],
    section: ['Yang baru', 'Tiga permintaan Anda dan satu kejutan.'],
    agenda: {
      title: 'Acara malam ini',
      lead: [
        'Tiga puluh menit tentang pembaruan Zrima 2.0 dan alasan di baliknya.',
        'Lalu demo langsung: dari halaman kosong menjadi alur yang mandiri.',
      ],
      points: [
        ['Editor: ', 'Semua langkah dalam satu kanvas, dibantu AI.'],
        ['Beta: ', 'Karya dan masukan dari 4.200 tim.'],
        ['Paket: ', 'Tiga pilihan, dari gratis hingga Business.'],
        ['Rencana: ', 'Persetujuan seluler Februari, alur bersama pada 2027.'],
      ],
    },
    figures: {
      title: 'Beta dalam angka',
      subtitle: 'Alur kerja dijalankan otomatis selama beta',
      labels: [
        'Tim dalam beta terbuka',
        'Waktu proses pesanan berkurang',
        'Ketersediaan selama tiga bulan',
      ],
      body: 'Pada minggu pertama, tiap tim membuat rata-rata 14 alur.',
    },
    features: {
      title: 'Tiga kemampuan baru',
      heads: ['Agen AI', '400 integrasi', 'Akses tiap langkah'],
      bodies: [
        'Memilah, menjawab, atau meneruskan permintaan ke manusia.',
        'Dari keuangan ke gudang: terhubung dalam dua menit.',
        'Izin minimum tiap langkah, semua tindakan tercatat.',
      ],
    },
    timeline: {
      title: 'Dari versi 1.0 ke 3.0',
      heads: ['Fondasi', 'Editor dan AI', 'Aplikasi seluler', 'Alur bersama'],
      bodies: [
        '2025: 40 integrasi dan alur sederhana.',
        'Desember 2026: editor, AI, 400 integrasi.',
        'Februari 2027: persetujuan dan notifikasi seluler.',
        'Akhir 2027: pelanggan dan pemasok dalam satu alur.',
      ],
    },
    process: {
      title: 'Alur pertama dalam 15 menit',
      steps: ['Daftar', 'Hubungkan', 'Undang', 'Otomatiskan', 'Laporkan'],
    },
    comparison: {
      title: 'Satu pesanan, dua dunia',
      before: 'Enam alat, 40 menit',
      after: 'Satu alur, 4 menit',
      old: [
        'Menyalin data secara manual',
        'Mengejar persetujuan lewat telepon',
        'Menemukan kesalahan pada akhir bulan',
      ],
      next: [
        'Data berpindah otomatis',
        'Setujui langsung dari notifikasi',
        'Penyimpangan terdeteksi saat terjadi',
      ],
    },
    chart: {
      title: 'Tim datang dan bertahan',
      note: 'Data penggunaan Juni–November 2026.',
      series: 'Alur kerja',
      body: ['Alur aktif tumbuh 13 kali sejak Juni.', '92% tim masih aktif setelah 60 hari.'],
    },
    table: {
      title: 'Tiga paket, satu produk',
      note: 'Harga peluncuran untuk pendaftaran sampai 31 Januari 2027.',
      headers: ['Fitur', 'Free', 'Pro', 'Business'],
      labels: [
        'Alur aktif',
        'Eksekusi per bulan',
        'Agen AI',
        'Izin dan SSO',
        'Harga / pengguna / bulan',
        'Gratis',
        'Tanpa batas',
        'Dasar',
        'Lengkap',
      ],
    },
    photo: [
      'Satu dasbor untuk',
      'seluruh operasi',
      'Pesanan, stok, pemasok, dan tiket secara langsung di satu layar bersama.',
    ],
    quote: [
      'Dulu kami menyalin setiap pesanan ke enam sistem. Sekarang tim saya menangani pengecualian, sisanya mengalir sendiri.',
      'Kepala operasi jaringan toko olahraga · pelanggan beta',
    ],
    team: {
      title: 'Tim pembuat Zrima',
      bios: [
        'Memimpin operasi di tiga perusahaan logistik.',
        'Membangun mesin untuk dua juta eksekusi per hari.',
        'Memimpin editor dan agen AI.',
        'Merancang 2.0 bersama empat puluh tim operasi.',
      ],
      roles: ['Direktur utama', 'Direktur teknologi', 'Pemimpin produk', 'Pemimpin desain'],
    },
    closing: {
      title: ['Mulai', 'mengalir'],
      lines: [
        'Buka akun gratis di zrima.example.',
        'Demo langsung di stan kami sampai pukul 22.00.',
        'Diskon peluncuran 30% sampai akhir Januari.',
      ],
    },
  },
};
