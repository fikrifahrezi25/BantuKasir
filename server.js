// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
const PORT = 9123;
const SALT_ROUNDS = 10;

// Unsplash Access Key dari .env
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Pollinations.AI API Key dari .env
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

// Middleware
app.use(express.json({ limit: "10mb" }));

// ===== DATABASE HELPERS =====
const DB_PATH = path.join(__dirname, "database");

// Pastikan folder database ada
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH);
}

function bacaDatabase(filename) {
  const filepath = path.join(DB_PATH, filename);
  try {
    if (!fs.existsSync(filepath)) return [];
    const raw = fs.readFileSync(filepath, "utf-8").trim();
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error(`[DB] Error membaca ${filename}:`, err.message);
    return [];
  }
}

function simpanDatabase(filename, data) {
  const filepath = path.join(DB_PATH, filename);
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error(`[DB] Error menyimpan ${filename}:`, err.message);
    return false;
  }
}

// Helper: ambil/buat entry user di suatu database
function getUserEntry(filename, userId) {
  const db = bacaDatabase(filename);
  let entry = db.find((x) => x.user_id === userId);
  if (!entry) {
    entry = { user_id: userId };
    // Tambahkan array default berdasarkan jenis file
    if (filename === "database_produk.json") entry.produk = [];
    if (filename === "database_laporan.json") entry.laporan = [];
    if (filename === "database_riwayat_transaksi.json") entry.transaksi = [];
    if (filename === "database_kasbon.json") entry.kasbon = [];
    db.push(entry);
    simpanDatabase(filename, db);
  }
  return { db, entry };
}

function saveUserEntry(filename, db) {
  simpanDatabase(filename, db);
}

// ===== VISITOR COUNTER =====
const visitorLogPath = path.join(__dirname, "visitor-count.txt");
if (!fs.existsSync(visitorLogPath)) {
  fs.writeFileSync(visitorLogPath, "0", "utf-8");
}

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, "public_html")));

// ===== VISITOR COUNTER MIDDLEWARE =====
app.get("/", (req, res, next) => {
  try {
    let count = parseInt(fs.readFileSync(visitorLogPath, "utf-8").trim()) || 0;
    count += 1;
    fs.writeFileSync(visitorLogPath, count.toString(), "utf-8");
    console.log(`Visitor ke-${count} baru masuk.`);
  } catch (err) {
    console.error("Gagal memperbarui file log visitor:", err);
  }
  next();
});

// ===== ROUTING HALAMAN =====
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public_html", "dashboard.html"));
});

// ===== AUTH ENDPOINTS =====

// POST /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { nama, nama_usaha, alamat_usaha, email, password } = req.body;

    // --- Validasi ---
    if (!nama || !nama.trim()) {
      return res.status(400).json({ success: false, message: "Nama tidak boleh kosong" });
    }
    if (!nama_usaha || !nama_usaha.trim()) {
      return res.status(400).json({ success: false, message: "Nama usaha wajib diisi" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email atau nomor WhatsApp wajib diisi" });
    }
    // Validasi email atau nomor telepon
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const isPhone = /^[\d\s+()-]{10,}$/.test(email.trim());
    if (!isEmail && !isPhone) {
      return res.status(400).json({ success: false, message: "Format email atau nomor WhatsApp tidak valid" });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: "Kata sandi minimal 8 karakter" });
    }

    // Cek duplikat email
    const users = bacaDatabase("database_user.json");
    const emailNormal = email.trim().toLowerCase();
    const sudahAda = users.find((u) => u.email.toLowerCase() === emailNormal);
    if (sudahAda) {
      return res.status(409).json({ success: false, message: "Email atau nomor sudah terdaftar" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const timestamp = Date.now();
    const userId = `user_${timestamp}`;

    const newUser = {
      id: userId,
      nama: nama.trim(),
      nama_usaha: nama_usaha.trim(),
      alamat_usaha: alamat_usaha ? alamat_usaha.trim() : "",
      email: emailNormal,
      password: hashedPassword,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
    };

    // Simpan user
    users.push(newUser);
    simpanDatabase("database_user.json", users);

    // Inisialisasi database kosong untuk user baru
    getUserEntry("database_produk.json", userId);
    getUserEntry("database_laporan.json", userId);
    getUserEntry("database_riwayat_transaksi.json", userId);
    getUserEntry("database_kasbon.json", userId);

    console.log(`[Auth] User baru terdaftar: ${newUser.nama} (${userId})`);

    return res.status(201).json({
      success: true,
      message: "Pendaftaran berhasil",
      user: {
        id: newUser.id,
        nama: newUser.nama,
        nama_usaha: newUser.nama_usaha,
        alamat_usaha: newUser.alamat_usaha,
        email: newUser.email,
      },
    });
  } catch (err) {
    console.error("[Auth] Register error:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server. Silakan coba lagi." });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email atau nomor WhatsApp wajib diisi" });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: "Kata sandi wajib diisi" });
    }

    const users = bacaDatabase("database_user.json");
    const emailNormal = email.trim().toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === emailNormal);

    if (!user) {
      return res.status(401).json({ success: false, message: "Email atau kata sandi salah" });
    }

    const passwordCocok = await bcrypt.compare(password, user.password);
    if (!passwordCocok) {
      return res.status(401).json({ success: false, message: "Email atau kata sandi salah" });
    }

    // Update last_login
    user.last_login = new Date().toISOString();
    simpanDatabase("database_user.json", users);

    console.log(`[Auth] Login berhasil: ${user.nama} (${user.id})`);

    return res.status(200).json({
      success: true,
      message: "Login berhasil",
      user: {
        id: user.id,
        nama: user.nama,
        nama_usaha: user.nama_usaha,
        alamat_usaha: user.alamat_usaha || "",
        email: user.email,
      },
    });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server. Silakan coba lagi." });
  }
});

