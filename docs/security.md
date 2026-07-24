# Keamanan

## Credential

Credential harus berasal dari environment variable. `.env` tidak boleh
di-commit dan `.env.example` hanya berisi nama variable/default non-rahasia.
Token, cookie, password, authorization, session, dan API key tidak boleh
ditulis sebagai literal production.

## Logging

Logger bersama menyensor field sensitif, termasuk object bertingkat. Log hanya
boleh memuat endpoint/use case, kode error, status, durasi, dan jumlah data yang
memang diperlukan. Body sensitif, header penuh, raw response, data penerima, dan
stack trace tidak boleh dicatat.

## Risiko `/set-token`

`GET /set-token` mengubah token runtime global dari query string dan
mengembalikan token dalam response. Endpoint tidak memiliki proteksi tambahan.
Risikonya tinggi karena query dapat masuk access log/history, token hilang saat
restart, dan nilai dapat berbeda antar-instance. Endpoint belum diperbaiki pada
TAHAP 6 karena merupakan contract lama dan memerlukan rencana migrasi khusus.

Endpoint ini tidak boleh diekspos tanpa proteksi. Sebelum multi-client, pindahkan
credential ke penyimpanan/config yang terisolasi dan sediakan mekanisme rotasi
yang kompatibel.

## Error handling

Controller modular tidak mengirim stack trace, header internal, atau raw
upstream response. Endpoint legacy belum seluruhnya memenuhi aturan ini dan
harus ditangani bertahap bersama contract test.

## Testing

- Semua upstream request harus dimock atau memakai server lokal.
- Fixture wajib anonim.
- Test dilarang menghubungi production.
- Dummy secret harus jelas berlabel test dan diverifikasi tersensor.

## Git

Gunakan branch refactor, catat commit baseline, review diff dan secret scan
sebelum push. Jangan menyimpan credential dalam commit/history. Commit pada
branch ini masih lokal sampai ada persetujuan terpisah.

## Risiko multi-client

Token dan session saat ini bersifat global. Tanpa isolasi, token antar-client
dapat tertukar, outlet yang salah dapat dipakai, dan data dapat bocor antar
client. Hardcoded outlet/network juga belum menjadi resolver multi-client.
Risiko desain ini belum diselesaikan sepenuhnya.
