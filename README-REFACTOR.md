# Refactor script.js — Rin-san AI

**Tanggal:** 11 November 2026
**Sumber:** `../original/script.js` (2.695 baris) → `script.js` di folder ini (1.615 baris, −1.080 baris / −40%)
**Prinsip:** hanya definisi **terakhir yang lengkap** yang dipertahankan untuk
setiap fungsi duplikat. Logika bisnis, `WORKER_URL`, dan semua localStorage
keys **tidak diubah**. Tidak ada fitur baru.

## Cara pakai

Folder `cleaned/` adalah drop-in replacement untuk isi folder `program pertama/`:

1. Backup folder asli (sudah ada di `../original/`).
2. Timpa `script.js` dan `index.html` dengan versi dari folder ini,
   atau pakai seluruh isi folder ini apa adanya.
3. Buka `index.html` di browser seperti biasa. Tidak ada build step,
   tidak ada ES module — tetap satu file `<script>` klasik seperti semula.

## Tabel duplikasi yang dihapus

Aturan: di JavaScript, definisi terakhir yang menang. Karena itu yang
dipertahankan adalah definisi terakhir, **kecuali** ada logika unik di versi
lama (lihat "Logika unik yang hilang" di bawah).

| Fungsi | Definisi di asli | Dipertahankan | Alasan / isi versi terakhir |
|---|---|---|---|
| `getReply` | 8× (baris 475, 792, 950, 1208, 1884, 2048, 2256, 2644) | baris 2644 | Superset semua versi: persona per-chat, memori, mood, `profile`, + retry 4× saat balasan "User location is not supported" |
| `renderChat` | 4× (274, 653, 1352, 1857) | baris 1857 | v2 tambah `m.img`, v3 tambah `id` pesan, v4 tambah `mood` + `updateHeaderMood()` |
| `sendMessage` | 4× (500, 670, 1451, 1925) | baris 1925 | v2 tambah `caption`/`img` thumb, v3 tambah `id` pesan, v4 tambah `mood` + `updateHeaderMood(true)` |
| `savePersona` | 4× (782, 1047, 1075, 1157) | baris 1157 | v2/v3 tambah dialog konfirmasi, v4 tambah persona per-chat + early-return bila teks sama |
| `addMessage` | 3× (124, 1250, 1672) + wrapper di 1842 | baris 1672 + wrapper digabung | v2 tambah tombol salin/edit/hapus, v3 ganti tombol itu dengan menu long-press; wrapper tambah wajah sprite sesuai mood (lihat bawah) |
| `commitPersona` | 3× (1019, 1029, 1110) | baris 1110 | v3 stempel persona lama ke semua chat lama yang belum punya persona, simpan store, tampilkan toast |
| `resizeImage` | 2× (188, 605) | baris 605 | Pakai helper `drawScaled`, hasil tambah `thumb` (480px) untuk penyimpanan |
| `saveStore` | 2× (240, 642) | baris 642 | Saat kuota localStorage penuh, buang gambar tertua (`dropOldestImage`) lalu coba lagi |
| `clearMemory` | 2× (933, 1091) | baris 1091 | Tambah tutup panel pengaturan + toast setelah hapus |
| `toggleAcc` | 2× (997, 1135) | baris 1135 | Saat buka accordion persona, tampilkan persona efektif chat aktif, bukan persona global |
| `resetActiveChat` | 2× (1036, 1123) | baris 1123 | Tambah `delete chat.persona` |
| `applyPersona` | 2× (1063, 1181) | baris 1181 | Cegah saat `sending`, opsi "pindah ke obrolan baru" benar-benar membuat chat baru + toast |
| `openEdit` | 2× (1392, 1520) | baris 1520 | Tambah atur tampil/sembunyi tombol `editResend` (hanya pesan user tanpa gambar) |
| `saveEdit` | 2× (1411, 1535) | baris 1535 | Tambah parameter `resend` → `regenerateFrom` (edit lalu kirim ulang) |
| `setFace` | 2× (1806, 2021) | baris 2021 | Pakai `faceInfo()` (tabel tunggal `faceTable()`), bukan `FACES` + `ROW_Y` |
| `updateHeaderMood` | 2× (1821, 2028) | baris 2028 | Sama, hanya sumber label mood pindah ke `faceInfo()` |
| `renderProfile` | 2× (2158, 2417) | baris 2417 | Profil per-persona (`activeProfile()`), tag strip berubah, seksi disembunyikan bila kosong |
| `profileText` | 2× (2245, 2405) | baris 2405 | Teks profil dikirim ke Worker berdasarkan persona aktif, bukan profil Tsundere statis |
| `closeAttachMenu` | 2× (2505, 2569) | baris 2569 | v2 popover `attachPop`/`attachBackdrop`, bukan overlay `attachMenu` |
| `ensureAttachMenu` | 2× (2510, 2576) | baris 2576 | v2 popover dengan ikon SVG, opsi Kamera + Galeri |
| `openAttachMenu` | 2× (2551, 2615) | baris 2615 | v2 popover diposisikan di dekat tombol lampiran |
| `closePersona` | 2× (778, 1017) | — dihapus | Keduanya dead code (lihat bawah) |
| `opt` (nested) | 2× (di dalam dua `ensureAttachMenu`) | 1× | Tinggal satu, di dalam `ensureAttachMenu` v2 |

