# JFS scrapers

Scraper module tidak bergantung pada Express. Route tetap membaca parameter dan
mengirim kontrak response lama, sedangkan module membuat request, membaca
response upstream, dan memetakan data.

## Scraper modular

| Module | Endpoint | Parameter internal | Return internal | Response publik |
|---|---|---|---|---|
| `aging-sign.scraper.js` | `GET /jfs-aging-sign` | `date`, `authToken`, `requestFn` | `{ data }` | `{ success, total, data }` |
| `sensitive.scraper.js` | `GET /jfs-sensitive` | `waybillNo`, `authToken`, `requestFn` | `{ data }` | `{ success, data }` |

Aging sign menggunakan shared request utility sehingga memiliki timeout, retry
terbatas, parsing JSON, dan log error tersensor. Sensitive detail tetap memakai
Axios secara default untuk mempertahankan perilaku request lama. Keduanya
mendukung dependency injection agar test tidak menghubungi JFS.

## Menambahkan scraper

1. Buat module CommonJS di `src/scrapers/` tanpa `req` atau `res`.
2. Terima parameter dan `requestFn` melalui argument object.
3. Pertahankan URL, method, payload, header, mapping, dan urutan data lama.
4. Export scraper melalui `src/scrapers/index.js`.
5. Buat fixture anonim dan test request configuration, mapping, data kosong,
   property hilang, serta upstream error.
6. Integrasikan satu endpoint dan pertahankan response/error publiknya.

## Belum modular

- Pickup: pagination tanpa batas maksimum.
- Dispatch: pagination maksimum 20 halaman.
- COD: pagination maksimum 20 halaman.
- IBK report: pagination berisiko mengulang halaman pertama.
- OMS order sync: pagination dan request detail per order.
- Inventory: dua tingkat pagination.

Risiko utama migrasi berikutnya adalah perubahan jumlah/urutan data, perilaku
pagination, response parsial, dan pesan error yang digunakan Google Apps Script.