// ===== PRODUK ENDPOINTS =====

// GET /api/produk?user_id=xxx
app.get("/api/produk", (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ success: false, message: "user_id wajib diisi" });
  const { entry } = getUserEntry("database_produk.json", user_id);
  res.json({ success: true, produk: entry.produk || [] });
});

// POST /api/produk — Simpan semua produk (replace)
app.post("/api/produk", (req, res) => {
  const { user_id, produk } = req.body;
  if (!user_id) return res.status(400).json({ success: false, message: "user_id wajib diisi" });
  if (!Array.isArray(produk)) return res.status(400).json({ success: false, message: "produk harus array" });
  const { db, entry } = getUserEntry("database_produk.json", user_id);
  entry.produk = produk;
  saveUserEntry("database_produk.json", db);
  res.json({ success: true, message: "Produk disimpan", produk: entry.produk });
});

// ===== TRANSAKSI ENDPOINTS =====

// GET /api/transaksi?user_id=xxx
app.get("/api/transaksi", (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ success: false, message: "user_id wajib diisi" });
  const { entry } = getUserEntry("database_riwayat_transaksi.json", user_id);
  res.json({ success: true, transaksi: entry.transaksi || [] });
});

// POST /api/transaksi — Tambah satu transaksi
app.post("/api/transaksi", (req, res) => {
  const { user_id, transaksi } = req.body;
  if (!user_id) return res.status(400).json({ success: false, message: "user_id wajib diisi" });
  if (!transaksi) return res.status(400).json({ success: false, message: "data transaksi wajib diisi" });
  const { db, entry } = getUserEntry("database_riwayat_transaksi.json", user_id);
  if (!entry.transaksi) entry.transaksi = [];
  entry.transaksi.push(transaksi);
  saveUserEntry("database_riwayat_transaksi.json", db);
  res.json({ success: true, message: "Transaksi disimpan", transaksi });
});

// PUT /api/transaksi/:id/void — Void/batalkan transaksi
app.put("/api/transaksi/:id/void", (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ success: false, message: "user_id wajib diisi" });
  const { db, entry } = getUserEntry("database_riwayat_transaksi.json", user_id);
  const trx = (entry.transaksi || []).find((t) => t.id === id);
  if (!trx) return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan" });
  trx.void = true;
  saveUserEntry("database_riwayat_transaksi.json", db);
  res.json({ success: true, message: "Transaksi dibatalkan", transaksi: trx });
});

// ===== LAPORAN ENDPOINTS =====

// GET /api/laporan?user_id=xxx
app.get("/api/laporan", (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ success: false, message: "user_id wajib diisi" });
  const { entry } = getUserEntry("database_laporan.json", user_id);
  res.json({ success: true, laporan: entry.laporan || [] });
});

// POST /api/laporan — Simpan / update laporan harian
app.post("/api/laporan", (req, res) => {
  const { user_id, tanggal, uang_masuk, modal_keluar, pengeluaran, untung } = req.body;
  if (!user_id) return res.status(400).json({ success: false, message: "user_id wajib diisi" });
  if (!tanggal) return res.status(400).json({ success: false, message: "tanggal wajib diisi" });
  const { db, entry } = getUserEntry("database_laporan.json", user_id);
  if (!entry.laporan) entry.laporan = [];
  const idx = entry.laporan.findIndex((l) => l.tanggal === tanggal);
  const data = { tanggal, uang_masuk: uang_masuk || 0, modal_keluar: modal_keluar || 0, pengeluaran: pengeluaran || 0, untung: untung || 0 };
  if (idx >= 0) entry.laporan[idx] = data;
  else entry.laporan.push(data);
  saveUserEntry("database_laporan.json", db);
  res.json({ success: true, message: "Laporan disimpan", laporan: data });
});

// ===== KASBON ENDPOINTS (per user) =====

// GET /api/kasbon?user_id=xxx
app.get("/api/kasbon", (req, res) => {
  const { user_id } = req.query;
  // Backward compat: jika tidak ada user_id, baca kasbon-data.json lama
  if (!user_id) {
    try {
      const kasbonFilePath = path.join(__dirname, "kasbon-data.json");
      if (!fs.existsSync(kasbonFilePath)) return res.json({ success: true, kasbon: [] });
      const raw = fs.readFileSync(kasbonFilePath, "utf-8").trim();
      const data = raw ? JSON.parse(raw) : [];
      return res.json({ success: true, kasbon: data });
    } catch (err) {
      return res.status(500).json({ success: false, error: "Gagal membaca data kasbon" });
    }
  }
  const { entry } = getUserEntry("database_kasbon.json", user_id);
  res.json({ success: true, kasbon: entry.kasbon || [] });
});

