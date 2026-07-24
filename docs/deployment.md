# Deployment

## Konfigurasi yang ditemukan

- Entry point: `server.js`
- Start command: `node server.js` melalui `npm start`
- Port: `process.env.PORT || 3000`
- Binding: `0.0.0.0`
- Versi Node: belum ditentukan oleh `engines`, `.nvmrc`, atau `.node-version`
- Railway config file: tidak ditemukan
- Health endpoint khusus: tidak tersedia; root `/` hanya mengembalikan teks

Railway dapat mendeteksi aplikasi Node dari `package.json`, tetapi commit yang
sedang aktif di Railway tidak dapat diverifikasi dari repository lokal.

## Environment

Sediakan variable yang tercantum di `.env.example`. `AUTH_TOKEN` bersifat
sensitif. Jangan menyalin nilainya ke source, dokumentasi, command history, atau
log.

## Rollback Git

1. Catat branch dan commit production sebelum deploy.
2. Jangan menghapus branch/tag backup.
3. Jika regresi terjadi, pilih commit production terakhir yang sudah terbukti
   aman melalui proses release organisasi.
4. Deploy ulang commit aman melalui Railway secara manual.
5. Jangan memakai `git reset --hard` pada working copy berisi perubahan lokal.

TAHAP 6 tidak melakukan deployment atau rollback.

## Checklist sebelum deploy

- [ ] Branch benar
- [ ] Working tree bersih
- [ ] `npm test` lulus
- [ ] Syntax check lulus
- [ ] Tidak ada credential dalam diff
- [ ] Endpoint contract tidak berubah
- [ ] Environment variable tersedia
- [ ] Commit telah direview
- [ ] Backup commit production dicatat
- [ ] Versi Node target telah dikonfirmasi

## Checklist setelah deploy

- [ ] Root atau health endpoint aktif
- [ ] Endpoint pilot merespons
- [ ] Google Apps Script tetap dapat membaca response
- [ ] Log tidak mengandung credential
- [ ] Error rate normal
- [ ] Tidak ada pagination berulang
- [ ] Token/session tidak tercampur antar-instance