Total definisi fungsi: **131 → 88** (88 nama unik, 0 duplikat).
Satu-satunya nama fungsi baru adalah `extendPresets()` (lihat bawah).

## Logika unik yang hilang — keputusan

* **`addMessage` v2: tombol edit (✏️) & hapus (🗑️) inline di footer.**
  Versi terakhir (v3) sengaja menggantinya dengan menu long-press
  (`attachLongPress` → `openMsgMenu` → Salin/Edit/Hapus). Tombol inline
  **tidak** dikembalikan — itu pergantian desain, bukan kehilangan tak
  sengaja. Edit/hapus tetap tersedia lewat menu long-press.
* **`getReply` v5 vs v6:** satu-satunya beda adalah `FACES[...]` → 
  `faceTable()[...]`. Tabelnya identik. `FACES` + `ROW_Y` dihapus;
  `faceTable()`/`faceInfo()` jadi satu-satunya sumber tabel wajah.
* **`commitPersona` v1 → v2:** toast "Kepribadian disimpan" sempat hilang
  di v2, tapi kembali di v3 yang dipertahankan. Tidak ada yang hilang.
* **Menu lampiran v1: opsi "Kamera depan".** v2 (popover) hanya punya
  Kamera + Galeri. Input kamera depan (`camFrontInput`) ikut dihapus karena
  hanya dipakai menu v1. Kalau Ridwan mau kamera depan kembali, itu penambahan
  fitur — bukan bagian refactor ini.
* **`savePersona` v1: `closePersona()`.** Fungsi itu memanggil
  `$("personaBox")` yang tidak ada di HTML (akan throw). v3/v4 sudah memakai
  `toggleSettings(false)`. `closePersona`/`openPersona` dihapus.

## Perubahan lain

* **Satu blok init di akhir file.** Aslinya init tersebar di 6 tempat
  (`loadTheme/loadStore/renderChat/renderList` di baris 591,
  `loadPersona` 817, `loadMemory` 985, `renderChat` 1751,
  `initHeaderFace + renderChat` 1996, `initHeaderFace + renderChat +
  renderList` 2089, `initProfile` 2243, `initAttach` 2563).
  Kini satu kali, berurutan:
  `extendPresets(); loadTheme(); loadStore(); loadPersona(); loadMemory();
  initHeaderFace(); initAttach(); initProfile(); renderChat(); renderList();`
  Urutan ini penting: `initHeaderFace` sebelum `renderChat` (supaya header
  langsung jadi sprite), `initProfile` sesudahnya (klik avatar header).
  Hasil akhir di layar sama seperti setelah seluruh file asli selesai dieksekusi.
* **Listener `on(...)` hanya dipasang sekali.** Aslinya `on("userInput")`,
  `on("renameInput")`, `on("fileInput")` masing-masing sudah sekali — tetap
  sekali. Yang dihapus adalah IIFE kedua yang meng-assign ulang
  `attach-btn.onclick = openAttachMenu` (sudah dilakukan `initAttach`).
* **IIFE preset tambahan → `extendPresets()`.** Lima preset tambahan
  (Kakak, Maid, Pemalas, Manja, Jahil) yang tadinya disisipkan IIFE tanpa nama
  kini jadi fungsi bernama yang dipanggil di init. Isi daftar tidak berubah.
