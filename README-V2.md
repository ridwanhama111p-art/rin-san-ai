# Rin-san AI v2 — Pencarian & Backup + Suara Rin

**Tanggal:** 11 November 2026
**Basis:** salinan lengkap `../cleaned/` (script.js 1.615 baris yang sudah
dibersihkan dari fungsi duplikat) + fitur baru di folder ini saja. Folder `cleaned/` dan
`original/` **tidak diubah**. Belum di-push ke GitHub.

## Ringkasan perubahan

| File | Sebelum | Sesudah |
|---|---|---|
| `script.js` | 1.615 baris, 88 fungsi | 2.114 baris, 111 fungsi, 0 duplikat |
| `index.html` | 177 baris | 209 baris |
| `Style.css` | 1.408 baris | 1.498 baris (+90 baris, hanya untuk elemen baru) |
| Aset (`rin.jpg`, `rin-full.jpg`, `rin-sheet.png`, font) | — | tidak diubah |

`WORKER_URL` (`https://rin-san.ridwanhama111p.workers.dev`) dan semua
localStorage key lama (`rinChats`, `rinTheme`, `rinPersona`, `rinMemory`,
`rinMemoryOn`, migrasi `rinChat`) **tidak diubah**. Worker tidak disentuh.

## Fitur #2 — Pencarian & backup JSON

### Cari chat di sidebar
- Input "Cari obrolan..." di atas daftar chat (sidebar).
- Filter judul chat secara live, case-insensitive; kosong = tampilkan semua.
- Kalau tidak ada yang cocok: "Tidak ada obrolan yang cocok."

### Cari pesan di chat aktif
- Tekan tombol 🔍 di header chat untuk membuka/menutup bar pencarian.
- Ketik kata kunci: **semua** pesan yang cocok langsung di-highlight
  (garis tepi pada bubble) dan penghitung `n/total` diperbarui — layar
  **tidak** melompat sendiri saat mengetik.
- Enter / tombol › = lompat ke match berikutnya, ‹ = sebelumnya
  (membungkus di ujung), match aktif ditandai lebih tebal dan
  di-scroll ke tengah. Pencarian case-insensitive, mencakup teks pesan
  dan caption foto.
- Tutup bar (✕) = bersihkan pencarian. Highlight ikut pulih otomatis
  setiap kali chat di-render ulang (mis. setelah kirim pesan).

### Ekspor cadangan
- Pengaturan → "Suara & cadangan" → "⬇️ Ekspor cadangan (JSON)".
- Mengunduh `rin-san-ai-backup-YYYY-MM-DD.json` (tanggal lokal) berisi:
  `rinChats` (semua chat), `rinPersona`, `rinMemory`, `rinTheme`,
  `rinMemoryOn`, `rinVoiceOn`, plus `app`, `version`, `exportedAt`.
- Pakai `Blob` + `a.download`, tanpa server.

### Impor cadangan
- Pengaturan → "Suara & cadangan" → "⬆️ Impor cadangan (JSON)",
  pilih file `.json`.
- File divalidasi: harus JSON valid dan punya `rinChats` berupa
  `{chats: [...]}` atau array chat. File tidak valid → toast
  "File backup tidak valid", **data lama tidak rusak**.
- File valid → dialog konfirmasi (jumlah obrolan + tanggal ekspor)
  sebelum menimpa. Setelah "Ya, impor": data disimpan ke localStorage,
  tema/persona/memori/suara diterapkan, chat di-render ulang.
- Backup dari versi lama (tanpa `rinVoiceOn`/`rinMemoryOn`) tetap bisa
  diimpor; field yang tidak ada dibiarkan apa adanya.

## Fitur #3 — Suara Rin (TTS) + input suara (STT)

Semua client-side via Web Speech API, tanpa server baru. Semua akses
`speechSynthesis` / `SpeechRecognition` dijaga `typeof` check, jadi
browser tanpa API dan `node --check` tetap jalan.

### TTS — balasan Rin dibacakan
- Pengaturan → "Suara & cadangan" → tombol "Suara Rin: Mati/Aktif".
  **Default MATI**, disimpan di key baru `rinVoiceOn` (`"1"`/`"0"`).
- Kalau aktif: balasan Rin yang baru dibacakan otomatis.
- Tombol 🔊 di footer tiap balasan Rin memutar balasan itu sekali —
  tombol ini jalan **walau toggle mati** (aksi eksplisit pengguna).
  Tombol berubah jadi ⏹️ selama membacakan.
- Suara: dipilih suara Bahasa Indonesia kalau ada (prioritas:
  `lang` diawali `id`, nama mengandung "Google Bahasa Indonesia" /
  "Indonesian", lalu suara perempuan), fallback ke suara default
  browser. `lang="id-ID"`, `rate=1`, `pitch=1.05`.
