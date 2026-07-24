# Scraper JFS

URL di bawah hanya menampilkan host/path aman. Header token dan query key laporan
tidak ditulis dalam dokumentasi.

| Scraper | Endpoint lokal | File/status | Upstream dan method | Input/default | Pagination | Utility | Return/response | Risiko dan test |
|---|---|---|---|---|---|---|---|---|
| Pickup | `/jfs-pickup` | `server.js` / Legacy | `/networkmanagement/omsWaybill/shippingWaybillList`, POST | `date`; default tanggal UTC source lama | 100, tanpa batas | Axios, FormData | internal langsung; `{total,data}` | Infinite loop; belum contract test lengkap |
| Dispatch | `/jfs-dispatch` | `server.js` / Legacy | `/networkmanagement/dispatchWaybill/list`, POST | `date`; hari ini WIB | 100, max 20 | Axios | langsung; `{success,total,page,data}` | Raw error; belum contract test lengkap |
| Aging sign | `/jfs-aging-sign` | `aging-sign.scraper.js` / Modular | JFS dynamic report path, POST | `date`; hari ini WIB | Satu halaman, size 20 | Shared request | `{data}`; `{success,total,data}` | Batas 20; scraper/service/controller/route diuji |
| COD | `/jfs-cod` | `server.js` / Legacy | `/codAccounting/api/collection-receipt-detail/page`, POST | `date`; hari ini WIB | 100, max 20 | Axios | langsung; `{success,total,page,data}` | Raw error; belum contract test lengkap |
| IBK | `/jfs-ibk-report` | `server.js` / Legacy | `/financialmanagement/ibkFundRecord/report`, POST | kemarin 00:00 sampai hari ini 23:59 WIB | 100, max 20 | Axios | langsung; `{success,total,page,data}` | Query URL selalu page 1; belum contract test |
| Sensitive detail | `/jfs-sensitive` | `sensitive.scraper.js` / Modular | `/networkmanagement/dispatchWaybill/sensitiveDetailByWaybillNo`, POST | `waybillNo`; tanpa default | Tidak ada | Axios | `{data}`; `{success,data}` | Data pribadi; scraper/service/controller/route diuji |
| OMS order sync | `/jfs-order-sync` | `server.js` / Legacy | OMS list POST + detail GET | `start`,`end`; awal bulan–saat ini WIB | List tanpa batas, detail per order | Axios, FormData | langsung; `{success,total,startTime,endTime,syncTime,data}` | Sangat berat; belum contract test |
| Inventory | `/jfs-inventory` | `server.js` / Legacy | OPS check list + detail, POST | `date`; hari ini WIB | Dua tingkat, size 20, tanpa batas | Axios | langsung; `{success,date,totalCheckCode,total,data}` | Sangat berat; belum contract test |

## Template scraper baru

```javascript
async function scrapeExample({
  requestFn,
  date
}) {
  // Build upstream request.
  // Map upstream data.
  return {
    data: []
  };
}
```

Scraper baru harus menerima dependency request, tidak memakai Express, tidak
mencatat credential, dan memiliki fixture anonim serta regression test sebelum
route didaftarkan.
