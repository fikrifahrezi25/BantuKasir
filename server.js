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

// Jalankan server
app.listen(PORT, () => {
  console.log(`Web Server running at http://localhost:${PORT}`);
  console.log(`Unsplash API: ${UNSPLASH_ACCESS_KEY ? '✓ Access Key configured' : '✗ Access Key NOT configured'}`);
  if (UNSPLASH_ACCESS_KEY) {
    console.log(`Access Key: ${UNSPLASH_ACCESS_KEY.substring(0, 10)}...`);
  }
});
