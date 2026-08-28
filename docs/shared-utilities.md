# Shared utilities

Utility bersama menyediakan konfigurasi environment, tanggal Jakarta, pagination
terbatas, request HTTP, response Express, dan logging yang menyensor credential.

## Penggunaan

`externalRequest` menggunakan Axios, timeout, serta retry terbatas untuk timeout,
connection reset, dan HTTP 429/502/503/504. HTTP 400/401/403 tidak di-retry.

```js
const { externalRequest } = require("../src/utils/request");

const response = await externalRequest({
  method: "POST",
  url,
  headers,
  body,
  timeoutMs: 30000,
  retries: 1
});
```

Error request menyediakan `code`, `status`, `isTimeout`, dan `isUpstream`.
Response non-JSON menggunakan kode `INVALID_JSON`.

`fetchAllPages` selalu memerlukan batas `maxPages` dan memberikan `items`,
`pageCount`, serta `stoppedReason`.

```js
const result = await fetchAllPages({
  fetchPage: ({ page, pageSize }) => loadPage(page, pageSize),
  pageSize: 100,
  maxPages: 20,
  getItems: response => response.data.records
});
```

Logger hanya boleh menerima context yang diperlukan untuk diagnosis. Field token,
cookie, authorization, password, secret, session, dan API key otomatis menjadi
`[REDACTED]`; body dan response mentah tetap tidak boleh dicatat.

Jalankan test dengan `npm test` dan syntax check dengan `npm run check`.

## Status integrasi

`/jfs-aging-sign` menggunakan date, request, response, dan logger melalui alur
route/controller/service/scraper. `/jfs-sensitive` memakai logger serta pola
modular, tetapi request scraper tetap menggunakan Axios untuk mempertahankan
perilaku lamanya. URL, parameter, mapping, dan response contract tetap.
Pagination helper belum dipakai endpoint production. Endpoint lainnya masih
menggunakan implementasi legacy dan akan dimigrasikan satu per satu setelah
compatibility test tersedia.

Risiko tersisa meliputi variasi response JFS, pagination lama tanpa batas, serta
error response lama yang masih dapat membawa detail upstream.