* **Dead code yang dihapus** (0 pemanggil di file asli, dicek dengan grep):
  `openPersona`, `closePersona` (2 definisi), `openMemory`, `closeMemory`,
  `confirmClear`, `openFaceZoom`, konstanta `FACES`, `ROW_Y`,
  `ICON_SELFIE`, `camFrontInput`, dan assignment `addMessage = function...`
  (wrapper — logikanya digabung ke dalam `addMessage`).
* **Struktur file baru:** komentar bagian bernomor (util, format teks,
  gambar, penyimpanan chat, tema, pesan, kirim/API, persona, memori,
  pengaturan, profil/mood, lampiran, event, init). Isi tiap fungsi diambil
  verbatim dari aslinya — tidak diketik ulang (lihat "Verifikasi").

## Perubahan di `index.html` (satu-satunya)

File asli **tidak punya** elemen `#editBox`, `#editInput`, `#editResend`,
padahal `openEdit`/`saveEdit` (versi terakhir) memanggil ketiganya. Akibatnya
tombol **Edit** di menu pesan (long-press) error di file asli
(`Cannot read properties of null`). Ditambahkan modal edit (17 baris,
setelah `#renameBox`), memakai class `confirm-overlay` / `confirm-card` /
`rename-input` / `confirm-actions` yang sudah ada di `Style.css` — tidak ada
CSS baru, tidak ada perubahan lain di HTML. `Style.css` dan semua aset
(`rin.jpg`, `rin-full.jpg`, `rin-sheet.png`, `asteroid-blaster.ttf`)
disalin byte-identik (dicek md5).

## Verifikasi

* `node --check cleaned/script.js` → **lolos**.
* `grep` definisi fungsi: asli 131 definisi / 94 nama unik (23 nama duplikat),
  bersih **88 definisi / 88 nama unik, 0 duplikat**.
* Semua **23 fungsi `onclick` di `index.html`** ada di file bersih
  (`toggleSidebar`, `toggleSettings`, `setTheme`, `newChat`, `savePersona`,
  `toggleAcc`, `toggleMemory`, `addManualMemory`, `clearMemory`,
  `removeImage`, `closeRename`, `saveRename`, `applyPersona`,
  `cancelPersona`, `menuCopy`, `menuEdit`, `menuDelete`, `closeMenu`,
  `doClear`, `closeConfirm`, `closeProfile`, `sendMessage`).
* `WORKER_URL` = `https://rin-san.ridwanhama111p.workers.dev` (sama),
  keys `rinChats`, `rinTheme`, `rinPersona`, `rinMemory`, `rinMemoryOn`,
  `MEMORY_MAX = 40` (sama). Migrasi data lama `rinChat` juga dipertahankan.
* Setiap segmen fungsi yang dipertahankan dicek **verbatim** terhadap file
  asli (hanya 3 transformasi yang diizinkan: gabungan `addMessage`,
  `initAttach` tanpa `camFrontInput`, IIFE → `extendPresets()`).
* Smoke test node (`../smoke-test.mjs`, stub DOM minimal): **41 checks lulus** —
  init tanpa throw, semua fungsi onclick global ada, `setTheme('blue')`
  tersimpan, satu putaran kirim pesan (2 pesan, mood `senang`, memori dari
  worker tersimpan, judul terisi), edit pesan + kirim ulang (regenerate),
  `getReply` retry 2× saat balasan diblokir wilayah, ganti persona
  (konfirmasi → `applyPersona(false)` → chat baru + persona lama distempel
  ke chat lama).

## Masalah yang tersisa / belum diuji

* **Belum diuji di browser sungguhan.** Smoke test di atas memakai stub DOM
  di node. Sebelum dipakai harian, buka `cleaned/index.html` di browser dan
  coba: kirim pesan, ganti tema, ganti persona, buka profil, long-press pesan
  → Edit (ini yang diperbaiki), kirim foto, dan muat ulang (data tersimpan).
* **Perilaku asli yang dipertahankan apa adanya (bukan bug refactor):**
  tombol `attach-btn` di HTML masih punya `onclick` inline
  `fileInput.click()` yang langsung ditimpa `initAttach` menjadi menu lampiran;
  preset default persona `"Tsundere"` tidak ada di daftar chip `PRESETS`
  (chip yang ada: Gengsi, santai, ceria, Dingin, Pemalu, + 5 tambahan,
  Kustom), jadi awalnya tidak ada chip yang aktif.
* Folder `original/` tidak diubah. Skrip pembangun ada di
  `../build_clean.py` (mengekstrak definisi terakhir secara verbatim dari
  aslinya); smoke test ada di `../smoke-test.mjs`.
