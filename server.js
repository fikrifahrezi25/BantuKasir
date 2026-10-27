// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
require('dotenv').config(); // Load .env file

const app = express();
const PORT = 9123;

// Unsplash Access Key dari .env
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Middleware untuk parse JSON
app.use(express.json());

// Lokasi file log visitor
const visitorLogPath = path.join(__dirname, "visitor-count.txt");

// Inisialisasi file log jika belum ada
if (!fs.existsSync(visitorLogPath)) {
  fs.writeFileSync(visitorLogPath, "0", "utf-8");
}

// Middleware logging visitor khusus untuk request ke root "/"
app.get("/", (req, res, next) => {
  try {
    let count = parseInt(fs.readFileSync(visitorLogPath, "utf-8").trim()) || 0;
    count += 1;
    fs.writeFileSync(visitorLogPath, count.toString(), "utf-8");
    console.log(`Visitor ke-${count} baru masuk.`);
  } catch (err) {
    console.error("Gagal memperbarui file log visitor:", err);
  }
  next(); // Lanjutkan ke middleware static untuk merender index.html
});

// Middleware untuk melayani file statis (HTML, CSS, JS, Gambar) dari folder "public_html"
app.use(express.static(path.join(__dirname, "public_html")));

// ===== ENDPOINT UNSPLASH API =====
// Endpoint untuk mendapatkan foto produk dari Unsplash
app.get("/api/product-photo", (req, res) => {
  const query = req.query.q;
  
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  // Validasi Access Key
  if (!UNSPLASH_ACCESS_KEY) {
    return res.status(500).json({ 
      error: "Unsplash Access Key not configured",
      message: "Please set UNSPLASH_ACCESS_KEY in .env file"
    });
  }

  console.log(`[Unsplash API] Searching for: "${query}"`);
  
  const encodedQuery = encodeURIComponent(query);
  const apiUrl = `https://api.unsplash.com/search/photos?page=1&query=${encodedQuery}&per_page=1`;

  const options = {
    headers: {
      'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      'Accept-Version': 'v1'
    }
  };

  https.get(apiUrl, options, (apiRes) => {
    let data = '';
    
    console.log(`[Unsplash API] Response status: ${apiRes.statusCode}`);

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        
        console.log(`[Unsplash API] Results found: ${parsed.results ? parsed.results.length : 0}`);
        
        if (parsed.results && parsed.results.length > 0) {
          const photo = parsed.results[0];
          console.log(`[Unsplash API] Photo URL: ${photo.urls.small}`);
          res.json({
            success: true,
            photo: {
              url: photo.urls.regular,
              thumb: photo.urls.thumb,
              small: photo.urls.small,
              author: photo.user.name,
              author_url: photo.user.links.html
            }
          });
        } else {
          console.log(`[Unsplash API] No results for query: "${query}"`);
          res.json({
            success: false,
            message: "No photos found for this query"
          });
        }
      } catch (err) {
        console.error("[Unsplash API] Error parsing response:", err);
        console.error("[Unsplash API] Raw response:", data);
        res.status(500).json({ 
          error: "Failed to parse Unsplash response",
          details: err.message 
        });
      }
    });
  }).on('error', (err) => {
    console.error("[Unsplash API] Request error:", err);
    res.status(500).json({ 
      error: "Failed to fetch from Unsplash",
      details: err.message 
    });
  });
});

// ===== ENDPOINT KASBON API =====
// Data kasbon disimpan ke file JSON agar persisten tanpa database eksternal
const kasbonFilePath = path.join(__dirname, "kasbon-data.json");

function bacaKasbon() {
  try {
    if (!fs.existsSync(kasbonFilePath)) return [];
    const raw = fs.readFileSync(kasbonFilePath, "utf-8").trim();
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("[Kasbon] Gagal membaca file:", err);
    return [];
  }
}

function simpanKasbon(data) {
  try {
    fs.writeFileSync(kasbonFilePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Kasbon] Gagal menyimpan file:", err);
    throw err;
  }
}

// GET /api/kasbon — Ambil semua data kasbon
app.get("/api/kasbon", (req, res) => {
  try {
    const data = bacaKasbon();
    console.log(`[Kasbon] GET semua: ${data.length} pelanggan`);
    res.json({ success: true, kasbon: data });
  } catch (err) {
    res.status(500).json({ success: false, error: "Gagal membaca data kasbon" });
  }
});

