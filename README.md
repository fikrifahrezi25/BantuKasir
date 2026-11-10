# BantuKasir

Sistem Point of Sale (POS) berbasis web yang dirancang untuk UMKM, dengan fokus pada kemampuan offline-first dan sinkronisasi otomatis.

BantuKasir adalah aplikasi kasir modern yang dapat berjalan tanpa koneksi internet. Aplikasi ini dibangun untuk memenuhi kebutuhan usaha kecil dan menengah yang memerlukan sistem pencatatan transaksi yang andal, bahkan di lokasi dengan koneksi internet yang tidak stabil.

Sistem ini menggunakan arsitektur Progressive Web App (PWA) yang memungkinkan aplikasi berjalan seperti aplikasi native di perangkat pengguna. Data transaksi disimpan secara lokal dan akan otomatis tersinkronisasi ketika koneksi tersedia.

## Fitur Utama

### Manajemen Produk
- Pendaftaran produk dengan informasi lengkap (nama, harga, kategori, stok)
- Pengelompokan produk berdasarkan kategori
- Pencarian dan filter produk
- Update stok otomatis setelah transaksi

### Sistem Kasir
- Interface kasir yang responsif dan mudah digunakan
- Pencarian produk cepat
- Perhitungan otomatis total dan kembalian
- Dukungan berbagai metode pembayaran (tunai, transfer, QRIS)
- Cetak struk transaksi

### Manajemen Pesanan
- Sistem pesanan untuk layanan makan di tempat
- Status pesanan real-time
- Notifikasi pesanan baru
- Integrasi dengan Voice Order AI
- Manajemen nomor meja/pesanan

### Laporan Keuangan
- Laporan harian otomatis
- Ringkasan penjualan per periode
- Statistik produk terlaris
- Riwayat transaksi lengkap
- Export data dalam format JSON

### Manajemen Kasbon
- Pencatatan kasbon karyawan
- Tracking pembayaran cicilan
- Riwayat kasbon per karyawan
- Perhitungan otomatis sisa hutang

### AI Features
- **Voice Order**: Pemesanan menggunakan perintah suara (powered by Pollinations AI)
- **Insight AI**: Analisis bisnis dan rekomendasi strategis otomatis
- Prediksi tren penjualan
- Rekomendasi stok produk

### Mode Offline
- Semua fitur tetap berfungsi tanpa internet
- Penyimpanan data lokal menggunakan IndexedDB
- Queue system untuk sinkronisasi data
- Auto-sync ketika koneksi kembali tersedia

## Persyaratan Sistem

### Server
- Node.js versi 14 atau lebih baru
- npm atau yarn
- Port 5172 (default) harus tersedia

### Client
- Browser modern dengan dukungan PWA (Chrome, Firefox, Edge, Safari)
- JavaScript harus diaktifkan
- Minimal 50MB storage untuk data offline

## Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/fikrifahrezi25/BantuKasir.git
cd BantuKasir
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Konfigurasi Environment

Salin file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Edit file `.env` sesuai kebutuhan:

```env
PORT=5172
NODE_ENV=production
```

### 4. Jalankan Server

```bash
npm start
```

Atau untuk development dengan auto-reload:

```bash
npm run dev
```

Server akan berjalan di `http://localhost:5172`

## Penggunaan

### Akses Aplikasi

1. Buka browser dan akses `http://localhost:5172`
2. Untuk akses dari perangkat lain di jaringan lokal, gunakan IP server (contoh: `http://192.168.1.100:5172`)

### Instalasi PWA

Untuk pengalaman terbaik, install aplikasi sebagai PWA:

1. Buka aplikasi di browser
2. Klik ikon "Install" atau "Tambahkan ke Home Screen"
3. Aplikasi akan tersedia seperti aplikasi native

### Workflow Umum

#### Transaksi Kasir
1. Login ke sistem
2. Pilih menu "Kasir"
3. Tambahkan produk ke keranjang
4. Masukkan jumlah pembayaran
5. Cetak struk

#### Manajemen Produk
1. Akses menu "Produk"
2. Klik "Tambah Produk"
3. Isi informasi produk
4. Simpan

#### Laporan
1. Pilih menu "Laporan"
2. Pilih periode yang diinginkan
3. Lihat statistik dan detail transaksi
4. Export jika diperlukan

## API Documentation

### Base URL
```
http://localhost:5172/api
```

### Endpoints

#### Produk

**GET /api/produk**
- Mendapatkan semua produk
- Response: Array of products

**POST /api/produk**
- Menambah produk baru
- Body: `{ nama, harga, kategori, stok }`

**PUT /api/produk/:id**
- Update produk
- Body: `{ nama, harga, kategori, stok }`

**DELETE /api/produk/:id**
- Hapus produk

#### Transaksi

**GET /api/transaksi**
- Mendapatkan riwayat transaksi
- Query params: `?tanggal_mulai=YYYY-MM-DD&tanggal_akhir=YYYY-MM-DD`

**POST /api/transaksi**
```json
{
  "items": [
    { "produk_id": 1, "jumlah": 2, "harga": 15000 }
  ],
  "total": 30000,
  "dibayar": 50000,
  "kembalian": 20000,
  "metode_pembayaran": "tunai"
}
```