// POST /api/kasbon — Buat kasbon baru atau tambah utang
app.post("/api/kasbon", (req, res) => {
  try {
    const { user_id, nama, hp, jml, catatan, items } = req.body;
    if (!nama || !nama.trim()) {
      return res.status(400).json({ success: false, error: "Nama pelanggan wajib diisi" });
    }
    if (!jml || isNaN(jml) || Number(jml) <= 0) {
      return res.status(400).json({ success: false, error: "Jumlah kasbon harus lebih dari 0" });
    }

    let dbData, entryData;
    if (user_id) {
      const { db, entry } = getUserEntry("database_kasbon.json", user_id);
      dbData = db;
      entryData = entry;
      if (!entryData.kasbon) entryData.kasbon = [];
    } else {
      // Backward compat dengan kasbon-data.json lama
      const kasbonFilePath = path.join(__dirname, "kasbon-data.json");
      dbData = null;
      entryData = { kasbon: [] };
      try {
        if (fs.existsSync(kasbonFilePath)) {
          const raw = fs.readFileSync(kasbonFilePath, "utf-8").trim();
          entryData.kasbon = raw ? JSON.parse(raw) : [];
        }
      } catch (e) { entryData.kasbon = []; }
    }

    let pel = entryData.kasbon.find((p) => p.nama.toLowerCase() === nama.trim().toLowerCase());
    if (!pel) {
      pel = { id: `kb_${Date.now()}`, nama: nama.trim(), hp: hp ? hp.trim() : "", riwayat: [] };
      entryData.kasbon.push(pel);
    } else {
      if (hp && hp.trim()) pel.hp = hp.trim();
    }
    pel.riwayat.push({ tipe: "utang", jml: Number(jml), tgl: Date.now(), catatan: catatan ? catatan.trim() : "", items: items || [] });

    if (user_id && dbData) {
      saveUserEntry("database_kasbon.json", dbData);
    } else {
      const kasbonFilePath = path.join(__dirname, "kasbon-data.json");
      fs.writeFileSync(kasbonFilePath, JSON.stringify(entryData.kasbon, null, 2), "utf-8");
    }
    res.json({ success: true, pelanggan: pel });
  } catch (err) {
    console.error("[Kasbon] POST error:", err);
    res.status(500).json({ success: false, error: "Gagal menyimpan kasbon" });
  }
});

// POST /api/kasbon/:id/bayar
app.post("/api/kasbon/:id/bayar", (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, jml, catatan } = req.body;
    if (!jml || isNaN(jml) || Number(jml) <= 0) {
      return res.status(400).json({ success: false, error: "Jumlah bayar harus lebih dari 0" });
    }

    let dbData, kasbon;
    if (user_id) {
      const { db, entry } = getUserEntry("database_kasbon.json", user_id);
      dbData = db;
      kasbon = entry.kasbon || [];
    } else {
      const kasbonFilePath = path.join(__dirname, "kasbon-data.json");
      try {
        const raw = fs.readFileSync(kasbonFilePath, "utf-8").trim();
        kasbon = raw ? JSON.parse(raw) : [];
      } catch (e) { kasbon = []; }
    }

    const pel = kasbon.find((p) => p.id === id);
    if (!pel) return res.status(404).json({ success: false, error: "Pelanggan tidak ditemukan" });

    const totalUtang = pel.riwayat.filter((r) => r.tipe === "utang").reduce((s, r) => s + r.jml, 0);
    const totalBayar = pel.riwayat.filter((r) => r.tipe === "bayar").reduce((s, r) => s + r.jml, 0);
    const sisa = totalUtang - totalBayar;
    const jumlahBayar = Math.min(Number(jml), sisa);
    if (jumlahBayar <= 0) return res.status(400).json({ success: false, error: "Kasbon pelanggan ini sudah lunas" });

    pel.riwayat.push({ tipe: "bayar", jml: jumlahBayar, tgl: Date.now(), catatan: catatan ? catatan.trim() : "" });
    const sisaBaru = sisa - jumlahBayar;

    if (user_id && dbData) {
      saveUserEntry("database_kasbon.json", dbData);
    } else {
      const kasbonFilePath = path.join(__dirname, "kasbon-data.json");
      fs.writeFileSync(kasbonFilePath, JSON.stringify(kasbon, null, 2), "utf-8");
    }
    res.json({ success: true, pelanggan: pel, sisa: sisaBaru });
  } catch (err) {
    console.error("[Kasbon] POST bayar error:", err);
    res.status(500).json({ success: false, error: "Gagal menyimpan pembayaran" });
  }
});

