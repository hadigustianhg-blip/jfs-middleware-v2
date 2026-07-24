# Endpoint contract

Contract didokumentasikan berdasarkan source code dan automated test. Contoh
memakai data dummy. Endpoint legacy belum memiliki contract test lengkap dan
ditandai secara eksplisit.

## GET /

- Status: Legacy; tanpa upstream.
- Query: tidak ada.
- Sukses `200`: teks `API JFS Middleware (Pickup + Dispatch) 🚀`.
- Risiko: rendah.
- Test: entry point diuji, contract response berdasarkan analisis source.

## GET /set-token

- Status: Legacy, security-sensitive.
- Query: `token` wajib.
- Sukses `200`: `{ "message": "...", "token": "[REDACTED]" }`.
- Error `400`: `{ "error": "Token wajib diisi" }`.
- Token/session: mengubah token global runtime.
- Upstream: tidak ada.
- Risiko: sangat tinggi; query dan response mengekspos token.
- Test: contract berdasarkan analisis source; belum memiliki contract test
  lengkap. Endpoint sengaja tidak diubah.

## GET /jfs-pickup

- Status: Legacy.
- Query: `date` opsional; default tanggal UTC dari source lama.
- Sukses `200`: `{ "total": 1, "data": [{ "waybillNo": "TEST000001" }] }`.
- Token kosong `400`: `{ "error": "Token kosong" }`.
- Session expired `401`: `{ "error": "TOKEN EXPIRED", "detail": "..." }`.
- Error upstream `500`: `{ "error": "...", "detail": "..." }`.
- Upstream: OMS shipping waybill list, POST.
- Risiko: pagination tanpa batas dan default timezone berbeda.
- Test: contract berdasarkan analisis source; belum lengkap.

## GET /jfs-dispatch

- Status: Legacy.
- Query: `date` opsional; default hari ini WIB.
- Sukses `200`: `{ "success": true, "total": 1, "page": 1, "data": [] }`.
- Token kosong `400`: `{ "error": "Token kosong" }`.
- Error `500`: `{ "error": "Gagal ambil data dispatch", "detail": "..." }`.
- Upstream: dispatch waybill list, POST.
- Risiko: maksimum 20 halaman, raw upstream error.
- Test: contract berdasarkan analisis source; belum lengkap.

## GET /jfs-aging-sign

- Status: Modular.
- Query: `date` opsional; default hari ini WIB.
- Sukses `200`: `{ "success": true, "total": 0, "data": [] }`.
- Token kosong `400`: `{ "error": "Token kosong" }`.
- Error `500`: `{ "error": "Gagal ambil aging sign", "detail": "..." }`.
- Upstream: dynamic report aging sign, POST; query rahasia tidak
  didokumentasikan.
- Risiko: hanya halaman pertama dengan size 20.
- Test: scraper, service, controller, route, mapping, empty data, dan error diuji.

## GET /jfs-cod

- Status: Legacy.
- Query: `date` opsional; default hari ini WIB.
- Sukses `200`: `{ "success": true, "total": 0, "page": 0, "data": [] }`.
- Token kosong `400`: `{ "error": "Token kosong" }`.
- Error `500`: `{ "error": "Gagal ambil data COD", "detail": "..." }`.
- Upstream: COD collection receipt detail, POST.
- Risiko: pagination dan raw upstream error.
- Test: contract berdasarkan analisis source; belum lengkap.

## GET /jfs-ibk-report

- Status: Legacy, heavy.
- Query: tidak ada.
- Default: kemarin 00:00 hingga hari ini 23:59 WIB.
- Sukses `200`: `{ "success": true, "total": 0, "page": 0, "data": [] }`.
- Token kosong `400`: `{ "error": "Token kosong" }`.
- Error `500`: `{ "error": "Gagal ambil data IBK REPORT", "detail": "..." }`.
- Upstream: IBK fund record report, POST.
- Risiko: URL tetap memuat halaman pertama saat body berubah.
- Test: contract berdasarkan analisis source; belum lengkap.

## GET /jfs-sensitive

- Status: Modular, sensitive.
- Query: `waybillNo`; source lama tidak melakukan validasi wajib.
- Sukses `200`:

```json
{
  "success": true,
  "data": {
    "waybillNo": "TEST000001",
    "receiverName": "Customer Test",
    "receiverMobilePhone": "081200000000",
    "receiverDetailedAddress": "Alamat Test"
  }
}
```

- Token kosong `400`: `{ "error": "Token kosong" }`.
- Error `500`: `{ "success": false, "error": "..." }`.
- Upstream: sensitive dispatch detail, POST.
- Risiko: response berisi data pribadi.
- Test: scraper, service, controller, route, mapping, empty data, dan error diuji.

## GET /jfs-order-sync

- Status: Legacy, heavy.
- Query: `start`, `end` opsional; default awal bulan hingga saat ini WIB.
- Sukses `200`:
  `{ "success": true, "total": 0, "startTime": "...", "endTime": "...", "syncTime": "...", "data": [] }`.
- Token kosong `400`: `{ "error": "Token kosong" }`.
- Error `500`: `{ "success": false, "error": "..." }`.
- Upstream: OMS order list POST dan detail GET.
- Risiko: pagination tanpa batas, N+1 request, dan hasil dapat parsial.
- Test: contract berdasarkan analisis source; belum lengkap.

## GET /jfs-inventory

- Status: Legacy, heavy.
- Query: `date` opsional; default hari ini WIB.
- Sukses normal `200`:
  `{ "success": true, "date": "2026-07-24", "totalCheckCode": 1, "total": 0, "data": [] }`.
- Sukses tanpa check code `200` tidak memiliki `totalCheckCode`.
- Token kosong `400`: `{ "error": "Token kosong" }`.
- Session expired `401`: `{ "error": "TOKEN EXPIRED", "detail": "..." }`.
- Error `500`: `{ "error": "Gagal ambil data inventory", "detail": "..." }`.
- Upstream: OPS check list dan detail, keduanya POST.
- Risiko: dua tingkat pagination tanpa batas.
- Test: contract berdasarkan analisis source; belum lengkap.

## Catatan kompatibilitas

Google Apps Script dapat bergantung pada nama key, tipe nilai, dan perbedaan
response kosong. Contract tidak boleh “dirapikan” tanpa regression test dan
persetujuan migrasi consumer.