#### Pesanan

**GET /api/orders**
- Mendapatkan semua pesanan

**POST /api/orders**
- Membuat pesanan baru
- Body: `{ orderNumber, items, tableNumber, notes }`

**PUT /api/orders/:id/status**
- Update status pesanan
- Body: `{ status: "pending" | "preparing" | "ready" | "completed" }`

#### Laporan

**GET /api/laporan/harian?tanggal=YYYY-MM-DD**
- Laporan penjualan harian

**GET /api/laporan/periode?mulai=YYYY-MM-DD&akhir=YYYY-MM-DD**
- Laporan penjualan periode tertentu

#### Kasbon

Data kasbon disimpan dengan struktur bertingkat (*nested ledger*) per `user_id`. Setiap kontak/pelanggan memiliki array `riwayat` transaksi (`utang` / `bayar`).

---

##### Structure Overview

```json
[
  {
    "user_id": "string",
    "kasbon": [
      {
        "id": "string",
        "nama": "string",
        "hp": "string",
        "riwayat": [
          {
            "tipe": "utang | bayar",
            "jml": 0,
            "tgl": 0,
            "catatan": "string",
            "items": [
              {
                "id": 0,
                "n": "string",
                "p": 0,
                "c": 0,
                "q": 0,
                "vi": 0
              }
            ]
          }
        ]
      }
    ]
  }
]

#### AI Features

**POST /api/voice-order**
- Proses perintah suara menjadi pesanan
- Body: `{ transcript: "pesan 2 nasi goreng" }`

**GET /api/insight**
- Mendapatkan insight AI untuk bisnis

### Sinkronisasi Offline

**POST /api/sync**
```json
{
  "transactions": [...],
  "products": [...],
  "orders": [...]
}
```

Response mengembalikan data yang berhasil disinkronkan dan conflict yang perlu diselesaikan.

## Struktur Project

```
BantuKasir/
├── server.js                 # Entry point server
├── package.json              # Dependencies dan scripts
├── database/                 # JSON database files
│   ├── database_produk.json
│   ├── database_transaksi.json
│   ├── database_orders.json
│   ├── database_kasbon.json
│   └── database_user.json
├── public_html/              # Frontend files
│   ├── index.html            # Landing page
│   ├── dashboard.html        # Dashboard kasir
│   ├── order.html            # Sistem pesanan
│   ├── sw.js                 # Service Worker
│   ├── offline-db.js         # IndexedDB handler
│   ├── offline-sync.js       # Sync mechanism
│   └── icons/                # PWA icons
└── lomba/                    # Dokumentasi lomba
```

## Development

### Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript (no framework)
- **Database**: JSON files (untuk portabilitas)
- **Offline Storage**: IndexedDB
- **PWA**: Service Worker, Web Manifest
- **AI Integration**: Pollinations API

### Menjalankan Development Mode

```bash
npm run dev
```

Mode development mengaktifkan:
- Auto-reload server saat file berubah
- Logging lebih detail
- CORS permissive untuk testing

### Testing

Jalankan automated tests:

```bash
npm test
```

### Build untuk Production

Aplikasi ini tidak memerlukan build process karena menggunakan vanilla JavaScript. Untuk deploy:

1. Pastikan environment variables sudah benar
2. Set `NODE_ENV=production` di `.env`
3. Jalankan `npm start`

## Deployment

### Local Network

Untuk deployment di jaringan lokal:

1. Pastikan server dapat diakses di jaringan
2. Configure firewall untuk allow port 5172
3. Client akses via IP address server

### Cloud Deployment

Aplikasi dapat di-deploy ke:
- Heroku
- DigitalOcean
- AWS EC2
- Google Cloud Platform

Pastikan port dan environment variables dikonfigurasi dengan benar.

## Troubleshooting

### Masalah Umum

**Port sudah digunakan**
```bash
Error: listen EADDRINUSE: address already in use :::5172
```
Solusi: Ubah PORT di file `.env` atau kill process yang menggunakan port tersebut.

**Database tidak terbaca**
- Pastikan folder `database/` ada dan memiliki permission yang benar
- Check apakah file JSON valid (gunakan JSON validator)

**Sync tidak bekerja**
- Periksa koneksi internet
- Buka DevTools > Application > Service Workers untuk melihat status SW
- Clear cache dan reload aplikasi

**Voice Order tidak berfungsi**
- Pastikan microphone permission sudah diberikan
- Check koneksi ke Pollinations API
- Verifikasi browser mendukung Web Speech API

### Debug Mode

Aktifkan debug logging dengan menambahkan di `.env`:
```
DEBUG=true
```

## Kontribusi

Kontribusi sangat diterima. Untuk berkontribusi:

1. Fork repository
2. Buat branch fitur (`git checkout -b fitur-baru`)
3. Commit perubahan (`git commit -m 'Menambahkan fitur baru'`)
4. Push ke branch (`git push origin fitur-baru`)
5. Buat Pull Request

## Kontak

Untuk pertanyaan, saran, atau bug report, silakan buat issue di repository ini.

---