// DELETE /api/kasbon/:id
app.delete("/api/kasbon/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    let dbData, kasbon;
    if (user_id) {
      const { db, entry } = getUserEntry("database_kasbon.json", user_id);
      dbData = db;
      kasbon = entry.kasbon || [];
    } else {
      const kasbonFilePath = path.join(__dirname, "kasbon-data.json");
      try {
        const raw = fs.readFileSync(kasbonFilePath, "utf-8").trim();
        kasbon = raw ? JSON.parse(raw) : [];
      } catch (e) { kasbon = []; }
    }

    const idx = kasbon.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: "Pelanggan tidak ditemukan" });
    const nama = kasbon[idx].nama;
    kasbon.splice(idx, 1);

    if (user_id && dbData) {
      saveUserEntry("database_kasbon.json", dbData);
    } else {
      const kasbonFilePath = path.join(__dirname, "kasbon-data.json");
      fs.writeFileSync(kasbonFilePath, JSON.stringify(kasbon, null, 2), "utf-8");
    }
    res.json({ success: true, message: `Data kasbon "${nama}" dihapus` });
  } catch (err) {
    console.error("[Kasbon] DELETE error:", err);
    res.status(500).json({ success: false, error: "Gagal menghapus kasbon" });
  }
});

// ===== PENGATURAN USER =====

// PUT /api/user/pengaturan — Update nama usaha, alamat, kasir, qris, tema, pajak & diskon
app.put("/api/user/pengaturan", (req, res) => {
  try {
    const { user_id, pengaturan } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: "user_id wajib diisi" });
    const users = bacaDatabase("database_user.json");
    const user = users.find((u) => u.id === user_id);
    if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    // Simpan pengaturan non-sensitif ke user record
    if (pengaturan) {
      if (pengaturan.nama_usaha !== undefined) user.nama_usaha = pengaturan.nama_usaha;
      if (pengaturan.alamat_usaha !== undefined) user.alamat_usaha = pengaturan.alamat_usaha;
      if (pengaturan.kasir !== undefined) user.kasir = pengaturan.kasir;
      if (pengaturan.qris !== undefined) user.qris = pengaturan.qris;
      if (pengaturan.tema !== undefined) user.tema = pengaturan.tema;
      if (pengaturan.pajak !== undefined) user.pajak = pengaturan.pajak;
      if (pengaturan.kats !== undefined) user.kats = pengaturan.kats;
      
      // Konfigurasi PPN
      if (pengaturan.ppn_aktif !== undefined) user.ppn_aktif = pengaturan.ppn_aktif;
      if (pengaturan.ppn_persen !== undefined) user.ppn_persen = pengaturan.ppn_persen;
      
      // Konfigurasi Diskon Global
      if (pengaturan.diskon_global_aktif !== undefined) user.diskon_global_aktif = pengaturan.diskon_global_aktif;
      if (pengaturan.diskon_global_tipe !== undefined) user.diskon_global_tipe = pengaturan.diskon_global_tipe;
      if (pengaturan.diskon_global_persen !== undefined) user.diskon_global_persen = pengaturan.diskon_global_persen;
      if (pengaturan.diskon_global_nominal !== undefined) user.diskon_global_nominal = pengaturan.diskon_global_nominal;
    }
    simpanDatabase("database_user.json", users);
    res.json({ success: true, message: "Pengaturan disimpan" });
  } catch (err) {
    console.error("[User] PUT pengaturan error:", err);
    res.status(500).json({ success: false, message: "Gagal menyimpan pengaturan" });
  }
});

// GET /api/user/pengaturan?user_id=xxx
app.get("/api/user/pengaturan", (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ success: false, message: "user_id wajib diisi" });
  const users = bacaDatabase("database_user.json");
  const user = users.find((u) => u.id === user_id);
  if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
  res.json({
    success: true,
    pengaturan: {
      nama_usaha: user.nama_usaha || "",
      alamat_usaha: user.alamat_usaha || "",
      kasir: user.kasir || "",
      qris: user.qris || "",
      tema: user.tema || "auto",
      pajak: user.pajak || false,
      kats: user.kats || ["Minuman", "Makanan", "Camilan"],
      
      // Konfigurasi PPN
      ppn_aktif: user.ppn_aktif !== undefined ? user.ppn_aktif : false,
      ppn_persen: user.ppn_persen !== undefined ? user.ppn_persen : 11,
      
      // Konfigurasi Diskon Global
      diskon_global_aktif: user.diskon_global_aktif !== undefined ? user.diskon_global_aktif : false,
      diskon_global_tipe: user.diskon_global_tipe || "persen",
      diskon_global_persen: user.diskon_global_persen !== undefined ? user.diskon_global_persen : 0,
      diskon_global_nominal: user.diskon_global_nominal !== undefined ? user.diskon_global_nominal : 0,
    },
  });
});

// ===== UNSPLASH API =====
app.get("/api/product-photo", (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Query parameter 'q' is required" });
  if (!UNSPLASH_ACCESS_KEY) {
    return res.status(500).json({ error: "Unsplash Access Key not configured" });
  }
  const encodedQuery = encodeURIComponent(query);
  const apiUrl = `https://api.unsplash.com/search/photos?page=1&query=${encodedQuery}&per_page=1`;
  const options = { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" } };
  https.get(apiUrl, options, (apiRes) => {
    let data = "";
    apiRes.on("data", (chunk) => { data += chunk; });
    apiRes.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.results && parsed.results.length > 0) {
          const photo = parsed.results[0];
          res.json({ success: true, photo: { url: photo.urls.regular, thumb: photo.urls.thumb, small: photo.urls.small, author: photo.user.name, author_url: photo.user.links.html } });
        } else {
          res.json({ success: false, message: "No photos found" });
        }
      } catch (err) {
        res.status(500).json({ error: "Failed to parse Unsplash response" });
      }
    });
  }).on("error", (err) => {
    res.status(500).json({ error: "Failed to fetch from Unsplash" });
  });
});

