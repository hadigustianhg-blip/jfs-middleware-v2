# Arsitektur aplikasi

## Alur request

```text
Client
  → Express application (server.js)
  → Route
  → Controller
  → Service
  → Scraper
  → Shared request utility atau Axios
  → JFS upstream
```

Contoh aktual:

```text
GET /jfs-aging-sign
  → aging-sign.routes.js
  → aging-sign.controller.js
  → aging-sign.service.js
  → aging-sign.scraper.js
  → request.js
  → JFS report service
```

## Komponen dan tanggung jawab

### `server.js`

Membuat Express app, memasang middleware global dan route modular, menyimpan
route legacy, serta membuka listener. File ini tidak boleh mengganti entry point,
port, atau binding host tanpa pemeriksaan deployment.

### `routes`

Hanya mendefinisikan path, method, dan controller. Route tidak boleh membaca
credential, membuat payload JFS, memetakan data, atau menjalankan pagination.

### `controllers`

Membaca input HTTP, memanggil service, dan mempertahankan status serta response
publik. Controller tidak boleh melakukan request JFS, memetakan response
upstream, atau mengirim stack trace/raw response.

### `services`

Mengatur use case ringan, mendapatkan credential melalui dependency, memeriksa
token kosong, dan memanggil scraper. Service tidak mengenal Express.

### `scrapers`

Membangun URL/payload/header upstream, menjalankan request, parsing, dan mapping.
Scraper tidak menggunakan `req` atau `res` dan harus mendukung mock request.

### `utils`

Berisi fungsi umum: environment, tanggal Jakarta, pagination aman, response,
request eksternal, serta logger tersensor. Utility tidak menyimpan business
mapping endpoint.

### `config`

Menyimpan default non-rahasia dan pembacaan environment variable. Credential
tidak boleh menjadi constant source.

### `tests` dan `fixtures`

Test memverifikasi contract, mapping, keamanan, dan startup tanpa request
production. Fixture hanya memakai identitas dummy dan JSON kecil.

## Alur error

- Timeout menjadi `UPSTREAM_TIMEOUT`.
- HTTP 401/403 menjadi `UNAUTHORIZED` dan tidak di-retry.
- HTTP upstream lain menjadi `UPSTREAM_HTTP_ERROR`.
- Response bukan JSON menjadi `INVALID_JSON`.
- Network error menjadi `NETWORK_ERROR`.
- Retry hanya untuk timeout, connection reset, serta HTTP 429/502/503/504.
- Logger mencatat metadata aman; token, cookie, authorization, password,
  session, dan API key disensor.
- Controller modular mengirim pesan publik tanpa raw upstream response atau
  stack trace.

Endpoint legacy masih memiliki error handling tidak konsisten; kondisi tersebut
didokumentasikan, bukan diubah pada tahap dokumentasi.

## Endpoint legacy

Root, `/set-token`, pickup, dispatch, COD, IBK, OMS order sync, dan inventory
masih berada di `server.js`. Pemindahan ditunda karena pagination, volume data,
risiko kompatibilitas, atau kebutuhan keamanan khusus.

## Prinsip kompatibilitas

- Path dan method tidak berubah.
- Query parameter dan default tidak berubah.
- Status dan top-level response tidak berubah.
- Mapping serta urutan data tidak berubah.
- Refactor harus dibandingkan dengan commit baseline dan contract manifest.

## Rekomendasi urutan berikutnya

| Risiko | Kandidat | Alasan |
|---|---|---|
| Rendah–sedang | Dispatch, COD | Pagination dibatasi 20 tetapi masih duplikat |
| Sedang | Pickup | Pagination belum memiliki batas maksimum |
| Tinggi | IBK | Potensi halaman pertama berulang |
| Tinggi | OMS order sync | Pagination ditambah request detail per order |
| Tinggi | Inventory | Dua tingkat pagination |
| Khusus keamanan | `/set-token` | Token global dan terekspos melalui query/response |

Urutan ini hanya rekomendasi; tidak ada endpoint tambahan yang dimodularisasi
pada TAHAP 6.