// POST /api/kasbon — Buat entri kasbon baru atau tambah utang ke pelanggan existing
// Body: { nama, hp, jml, catatan, items }
app.post("/api/kasbon", (req, res) => {
  try {
    const { nama, hp, jml, catatan, items } = req.body;
    if (!nama || !nama.trim()) {
      return res.status(400).json({ success: false, error: "Nama pelanggan wajib diisi" });
    }
    if (!jml || isNaN(jml) || Number(jml) <= 0) {
      return res.status(400).json({ success: false, error: "Jumlah kasbon harus lebih dari 0" });
    }

    const data = bacaKasbon();
    let pel = data.find(p => p.nama.toLowerCase() === nama.trim().toLowerCase());

    if (!pel) {
      pel = { id: `kb_${Date.now()}`, nama: nama.trim(), hp: hp ? hp.trim() : "", riwayat: [] };
      data.push(pel);
      console.log(`[Kasbon] Pelanggan baru: "${pel.nama}" (${pel.id})`);
    } else {
      if (hp && hp.trim()) pel.hp = hp.trim();
      console.log(`[Kasbon] Tambah utang ke pelanggan existing: "${pel.nama}"`);
    }

    pel.riwayat.push({
      tipe: "utang",
      jml: Number(jml),
      tgl: Date.now(),
      catatan: catatan ? catatan.trim() : "",
      items: items || []
    });

    simpanKasbon(data);
    res.json({ success: true, pelanggan: pel });
  } catch (err) {
    console.error("[Kasbon] POST error:", err);
    res.status(500).json({ success: false, error: "Gagal menyimpan kasbon" });
  }
});

// POST /api/kasbon/:id/bayar — Catat pembayaran cicilan atau lunas
// Body: { jml, catatan }
app.post("/api/kasbon/:id/bayar", (req, res) => {
  try {
    const { id } = req.params;
    const { jml, catatan } = req.body;

    if (!jml || isNaN(jml) || Number(jml) <= 0) {
      return res.status(400).json({ success: false, error: "Jumlah bayar harus lebih dari 0" });
    }

    const data = bacaKasbon();
    const pel = data.find(p => p.id === id);
    if (!pel) {
      return res.status(404).json({ success: false, error: "Pelanggan tidak ditemukan" });
    }

    const totalUtang = pel.riwayat.filter(r => r.tipe === "utang").reduce((s, r) => s + r.jml, 0);
    const totalBayar = pel.riwayat.filter(r => r.tipe === "bayar").reduce((s, r) => s + r.jml, 0);
    const sisa = totalUtang - totalBayar;

    const jumlahBayar = Math.min(Number(jml), sisa);
    if (jumlahBayar <= 0) {
      return res.status(400).json({ success: false, error: "Kasbon pelanggan ini sudah lunas" });
    }

    pel.riwayat.push({
      tipe: "bayar",
      jml: jumlahBayar,
      tgl: Date.now(),
      catatan: catatan ? catatan.trim() : ""
    });

    simpanKasbon(data);
    const sisaBaru = sisa - jumlahBayar;
    console.log(`[Kasbon] Bayar "${pel.nama}": ${jumlahBayar}, sisa: ${sisaBaru}`);
    res.json({ success: true, pelanggan: pel, sisa: sisaBaru });
  } catch (err) {
    console.error("[Kasbon] POST bayar error:", err);
    res.status(500).json({ success: false, error: "Gagal menyimpan pembayaran" });
  }
});

// DELETE /api/kasbon/:id — Hapus seluruh data kasbon satu pelanggan
app.delete("/api/kasbon/:id", (req, res) => {
  try {
    const { id } = req.params;
    const data = bacaKasbon();
    const idx = data.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: "Pelanggan tidak ditemukan" });
    }
    const nama = data[idx].nama;
    data.splice(idx, 1);
    simpanKasbon(data);
    console.log(`[Kasbon] Hapus "${nama}" (${id})`);
    res.json({ success: true, message: `Data kasbon "${nama}" dihapus` });
  } catch (err) {
    console.error("[Kasbon] DELETE error:", err);
    res.status(500).json({ success: false, error: "Gagal menghapus kasbon" });
  }
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`Web Server running at http://localhost:${PORT}`);
  console.log(`Unsplash API: ${UNSPLASH_ACCESS_KEY ? '✓ Access Key configured' : '✗ Access Key NOT configured'}`);
  if (UNSPLASH_ACCESS_KEY) {
    console.log(`Access Key: ${UNSPLASH_ACCESS_KEY.substring(0, 10)}...`);
  }
});
