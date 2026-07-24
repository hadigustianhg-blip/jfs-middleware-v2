# Rollback plan

## Titik pemulihan

- Baseline Git lokal sebelum refactor: `db5bb54`
- Branch refactor sebelum integration-review commit: `d4d4a7f`
- Commit production Railway: belum terverifikasi; wajib dicatat sebelum deploy

Hash baseline lokal tidak boleh dianggap sebagai commit production aktif sampai
dibuktikan melalui Railway.

## Sebelum merge

Jika integrasi dibatalkan sebelum merge, kembali melihat branch utama tanpa
menghapus branch refactor:

```bash
git switch main
```

Jangan menghapus branch refactor sebelum review dan rollback dinyatakan selesai.

## Setelah merge tetapi sebelum deploy

Jika digunakan merge commit, buat revert baru; jangan reset paksa:

```bash
git revert -m 1 <merge-commit>
```

Jika integrasi akhirnya memakai squash commit, gunakan:

```bash
git revert <squash-commit>
```

Jalankan test pada commit revert sebelum push atau deploy. Jangan menulis ulang
history branch bersama.

## Setelah deploy Railway

Opsi aman:

1. Redeploy commit production sebelumnya yang sudah dicatat dan terbukti sehat.
2. Revert merge commit, review/test hasil revert, lalu deploy commit revert.

Environment variable tidak boleh dihapus atau diubah saat rollback kecuali ada
instruksi insiden khusus. Domain Railway dan URL Google Apps Script tidak perlu
diubah bila rollback memakai contract endpoint lama.

## Verifikasi rollback

- [ ] Root aktif
- [ ] Seluruh endpoint lama terdaftar
- [ ] Google Apps Script membaca data
- [ ] Response keys tetap
- [ ] Log dan error rate normal
- [ ] Tidak ada credential berubah atau tercetak
- [ ] Tidak ada pagination berulang
- [ ] Commit aktif Railway sesuai rollback point

Rollback tidak dijalankan pada TAHAP 7.