- Sebelum dibacakan, markup `**bold**` / `*italic*` dan emoji
  dibersihkan. Suara yang sedang jalan dihentikan (`cancel()`) saat
  pesan baru dibacakan, saat toggle dimatikan, dan saat pindah chat.

### STT — input suara
- Tombol 🎤 di kolom ketik (sebelah tombol Kirim), pakai
  `SpeechRecognition` / `webkitSpeechRecognition`, `lang="id-ID"`,
  `interimResults=true`.
- Hasil akhir masuk ke kolom teks (**tidak langsung dikirim**) — bisa
  diedit dulu baru tekan Kirim. Saat merekam tombol jadi 🔴 berdenyut.
- Browser tidak mendukung (mis. Firefox): tombol tetap ada, klik
  menampilkan toast "Browser ini tidak mendukung input suara",
  tidak crash. Izin mikrofon ditolak → toast "Izin mikrofon ditolak".

## Key localStorage baru

| Key | Isi |
|---|---|
| `rinVoiceOn` | `"1"` = suara Rin otomatis aktif, `"0"`/tidak ada = mati (default) |

Key lama tidak berubah: `rinChats`, `rinTheme`, `rinPersona`,
`rinMemory`, `rinMemoryOn`.

## Cara pakai (uji manual di browser)

1. Buka `index.html` di folder ini (atau deploy folder ini apa adanya).
2. **Cari chat:** buka sidebar (☰) → ketik di "Cari obrolan..." →
   daftar menyempit; hapus teks → semua kembali.
3. **Cari pesan:** tekan 🔍 di header → ketik kata → pesan yang cocok
   berbingkai; tekan Enter/› untuk melompat; ✕ untuk menutup.
4. **Ekspor:** Pengaturan (⚙️) → "Suara & cadangan" → "⬇️ Ekspor
   cadangan (JSON)" → file terunduh.
5. **Impor:** tombol "⬆️ Impor cadangan (JSON)" → pilih file backup →
   konfirmasi "Ya, impor" → chat/tema/persona kembali seperti di backup.
   Coba juga file `.json` sembarangan → harus muncul toast error dan
   data tetap utuh.
6. **Suara:** Pengaturan → "Suara & cadangan" → nyalakan "Suara Rin" →
   kirim pesan → balasan dibacakan. Tekan 🔊 di balasan lama → dibacakan
   sekali. Matikan toggle → suara berhenti.
7. **Mic:** tekan 🎤 → izinkan mikrofon → bicara → teks muncul di kolom
   ketik → tekan Kirim. Di browser tanpa dukungan, tekan 🎤 → toast.

## Verifikasi (11 November 2026)

- `node --check script.js`: **OK**.
- Grep: **111 fungsi, 0 duplikat**; semua 36 fungsi `onclick` di
  `index.html` (termasuk 13 fungsi baru v2) tetap global;
  `WORKER_URL` dan key lama tetap ada.
- Smoke test node `../smoke-test-v2.mjs` (stub DOM + stub
  `speechSynthesis`/`SpeechRecognition`/`Blob`/`FileReader`):
  **62/62 checks lulus** — init, toggle suara + simpan `rinVoiceOn`,
  TTS (bersihkan markup, pilih suara id-ID, `cancel()` saat bicara
  baru/dimatikan), STT tanpa dukungan (toast, tidak crash) dan dengan
  dukungan (hasil masuk input), kirim pesan lama tetap jalan, cari chat
  (filter/tanpa hasil/kosong), cari pesan (match, penghitung, next,
  tanpa hasil), ekspor (isi + nama file), impor valid (konfirmasi +
  timpa data) dan tidak valid (JSON rusak & `rinChats` bukan array —
  data lama aman), `toggleAcc('backup')`.
- Folder `cleaned/` tidak berubah (SHA blob `script.js` masih
  `0db927ae…`, `index.html` masih `11d98f7d…`).

## Batasan yang diketahui / belum teruji di browser sungguhan

- **Belum diuji di browser sungguhan.** Smoke test di atas memakai stub
  di node. Yang wajib dicoba manual: suara & mic di Chrome Android
  (perangkat Ridwan), highlight pencarian di layar, dan unduh/impor file
  di HP.
- Kualitas & ketersediaan suara Indonesia **tergantung browser/device**:
  di Chrome Android biasanya ada "Google Bahasa Indonesia", di
  browser lain bisa jatuh ke suara default (mungkin berbahasa Inggris).
- STT butuh Chrome/Edge (dan izin mikrofon + internet, karena
  pengenalan suara Chrome memakai layanan Google). Firefox tidak
  mendukung `SpeechRecognition` → tombol mic hanya menampilkan toast.
- TTS tidak jalan di browser tanpa `speechSynthesis` → tombol 🔊
  menampilkan toast.
- Pencarian pesan hanya mencocokkan teks (bukan isi gambar) dan tidak
  mencari di chat lain — cari chat hanya dari judul.
- Impor menimpa **semua** data (tidak ada merge/pilih chat tertentu).