<<<<<<< HEAD
// ===== INSIGHT AI ENDPOINT =====
app.post("/api/insight", async (req, res) => {
  try {
    const { user_id, force_refresh } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ success: false, error: "user_id wajib diisi" });
    }
    
    console.log(`[Insight AI] Processing insight for user ${user_id}, force_refresh: ${force_refresh || false}`);
    
    // Ambil atau buat entry insight untuk user
    const { db, entry } = getUserEntry("database_insight.json", user_id);
    if (!entry.insights) entry.insights = [];
    if (!entry.refresh_count) entry.refresh_count = {};
    
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const todayKey = today.replace(/-/g, ''); // YYYYMMDD untuk key
    
    // Cek apakah sudah ada insight hari ini
    const existingInsight = entry.insights.find(i => i.tanggal === today);
    
    // Cek batas refresh (max 5x per hari)
    const refreshCount = entry.refresh_count[todayKey] || 0;
    const MAX_REFRESH_PER_DAY = 5;
    
    if (existingInsight && !force_refresh) {
      // Sudah ada insight dan tidak force refresh, kembalikan yang ada
      return res.json({
        success: true,
        insight: existingInsight,
        from_cache: true,
        refresh_count: refreshCount,
        max_refresh: MAX_REFRESH_PER_DAY
      });
    }
    
    if (force_refresh && refreshCount >= MAX_REFRESH_PER_DAY) {
      return res.status(429).json({
        success: false,
        error: `Batas refresh insight hari ini sudah tercapai (${MAX_REFRESH_PER_DAY}x). Coba lagi besok.`,
        refresh_count: refreshCount,
        max_refresh: MAX_REFRESH_PER_DAY
      });
    }
    
    // Hitung semua angka untuk insight
    const transaksi = bacaDatabase("database_riwayat_transaksi.json");
    const produk = bacaDatabase("database_produk.json");
    const kasbon = bacaDatabase("database_kasbon.json");
    
    const userTransaksi = (transaksi.find(t => t.user_id === user_id)?.transaksi || []);
    const userProduk = (produk.find(p => p.user_id === user_id)?.produk || []);
    const userKasbon = (kasbon.find(k => k.user_id === user_id)?.kasbon || []);
    
    const DAY = Math.floor(Date.now() / 864e5);
    const PENGELUARAN = 15000; // Asumsi pengeluaran harian
    
    console.log(`[Insight AI] Calculating for DAY: ${DAY}, user has ${userTransaksi.length} transactions`);
    
    // Hitung untung hari ini
    let untungHariIni = 0;
    let uangMasuk = 0;
    let modal = 0;
    const produkTerlaris = {};
    
    userTransaksi.forEach(t => {
      // Hitung day dari timestamp atau gunakan field day jika ada
      const trxDay = t.day || Math.floor((t.timestamp || 0) / 864e5);
      
      if (!t.void && trxDay === DAY) {
        const trxTotal = t.total || t.items.reduce((sum, i) => sum + i.p * i.q, 0);
        uangMasuk += trxTotal;
        
        t.items.forEach(i => {
          modal += i.c * i.q;
          produkTerlaris[i.n] = (produkTerlaris[i.n] || 0) + i.q;
        });
      }
    });
    
    console.log(`[Insight AI] Found transactions today: uangMasuk=${uangMasuk}, modal=${modal}`);
    
    untungHariIni = uangMasuk - modal - PENGELUARAN;
    
    // Hitung untung kemarin untuk perbandingan
    let untungKemarin = 0;
    let uangMasukKemarin = 0;
    let modalKemarin = 0;
    
    userTransaksi.forEach(t => {
      // Hitung day dari timestamp atau gunakan field day jika ada
      const trxDay = t.day || Math.floor((t.timestamp || 0) / 864e5);
      
      if (!t.void && trxDay === (DAY - 1)) {
        const trxTotal = t.total || t.items.reduce((sum, i) => sum + i.p * i.q, 0);
        uangMasukKemarin += trxTotal;
        
        t.items.forEach(i => {
          modalKemarin += i.c * i.q;
        });
      }
    });
    
    untungKemarin = uangMasukKemarin - modalKemarin - PENGELUARAN;
    
    // Produk terlaris (top 3)
    const topProduk = Object.entries(produkTerlaris)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([nama, qty]) => `${nama} (${qty} terjual)`);
    
    // Produk habis atau menipis
    const produkHabis = [];
    const produkTipis = [];
    
    userProduk.forEach(p => {
      if (p.v && p.v.length > 0) {
        // Produk dengan varian
        p.v.forEach(v => {
          if (v.s === 0) produkHabis.push(`${p.n} (${v.n})`);
          else if (v.s > 0 && v.s <= 5) produkTipis.push(`${p.n} (${v.n})`);
        });
      } else {
        // Produk tanpa varian
        if (p.s === 0) produkHabis.push(p.n);
        else if (p.s > 0 && p.s <= 5) produkTipis.push(p.n);
      }
    });
    
    // Kasbon belum lunas
    const kasbonBelumLunas = userKasbon.filter(k => {
      const totalUtang = k.riwayat.filter(r => r.tipe === 'utang').reduce((s, r) => s + r.jml, 0);
      const totalBayar = k.riwayat.filter(r => r.tipe === 'bayar').reduce((s, r) => s + r.jml, 0);
      return totalUtang > totalBayar;
    }).length;
    
    // Jika belum ada penjualan hari ini
    if (uangMasuk === 0) {
      const fallbackInsight = {
        tanggal: today,
        ringkasan: "Belum ada penjualan hari ini",
        penyebab: untungKemarin > 0 ? 
          `Kemarin untung ${formatRupiah(untungKemarin)}${produkHabis.length > 0 ? `, tapi ${produkHabis.slice(0, 2).join(', ')} habis` : ''}` :
          produkHabis.length > 0 ? `${produkHabis.slice(0, 2).join(', ')} habis, susah buka jualan` : "Belum ada aktivitas",
        saran: produkHabis.length > 0 ? 
          `Belanja ${produkHabis.slice(0, 2).join(' dan ')} dulu supaya bisa buka` :
          "Cek stok dan siapkan jualan hari ini",
        timestamp: Date.now(),
        generated_by: "template"
      };
      
      // Simpan insight
      let savedInsight;
      if (existingInsight) {
        Object.assign(existingInsight, fallbackInsight);
        savedInsight = existingInsight;
      } else {
        entry.insights.push(fallbackInsight);
        savedInsight = fallbackInsight;
      }
      
      if (force_refresh) {
        entry.refresh_count[todayKey] = refreshCount + 1;
      }
      
      saveUserEntry("database_insight.json", db);
      
      // Return insight (no data_context for no transaction case)
      return res.json({
        success: true,
        insight: savedInsight,
        from_cache: false,
        refresh_count: entry.refresh_count[todayKey] || 0,
        max_refresh: MAX_REFRESH_PER_DAY
      });
    }
    
    // Generate insight dengan AI
    const selisihUntung = untungHariIni - untungKemarin;
    const persenSelisih = untungKemarin !== 0 ? Math.round((selisihUntung / Math.abs(untungKemarin)) * 100) : 0;
    
    // Siapkan data untuk AI (tanpa data pribadi)
    const dataContext = {
      untung_hari_ini: untungHariIni,
      untung_kemarin: untungKemarin,
      selisih: selisihUntung,
      persen_selisih: persenSelisih,
      uang_masuk: uangMasuk,
      modal: modal,
      pengeluaran: PENGELUARAN,
      produk_terlaris: topProduk,
      produk_habis: produkHabis.slice(0, 3),
      produk_menipis: produkTipis.slice(0, 3),
      kasbon_belum_lunas: kasbonBelumLunas
    };
    
    // Prompt untuk AI
    const promptAI = `Kamu adalah asisten keuangan untuk pedagang warung. Berikan insight singkat (maksimal 3-4 kalimat) tentang kondisi usaha hari ini dalam bahasa pedagang (kalimat pendek, tanpa istilah akuntansi).

Data hari ini:
- Untung hari ini: Rp ${untungHariIni.toLocaleString('id-ID')}
- Untung kemarin: Rp ${untungKemarin.toLocaleString('id-ID')}
- Selisih: Rp ${selisihUntung.toLocaleString('id-ID')} (${persenSelisih}%)
- Uang masuk: Rp ${uangMasuk.toLocaleString('id-ID')}
- Modal keluar: Rp ${modal.toLocaleString('id-ID')}
- Produk terlaris: ${topProduk.join(', ') || 'Belum ada'}
- Produk habis: ${produkHabis.length > 0 ? produkHabis.slice(0, 3).join(', ') : 'Tidak ada'}
- Produk menipis: ${produkTipis.length > 0 ? produkTipis.slice(0, 3).join(', ') : 'Tidak ada'}
- Kasbon belum lunas: ${kasbonBelumLunas} pelanggan

Format output WAJIB dalam JSON:
{
  "ringkasan": "Ringkasan untung hari ini dibanding kemarin dalam 1 kalimat",
  "penyebab": "1-2 penyebab utama (misal: produk habis, pengeluaran besar, penjualan turun) dalam 1-2 kalimat",
  "saran": "Satu saran tindakan konkret yang bisa langsung dikerjakan (misal: belanja susu sebelum besok) dalam 1 kalimat"
}

Pastikan angka yang kamu sebutkan PERSIS sama dengan data di atas. Gunakan bahasa pedagang yang sederhana.`;
    
    try {
      // Panggil Pollinations AI
      const aiResponse = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${POLLINATIONS_API_KEY}`
        },
        body: JSON.stringify({
          model: 'openai/gpt-5.4-nano',
          messages: [
            { role: 'system', content: 'Kamu adalah asisten keuangan pedagang yang memberikan insight singkat dalam bahasa sederhana.' },
            { role: 'user', content: promptAI }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7
        })
      });
      
      if (!aiResponse.ok) {
        throw new Error(`AI API error: ${aiResponse.status}`);
      }
      
      const aiData = await aiResponse.json();
      const aiContent = aiData.choices?.[0]?.message?.content;
      
      if (!aiContent) {
        throw new Error('No content from AI');
      }
      
      const parsedInsight = JSON.parse(aiContent);
      
      // Validasi struktur response
      if (!parsedInsight.ringkasan || !parsedInsight.penyebab || !parsedInsight.saran) {
        throw new Error('Invalid AI response structure');
      }
      
      const newInsight = {
        tanggal: today,
        ringkasan: parsedInsight.ringkasan,
        penyebab: parsedInsight.penyebab,
        saran: parsedInsight.saran,
        timestamp: Date.now(),
        generated_by: "ai",
        data_context: dataContext // Simpan data untuk verifikasi
      };
      
      // Simpan atau update insight
      let savedInsight;
      if (existingInsight) {
        Object.assign(existingInsight, newInsight);
        savedInsight = existingInsight;
      } else {
        entry.insights.push(newInsight);
        savedInsight = newInsight;
      }
      
      if (force_refresh) {
        entry.refresh_count[todayKey] = refreshCount + 1;
      }
      
      saveUserEntry("database_insight.json", db);
      
      console.log(`[Insight AI] Generated successfully for user ${user_id}`);
      console.log(`[Insight AI] savedInsight:`, JSON.stringify(savedInsight, null, 2));
      
      // Return tanpa data_context untuk response (sudah ada di database)
      const {data_context, ...insightForResponse} = savedInsight;
      console.log(`[Insight AI] insightForResponse:`, JSON.stringify(insightForResponse, null, 2));
      
      return res.json({
        success: true,
        insight: insightForResponse,
        from_cache: false,
        refresh_count: entry.refresh_count[todayKey] || 0,
        max_refresh: MAX_REFRESH_PER_DAY
      });
      
    } catch (aiError) {
      console.error('[Insight AI] AI generation failed:', aiError.message);
      
      // Fallback ke template berbasis aturan
      const trendText = selisihUntung > 0 ? 'naik' : (selisihUntung < 0 ? 'turun' : 'sama');
      const selisihText = formatRupiah(Math.abs(selisihUntung));
      
      let penyebabText = '';
      if (produkHabis.length > 0) {
        penyebabText = `${produkHabis.slice(0, 2).join(' dan ')} habis sejak ${uangMasuk < 50000 ? 'pagi' : 'siang'}`;
      } else if (selisihUntung < 0) {
        penyebabText = `Penjualan turun dari kemarin`;
      } else {
        penyebabText = `Penjualan lancar${topProduk.length > 0 ? ', ' + topProduk[0].split(' (')[0] + ' laris' : ''}`;
      }
      
      let saranText = '';
      if (produkHabis.length > 0) {
        saranText = `Belanja ${produkHabis[0]} sebelum besok supaya tidak kehilangan pembeli`;
      } else if (produkTipis.length > 0) {
        saranText = `Stok ${produkTipis[0]} tinggal sedikit, siapkan belanjaan`;
      } else if (kasbonBelumLunas > 0) {
        saranText = `${kasbonBelumLunas} kasbon belum lunas, coba tagih yang sudah jatuh tempo`;
      } else {
        saranText = `Pertahankan pelayanan, besok bisa lebih baik lagi`;
      }
      
      const fallbackInsight = {
        tanggal: today,
        ringkasan: `Untung hari ini ${formatRupiah(untungHariIni)}, ${trendText} ${selisihText} dari kemarin`,
        penyebab: penyebabText,
        saran: saranText,
        timestamp: Date.now(),
        generated_by: "template",
        data_context: dataContext
      };
      
      // Simpan fallback insight
      let savedInsight;
      if (existingInsight) {
        Object.assign(existingInsight, fallbackInsight);
        savedInsight = existingInsight;
      } else {
        entry.insights.push(fallbackInsight);
        savedInsight = fallbackInsight;
      }
      
      if (force_refresh) {
        entry.refresh_count[todayKey] = refreshCount + 1;
      }
      
      saveUserEntry("database_insight.json", db);
      
      // Return tanpa data_context
      const {data_context, ...insightForResponse} = savedInsight;
      
      return res.json({
        success: true,
        insight: insightForResponse,
        from_cache: false,
        ai_failed: true,
        refresh_count: entry.refresh_count[todayKey] || 0,
        max_refresh: MAX_REFRESH_PER_DAY
      });
    }
    
  } catch (error) {
    console.error('[Insight AI] Error:', error);
    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan saat menghasilkan insight: " + error.message
    });
  }
});

// Helper function untuk format rupiah
function formatRupiah(angka) {
  if (angka >= 1000000) {
    return 'Rp ' + (angka / 1000000).toFixed(1).replace('.', ',') + ' juta';
  }
  return 'Rp ' + Math.round(angka).toLocaleString('id-ID');
}

// GET endpoint untuk mengambil insight
app.get("/api/insight", async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ success: false, error: "user_id wajib diisi" });
    }
    
    const { entry } = getUserEntry("database_insight.json", user_id);
    const today = new Date().toISOString().slice(0, 10);
    
    const todayInsight = (entry.insights || []).find(i => i.tanggal === today);
    
    if (!todayInsight) {
      return res.json({ success: true, insight: null });
    }
    
    const todayKey = today.replace(/-/g, '');
    const refreshCount = (entry.refresh_count || {})[todayKey] || 0;
    
    return res.json({
      success: true,
      insight: todayInsight,
      refresh_count: refreshCount,
      max_refresh: 5
    });
    
  } catch (error) {
    console.error('[Insight AI] GET Error:', error);
    return res.status(500).json({
      success: false,
      error: "Gagal mengambil insight"
    });
  }
});

=======
>>>>>>> e8b2c41e5c9c6cbbd8f2c55f11a49ff6854a5782
// ===== AI VOICE-TO-ORDER ENDPOINT =====
app.post("/api/voice-order", async (req, res) => {
  try {
    const { user_id, transcription, products } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ success: false, error: "user_id wajib diisi" });
    }
    
    if (!transcription || typeof transcription !== 'string' || transcription.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Transcription text wajib diisi" });
    }
    
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ success: false, error: "Daftar produk wajib diisi" });
    }
    
    console.log(`[Voice Order] Processing transcription for user ${user_id}, ${products.length} products in catalog`);
    console.log(`[Voice Order] Transcription: "${transcription}"`);
    
    // Parse transcription to structured JSON using Pollinations.AI Chat Completion
    const productNames = products.map(p => p.name).join(', ');
    const systemPrompt = `Anda adalah AI asisten kasir untuk aplikasi BantuKasir. Tugas Anda adalah mengekstrak pesanan dari teks ke dalam format JSON.

Daftar produk yang tersedia: ${productNames}

Format output yang WAJIB:
{
  "items": [
    { "product_name": "Nama Produk", "quantity": 1 }
  ]
}

Aturan:
1. Kembalikan HANYA format JSON, tanpa teks tambahan
2. Cocokkan nama produk dari teks dengan daftar produk yang tersedia (case-insensitive, fuzzy matching)
3. Ekstrak jumlah pesanan dari angka atau kata (satu=1, dua=2, tiga=3, dst)
4. Jika jumlah tidak disebutkan, default = 1
5. Jika produk tidak ada di daftar, tetap masukkan tapi gunakan nama yang paling mirip`;

    const chatResponse = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POLLINATIONS_API_KEY}`
      },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse pesanan ini: "${transcription}"` }
        ],
        response_format: { type: 'json_object' }
      })
    });
    
    if (!chatResponse.ok) {
      console.error('[Voice Order] Chat API failed:', chatResponse.status, chatResponse.statusText);
      return res.status(500).json({
        success: false,
        error: "Gagal memproses pesanan dengan AI"
      });
    }
    
    const chatData = await chatResponse.json();
    console.log('[Voice Order] Chat response:', JSON.stringify(chatData, null, 2));
    
    let parsedOrder;
    try {
      const content = chatData.choices?.[0]?.message?.content || '{}';
      parsedOrder = JSON.parse(content);
    } catch (parseError) {
      console.error('[Voice Order] Failed to parse AI response:', parseError.message);
      return res.status(500).json({
        success: false,
        error: "Gagal memproses format respons AI"
      });
    }
    
    if (!parsedOrder.items || !Array.isArray(parsedOrder.items) || parsedOrder.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Tidak dapat mengenali produk dari pesanan"
      });
    }
    
    console.log(`[Voice Order] Parsed ${parsedOrder.items.length} items:`, parsedOrder.items);
    
    return res.json({
      success: true,
      transcription,
      items: parsedOrder.items
    });
    
  } catch (error) {
    console.error('[Voice Order] Error:', error);
    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan saat memproses pesanan suara: " + error.message
    });
  }
});

// ===== JALANKAN SERVER =====
app.listen(PORT, () => {
  console.log(`\nBantuKasir Server running at http://localhost:${PORT}`);
  console.log(`Database folder: ${DB_PATH}`);
  console.log(`Unsplash API: ${UNSPLASH_ACCESS_KEY ? "✓ Configured" : "✗ Not configured"}`);
  console.log(`Pollinations.AI API: ${POLLINATIONS_API_KEY ? "✓ Configured" : "✗ Not configured"}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST   /api/auth/register`);
  console.log(`  POST   /api/auth/login`);
  console.log(`  GET    /api/produk?user_id=xxx`);
  console.log(`  POST   /api/produk`);
  console.log(`  GET    /api/transaksi?user_id=xxx`);
  console.log(`  POST   /api/transaksi`);
  console.log(`  PUT    /api/transaksi/:id/void`);
  console.log(`  GET    /api/laporan?user_id=xxx`);
  console.log(`  POST   /api/laporan`);
  console.log(`  GET    /api/kasbon?user_id=xxx`);
  console.log(`  POST   /api/kasbon`);
  console.log(`  POST   /api/kasbon/:id/bayar`);
  console.log(`  DELETE /api/kasbon/:id`);
  console.log(`  GET    /api/user/pengaturan?user_id=xxx`);
  console.log(`  PUT    /api/user/pengaturan`);
  console.log(`  POST   /api/voice-order (AI Voice-to-Order)`);
});
