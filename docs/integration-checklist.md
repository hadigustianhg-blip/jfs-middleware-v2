# Integration checklist

Branch refactor: `refactor/scraping-structure-v2`
Baseline lokal: `db5bb54`
HEAD hasil TAHAP 6: `d4d4a7f`

Checklist ini tidak menjalankan push, merge, atau deployment.

## Sebelum push

- [ ] Branch `refactor/scraping-structure-v2` aktif
- [ ] Working tree bersih
- [ ] Seluruh test lulus
- [ ] Syntax check lulus
- [ ] Diff `main...HEAD` sudah direview
- [ ] Tidak ada credential atau data production
- [ ] Start command tetap `node server.js`
- [ ] Contract endpoint tidak berubah
- [ ] Rollback commit production sudah dikonfirmasi
- [ ] Identitas author/committer Git sudah benar
- [ ] Temuan dependency audit sudah mendapat keputusan pemilik project

## Sebelum merge

- [ ] Branch `main` terbaru sudah ditinjau setelah branch dipush
- [ ] Tidak ada conflict dengan `origin/main`
- [ ] Test dijalankan ulang setelah merge simulation terbaru
- [ ] Reviewer menyetujui diff dan contract manifest
- [ ] Endpoint modular dibandingkan dengan baseline
- [ ] Delapan endpoint legacy tetap tersedia
- [ ] Strategi merge commit disetujui
- [ ] Commit merge yang akan menjadi rollback target dicatat

## Sebelum deploy

- [ ] Environment Railway lengkap tanpa menyalin credential ke source
- [ ] Commit production aktif benar-benar dikonfirmasi dari Railway
- [ ] Backup/redeploy point production tersedia
- [ ] Commit yang akan dideploy dicatat
- [ ] Tidak ada perubahan domain, method, path, atau query
- [ ] Versi Node Railway dikonfirmasi kompatibel
- [ ] Kerentanan critical/high dependency telah ditinjau dan ditangani atau
      diterima secara tertulis
- [ ] Window monitoring dan penanggung jawab tersedia
- [ ] Rollback plan siap

## Setelah deploy

- [ ] Root endpoint aktif
- [ ] `/jfs-aging-sign` aktif dengan fixture tanggal terkontrol
- [ ] `/jfs-sensitive` aktif menggunakan waybill test yang diizinkan
- [ ] Google Apps Script tetap membaca response
- [ ] Response contract sama
- [ ] Log tidak membocorkan credential atau data penerima
- [ ] Tidak ada lonjakan error
- [ ] Tidak ada timeout baru
- [ ] Tidak ada pagination berulang
- [ ] Token tidak tercampur antar-instance

Endpoint scraping tidak boleh diuji secara destruktif atau dengan data production
tanpa window dan otorisasi operasional yang jelas.
