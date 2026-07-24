# Application architecture

```text
Request
  → Route
  → Controller
  → Service
  → Scraper
  → Shared Request Utility or Axios
  → JFS
```

Routes hanya menetapkan method dan path tanpa prefix. Controllers membaca query,
mempertahankan status serta response publik, dan menerjemahkan error. Services
mengambil token melalui dependency yang diberikan aplikasi lalu mengorkestrasi
scraper. Scrapers membentuk request upstream, parsing, dan mapping tanpa mengenal
Express.

Error internal dicatat menggunakan logger yang menyensor credential. Controller
tidak mengirim header, stack trace, atau raw response upstream. Response sukses
tetap mengikuti contract endpoint lama.

Endpoint yang sudah memakai pola baru:

- `GET /jfs-aging-sign`
- `GET /jfs-sensitive`

Endpoint pickup, dispatch, COD, IBK report, OMS order sync, dan inventory masih
berada di `server.js`.

Untuk menambahkan endpoint baru, buat scraper independen dan test fixture lebih
dahulu, lalu service tipis, controller contract, serta route GET tanpa prefix.
Daftarkan dependency di `src/routes/index.js` dan uji path, method, response,
error, serta entry point.

Token, cookie, authorization, password, session, API key, dan data customer asli
tidak boleh disimpan dalam source, fixture, dokumentasi, atau log.
