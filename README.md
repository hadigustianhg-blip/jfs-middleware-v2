# JFS Middleware

JFS Middleware adalah aplikasi internal yang menjembatani sistem JFS dengan
Google Apps Script atau aplikasi internal lain. Aplikasi mengambil data dari
beberapa layanan JFS dan mempertahankan endpoint serta bentuk response lama agar
integrasi yang sudah berjalan tidak rusak. Project ini bukan API resmi J&T Cargo.

## Arsitektur

```text
Client / Google Apps Script
        ↓
Express Route
        ↓
Controller
        ↓
Service
        ↓
Scraper
        ↓
Shared Request Utility
        ↓
JFS Upstream
```

Saat ini `/jfs-aging-sign` dan `/jfs-sensitive` sudah memakai alur modular.
Endpoint lain masih berada di `server.js` dan dimigrasikan bertahap.

## Instalasi

```bash
git clone https://github.com/hadigustianhg-blip/jfs-middleware-v2.git
cd jfs-middleware-v2
npm install
```

Salin `.env.example` menjadi `.env` untuk penggunaan lokal, lalu isi credential
sendiri. Jangan commit file `.env`.

## Environment variable

| Nama | Wajib | Default | Sensitif | Fungsi |
|---|---|---:|---|---|
| `PORT` | Tidak | `3000` | Tidak | Port HTTP aplikasi |
| `AUTH_TOKEN` | Untuk scraping | Kosong | Ya | Token runtime JFS yang sudah digunakan aplikasi lama |
| `REQUEST_TIMEOUT_MS` | Tidak | `30000` | Tidak | Timeout shared request utility |
| `REQUEST_RETRY_COUNT` | Tidak | `1` | Tidak | Jumlah retry kondisi sementara |
| `DEFAULT_PAGE_SIZE` | Tidak | `100` | Tidak | Page size utility pagination |
| `DEFAULT_MAX_PAGES` | Tidak | `20` | Tidak | Batas utility pagination |

`AUTH_TOKEN` tetap opsional saat startup agar root endpoint dapat dijalankan,
tetapi endpoint scraping akan menolak request bila token kosong.

## Menjalankan aplikasi

```bash
npm start
```

Entry point tetap `server.js`. Server memakai `PORT` dan bind ke `0.0.0.0`.
Tidak ada script development khusus.

## Menjalankan test

```bash
npm test
npm run check
npm run test:contracts
npm run test:safety
```

Test memakai fixture anonim, dependency injection, atau server lokal. Test tidak
boleh menghubungi JFS production.

## Struktur aktual

```text
.
├── server.js
├── src/
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── scrapers/
│   ├── services/
│   └── utils/
├── tests/
│   ├── contracts/
│   └── fixtures/
├── docs/
├── .env.example
├── package.json
└── package-lock.json
```

## Endpoint

| Method | Endpoint | Status | Parameter utama | Keterangan |
|---|---|---|---|---|
| GET | `/` | Legacy | — | Root tanpa request upstream |
| GET | `/set-token` | Security-sensitive | `token` | Mengubah token runtime; risiko tinggi |
| GET | `/jfs-pickup` | Legacy | `date` | Data pickup |
| GET | `/jfs-dispatch` | Legacy | `date` | Data dispatch |
| GET | `/jfs-aging-sign` | Modular | `date` | Laporan aging sign |
| GET | `/jfs-cod` | Legacy | `date` | Data COD |
| GET | `/jfs-ibk-report` | Heavy | — | Laporan IBK dengan risiko pagination |
| GET | `/jfs-sensitive` | Modular, sensitive | `waybillNo` | Detail penerima |
| GET | `/jfs-order-sync` | Heavy | `start`, `end` | OMS dan detail per order |
| GET | `/jfs-inventory` | Heavy | `date` | Dua tingkat pagination |

Contract rinci tersedia di [docs/endpoints.md](docs/endpoints.md).

## Kompatibilitas

Endpoint ini digunakan Google Apps Script. Path, method, query, status, nama
property, nilai default, mapping, serta urutan data tidak boleh diganti
sembarangan. Setiap refactor harus memiliki fixture dan contract/regression test.

## Menambahkan scraper

1. Buat scraper CommonJS di `src/scrapers/`.
2. Buat fixture dummy di `tests/fixtures/`.
3. Uji URL, payload, mapping, data kosong, dan error scraper.
4. Buat service yang menerima plain object.
5. Buat controller yang mempertahankan response publik.
6. Buat route tanpa prefix baru.
7. Daftarkan route di `src/routes/index.js`.
8. Tambahkan endpoint ke manifest kontrak.
9. Jalankan semua test dan periksa diff.
10. Jangan menyimpan token, cookie, data customer asli, atau credential lain.

## Deployment

Repository tidak memiliki `railway.json`, `railway.toml`, `Procfile`, atau
`Dockerfile`. Konfigurasi yang dapat dibuktikan dari source adalah:

- Entry point: `server.js`
- Start command: `node server.js`
- Port: `PORT`, default `3000`
- Host binding: `0.0.0.0`
- Versi Node: belum dikunci

Project telah disebut berjalan di Railway, tetapi commit deployment aktif tidak
dapat dibuktikan dari repository lokal. Tahap refactor ini tidak melakukan
deployment.

## Aturan keamanan

- Jangan commit `.env` atau hardcode token.
- Jangan mencatat cookie, authorization, password, session, atau API key.
- Jangan mengirim stack trace, header internal, atau raw upstream response.
- Jangan memakai data production sebagai fixture.
- Jangan memanggil endpoint production saat automated test.
- Review `/set-token` secara khusus sebelum aplikasi digunakan multi-client.
