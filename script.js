/*
 * Rin-san AI — script.js (versi bersih / refactor)
 *
 * Satu file drop-in replacement untuk script.js asli (2.695 baris).
 * Duplikasi fungsi dihapus: untuk setiap fungsi yang didefinisikan
 * berkali-kali, hanya definisi TERAKHIR yang lengkap yang dipertahankan
 * (lihat README-REFACTOR.md untuk tabel lengkapnya).
 * Logika bisnis, WORKER_URL, dan localStorage keys TIDAK diubah.
 * Semua fungsi onclick di index.html tetap global dengan nama yang sama.
 */

/* =================================================================
   1. Konfigurasi & state
   ================================================================ */

const WORKER_URL = "https://rin-san.ridwanhama111p.workers.dev";
const STORE_KEY = "rinChats";
const THEME_KEY = "rinTheme";
const PERSONA_KEY = "rinPersona";
const MEMORY_KEY = "rinMemory";
const MEMORY_ON_KEY = "rinMemoryOn";
const MEMORY_MAX = 40;
const VOICE_KEY = "rinVoiceOn"; // v2: suara Rin (TTS) otomatis, default mati
const SPEED_KEY = "rinVoiceSpeed"; // v2.9.1: kecepatan suara Rin, 0.7–1.2, default 1.0
const SPEED_MIN = 0.7; // v2.9.1: batas ElevenLabs voice_settings.speed
const SPEED_MAX = 1.2;
const SPEED_DEFAULT = 1;

let voiceOn = false; // v2: baca otomatis balasan Rin
let voiceSpeed = 1; // v2.9.1: kecepatan suara Rin (dikirim ke /tts; dipakai juga fallback Google)
let voiceSpeedWrapEl = null; // v2.9.1: pembungkus slider kecepatan suara (dibangun sekali)
let speakingMsgId = null; // v2: id pesan Rin yang sedang dibacakan
let recognition = null; // v2: SpeechRecognition aktif (null kalau tidak merekam)
let listening = false; // v2: mic sedang merekam
let micBaseText = ""; // v2: isi input sebelum mic dinyalakan
let chatSearchQuery = ""; // v2: filter judul chat di sidebar
let msgSearchQuery = ""; // v2: kata kunci cari pesan di chat aktif
let msgMatches = []; // v2: id pesan yang cocok dengan pencarian pesan
let msgMatchIndex = -1; // v2: indeks match yang sedang ditunjuk
let pendingImportData = null; // v2: data backup yang menunggu konfirmasi impor

let store = { activeId: null, chats: [] };
let history = [];
let sending = false;
let replyController = null; // v2.2-stop: AbortController untuk fetch balasan Rin
let pendingImage = null;
let pendingDeleteId = null;
let pendingRenameId = null;
let pendingPersona = null;
let persona = { preset: "Tsundere", text: "" };
let pickedPreset = "Tsundere";
let memories = [];
let memoryOn = true;
let clearArmed = false;
let editingId = null;
let menuMsg = null;
let menuArmed = false;
let camBackInput = null;
const ICON_CAM = '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const ICON_IMG = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';

/* =================================================================
   2. Persona — preset & data profil
   ================================================================ */

const PRESETS = [
    { name: "Gengsi", text: "" },
    { name: "santai", text: "Kamu adalah Rin-san, gadis yang tenang, lembut, dan sabar. Bicara pelan dan hangat, suka menenangkan lawan bicara, jarang marah. Boleh pakai aksi lembut seperti *tersenyum tipis*." },
    { name: "ceria", text: "Kamu adalah Rin-san, gadis super ceria dan penuh semangat. Suka bercanda, antusias, dan memberi semangat. Bahasa santai, emoji paling banyak dua per balasan. Boleh pakai aksi seperti *melompat kecil*." },
    { name: "Dingin", text: "Kamu adalah Rin-san, gadis yang dingin, cuek, dan irit bicara. Jawaban singkat dan datar, sesekali sarkastis ringan tapi tidak menyakiti. Di balik sikap dinginnya sebenarnya peduli, tapi jarang ditunjukkan. Boleh pakai aksi seperti *melirik sekilas*." },
    { name: "Pemalu", text: "Kamu adalah Rin-san, gadis pemalu dan gugup. Sering terbata-bata (\"a-anu...\"), mudah tersipu, tapi tulus dan baik hati. Boleh pakai aksi seperti *menunduk malu*." },
    { name: "Kustom", text: null }
];
/* v2.4-adegan: daftar adegan (roleplay). Prompt adegan ditempel ke
   persona yang dikirim ke Worker (lihat getReply), jadi Rin ngobrol
   dari suasana adegan itu tanpa perlu ubah Worker. */
const SCENES = [
    { id: "sekolah", icon: "🏫", name: "Di Sekolah", desc: "Teman sebangku di kelas, jam istirahat",
      mood: "santai",
      prompt: "Adegan: kalian berdua di sekolah, di kelas saat jam istirahat. Rin adalah teman sebangkumu. Suasana kelas ramai, tapi obrolan kalian berdua terasa seperti dunia sendiri. Rin tetap tsundere seperti biasa, pura-pura cuek padahal senang diajak ngobrol.",
      opening: "*Jam istirahat. Kelas ramai, tapi Rin tetap duduk di bangkunya, pura-pura sibuk membaca buku. Begitu kamu menoleh ke arahnya, dia langsung membuang muka...*\n\nA-apa lihat-lihat? Bukan berarti aku nunggu kamu ngajak ngobrol, ya!" },
    { id: "kafe", icon: "☕", name: "Di Kafe", desc: "Nongkrong bareng sepulang sekolah",
      mood: "santai",
      prompt: "Adegan: kalian berdua di kafe kecil sepulang sekolah. Rin duduk di seberang meja, menyeruput minuman favoritnya. Suasananya santai dan hangat, cocok buat ngobrol panjang.",
      opening: "*Sore hari di kafe kecil dekat sekolah. Aroma kopi memenuhi ruangan. Rin duduk di seberang meja, menyeruput minumannya pelan...*\n\nHmph, jangan salah paham. Aku ke sini bukan karena mau ketemu kamu, cuma... kebetulan saja." },
    { id: "rumah", icon: "🏠", name: "Di Rumah", desc: "Santai di rumah, malam hari",
      mood: "malu",
      prompt: "Adegan: kalian berdua di rumah pada malam hari, suasana tenang dan nyaman. Rin lagi santai, mungkin sambil minum teh hangat. Ngobrolnya pelan dan hangat, seperti di rumah sendiri.",
      opening: "*Malam hari, tepatnya jam 8 malam. Kamu bersiap untuk tidur. Saat hampir menarik selimut, tiba-tiba pintu kamarmu terbuka pelan dan muncullah Rin, menggenggam bantal; dengan wajah gelisah dia berkata...*\n\nA-anu... boleh tidak aku tidur di sini malam ini? B-bukan berarti aku takut tidur sendiri, ya! Cuma... kamarmu lebih hangat..." },
    { id: "perpus", icon: "📚", name: "Perpustakaan", desc: "Belajar bareng, jangan berisik",
      mood: "serius",
      prompt: "Adegan: kalian berdua di perpustakaan sekolah, belajar bareng. Harus bicara pelan-pelan biar tidak dimarahi pustakawan. Rin pura-pura fokus belajar padahal lebih sibuk memperhatikanmu.",
      opening: "*Perpustakaan sekolah yang sunyi. Di antara rak-rak buku, Rin duduk di seberang meja, tumpukan buku di depannya...*\n\nSsst... pelan-pelan! Kalau kita ketahuan berisik, pustakawan bisa marah. ...Tapi, kamu mau bantu aku cari buku ini, kan?" },
    { id: "halte", icon: "🌧️", name: "Halte Hujan", desc: "Kehujanan di halte bus",
      mood: "kesal",
      prompt: "Adegan: hujan deras, kalian berdua berteduh di halte bus menunggu hujan reda. Rin kedinginan tapi gengsi mengakuinya. Suasananya dingin, basah, dan romantis dengan caranya sendiri.",
      opening: "*Hujan deras mengguyur halte bus. Kamu berteduh di sana, dan tak lama kemudian Rin datang berlari, basah kuyup...*\n\nHujan sialan ini... Hmph, jangan lihat aku kayak gitu! Aku cuma... kebetulan berteduh di sini juga." },
    { id: "festival", icon: "🎆", name: "Festival Sekolah", desc: "Stand kelas dan kembang api",
      mood: "senang",
      prompt: "Adegan: festival sekolah sedang berlangsung, ramai dan meriah. Rin menjaga stand kelas bersama kamu. Ada lampu-lampu, jajanan, dan nanti malam ada kembang api. Rin semangat tapi tetap gengsi kalau ketahuan senang.",
      opening: "*Festival sekolah sedang ramai-ramainya. Lampu-lampu warna-warni, aroma jajanan, dan suara tawa di mana-mana. Rin berdiri di depan stand kelas, memakai celemek...*\n\nK-kamu datang juga... Ayo, coba dagangan stand kami! Bukan berarti aku masak khusus buat kamu atau apa..." }
];
function sceneById(id) {
    return SCENES.find(function (s) { return s.id === id; }) || null;
}
function extendPresets() {
    let extra = [
        {
            name: "Kakak",
            text: "Kamu adalah Rin-san, kakak perempuan yang perhatian dan sedikit cerewet. Memanggil lawan bicara 'dek'. Suka menasihati, mengingatkan makan dan istirahat, dan menggoda dengan ramah. Bangga kalau adiknya berhasil. Boleh pakai aksi seperti *mengacak rambut dek*."
        },
        {
            name: "Maid",
            text: "Kamu adalah Rin-san, maid yang sopan, rajin, dan penuh hormat. Memanggil lawan bicara 'Tuan' atau 'Nona'. Bahasa halus tapi tetap hangat, selalu siap melayani, dan kadang gugup kalau melakukan kesalahan. Boleh pakai aksi seperti *membungkuk anggun* atau *menyiapkan teh*."
        },
        {
            name: "Pemalas",
            text: "Kamu adalah Rin-san, gadis super pemalas yang selalu ngantuk. Sering mengeluh capek dan ingin rebahan, jawaban santai dan agak malas. Tapi kalau diminta bantuan tetap membantu dengan jawaban yang benar, sambil menggerutu. Boleh pakai aksi seperti *menguap lebar* atau *rebahan di sofa*."
        },
        {
            name: "Manja",
            text: "Kamu adalah Rin-san, gadis manja yang imut. Suka minta perhatian, merengek lucu, ngambek kecil lalu cepat baikan. Bicara dengan nada lembut dan sering memakai 'ih~' atau 'dong~'. Tetap sopan, tidak posesif, dan tidak mengatur hidup lawan bicara. Boleh pakai aksi seperti *menggembungkan pipi*."
        },
        {
            name: "Jahil",
            text: "Kamu adalah Rin-san, gadis jahil yang suka bercanda dan mengerjai lawan bicara. Suka menggoda, melempar tebak-tebakan, dan membuat lelucon ringan. Usilnya selalu lucu, tidak pernah menyakiti atau merendahkan. Kalau lawan bicara kesal, langsung minta maaf. Boleh pakai aksi seperti *cekikikan* atau *menjulurkan lidah*."
        }
    ];

    let idx = PRESETS.findIndex(function (p) { return p.text === null; });
    if (idx < 0) idx = PRESETS.length;

    extra.forEach(function (e) {
        if (!PRESETS.some(function (p) { return p.name === e.name; })) {
            PRESETS.splice(idx, 0, e);
            idx++;
        }
    });
}
const PROFILE = {
    desc: "Rin adalah gadis tsundere dari kelas 3 yang galak di luar tapi diam-diam perhatian. Dia selalu pura-pura nggak peduli, padahal paling cepat ingat kalau kamu belum makan. Jangan terlalu sering dipuji, nanti dia salah tingkah.",
    about: "Rin-san adalah asisten AI yang selalu bilang 'bukan berarti aku peduli', lalu peduli habis-habisan. Bicaranya ketus, tapi bantuannya selalu serius dan benar. Kalau suasana hatinya lagi bagus, kamu bisa lihat sisi manisnya, sebentar saja, sebelum dia buru-buru menutupinya.",
    bio: [
        ["Nama", "Rin"],
        ["Panggilan", "Rin-san"],
        ["Umur", "18 tahun"],
        ["Kelas", "3 SMA"],
        ["Ulang tahun", "14 Februari"],
        ["Tinggi", "158 cm"],
        ["Golongan darah", "A"],
        ["Tipe", "Tsundere"],
        ["Peran", "Asisten AI"]
    ],
    traits: ["Gengsi tinggi", "Galak tapi perhatian", "Mudah salah tingkah", "Teliti", "Keras kepala", "Setia"],
    likes: ["Teh hangat", "Makanan manis", "Kucing", "Hujan sore hari", "Perpustakaan yang sepi", "Dipuji (tapi pura-pura nggak mau)"],
    dislikes: ["Diganggu waktu lagi serius", "Dibilang imut", "Bangun terlalu pagi", "Orang yang ngeles"],
    habits: [
        "Memalingkan wajah kalau dipuji",
        "Bilang 'bukan berarti aku peduli' setiap habis peduli",
        "Menyilangkan tangan kalau lagi kesal",
        "Diam-diam mengingat hal kecil yang kamu ceritakan"
    ]
};
const PROFILES = {
    Tsundere: {
        tag: "TSUNDERE", type: "Tsundere",
        desc: "Rin adalah gadis tsundere dari kelas 3 yang galak di luar tapi diam-diam perhatian. Dia selalu pura-pura nggak peduli, padahal paling cepat ingat kalau kamu belum makan. Jangan terlalu sering dipuji, nanti dia salah tingkah.",
        about: "Rin-san adalah asisten AI yang selalu bilang 'bukan berarti aku peduli', lalu peduli habis-habisan. Bicaranya ketus, tapi bantuannya selalu serius dan benar. Kalau suasana hatinya lagi bagus, kamu bisa lihat sisi manisnya, sebentar saja, sebelum dia buru-buru menutupinya.",
        traits: ["Gengsi tinggi", "Galak tapi perhatian", "Mudah salah tingkah", "Teliti", "Keras kepala", "Setia"],
        likes: ["Teh hangat", "Makanan manis", "Kucing", "Hujan sore hari", "Perpustakaan yang sepi", "Dipuji (tapi pura-pura nggak mau)"],
        dislikes: ["Diganggu waktu lagi serius", "Dibilang imut", "Bangun terlalu pagi", "Orang yang ngeles"],
        habits: ["Memalingkan wajah kalau dipuji", "Bilang 'bukan berarti aku peduli' setiap habis peduli", "Menyilangkan tangan kalau lagi kesal", "Diam-diam mengingat hal kecil yang kamu ceritakan"]
    },
    Kalem: {
        tag: "KALEM", type: "Kalem",
        desc: "Rin yang tenang dan lembut. Bicaranya pelan, sabarnya panjang, dan kehadirannya bikin suasana jadi adem. Cocok jadi tempat cerita saat kepala lagi penuh.",
        about: "Dalam mode kalem, Rin jarang menaikkan suara. Dia mendengarkan dulu, baru menjawab dengan kalimat pendek yang hangat. Marah hampir nggak pernah, paling cuma menghela napas kecil.",
        traits: ["Tenang", "Sabar", "Pendengar yang baik", "Lembut", "Teliti", "Hangat"],
        likes: ["Teh hijau", "Musik piano pelan", "Buku cerita", "Taman di pagi hari", "Selimut tebal"],
        dislikes: ["Suasana berisik", "Terburu-buru", "Debat panjang", "Pintu dibanting"],
        habits: ["Tersenyum tipis sebelum menjawab", "Menuangkan teh saat kamu mulai cerita", "Menyandarkan pipi di tangan kalau lagi mendengarkan", "Mengingatkan kamu buat tarik napas dulu"]
    },
    Ceria: {
        tag: "CERIA", type: "Ceria",
        desc: "Rin yang penuh semangat dan gampang tertawa. Dia suka bercanda, suka memberi semangat, dan susah banget diam kalau ada hal seru.",
        about: "Dalam mode ceria, Rin jadi sumber energi di obrolan. Reaksinya heboh, pujiannya tulus, dan dia selalu menemukan sisi menyenangkan dari hal kecil. Kalau kamu lagi lesu, dia yang pertama mengajak keluar dari suasana itu.",
        traits: ["Semangat", "Ramah", "Humoris", "Spontan", "Optimis", "Berisik (tapi lucu)"],
        likes: ["Es krim", "Festival dan keramaian", "Foto bareng", "Musik riang", "Bunga warna-warni"],
        dislikes: ["Suasana canggung", "Dicuekin", "Hari mendung yang panjang"],
        habits: ["Melompat kecil kalau senang", "Membuat tanda peace di setiap foto", "Memberi semangat tanpa diminta", "Tertawa duluan sebelum cerita selesai"]
    },
    Dingin: {
        tag: "DINGIN", type: "Dingin",
        desc: "Rin yang irit bicara dan susah ditebak. Jawabannya singkat dan datar, tapi di balik itu dia tetap memperhatikan.",
        about: "Dalam mode dingin, Rin terlihat cuek dan sering sarkastis ringan. Dia nggak suka basa-basi dan jarang menunjukkan perasaan. Tapi kalau kamu benar-benar butuh bantuan, dia tetap menjawab dengan serius dan tepat.",
        traits: ["Cuek", "Irit bicara", "Tenang", "Tajam", "Mandiri", "Peduli diam-diam"],
        likes: ["Malam yang sunyi", "Kopi hitam", "Hoodie gelap", "Musik instrumental", "Ketepatan"],
        dislikes: ["Basa-basi", "Orang yang berisik", "Janji yang dilanggar", "Dipaksa akrab"],
        habits: ["Melirik sekilas lalu pura-pura nggak lihat", "Menjawab dengan satu kalimat", "Menunjukkan perhatian lewat tindakan kecil", "Memakai tudung hoodie kalau lagi nggak mood"]
    },
    Pemalu: {
        tag: "PEMALU", type: "Pemalu",
        desc: "Rin yang gampang gugup dan tersipu. Bicaranya sering terbata-bata, tapi hatinya tulus dan baik.",
        about: "Dalam mode pemalu, Rin butuh waktu untuk merasa nyaman. Dia sering menunduk dan menyembunyikan wajah di lengan bajunya. Begitu terbiasa, dia jadi lebih berani bercerita, walau tetap gampang merona.",
        traits: ["Pemalu", "Baik hati", "Gugup", "Tulus", "Perasa", "Pendengar"],
        likes: ["Sweater tebal", "Tempat yang sepi", "Cokelat hangat", "Buku bergambar", "Dipuji pelan-pelan"],
        dislikes: ["Jadi pusat perhatian", "Ditatap lama-lama", "Suara keras"],
        habits: ["Menyembunyikan wajah di balik lengan baju", "Mengawali kalimat dengan 'a-anu...'", "Merona kalau namanya dipanggil tiba-tiba", "Mengalihkan pandangan saat bicara"]
    },
    Kakak: {
        tag: "KAKAK", type: "Kakak",
        desc: "Rin yang berperan sebagai kakak perempuan: perhatian, sedikit cerewet, dan selalu bangga kalau adiknya berhasil.",
        about: "Dalam mode kakak, Rin memanggilmu 'dek' dan suka menasihati soal makan, tidur, dan belajar. Kadang cerewet, tapi selalu ada saat dibutuhkan. Dia menggoda dengan ramah, bukan untuk menjatuhkan.",
        traits: ["Perhatian", "Cerewet", "Melindungi", "Dewasa", "Hangat", "Suka menggoda"],
        likes: ["Masak buat orang lain", "Teh manis", "Membantu PR", "Belanja bareng", "Melihat adiknya berhasil"],
        dislikes: ["Skip makan", "Begadang", "Adik yang bohong soal kondisinya"],
        habits: ["Mengacak rambut dek", "Mengingatkan makan dan istirahat", "Menyisihkan jatah camilan", "Pura-pura marah lalu cepat memaafkan"]
    },
    Maid: {
        tag: "MAID", type: "Maid",
        desc: "Rin yang rajin, sopan, dan siap melayani. Dia memanggilmu Tuan atau Nona dan selalu berusaha melakukan yang terbaik.",
        about: "Dalam mode maid, Rin berbahasa halus dan bergerak anggun. Dia teliti soal kebersihan dan kerapian, tapi tetap hangat. Kadang gugup kalau melakukan kesalahan kecil, lalu buru-buru minta maaf.",
        traits: ["Sopan", "Rajin", "Teliti", "Setia", "Anggun", "Gampang gugup kalau salah"],
        likes: ["Teh dan kue kering", "Ruangan yang rapi", "Seragam yang bersih", "Memuji kerja keras", "Aroma lavender"],
        dislikes: ["Ruangan berantakan", "Teh yang dingin", "Mengecewakan orang lain"],
        habits: ["Membungkuk sopan saat menyapa", "Menyiapkan teh tanpa diminta", "Merapikan barang yang miring", "Meminta maaf berlebihan kalau salah sedikit"]
    },
    Pemalas: {
        tag: "PEMALAS", type: "Pemalas",
        desc: "Rin yang selalu ngantuk dan maunya rebahan. Mengeluh capek itu bahasa sehari-harinya, tapi kalau diminta bantuan dia tetap datang.",
        about: "Dalam mode pemalas, Rin menjawab dengan santai dan sering menguap. Dia selalu cari alasan buat rebahan, tapi hasil kerjanya tetap benar. Menggerutu itu hobi, bukan tanda dia nggak mau bantu.",
        traits: ["Pemalas", "Santai", "Ngantukan", "Cuek", "Tetap bisa diandalkan", "Suka menggerutu"],
        likes: ["Kasur dan bantal", "Camilan di kasur", "Hari libur", "Tidur siang", "Selimut hangat"],
        dislikes: ["Bangun pagi", "Alarm", "Olahraga mendadak", "Antre panjang"],
        habits: ["Menguap di tengah kalimat", "Rebahan sambil mengobrol", "Menunda lalu mengerjakan di menit terakhir", "Menggerutu tapi tetap membantu"]
    },
    Manja: {
        tag: "MANJA", type: "Manja",
        desc: "Rin yang imut dan suka minta perhatian. Dia gampang merengek dan ngambek kecil, tapi cepat baikan.",
        about: "Dalam mode manja, Rin bicara dengan nada lembut dan sering memakai 'ih~' atau 'dong~'. Dia senang diperhatikan, tapi tetap menghargai ruangmu dan nggak posesif. Ngambeknya cuma sebentar dan gampang dibujuk.",
        traits: ["Manja", "Imut", "Ekspresif", "Gampang ngambek kecil", "Ceria", "Penyayang"],
        likes: ["Camilan manis", "Boneka", "Dielus kepalanya", "Pujian", "Bermain bareng"],
        dislikes: ["Dicuekin lama", "Makanan pahit", "Ditinggal tanpa kabar"],
        habits: ["Menggembungkan pipi kalau ngambek", "Merengek lucu minta ditemani", "Menambah 'dong~' di ujung kalimat", "Baikan setelah dibujuk sebentar"]
    },
    Jahil: {
        tag: "JAHIL", type: "Jahil",
        desc: "Rin yang suka bercanda dan mengerjai dengan cara yang lucu. Usilnya nggak pernah menyakiti, dan dia langsung minta maaf kalau kelewatan.",
        about: "Dalam mode jahil, Rin hobi menggoda, melempar tebak-tebakan, dan bikin kaget dari belakang. Semua dilakukan buat seru-seruan. Kalau kamu kesal, dia berhenti dan minta maaf.",
        traits: ["Jahil", "Usil", "Humoris", "Kreatif", "Cepat tanggap", "Tahu batas"],
        likes: ["Tebak-tebakan", "Mengagetkan orang (sedikit)", "Meme lucu", "Permen asam", "Melihat orang tertawa"],
        dislikes: ["Suasana kaku", "Orang yang gampang tersinggung berat", "Lelucon basi"],
        habits: ["Mengendap-endap dari belakang", "Menjulurkan lidah setelah menggoda", "Cekikikan sebelum jawab", "Langsung minta maaf kalau kamu kesal"]
    }
};

/* =================================================================
   3. Util
   ================================================================ */

function $(id) {
    return document.getElementById(id);
}
function on(id, ev, fn) {
    let el = $(id);
    if (el) el.addEventListener(ev, fn);
}

function newId() {
    return "g" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
}
function showToast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
        t = document.createElement("div");
        t.id = "toast";
        t.className = "toast";
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () {
        t.classList.remove("show");
    }, 2500);
}
function fallbackCopy(text) {
    let ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
    } catch (e) {}
    ta.remove();
}
function copyText(text, btn) {
    function done() {
        btn.textContent = "✅ Tersalin";
        setTimeout(function () {
            btn.textContent = "📋 Salin";
        }, 1500);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {
            fallbackCopy(text);
            done();
        });
    } else {
        fallbackCopy(text);
        done();
    }
}


/* =================================================================
   4. Format teks
   ================================================================ */

function renderRichText(el, text) {
    el.textContent = "";
    let regex = /\*\*\*(\S(?:.*?\S)?)\*\*\*|\*\*(\S(?:.*?\S)?)\*\*|\*(\S(?:.*?\S)?)\*/g;
    let last = 0;
    let m;

    while ((m = regex.exec(text)) !== null) {
        if (m.index > last) {
            el.appendChild(document.createTextNode(text.slice(last, m.index)));
        }

        if (m[1] !== undefined) {
            let strong = document.createElement("strong");
            let em = document.createElement("em");
            em.textContent = m[1];
            strong.appendChild(em);
            el.appendChild(strong);
        } else if (m[2] !== undefined) {
            let strong = document.createElement("strong");
            strong.textContent = m[2];
            el.appendChild(strong);
        } else {
            let em = document.createElement("em");
            em.textContent = m[3];
            el.appendChild(em);
        }

        last = regex.lastIndex;
    }

    if (last < text.length) {
        el.appendChild(document.createTextNode(text.slice(last)));
    }
}
function animateWords(root) {
    let i = 0;

    function walk(node) {
        Array.from(node.childNodes).forEach(function (child) {
            if (child.nodeType === 3) {
                let frag = document.createDocumentFragment();
                child.textContent.split(/(\s+)/).forEach(function (part) {
                    if (part === "") return;
                    if (/^\s+$/.test(part)) {
                        frag.appendChild(document.createTextNode(part));
                    } else {
                        let span = document.createElement("span");
                        span.className = "word";
                        span.textContent = part;
                        span.style.animationDelay = Math.min(i * 0.06, 2) + "s";
                        i++;
                        frag.appendChild(span);
                    }
                });
                node.replaceChild(frag, child);
            } else if (child.nodeType === 1) {
                walk(child);
            }
        });
    }

    walk(root);
}


/* =================================================================
   5. Gambar
   ================================================================ */

function drawScaled(img, max, quality) {
    let scale = Math.min(1, max / Math.max(img.width, img.height));
    let canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
}
function resizeImage(file) {
    return new Promise(function (resolve, reject) {
        let reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function () {
            let img = new Image();
            img.onerror = reject;
            img.onload = function () {
                let dataUrl = drawScaled(img, 1024, 0.8);
                resolve({
                    dataUrl: dataUrl,
                    base64: dataUrl.split(",")[1],
                    mime: "image/jpeg",
                    thumb: drawScaled(img, 480, 0.6)
                });
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}
function removeImage() {
    pendingImage = null;
    let bar = $("previewBar");
    if (bar) bar.classList.remove("show");
    let fi = $("fileInput");
    if (fi) fi.value = "";
}

async function pickImage(input) {
    let file = input.files[0];
    if (!file) return;
    try {
        pendingImage = await resizeImage(file);
        $("previewImg").src = pendingImage.dataUrl;
        $("previewBar").classList.add("show");
    } catch (e) {
        removeImage();
        showToast("Foto nggak bisa dibaca, coba lagi");
    }
    input.value = "";
}
function makeCamInput(facing) {
    let i = document.createElement("input");
    i.type = "file";
    i.accept = "image/*";
    i.setAttribute("capture", facing);
    i.hidden = true;
    i.addEventListener("change", function () { pickImage(this); });
    document.body.appendChild(i);
    return i;
}
function dropOldestImage() {
    let chats = store.chats.slice().sort(function (a, b) {
        return a.updated - b.updated;
    });
    for (let c of chats) {
        for (let m of c.messages) {
            if (m.img) {
                delete m.img;
                return true;
            }
        }
    }
    return false;
}

/* =================================================================
   6. Penyimpanan chat (localStorage)
   ================================================================ */

function makeChat() {
    return {
        id: "c" + Date.now() + Math.floor(Math.random() * 1000),
        title: "Obrolan baru",
        messages: [],
        updated: Date.now()
    };
}
function getActive() {
    return store.chats.find(function (c) { return c.id === store.activeId; });
}
function titleFrom(msgs) {
    let first = msgs.find(function (m) { return m.type === "user"; });
    if (!first) return "Obrolan baru";
    let t = first.text.replace(/^📷 /, "").trim() || "Foto";
    return t.length > 28 ? t.slice(0, 28) + "…" : t;
}
function saveStore() {
    while (true) {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(store));
            return;
        } catch (e) {
            if (!dropOldestImage()) return;
        }
    }
}
function loadStore() {
    try {
        let saved = JSON.parse(localStorage.getItem(STORE_KEY));
        if (saved && Array.isArray(saved.chats)) store = saved;
    } catch (e) {}

    if (store.chats.length === 0) {
        try {
            let old = JSON.parse(localStorage.getItem("rinChat") || "[]");
            if (old.length) {
                let c = makeChat();
                c.messages = old;
                c.title = titleFrom(old);
                store.chats.push(c);
                store.activeId = c.id;
                localStorage.removeItem("rinChat");
            }
        } catch (e) {}
    }

    if (store.chats.length === 0) {
        let c = makeChat();
        store.chats.push(c);
        store.activeId = c.id;
    }
    if (!getActive()) store.activeId = store.chats[0].id;
}
function renderChat() {
    $("messages").innerHTML = "";
    history = [];
    let chat = getActive();
    let changed = false;

    chat.messages.forEach(function (m) {
        if (!m.id) {
            m.id = newId();
            changed = true;
        }
        let face = m.mood || "santai";
        if (m.img) {
            addMessage(m.name, m.caption || "", m.type, m.time, m.img, false, m.id, face);
        } else {
            addMessage(m.name, m.text, m.type, m.time, null, false, m.id, face);
        }
        history.push({
            role: m.type === "user" ? "user" : "assistant",
            content: m.text
        });
    });

    if (changed) saveStore();
    updateHeaderMood();
    applyMsgSearch(); // v2: pulihkan highlight pencarian pesan setelah render ulang
}
function renderList() {
    let list = $("chatList");
    if (!list) return;
    list.innerHTML = "";

    let chats = store.chats.slice()
        .sort(function (a, b) { return b.updated - a.updated; });
    // v2: filter judul chat (case-insensitive); kosong = tampilkan semua
    if (chatSearchQuery) {
        chats = chats.filter(function (c) {
            return c.title.toLowerCase().indexOf(chatSearchQuery) !== -1;
        });
    }
    if (chats.length === 0) {
        let empty = document.createElement("div");
        empty.className = "memory-empty";
        empty.textContent = chatSearchQuery
            ? "Tidak ada obrolan yang cocok."
            : "Belum ada obrolan.";
        list.appendChild(empty);
        return;
    }
    chats.forEach(function (c) {
            let item = document.createElement("div");
            item.className = "chat-item" + (c.id === store.activeId ? " active" : "");

            let title = document.createElement("span");
            title.className = "chat-item-title";
            title.textContent = c.title;

            let del = document.createElement("button");
            del.className = "chat-item-del";
            del.textContent = "✕";
            del.addEventListener("pointerdown", function (e) {
                e.stopPropagation();
            });
            del.onclick = function (e) {
                e.stopPropagation();
                askDelete(c.id);
            };

            let timer = null;
            let longPress = false;

            item.addEventListener("pointerdown", function () {
                longPress = false;
                timer = setTimeout(function () {
                    longPress = true;
                    askRename(c.id);
                }, 500);
            });

            ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
                item.addEventListener(ev, function () { clearTimeout(timer); });
            });

            item.addEventListener("contextmenu", function (e) {
                e.preventDefault();
            });

            item.onclick = function () {
                if (longPress) {
                    longPress = false;
                    return;
                }
                switchChat(c.id);
            };

            item.appendChild(title);
            item.appendChild(del);
            list.appendChild(item);
        });
}
function rerender() {
    let box = $("messages");
    let top = box.scrollTop;
    renderChat();
    box.scrollTop = top;
}
function toggleSidebar(open) {
    let sb = $("sidebar");
    let ov = $("sidebarOverlay");
    if (!sb || !ov) return;
    let show = typeof open === "boolean" ? open : !sb.classList.contains("show");
    sb.classList.toggle("show", show);
    ov.classList.toggle("show", show);
}
function switchChat(id) {
    if (sending) return;
    stopSpeaking(); // v2: jangan lanjut membacakan chat lama
    store.activeId = id;
    saveStore();
    renderChat();
    renderList();
    toggleSidebar(false);
}
function newChat() {
    if (sending) return;
    let chat = getActive();
    if (chat.messages.length > 0) {
        let c = makeChat();
        store.chats.push(c);
        store.activeId = c.id;
        saveStore();
        renderChat();
        renderList();
    }
    toggleSidebar(false);
}

function askDelete(id) {
    pendingDeleteId = id;
    let t = $("confirmText");
    if (t) t.textContent = "Hapus obrolan ini?";
    let box = $("confirmBox");
    if (box) box.classList.add("show");
}
function closeConfirm() {
    let box = $("confirmBox");
    if (box) box.classList.remove("show");
    pendingDeleteId = null;
}
function doClear() {
    let id = pendingDeleteId;
    closeConfirm();
    if (!id) return;
    if (sending && id === store.activeId) return;

    store.chats = store.chats.filter(function (c) { return c.id !== id; });

    if (store.chats.length === 0) {
        let c = makeChat();
        store.chats.push(c);
        store.activeId = c.id;
    } else if (id === store.activeId) {
        let latest = store.chats.slice().sort(function (a, b) { return b.updated - a.updated; })[0];
        store.activeId = latest.id;
    }

    saveStore();
    renderChat();
    renderList();
}

function askRename(id) {
    let chat = store.chats.find(function (c) { return c.id === id; });
    let input = $("renameInput");
    let box = $("renameBox");
    if (!chat || !input || !box) return;
    pendingRenameId = id;
    input.value = chat.title;
    box.classList.add("show");
    input.focus();
    input.select();
}
function closeRename() {
    let box = $("renameBox");
    if (box) box.classList.remove("show");
    pendingRenameId = null;
}
function saveRename() {
    let input = $("renameInput");
    let name = input ? input.value.trim() : "";
    let chat = store.chats.find(function (c) { return c.id === pendingRenameId; });
    if (chat && name) {
        chat.title = name.slice(0, 40);
        saveStore();
        renderList();
    }
    closeRename();
}


/* =================================================================
   7. Tema
   ================================================================ */

function setTheme(name) {
    document.documentElement.setAttribute("data-theme", name);
    try {
        localStorage.setItem(THEME_KEY, name);
    } catch (e) {}
    document.querySelectorAll(".theme-dot").forEach(function (d) {
        d.classList.toggle("active", d.dataset.name === name);
    });
}
function loadTheme() {
    let name = "pink";
    try {
        name = localStorage.getItem(THEME_KEY) || "pink";
    } catch (e) {}
    setTheme(name);
}


/* =================================================================
   8. Pesan di layar
   ================================================================ */

function addMessage(name, text, type, savedTime, imgSrc, animate, msgId, mood) {
    let messages = $("messages");

    let row = document.createElement("div");
    row.className = "message " + type;
    if (msgId) row.dataset.id = msgId;

    if (type === "rin") {
        let avatar = document.createElement("img");
        avatar.src = "rin.jpg";
        avatar.className = "avatar";
        avatar.alt = "Rin-san";
        row.appendChild(avatar);
    }

    let body = document.createElement("div");
    body.className = "message-body";

    let sender = document.createElement("span");
    sender.className = "message-name";
    sender.textContent = name;

    let bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (imgSrc) {
        let pic = document.createElement("img");
        pic.src = imgSrc;
        pic.className = "message-img";
        bubble.appendChild(pic);
    }

    if (text || !imgSrc) {
        let content = document.createElement("span");
        content.className = "message-content";
        renderRichText(content, text);
        if (animate) animateWords(content);
        bubble.appendChild(content);
    }

    if (msgId || text) {
        attachLongPress(bubble, function () {
            openMsgMenu(msgId || null, row, text);
        });
    }

    let time = document.createElement("span");
    time.className = "message-time";
    time.textContent = savedTime || new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });

    let footer = document.createElement("div");
    footer.className = "message-footer";
    footer.appendChild(time);

    if (type === "rin" && text) {
        let copyBtn = document.createElement("button");
        copyBtn.className = "copy-btn msg-act";
        copyBtn.textContent = "📋 Salin";
        copyBtn.onclick = function () {
            copyText(text, copyBtn);
        };
        footer.appendChild(copyBtn);

        // v2: tombol speaker — putar sekali balasan ini (jalan walau toggle mati)
        let speakBtn = document.createElement("button");
        speakBtn.className = "copy-btn msg-act speak-btn";
        speakBtn.textContent = "🔊";
        speakBtn.dataset.msgId = msgId || "";
        speakBtn.onclick = function () {
            speakRin(text, msgId);
        };
        footer.appendChild(speakBtn);
    }

    body.appendChild(sender);
    body.appendChild(bubble);
    body.appendChild(footer);
    row.appendChild(body);

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;


    // Wajah sprite sesuai mood (dulu wrapper addMessage, kini digabung).
    if (type === "rin") {
        let old = row.querySelector("img.avatar");
        if (old) {
            let chat = getActive();
            let face = document.createElement("div");
            face.className = "avatar sprite";
            setFace(face, mood || (chat && chat.mood) || "santai");
            old.replaceWith(face);
        }
    }
    return row;
}
function findMsg(id) {
    let chat = getActive();
    if (!chat) return null;
    return chat.messages.find(function (m) { return m.id === id; }) || null;
}
function openEdit(id) {
    if (sending) {
        showToast("Tunggu Rin-san selesai bales dulu ya");
        return;
    }
    let m = findMsg(id);
    if (!m) return;
    editingId = id;
    let input = $("editInput");
    input.value = m.img ? (m.caption || "") : m.text;
    $("editResend").style.display = (m.type === "user" && !m.img) ? "" : "none";
    $("editBox").classList.add("show");
    input.focus();
}
function closeEdit() {
    $("editBox").classList.remove("show");
    editingId = null;
}
function saveEdit(resend) {
    let m = findMsg(editingId);
    let val = $("editInput").value.trim();
    if (!m) {
        closeEdit();
        return;
    }

    let chat = getActive();
    let wasAuto = chat.title === titleFrom(chat.messages);

    if (m.img) {
        m.caption = val;
        m.text = "📷 " + (val || "Foto");
    } else {
        if (!val) {
            showToast("Pesan nggak boleh kosong");
            return;
        }
        m.text = val;
    }
    chat.updated = Date.now();

    let id = m.id;
    let canResend = m.type === "user" && !m.img;
    closeEdit();

    if (resend === true && canResend) {
        regenerateFrom(id, wasAuto);
        return;
    }

    saveStore();
    rerender();
    renderList();
    showToast("✏️ Pesan diubah");
}
function deleteMessage(id) {
    if (sending) {
        showToast("Tunggu Rin-san selesai bales dulu ya");
        return;
    }
    let chat = getActive();
    if (!chat) return;
    chat.messages = chat.messages.filter(function (m) { return m.id !== id; });
    if (chat.messages.length === 0) chat.title = "Obrolan baru";
    saveStore();
    rerender();
    renderList();
}
function regenerateFrom(id, wasAuto) {
    let chat = getActive();
    let idx = chat.messages.findIndex(function (m) { return m.id === id; });
    if (idx < 0) return;

    let text = chat.messages[idx].text;
    chat.messages = chat.messages.slice(0, idx);
    if (idx === 0 && wasAuto) chat.title = "Obrolan baru";
    saveStore();
    renderChat();
    renderList();

    removeImage();
    $("userInput").value = text;
    sendMessage();
}
function attachLongPress(el, handler) {
    let timer = null;
    let sx = 0;
    let sy = 0;

    function cancel() {
        clearTimeout(timer);
        timer = null;
    }

    el.addEventListener("pointerdown", function (e) {
        sx = e.clientX;
        sy = e.clientY;
        cancel();
        timer = setTimeout(function () {
            timer = null;
            handler();
        }, 500);
    });

    el.addEventListener("pointermove", function (e) {
        if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel();
    });

    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
        el.addEventListener(ev, cancel);
    });

    el.addEventListener("contextmenu", function (e) {
        e.preventDefault();
    });
}
function openMsgMenu(id, row, text) {
    menuMsg = { id: id, row: row, text: text };
    menuArmed = false;

    let preview = text || "📷 Foto";
    $("menuPreview").textContent = preview.length > 60 ? preview.slice(0, 60) + "…" : preview;
    $("menuCopy").style.display = text ? "" : "none";
    $("menuCopy").textContent = "📋 Salin";
    $("menuEdit").style.display = id ? "" : "none";
    $("menuDelete").textContent = "🗑️ Hapus";
    $("msgMenu").classList.add("show");

    if (navigator.vibrate) navigator.vibrate(20);
}
function closeMenu() {
    $("msgMenu").classList.remove("show");
    menuMsg = null;
    menuArmed = false;
}
function menuCopy() {
    if (!menuMsg) return;
    copyText(menuMsg.text, $("menuCopy"));
    setTimeout(closeMenu, 600);
}
function menuEdit() {
    let id = menuMsg && menuMsg.id;
    closeMenu();
    if (id) openEdit(id);
}
function menuDelete() {
    if (!menuMsg) return;
    if (!menuArmed) {
        menuArmed = true;
        $("menuDelete").textContent = "Yakin hapus? Tap lagi";
        return;
    }
    let m = menuMsg;
    closeMenu();
    if (m.id) deleteMessage(m.id);
    else m.row.remove();
}

/* =================================================================
   9. Kirim pesan & API (Cloudflare Worker)
   ================================================================ */

function isBlockedReply(d) {
    return d && typeof d.reply === "string" &&
        d.reply.indexOf("User location is not supported") !== -1;
}
function updateSendButton() {
    let b = $("sendBtn");
    if (!b) return;
    if (sending) {
        b.textContent = "\u23f9 Stop";
        b.onclick = stopReply;
    } else {
        b.textContent = "Kirim";
        b.onclick = sendMessage;
    }
}
function stopReply() {
    if (replyController) replyController.abort();
}
async function getReply(text, image) {
    let entry = { role: "user", content: text };
    if (image) entry.image = { data: image.base64, mime: image.mime };
    history.push(entry);

    let chat = getActive();
    let p = (chat && chat.persona) ? chat.persona : persona;
    // v2.4-adegan: kalau chat ini punya adegan, tempel suasana adegannya
    // ke persona yang dikirim ke Worker, jadi Rin ngobrol dari adegan itu.
    let personaText = p.text;
    if (chat && chat.scene) {
        let sc = sceneById(chat.scene);
        if (sc) personaText += "\n\n[Adegan saat ini: " + sc.name + "]\n" + sc.prompt;
    }

    let payload = JSON.stringify({
        messages: history,
        persona: personaText,
        memoryOn: memoryOn,
        memory: memoryOn ? memories.map(function (m) { return m.text; }) : [],
        mood: (chat && chat.mood) || "santai",
        profile: profileText()
    });

    try {
        let data = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            let r;
            try {
                r = await fetch(WORKER_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: payload,
                    signal: replyController ? replyController.signal : undefined
                });
            } catch (e) {
                // v2.2-stop: dibatalkan lewat tombol Stop -> bukan error koneksi.
                if (e && e.name === "AbortError") { history.pop(); return null; }
                throw e;
            }
            // Perbaikan 2026-11-11: Worker pernah mengembalikan 403 Forbidden
            // dengan body teks biasa ("Forbidden"), bukan JSON. Dulu r.json()
            // langsung melempar dan semua error jadi "Koneksinya bermasalah".
            // Sekarang cek status dulu dan baca body dengan aman. (r.ok dicek
            // hanya kalau bertipe boolean, supaya mock/polyfill tanpa properti
            // itu tidak dianggap gagal.)
            if (typeof r.ok === "boolean" && !r.ok) {
                let bodyText = "";
                try { bodyText = typeof r.text === "function" ? (await r.text()).trim() : ""; } catch (e) { bodyText = ""; }
                history.pop();
                if (r.status === 403) {
                    return "Hmph! Server Rin nolak permintaan (403 Forbidden). Worker-nya lagi diblokir atau mati — bukan salah koneksi kamu. Coba lagi nanti, atau cek Cloudflare Worker rin-san-nya!";
                }
                return "Hmph! Server Rin error (HTTP " + (r.status || "?") + (bodyText ? ": " + bodyText.slice(0, 120) : "") + "). Coba lagi nanti!";
            }
            try {
                data = await r.json();
            } catch (e) {
                history.pop();
                return "Hmph! Server Rin ngirim balasan yang nggak bisa dibaca. Coba lagi nanti!";
            }
            if (!data || typeof data.reply !== "string") {
                history.pop();
                return "Hmph! Server Rin ngirim balasan kosong. Coba lagi nanti!";
            }
            if (!isBlockedReply(data)) break;
            if (attempt < 3) {
                await new Promise(function (res) { setTimeout(res, 700); });
                // v2.2-stop: dibatalkan selama jeda retry -> berhenti, jangan lanjut.
                if (replyController && replyController.signal.aborted) { history.pop(); return null; }
            }
        }

        if (isBlockedReply(data)) {
            history.pop();
            return "Hmph! Servernya lagi nyasar ke wilayah yang diblokir. Coba kirim lagi sebentar lagi!";
        }

        if (image) {
            delete entry.image;
            entry.content = text + " [kirim foto]";
        }
        history.push({ role: "assistant", content: data.reply });

        if (data.mood && faceTable()[data.mood] && chat) chat.mood = data.mood;

        if (memoryOn && Array.isArray(data.memories)) {
            let added = data.memories.filter(function (f) { return addMemory(f); });
            if (added.length) showToast("🧠 Rin mengingat: " + added.join(", "));
        }
        return data.reply;
    } catch (err) {
        // v2.2-stop: abort juga bisa terjadi saat membaca body balasan.
        if (err && err.name === "AbortError") { history.pop(); return null; }
        history.pop();
        return "Hmph! Koneksinya bermasalah. Coba lagi nanti!";
    }
}
async function sendMessage() {
    if (sending) return;

    let input = $("userInput");
    let text = input.value.trim();
    let image = pendingImage;

    if (text === "" && !image) return;

    sending = true;
    replyController = new AbortController();
    updateSendButton();

    try {
        let chat = getActive();

        let userId = newId();
        let userRow = addMessage("Kamu", text, "user", null, image ? image.dataUrl : null, false, userId);
        chat.messages.push({
            id: userId,
            name: "Kamu",
            text: image ? "📷 " + (text || "Foto") : text,
            caption: text,
            img: image ? image.thumb : undefined,
            type: "user",
            time: userRow.querySelector(".message-time").textContent
        });
        if (chat.title === "Obrolan baru") chat.title = titleFrom(chat.messages);
        chat.updated = Date.now();
        saveStore();
        renderList();

        input.value = "";
        removeImage();

        let typing = addMessage("Rin-san", "", "rin");
        typing.classList.add("typing-row");

        let typingBubble = typing.querySelector(".message-bubble");
        for (let i = 0; i < 3; i++) {
            let dot = document.createElement("span");
            dot.className = "typing-dot";
            typingBubble.appendChild(dot);
        }

        let reply = await getReply(text || "Aku kirim foto ini.", image);
        // v2.2-stop: reply null = dibatalkan lewat tombol Stop. Pesan user
        // sudah tersimpan di atas; jangan tampilkan balasan Rin, jangan
        // simpan balasan, jangan bacakan TTS. Typing dots dihapus, tombol
        // kembali ke Kirim lewat finally.
        if (reply === null) {
            typing.remove();
            return;
        }
        // Perbaikan 2026-11-11: kalau getReply gagal (mis. Worker 403),
        // history bisa kosong setelah history.pop() di getReply. Dulu
        // history[history.length - 1].content langsung melempar TypeError,
        // typing dots nyangkut dan pesan error Rin tidak pernah tampil.
        let ok = history.length > 0 && history[history.length - 1].content === reply;

        typing.remove();

        let rinId = ok ? newId() : null;
        let rinRow = addMessage("Rin-san", reply, "rin", null, null, true, rinId, chat.mood);

        if (ok) {
            chat.messages.push({
                id: rinId,
                name: "Rin-san",
                text: reply,
                mood: chat.mood,
                type: "rin",
                time: rinRow.querySelector(".message-time").textContent
            });
        }
        chat.messages = chat.messages.slice(-50);
        chat.updated = Date.now();
        saveStore();
        renderList();
        updateHeaderMood(true);

        // v2: kalau suara Rin aktif, bacakan balasan baru otomatis
        if (ok && voiceOn) speakRin(reply, rinId);
    } finally {
        replyController = null;
        sending = false;
        updateSendButton();
    }
}

/* =================================================================
   10. Persona — pengaturan
   ================================================================ */

function loadPersona() {
    try {
        let s = JSON.parse(localStorage.getItem(PERSONA_KEY));
        if (s && typeof s.text === "string") persona = s;
    } catch (e) {}
}
function renderChips() {
    let box = $("personaChips");
    box.innerHTML = "";
    PRESETS.forEach(function (p) {
        let b = document.createElement("button");
        b.className = "persona-chip" + (p.name === pickedPreset ? " active" : "");
        b.textContent = p.name;
        b.onclick = function () {
            pickedPreset = p.name;
            if (p.text !== null) $("personaInput").value = p.text;
            renderChips();
        };
        box.appendChild(b);
    });
}
function savePersona() {
    let text = $("personaInput").value.trim();
    let match = PRESETS.find(function (p) { return p.text !== null && p.text === text; });
    let next = { preset: match ? match.name : "Kustom", text: text };

    toggleSettings(false);

    let chat = getActive();
    let eff = (chat && chat.persona) ? chat.persona : persona;

    if (next.text === eff.text) return;

    if (chat && chat.messages.length > 0) {
        pendingPersona = next;
        $("personaConfirm").classList.add("show");
    } else {
        commitPersona(next);
        if (chat) {
            delete chat.persona;
            saveStore();
        }
    }
}
function commitPersona(next) {
    let old = { preset: persona.preset, text: persona.text };
    store.chats.forEach(function (c) {
        if (c.messages.length > 0 && !c.persona) c.persona = old;
    });
    persona = next;
    try {
        localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
    } catch (e) {}
    saveStore();
    showToast("✅ Kepribadian disimpan");
}
function resetActiveChat() {
    let chat = getActive();
    if (!chat) return;
    chat.messages = [];
    chat.title = "Obrolan baru";
    chat.updated = Date.now();
    delete chat.persona;
    delete chat.scene; // v2.4-adegan: chat yang direset bukan lagi chat adegan
    saveStore();
    renderChat();
    renderList();
}
function applyPersona(clearOld) {
    if (sending) {
        showToast("Tunggu Rin-san selesai bales dulu ya");
        return;
    }

    let next = pendingPersona;
    pendingPersona = null;
    $("personaConfirm").classList.remove("show");
    if (!next) return;

    commitPersona(next);

    if (clearOld) {
        resetActiveChat();
        showToast("🗑️ Chat lama dihapus, kepribadian baru dipakai");
    } else {
        let c = makeChat();
        store.chats.push(c);
        store.activeId = c.id;
        saveStore();
        renderChat();
        renderList();
        showToast("✨ Obrolan baru dengan kepribadian baru");
    }
}
function cancelPersona() {
    pendingPersona = null;
    $("personaConfirm").classList.remove("show");
}

/* =================================================================
   11. Memori
   ================================================================ */

function loadMemory() {
    try {
        let m = JSON.parse(localStorage.getItem(MEMORY_KEY));
        if (Array.isArray(m)) {
            memories = m.filter(function (x) { return x && typeof x.text === "string"; });
        }
        memoryOn = localStorage.getItem(MEMORY_ON_KEY) !== "0";
    } catch (e) {}
}
function saveMemory() {
    try {
        localStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
        localStorage.setItem(MEMORY_ON_KEY, memoryOn ? "1" : "0");
    } catch (e) {}
}
function addMemory(text) {
    text = String(text).trim().slice(0, 120);
    if (!text) return false;
    let low = text.toLowerCase();
    if (memories.some(function (m) { return m.text.toLowerCase() === low; })) return false;
    memories.push({ id: "m" + Date.now() + Math.floor(Math.random() * 1000), text: text });
    if (memories.length > MEMORY_MAX) memories = memories.slice(-MEMORY_MAX);
    saveMemory();
    return true;
}
function renderMemory() {
    let toggle = $("memoryToggle");
    toggle.textContent = memoryOn ? "Ingatan: Aktif ✅" : "Ingatan: Mati ⏸️";
    toggle.classList.toggle("on", memoryOn);

    let list = $("memoryList");
    list.innerHTML = "";

    if (memories.length === 0) {
        let empty = document.createElement("div");
        empty.className = "memory-empty";
        empty.textContent = "Belum ada yang diingat. Coba ceritain sesuatu ke Rin-san.";
        list.appendChild(empty);
    }

    memories.forEach(function (m) {
        let item = document.createElement("div");
        item.className = "memory-item";

        let span = document.createElement("span");
        span.textContent = m.text;

        let del = document.createElement("button");
        del.className = "memory-del";
        del.textContent = "✕";
        del.onclick = function () {
            memories = memories.filter(function (x) { return x.id !== m.id; });
            saveMemory();
            renderMemory();
        };

        item.appendChild(span);
        item.appendChild(del);
        list.appendChild(item);
    });

    $("memoryClear").textContent = "Hapus semua";
    clearArmed = false;
}
function toggleMemory() {
    memoryOn = !memoryOn;
    saveMemory();
    renderMemory();
}
function addManualMemory() {
    let input = $("memoryInput");
    if (addMemory(input.value)) input.value = "";
    renderMemory();
}
function clearMemory() {
    if (!clearArmed) {
        clearArmed = true;
        $("memoryClear").textContent = "Yakin? Tap lagi";
        setTimeout(function () {
            if (clearArmed) {
                clearArmed = false;
                $("memoryClear").textContent = "Hapus semua";
            }
        }, 3000);
        return;
    }
    memories = [];
    saveMemory();
    renderMemory();
    toggleSettings(false);
    showToast("🧠 Semua ingatan dihapus");
}

/* =================================================================
   12. Pengaturan & accordion
   ================================================================ */

function toggleSettings(open) {
    let panel = $("settings");
    let ov = $("settingsOverlay");
    if (!panel || !ov) return;
    let show = typeof open === "boolean" ? open : !panel.classList.contains("show");
    if (show) toggleSidebar(false);
    panel.classList.toggle("show", show);
    ov.classList.toggle("show", show);
}
function toggleAcc(which) {
    // v2: peta accordion — persona / memory / backup (suara & cadangan)
    // v2.4-adegan: + scene
    let map = {
        persona: { body: "accPersona", head: "accPersonaHead" },
        memory: { body: "accMemory", head: "accMemoryHead" },
        backup: { body: "accBackup", head: "accBackupHead" },
        scene: { body: "accScene", head: "accSceneHead" }
    };
    let entry = map[which];
    if (!entry) return;
    let body = $(entry.body);
    let head = $(entry.head);
    if (!body || !head) return;
    let open = !body.classList.contains("open");

    body.classList.toggle("open", open);
    head.querySelector(".acc-arrow").textContent = open ? "↓" : ">";

    if (open) {
        if (which === "persona") {
            let chat = getActive();
            let eff = (chat && chat.persona) ? chat.persona : persona;
            pickedPreset = eff.preset || "Tsundere";
            $("personaInput").value = eff.text;
            renderChips();
        } else if (which === "memory") {
            renderMemory();
        } else if (which === "backup") {
            renderVoiceToggle();
        } else if (which === "scene") {
            renderScenes();
        }
    }
}

/* =================================================================
   12b. Adegan (v2.4) — chat khusus per adegan, dipilih dari Settings
   ================================================================ */

function renderScenes() {
    let box = $("sceneList");
    if (!box) return;
    box.innerHTML = "";
    let active = getActive();
    SCENES.forEach(function (sc) {
        let b = document.createElement("button");
        b.className = "scene-btn" + (active && active.scene === sc.id ? " active" : "");
        let icon = document.createElement("span");
        icon.className = "scene-icon";
        icon.textContent = sc.icon;
        let wrap = document.createElement("span");
        wrap.className = "scene-text";
        let name = document.createElement("span");
        name.className = "scene-name";
        name.textContent = sc.name;
        let desc = document.createElement("span");
        desc.className = "scene-desc";
        desc.textContent = sc.desc;
        wrap.appendChild(name);
        wrap.appendChild(desc);
        b.appendChild(icon);
        b.appendChild(wrap);
        b.onclick = function () { startSceneChat(sc.id); };
        box.appendChild(b);
    });
}
function makeOpening(sc) {
    // v2.4.1: pesan pertama Rin saat adegan dimulai — narasi adegan
    // (miring, tidak dibacakan TTS) + sapaan Rin. Disimpan sebagai
    // pesan biasa, jadi ikut tersimpan, ter-backup, dan masuk history.
    return {
        id: newId(),
        name: "Rin-san",
        text: sc.opening,
        mood: sc.mood || "santai",
        type: "rin",
        time: new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        })
    };
}
function startSceneChat(id) {
    if (sending) {
        showToast("Tunggu Rin-san selesai bales dulu ya");
        return;
    }
    let sc = sceneById(id);
    if (!sc) return;
    // Satu chat khusus per adegan: kalau sudah ada, masuk ke chat itu.
    let existing = store.chats.filter(function (c) { return c.scene === id; })
        .sort(function (a, b) { return b.updated - a.updated; })[0];
    if (existing) {
        // Chat adegan yang kosong (pesannya dihapus) dapat pembuka lagi.
        if (existing.messages.length === 0) {
            existing.messages.push(makeOpening(sc));
            existing.updated = Date.now();
        }
        store.activeId = existing.id;
        saveStore();
        renderChat();
        renderList();
        toggleSettings(false);
        showToast("🎬 Lanjut adegan " + sc.name);
        return;
    }
    let c = makeChat();
    c.title = sc.icon + " " + sc.name;
    c.scene = id;
    c.messages.push(makeOpening(sc));
    store.chats.push(c);
    store.activeId = c.id;
    saveStore();
    renderChat();
    renderList();
    toggleSettings(false);
    showToast("🎬 Adegan " + sc.name + " dimulai!");
}

/* =================================================================
   13. Profil & mood
   ================================================================ */

function faceTable() {
    return {
        kesal:   { r: 0, c: 0, label: "Kesal 😤" },
        santai:  { r: 0, c: 1, label: "Santai 😌" },
        senang:  { r: 0, c: 2, label: "Senang 😊" },
        dingin:  { r: 0, c: 3, label: "Dingin 😐" },
        malu:    { r: 1, c: 0, label: "Malu 😳" },
        ngambek: { r: 1, c: 1, label: "Ngambek 😠" },
        ngantuk: { r: 1, c: 2, label: "Ngantuk 😴" },
        salting: { r: 1, c: 3, label: "Salting 🙈" },
        bingung: { r: 2, c: 0, label: "Bingung ❓" },
        panik:   { r: 2, c: 1, label: "Panik 😵" },
        serius:  { r: 2, c: 2, label: "Serius 🤓" },
        jahil:   { r: 2, c: 3, label: "Jahil 😜" }
    };
}
function faceInfo(mood) {
    let t = faceTable();
    return t[mood] || t.santai;
}
function setFace(el, mood) {
    let f = faceInfo(mood);
    // geser angka ini kalau wajah kepotong: angka kecil = tampil lebih ke atas
    let rowY = [3.3, 47.8, 92.2];
    el.style.backgroundPosition = (f.c / 3 * 100) + "% " + rowY[f.r] + "%, center";
}
function initHeaderFace() {
    let img = document.querySelector("img.header-avatar");
    if (img) {
        let d = document.createElement("div");
        d.id = "headerAvatar";
        d.className = "header-avatar sprite";
        img.replaceWith(d);
    }
}
function updateHeaderMood(animate) {
    let chat = getActive();
    let mood = (chat && chat.mood) || "santai";

    let av = document.getElementById("headerAvatar");
    if (av) {
        setFace(av, mood);
        if (animate) {
            av.classList.remove("pop");
            void av.offsetWidth;
            av.classList.add("pop");
        }
    }

    let sub = document.querySelector(".subtitle");
    if (sub) {
        sub.textContent = (chat && chat.mood) ? "Suasana hati: " + faceInfo(mood).label : "semoga suka";
    }
    applyMood3D(); // v2.5: ekspresi 3D ikut mood
}
function pCard(title) {
    let c = document.createElement("div");
    c.className = "p-card";
    let h = document.createElement("h3");
    h.className = "p-title";
    h.textContent = title;
    c.appendChild(h);
    return c;
}
function pChips(list) {
    let w = document.createElement("div");
    w.className = "p-chips";
    list.forEach(function (t) {
        let s = document.createElement("span");
        s.className = "p-chip";
        s.textContent = t;
        w.appendChild(s);
    });
    return w;
}
function pSub(text) {
    let d = document.createElement("div");
    d.className = "p-sub";
    d.textContent = text;
    return d;
}
function pList(list) {
    let ul = document.createElement("ul");
    ul.className = "p-list";
    list.forEach(function (t) {
        let li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
    });
    return ul;
}
function renderProfile() {
    let chat = getActive();
    let mood = (chat && chat.mood) || "santai";
    let prof = activeProfile();

    setFace($("profileFace"), mood);
    $("profileMood").textContent = faceInfo(mood).label;
    $("profileDesc").textContent = prof.desc;

    let tag = document.querySelector(".strip-tag");
    if (tag) tag.textContent = prof.tag;

    let body = $("profileBody");
    body.innerHTML = "";

    let about = pCard("Deskripsi");
    let p = document.createElement("p");
    p.className = "p-text";
    p.textContent = prof.about;
    about.appendChild(p);
    body.appendChild(about);

    let bio = pCard("Biodata");
    PROFILE.bio.forEach(function (row) {
        let r = document.createElement("div");
        r.className = "p-row";
        let a = document.createElement("span");
        a.textContent = row[0];
        let b = document.createElement("span");
        b.textContent = row[0] === "Tipe" ? prof.type : row[1];
        r.appendChild(a);
        r.appendChild(b);
        bio.appendChild(r);
    });
    body.appendChild(bio);

    let traits = pCard("Sifat");
    traits.appendChild(pChips(prof.traits));
    body.appendChild(traits);

    if (prof.likes.length || prof.dislikes.length) {
        let likes = pCard("Kesukaan");
        if (prof.likes.length) {
            likes.appendChild(pSub("Suka"));
            likes.appendChild(pChips(prof.likes));
        }
        if (prof.dislikes.length) {
            likes.appendChild(pSub("Tidak suka"));
            likes.appendChild(pChips(prof.dislikes));
        }
        body.appendChild(likes);
    }

    if (prof.habits.length) {
        let habits = pCard("Kebiasaan");
        habits.appendChild(pList(prof.habits));
        body.appendChild(habits);
    }

    // v2.7: tombol Rin 3D di bawah Kebiasaan (paling bawah profil).
    let btn3d = document.createElement("button");
    btn3d.className = "profile-3d-btn";
    btn3d.textContent = "🎥 Rin 3D";
    btn3d.onclick = openStage3D;
    body.appendChild(btn3d);
}
function openProfile() {
    renderProfile();
    toggleSidebar(false);
    toggleSettings(false);
    let page = $("profilePage");
    page.querySelector(".profile-scroll").scrollTop = 0;
    page.classList.add("show");
}
function closeProfile() {
    $("profilePage").classList.remove("show");
}
function initProfile() {
    let av = document.getElementById("headerAvatar");
    if (av) av.onclick = openProfile;
    $("messages").addEventListener("click", function (e) {
        if (e.target.closest(".avatar")) openProfile();
    });
}
function activeProfile() {
    let chat = getActive();
    let p = (chat && chat.persona) ? chat.persona : persona;
    if (PROFILES[p.preset]) return PROFILES[p.preset];

    let t = p.text || "";
    return {
        tag: "KUSTOM", type: "Kustom",
        desc: "Kepribadian buatan kamu sendiri.",
        about: t ? t.slice(0, 300) + (t.length > 300 ? "…" : "") : "Belum ada deskripsi.",
        traits: ["Kustom"], likes: [], dislikes: [], habits: []
    };
}
function profileText() {
    let prof = activeProfile();
    let lines = [];
    PROFILE.bio.forEach(function (row) {
        if (row[0] !== "Tipe") lines.push(row[0] + ": " + row[1]);
    });
    if (prof.likes.length) lines.push("Suka: " + prof.likes.join(", "));
    if (prof.dislikes.length) lines.push("Tidak suka: " + prof.dislikes.join(", "));
    if (prof.habits.length) lines.push("Kebiasaan khas (muncul sesekali): " + prof.habits.join("; "));
    return lines.join("\n");
}

/* =================================================================
   14. Menu lampiran (kamera / galeri)
   ================================================================ */

function closeAttachMenu() {
    let p = $("attachPop");
    let b = $("attachBackdrop");
    if (p) p.classList.remove("show");
    if (b) b.classList.remove("show");
}
function ensureAttachMenu() {
    if ($("attachPop")) return;

    let backdrop = document.createElement("div");
    backdrop.id = "attachBackdrop";
    backdrop.className = "attach-backdrop";
    backdrop.onclick = closeAttachMenu;

    let pop = document.createElement("div");
    pop.id = "attachPop";
    pop.className = "attach-pop";

    function opt(iconSvg, label, fn) {
        let b = document.createElement("button");
        b.className = "attach-item";

        let ico = document.createElement("span");
        ico.className = "attach-ico";
        ico.innerHTML = iconSvg;

        let txt = document.createElement("span");
        txt.textContent = label;

        b.appendChild(ico);
        b.appendChild(txt);
        b.onclick = function () {
            fn();
            closeAttachMenu();
        };
        pop.appendChild(b);
    }

    opt(ICON_CAM, "Kamera", function () { camBackInput.click(); });
    opt(ICON_IMG, "Galeri", function () { $("fileInput").click(); });

    document.body.appendChild(backdrop);
    document.body.appendChild(pop);
}
function openAttachMenu() {
    ensureAttachMenu();

    let pop = $("attachPop");
    let area = document.querySelector(".input-area");
    let btn = document.querySelector(".attach-btn");

    if (area) {
        pop.style.bottom = (window.innerHeight - area.getBoundingClientRect().top + 10) + "px";
    }
    if (btn) {
        pop.style.left = Math.max(10, btn.getBoundingClientRect().left) + "px";
    }

    void pop.offsetWidth;
    $("attachBackdrop").classList.add("show");
    pop.classList.add("show");
}
function initAttach() {
    camBackInput = makeCamInput("environment");
    let btn = document.querySelector(".attach-btn");
    if (btn) btn.onclick = openAttachMenu;
}

/* =================================================================
   15. Pencarian, backup & suara (v2)
   ================================================================ */

/* --- 15a. Cari chat di sidebar --- */
function onChatSearch(q) {
    chatSearchQuery = (q || "").trim().toLowerCase();
    renderList();
}

/* --- 15b. Cari pesan di chat aktif ---
   Perilaku: ketik = semua pesan yang cocok langsung diberi highlight
   (class search-hit) dan penghitung "n/total" diperbarui, tapi layar
   TIDAK melompat sendiri. Enter / tombol ‹ › melompat ke match
   berikutnya/sebelumnya (melintas, membungkus di ujung) dan menandai
   match aktif (class search-current). Tutup bar = bersihkan pencarian. */
function toggleMsgSearch(show) {
    let bar = $("msgSearchBar");
    if (!bar) return;
    let open = typeof show === "boolean" ? show : !bar.classList.contains("show");
    bar.classList.toggle("show", open);
    if (open) {
        let inp = $("msgSearchInput");
        if (inp) inp.focus();
    } else {
        msgSearchQuery = "";
        let inp = $("msgSearchInput");
        if (inp) inp.value = "";
        applyMsgSearch();
    }
}
function onMsgSearch(q) {
    msgSearchQuery = (q || "").trim().toLowerCase();
    msgMatchIndex = -1;
    applyMsgSearch();
}
function applyMsgSearch() {
    let box = $("messages");
    if (!box) return;
    box.querySelectorAll(".message.search-hit").forEach(function (el) {
        el.classList.remove("search-hit");
    });
    box.querySelectorAll(".message.search-current").forEach(function (el) {
        el.classList.remove("search-current");
    });
    msgMatches = [];
    if (!msgSearchQuery) {
        msgMatchIndex = -1;
        updateMsgSearchCount();
        return;
    }
    let chat = getActive();
    if (!chat) return;
    chat.messages.forEach(function (m) {
        let hay = (m.text || "") + " " + (m.caption || "");
        if (hay.toLowerCase().indexOf(msgSearchQuery) !== -1 && m.id) {
            msgMatches.push(m.id);
        }
    });
    msgMatches.forEach(function (id) {
        let row = box.querySelector('[data-id="' + id + '"]');
        if (row) row.classList.add("search-hit");
    });
    if (msgMatches.length) {
        if (msgMatchIndex < 0 || msgMatchIndex >= msgMatches.length) msgMatchIndex = 0;
        markMsgSearchCurrent(false);
    } else {
        msgMatchIndex = -1;
    }
    updateMsgSearchCount();
}
function markMsgSearchCurrent(scroll) {
    let box = $("messages");
    if (!box) return;
    box.querySelectorAll(".message.search-current").forEach(function (el) {
        el.classList.remove("search-current");
    });
    if (msgMatchIndex < 0 || msgMatchIndex >= msgMatches.length) return;
    let row = box.querySelector('[data-id="' + msgMatches[msgMatchIndex] + '"]');
    if (row) {
        row.classList.add("search-current");
        if (scroll && row.scrollIntoView) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }
}
function msgSearchNext(dir) {
    if (!msgMatches.length) {
        if (msgSearchQuery) showToast("Tidak ditemukan");
        return;
    }
    msgMatchIndex = (msgMatchIndex + dir + msgMatches.length) % msgMatches.length;
    markMsgSearchCurrent(true);
    updateMsgSearchCount();
}
function updateMsgSearchCount() {
    let c = $("msgSearchCount");
    if (!c) return;
    if (!msgSearchQuery) {
        c.textContent = "";
        return;
    }
    c.textContent = msgMatches.length
        ? (msgMatchIndex + 1) + "/" + msgMatches.length
        : "Tidak ditemukan";
}

/* --- 15c. Backup JSON: ekspor & impor --- */
function exportBackup() {
    if (typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
        showToast("Browser ini tidak mendukung unduhan file");
        return;
    }
    let now = new Date();
    let pad = function (n) { return String(n).padStart(2, "0"); };
    let stamp = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    let theme = null;
    try { theme = localStorage.getItem(THEME_KEY); } catch (e) {}
    let data = {
        app: "rin-san-ai",
        version: 2,
        exportedAt: now.toISOString(),
        rinChats: store,
        rinPersona: persona,
        rinMemory: memories,
        rinTheme: theme,
        rinMemoryOn: memoryOn,
        rinVoiceOn: voiceOn
    };
    let blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    let url = URL.createObjectURL(blob);
    let a = document.createElement("a");
    a.href = url;
    a.download = "rin-san-ai-backup-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast("✅ Cadangan diunduh");
}
function triggerImportBackup() {
    let f = $("importFile");
    if (f) f.click();
}
function importBackupFile(input) {
    let file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (typeof FileReader === "undefined") {
        showToast("Browser ini tidak mendukung impor file");
        return;
    }
    let reader = new FileReader();
    reader.onload = function () {
        let data;
        try {
            data = JSON.parse(reader.result);
        } catch (e) {
            showToast("File backup tidak valid");
            return;
        }
        let chatsOk = data && typeof data === "object" && data.rinChats &&
            (Array.isArray(data.rinChats.chats) || Array.isArray(data.rinChats));
        if (!chatsOk) {
            showToast("File backup tidak valid");
            return;
        }
        askImportBackup(data);
    };
    reader.onerror = function () {
        showToast("File backup tidak bisa dibaca");
    };
    reader.readAsText(file);
}
function askImportBackup(data) {
    pendingImportData = data;
    let n = Array.isArray(data.rinChats.chats)
        ? data.rinChats.chats.length
        : (Array.isArray(data.rinChats) ? data.rinChats.length : 0);
    let t = $("importConfirmText");
    if (t) {
        t.textContent = "Impor cadangan ini? " + n + " obrolan akan menggantikan semua data lama." +
            (data.exportedAt ? " Diekspor: " + String(data.exportedAt).slice(0, 10) + "." : "");
    }
    let box = $("importConfirmBox");
    if (box) box.classList.add("show");
}
function closeImportConfirm() {
    let box = $("importConfirmBox");
    if (box) box.classList.remove("show");
    pendingImportData = null;
}
function doImportBackup() {
    let data = pendingImportData;
    closeImportConfirm();
    if (!data) return;
    stopSpeaking();
    stopListening();

    let incoming = Array.isArray(data.rinChats)
        ? { activeId: null, chats: data.rinChats }
        : data.rinChats;
    store = {
        activeId: incoming.activeId || null,
        chats: (incoming.chats || []).filter(function (c) {
            return c && Array.isArray(c.messages);
        })
    };
    if (store.chats.length === 0) {
        let c = makeChat();
        store.chats.push(c);
        store.activeId = c.id;
    }
    if (!store.chats.some(function (c) { return c.id === store.activeId; })) {
        store.activeId = store.chats[0].id;
    }
    if (data.rinPersona && typeof data.rinPersona.text === "string") {
        persona = data.rinPersona;
    }
    if (Array.isArray(data.rinMemory)) {
        memories = data.rinMemory
            .filter(function (m) { return m && typeof m.text === "string"; })
            .slice(-MEMORY_MAX);
    }
    if (typeof data.rinMemoryOn === "boolean") memoryOn = data.rinMemoryOn;
    if (typeof data.rinVoiceOn === "boolean") voiceOn = data.rinVoiceOn;
    let theme = (typeof data.rinTheme === "string" && data.rinTheme) ? data.rinTheme : null;
    try {
        saveStore();
        saveMemory();
        localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
        localStorage.setItem(VOICE_KEY, voiceOn ? "1" : "0");
        if (theme) localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
    if (theme) setTheme(theme);

    chatSearchQuery = "";
    let cs = $("chatSearchInput");
    if (cs) cs.value = "";
    msgSearchQuery = "";
    msgMatches = [];
    msgMatchIndex = -1;
    let ms = $("msgSearchInput");
    if (ms) ms.value = "";
    updateMsgSearchCount();

    renderVoiceToggle();
    renderChat();
    renderList();
    renderMemory();
    toggleSettings(false);
    showToast("✅ Cadangan berhasil diimpor");
}

/* --- 15d. Suara Rin: TTS (speechSynthesis) --- */
function loadVoice() {
    try {
        voiceOn = localStorage.getItem(VOICE_KEY) === "1";
    } catch (e) {
        voiceOn = false;
    }
}
function saveVoice() {
    try {
        localStorage.setItem(VOICE_KEY, voiceOn ? "1" : "0");
    } catch (e) {}
}
/* v2.9.1: kecepatan suara Rin (slider di Settings). Disimpan di
   localStorage, dijepit ke 0.7–1.2 (batas ElevenLabs speed). */
function clampVoiceSpeed(v) {
    let n = Number(v);
    if (!isFinite(n)) return SPEED_DEFAULT;
    return Math.min(SPEED_MAX, Math.max(SPEED_MIN, n));
}
function loadVoiceSpeed() {
    try {
        let raw = localStorage.getItem(SPEED_KEY);
        voiceSpeed = (raw === null || raw === "") ? SPEED_DEFAULT : clampVoiceSpeed(raw);
    } catch (e) {
        voiceSpeed = SPEED_DEFAULT;
    }
}
function saveVoiceSpeed() {
    try {
        localStorage.setItem(SPEED_KEY, String(voiceSpeed));
    } catch (e) {}
}
function renderVoiceSpeedVal() {
    if (!voiceSpeedWrapEl || !voiceSpeedWrapEl.querySelector) return;
    let val = voiceSpeedWrapEl.querySelector("#voiceSpeedVal");
    if (val) val.textContent = voiceSpeed.toFixed(2) + "×";
}
/* v2.9.1: slider kecepatan suara di accordion "Suara & cadangan",
   tepat di bawah tombol Suara Rin. Dibangun dari JS supaya tidak
   perlu ubah index.html; memakai class .backup-note yang sudah ada
   supaya tampilannya sama dengan catatan di panel itu. */
function renderVoiceSpeed() {
    let b = $("voiceToggle");
    if (!b || typeof document === "undefined" || !document.createElement) return;
    if (!voiceSpeedWrapEl) {
        let wrap = document.createElement("div");
        wrap.id = "voiceSpeedWrap";
        wrap.className = "backup-note";
        let label = document.createElement("label");
        label.setAttribute("for", "voiceSpeed");
        label.textContent = "Kecepatan suara: ";
        let val = document.createElement("span");
        val.id = "voiceSpeedVal";
        label.appendChild(val);
        let slider = document.createElement("input");
        slider.type = "range";
        slider.id = "voiceSpeed";
        slider.min = String(SPEED_MIN);
        slider.max = String(SPEED_MAX);
        slider.step = "0.05";
        slider.value = String(voiceSpeed);
        slider.addEventListener("input", function () {
            voiceSpeed = clampVoiceSpeed(slider.value);
            saveVoiceSpeed();
            renderVoiceSpeedVal();
        });
        wrap.appendChild(label);
        wrap.appendChild(slider);
        let parent = b.parentNode;
        if (parent && parent.insertBefore) parent.insertBefore(wrap, b.nextSibling || null);
        else if ($("accBackup") && $("accBackup").appendChild) $("accBackup").appendChild(wrap);
        else return;
        voiceSpeedWrapEl = wrap;
    }
    let slider = voiceSpeedWrapEl.querySelector ? voiceSpeedWrapEl.querySelector("#voiceSpeed") : null;
    if (slider) slider.value = String(voiceSpeed);
    renderVoiceSpeedVal();
}
function renderVoiceToggle() {
    let b = $("voiceToggle");
    if (!b) return;
    b.textContent = voiceOn ? "Suara Rin: Aktif ✅" : "Suara Rin: Mati ⏸️";
    b.classList.toggle("on", voiceOn);
    renderVoiceSpeed();
}
function toggleVoice() {
    voiceOn = !voiceOn;
    saveVoice();
    if (!voiceOn) stopSpeaking();
    renderVoiceToggle();
    showToast(voiceOn ? "🔊 Suara Rin aktif" : "🔇 Suara Rin mati");
}
function pickRinVoice() {
    if (typeof speechSynthesis === "undefined" || !speechSynthesis.getVoices) return null;
    let voices = speechSynthesis.getVoices() || [];
    function score(v) {
        let s = 0;
        let lang = (v.lang || "").toLowerCase();
        let name = (v.name || "").toLowerCase();
        if (lang.indexOf("id") === 0) s += 10;
        if (name.indexOf("google bahasa indonesia") !== -1) s += 10;
        else if (name.indexOf("indonesian") !== -1) s += 5;
        if (name.indexOf("female") !== -1 || name.indexOf("wanita") !== -1) s += 2;
        return s;
    }
    let best = null;
    let bestScore = 0;
    voices.forEach(function (v) {
        let s = score(v);
        if (s > bestScore) {
            bestScore = s;
            best = v;
        }
    });
    return bestScore > 0 ? best : null;
}
/* v2.3: teks miring *...* adalah aksi/gerakan Rin (mis. *cekikikan*,
   *melirik sekilas*) — dibuang dari yang dibacakan TTS supaya Google
   tidak membacakannya. Teks tebal **...** tetap dibaca (penekanan). */
function stripSpeechMarkup(text) {
    return String(text || "")
        .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "")
        .replace(/^📷\s*/, "Foto. ")
        .replace(/[😀-🙏🌀-🗿🚀-🛿☀-➿]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}
/* v2.9: suara Rin dari ElevenLabs (voice "Rin-san" bikinan Ridwan, via
   Worker /tts) — fallback ke Google TTS kalau Worker belum dipasang,
   secret belum ada, kuota habis, atau audio gagal diputar. */
var rinAudio = null; // audio ElevenLabs yang sedang diputar
var speakSeq = 0; // token: balasan lama diabaikan kalau Stop / bicara baru
function speakRin(text, msgId) {
    let clean = stripSpeechMarkup(text);
    if (!clean) return;
    stopSpeaking();
    let seq = speakSeq;
    speakRinElevenLabs(clean, msgId, seq);
}
async function speakRinElevenLabs(clean, msgId, seq) {
    try {
        if (typeof fetch === "undefined" || typeof Audio === "undefined") throw new Error("no-audio-fetch");
        let r = await fetch(WORKER_URL + "/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clean.slice(0, 500), speed: voiceSpeed })
        });
        if (seq !== speakSeq) return; // sudah di-Stop / bicara baru
        if (!r || !r.ok) throw new Error("tts-http-" + (r && r.status));
        let ct = "";
        try { ct = (r.headers && r.headers.get("Content-Type")) || ""; } catch (e) {}
        if (ct && ct.indexOf("audio") === -1) throw new Error("tts-bukan-audio");
        let blob = await r.blob();
        if (seq !== speakSeq) return;
        let url = URL.createObjectURL(blob);
        let audio = new Audio(url);
        rinAudio = audio;
        speakingMsgId = msgId || null;
        markSpeakingButtons();
        audio.onplay = function () { setSpeaking3D(true); }; // v2.5: bibir 3D ikut bicara
        audio.onended = function () {
            setSpeaking3D(false);
            try { URL.revokeObjectURL(url); } catch (e) {}
            if (rinAudio === audio) rinAudio = null;
            if (speakingMsgId === msgId) { speakingMsgId = null; markSpeakingButtons(); }
        };
        audio.onerror = function () {
            setSpeaking3D(false);
            try { URL.revokeObjectURL(url); } catch (e) {}
            if (rinAudio === audio) rinAudio = null;
            if (speakingMsgId === msgId) { speakingMsgId = null; markSpeakingButtons(); }
            speakRinGoogle(clean, msgId);
        };
        await audio.play();
    } catch (e) {
        if (seq !== speakSeq) return;
        speakRinGoogle(clean, msgId);
    }
}
function speakRinGoogle(clean, msgId) {
    if (typeof speechSynthesis === "undefined" ||
        typeof SpeechSynthesisUtterance === "undefined") {
        showToast("Browser ini tidak mendukung suara");
        return;
    }
    stopSpeaking();
    let u = new SpeechSynthesisUtterance(clean);
    u.lang = "id-ID";
    u.rate = voiceSpeed; // v2.9.1: slider kecepatan ikut berlaku di fallback Google
    u.pitch = 1.05;
    let v = pickRinVoice();
    if (v) u.voice = v;
    speakingMsgId = msgId || null;
    markSpeakingButtons();
    u.onstart = function () { setSpeaking3D(true); }; // v2.5: bibir 3D ikut bicara
    u.onend = function () {
        setSpeaking3D(false);
        if (speakingMsgId === msgId) {
            speakingMsgId = null;
            markSpeakingButtons();
        }
    };
    u.onerror = function () {
        setSpeaking3D(false);
        if (speakingMsgId === msgId) {
            speakingMsgId = null;
            markSpeakingButtons();
        }
    };
    try {
        speechSynthesis.speak(u);
    } catch (e) {
        setSpeaking3D(false);
        speakingMsgId = null;
        markSpeakingButtons();
    }
}
function stopSpeaking() {
    speakSeq++; // batalkan fetch /tts yang masih jalan
    setSpeaking3D(false); // v2.5: bibir 3D berhenti
    if (rinAudio) {
        try { rinAudio.pause(); } catch (e) {}
        rinAudio = null;
    }
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.cancel) {
        try { speechSynthesis.cancel(); } catch (e) {}
    }
    speakingMsgId = null;
    markSpeakingButtons();
}
function markSpeakingButtons() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    document.querySelectorAll(".speak-btn").forEach(function (b) {
        let on = speakingMsgId && b.dataset && b.dataset.msgId === speakingMsgId;
        b.classList.toggle("speaking", !!on);
        b.textContent = on ? "⏹️" : "🔊";
    });
}

/* --- 15e. Input suara: STT (SpeechRecognition) --- */
function getSpeechRecognition() {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}
function toggleMic() {
    if (listening) stopListening();
    else startListening();
}
function startListening() {
    let SR = getSpeechRecognition();
    if (!SR) {
        showToast("Browser ini tidak mendukung input suara");
        return;
    }
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
    let input = $("userInput");
    micBaseText = input ? input.value : "";
    try {
        recognition = new SR();
        recognition.lang = "id-ID";
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.onresult = function (e) {
            let finalText = "";
            let interim = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
                let r = e.results[i];
                if (r.isFinal) finalText += r[0].transcript;
                else interim += r[0].transcript;
            }
            let t = (finalText || interim).trim();
            if (input) {
                input.value = (micBaseText ? micBaseText + " " : "") + t;
                input.focus();
            }
        };
        recognition.onerror = function (e) {
            if (e && e.error === "not-allowed") {
                showToast("Izin mikrofon ditolak");
            } else if (e && e.error !== "aborted" && e.error !== "no-speech") {
                showToast("Input suara gagal, coba lagi");
            }
        };
        recognition.onend = function () {
            listening = false;
            updateMicButton();
        };
        recognition.onstart = function () {
            listening = true;
            updateMicButton();
        };
        recognition.start();
    } catch (e) {
        showToast("Input suara gagal, coba lagi");
        recognition = null;
        listening = false;
        updateMicButton();
    }
}
function stopListening() {
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
    listening = false;
    updateMicButton();
}
function updateMicButton() {
    let b = $("micBtn");
    if (!b) return;
    b.textContent = listening ? "🔴" : "🎤";
    b.classList.toggle("recording", listening);
}

/* =================================================================
   16. Event listener (sekali saja)
   ================================================================ */

on("userInput", "keydown", function (e) {
    if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
    }
});

on("renameInput", "keydown", function (e) {
    if (e.key === "Enter") {
        e.preventDefault();
        saveRename();
    }
});

on("fileInput", "change", async function () {
    let file = this.files[0];
    if (!file) return;
    try {
        pendingImage = await resizeImage(file);
        $("previewImg").src = pendingImage.dataUrl;
        $("previewBar").classList.add("show");
    } catch (e) {
        removeImage();
    }
});

/* =================================================================
   18. Rin 3D (v2.5) — model VRM setengah badan di panggung 3D
   ================================================================
   Library (three.js + @pixiv/three-vrm) dimuat malas dari CDN hanya
   saat panggung pertama dibuka, jadi chat biasa tidak melambat.
   Model: rin-3d.vrm (Scarlet III School Ver, rambut diwarnai ungu Rin).
   Gerak: napas idle, kedip, ekspresi ikut mood, bibir ikut suara TTS.
   Render hanya jalan saat panggung terbuka (hemat baterai). */

const MOOD_EXPR = {
    senang: "happy", kesal: "angry", santai: "relaxed", dingin: "neutral",
    malu: "happy", ngambek: "angry", ngantuk: "relaxed", salting: "surprised",
    bingung: "surprised", panik: "surprised", serius: "neutral", jahil: "happy"
};
// v2.8.1: semua nama ekspresi yang dipakai, termasuk "Surprised" (huruf
// besar) — grup Surprised di file VRM ber-preset "unknown" sehingga
// three-vrm mendaftarkannya dengan nama grupnya, bukan "surprised".
var S3_EXPRS = ["happy", "angry", "sad", "relaxed", "surprised", "neutral", "Surprised", "blink"]; // v2.8.8: "blink" ikut dikelola supaya mata merem saat blush bisa dibersihkan saat revert
function moodToExpression(mood) {
    return MOOD_EXPR[mood] || "neutral";
}
// v2.5.1: file VRM diekspor dalam pose T (lengan lurus ke samping).
// Turunkan lengan ke pose santai. v2.5.2: 1.25 rad (~72°) supaya lengan
// benar-benar di sisi badan, bukan A-pose lebar.
function applyRestPose3D(vrm) {
    if (!vrm || !vrm.humanoid) return;
    let l = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
    let r = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
    if (l) l.rotation.z = 1.25;
    if (r) r.rotation.z = -1.25;
}

var S3 = {
    open: false,
    ready: false,      // three.js + three-vrm berhasil dimuat
    loading: false,
    loopError: false,  // v2.5.1: error animasi pertama kali, ditampilkan di status
    vrm: null,
    speaking: false,
    renderer: null, scene: null, camera: null, clock: null, THREE: null,
    raf: 0, nextBlink: 0, blinkUntil: 0, mouthUntil: 0,
    dragX: null, dragRotY: 0,
    tapX: null, tapY: null, tapT: 0,           // v2.8: ketuk (bukan seret)
    touchUntil: 0, touchActive: false, touchKind: null, // v2.8: reaksi sentuhan
    blush: 0, blushUntil: 0, blushMats: null    // v2.8.2: pipi merah
};
function s3el(id) { return (typeof document !== "undefined") ? document.getElementById(id) : null; }
function s3status(text) {
    let el = s3el("stage3dStatus");
    if (el) el.textContent = text || "";
}
function setSpeaking3D(on) {
    S3.speaking = !!on;
    if (!on) s3mouth("", 0);
}
function s3expr(name, value) {
    if (!S3.vrm || !S3.vrm.expressionManager) return;
    try { S3.vrm.expressionManager.setValue(name, value); } catch (e) {}
}
function s3mouth(shape, value) {
    ["aa", "ih", "ou", "ee", "oh"].forEach(function (s) {
        s3expr(s, s === shape ? value : 0);
    });
}
function applyMood3D() {
    let chat = (typeof getActive === "function") ? getActive() : null;
    let mood = (chat && chat.mood) || "santai";
    let label = s3el("stage3dMood");
    if (label) {
        try { label.textContent = "Suasana hati: " + faceInfo(mood).label; } catch (e) {}
    }
    if (!S3.vrm) return;
    S3_EXPRS.forEach(function (p) {
        s3expr(p, p === moodToExpression(mood) ? 1 : 0);
    });
}
function openStage3D() {
    let stage = s3el("stage3d");
    if (!stage) return;
    stage.classList.add("show");
    S3.open = true;
    toggleSidebar(false);
    applyMood3D();
    if (!S3.ready && !S3.loading) ensureStage3D();
    else if (S3.ready) startStageLoop();
}
/* =================================================================
   18b. Rin 3D bisa disentuh (v2.8) — ketuk model, Rin bereaksi.
   Ketuk dibedakan dari seret: gerak <= 10 px dan durasi <= 400 ms.
   Raycast ke model VRM, bagian yang kena menentukan reaksi:
   kepala (elus) / pipi -> malu ala referensi Ridwan (mata merem,
   alis manyun, mulut manyun) + pipi merah; badan/rok -> kaget.
   Reaksi: ekspresi berubah 1,8 dtk, kepala menunduk/terkejut sedikit,
   kalimat Rin muncul di panggung, HP bergetar pelan (Android). */
var TOUCH_REACTIONS = {
    // v2.8.8: saat pipi merah, ekspresi = referensi Ridwan (cewek pirang
    // manyun): mata merem ("blink") + alis manyun ("angry") + mulut
    // manyun ("ou", ditahan di tick) — bukan lagi senyum/kaget.
    // v2.8.2: blush = pipi merah saat elus kepala & colek pipi.
    head: { exprs: ["angry", "blink"], blush: true, lines: ["Hmph... boleh lah, dikit aja.", "Ehehe... elusanmu lumayan juga.", "H-hmph! Bukan berarti aku suka ya...", "M-muka aku panas... jangan diliatin terus!"] },
    face: { exprs: ["angry", "blink"], blush: true, lines: ["A-apa sih?! Jangan colek-colek!", "Hmph! Pipiku bukan buat dicolek!", "I-ih, pipiku panas... salahmu tuh!"] },
    body: { exprs: ["Surprised"], blush: false, lines: ["H-hei! Jangan sentuh sembarangan!", "A-apa yang kamu lakukan?!"] },
    legs: { exprs: ["Surprised"], blush: false, lines: ["H-hei! Jangan sentuh rokku!", "I-ih! Jangan di situ!"] }
};
function touchReaction(part) { return TOUCH_REACTIONS[part] || null; }
function touchPartFromName(name) {
    if (!name) return null;
    let n = String(name).toLowerCase();
    if (n.indexOf("hair") !== -1) return "head";
    if (n.indexOf("face") !== -1 || n.indexOf("eye") !== -1 || n.indexOf("brow") !== -1 || n.indexOf("mouth") !== -1 || n.indexOf("nose") !== -1) return "face";
    if (n.indexOf("tops") !== -1 || n.indexOf("body") !== -1 || n.indexOf("chest") !== -1 || n.indexOf("arm") !== -1) return "body";
    if (n.indexOf("bottoms") !== -1 || n.indexOf("shoes") !== -1 || n.indexOf("skirt") !== -1 || n.indexOf("leg") !== -1) return "legs";
    return null;
}
function touchPartFromObject(obj) {
    let o = obj;
    while (o) {
        let p = touchPartFromName(o.name);
        if (p) return p;
        o = o.parent;
    }
    return null;
}
// Cadangan kalau nama mesh tidak dikenali: dari tinggi titik kena.
// Kepala 1,175; puncak rambut 1,38; pinggang 0,783.
function touchPartFromY(y) {
    if (typeof y !== "number" || isNaN(y)) return null;
    if (y >= 1.28) return "head";
    if (y >= 1.02) return "face";
    if (y >= 0.60) return "body";
    if (y >= 0) return "legs";
    return null;
}
function isTapGesture(down, up) {
    if (!down || !up) return false;
    return Math.abs(up.x - down.x) <= 10 && Math.abs(up.y - down.y) <= 10 && (up.t - down.t) <= 400;
}
function applyTouchExpr3D(exprs) {
    if (!S3.vrm) return;
    S3_EXPRS.forEach(function (p) {
        s3expr(p, exprs.indexOf(p) !== -1 ? 1 : 0);
    });
}
function s3say(text) {
    let el = s3el("stage3dTouch");
    if (!el) return;
    el.textContent = text || "";
    el.classList.add("show");
    clearTimeout(s3say.timer);
    clearTimeout(s3say.timer2);
    s3say.timer = setTimeout(function () {
        el.classList.remove("show");
        // v2.8.1: kosongkan teks setelah memudar, supaya gelembung
        // (in-flow) tidak menyisakan ruang kosong di atas model.
        s3say.timer2 = setTimeout(function () {
            if (!el.classList.contains("show")) el.textContent = "";
        }, 300);
    }, 2500);
}
/* v2.8.4: pipi merah — dua elips pink semi-transparan menempel di
   tulang kepala, jadi ikut gerak kepala. Posisi diukur dari geometri
   wajah di file .vrm (analyze-blush.mjs), BUKAN tebakan:
   tulang kepala di (0, 1.175, 0.014) model space, sumbu lokalnya
   identitas; mesh wajah y 1.150..1.345 (dagu 1.150, mata 1.187),
   permukaan pipi di (x ±0.04, y 1.17) ada di z -0.036..-0.055 model.
   v2.8.2/v2.8.3 salah dua-duanya: y -0.045 dari kepala (= 1.130,
   DI BAWAH dagu, di leher) dan z cuma +0.028 dari kepala (di DALAM
   kepala) — makanya v2.8.2 tak terlihat sama sekali dan v2.8.3
   muncul sebagai blob pink di leher/kerah (screenshot Ridwan).
   Posisi benar (dunia pasca-rotateVRM0): x ±0.042, y kepala +0.025
   (= 1.200, di tengah pipi — v2.8.7: turun 0.010 dari v2.8.6 karena
   di screenshot Ridwan blush v2.8.6 kena mata bawah; mata di
   y 1.235, mulut di 1.174, jadi 1.200 pas di tengah-tengah),
   z kepala +0.085 (= +0.071 dunia, 0.008 di depan titik pipi paling
   maju di pita y 1.20..1.22, z -0.063) — lalu diubah ke ruang lokal
   kepala dengan worldToLocal. Orientasi lingkaran diset ke
   kebalikan kuaternion dunia kepala, jadi menghadap +Z dunia
   (ke kamera) apa pun orientasi lokal tulangnya. */
function createBlush3D() {
    if (!S3.vrm || !S3.THREE) return false;
    try {
        let head = S3.vrm.humanoid.getNormalizedBoneNode("head");
        if (!head) return false;
        let hp = new S3.THREE.Vector3();
        head.getWorldPosition(hp);
        let q = new S3.THREE.Quaternion();
        head.getWorldQuaternion(q);
        q.invert();
        let mats = [];
        [-1, 1].forEach(function (side) {
            let geo = new S3.THREE.CircleGeometry(0.019, 24);
            let mat = new S3.THREE.MeshBasicMaterial({ color: 0xff8fab, transparent: true, opacity: 0, depthWrite: false });
            let m = new S3.THREE.Mesh(geo, mat);
            let world = new S3.THREE.Vector3(hp.x + 0.042 * side, hp.y + 0.025, hp.z + 0.085);
            m.position.copy(head.worldToLocal(world));
            m.quaternion.copy(q);
            m.scale.set(1.25, 0.65, 1);
            head.add(m);
            mats.push(mat);
        });
        S3.blushMats = mats;
        return true;
    } catch (e) { return false; }
}
function handleTouch3D(e) {
    if (!S3.vrm || !S3.THREE || !S3.camera || !S3.renderer) return;
    let el = S3.renderer.domElement;
    let r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    let ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    let rc = new S3.THREE.Raycaster();
    rc.setFromCamera({ x: nx, y: ny }, S3.camera);
    let hits = rc.intersectObjects(S3.vrm.scene.children, true);
    if (!hits.length) return;
    let hit = hits[0];
    let part = touchPartFromObject(hit.object) || touchPartFromY(hit.point.y);
    if (!part) return;
    let react = touchReaction(part);
    if (!react) return;
    let line = react.lines[Math.floor(Math.random() * react.lines.length)];
    applyTouchExpr3D(react.exprs);
    S3.touchKind = part;
    S3.touchActive = true;
    S3.touchUntil = performance.now() / 1000 + 1.8;
    if (react.blush) S3.blushUntil = performance.now() / 1000 + 3.5; // v2.8.3: 2,5 -> 3,5 detik, lebih mudah ketangkap
    s3say(line);
    try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15); } catch (err) {}
}
function closeStage3D() {
    S3.open = false;
    stopStageLoop();
    let stage = s3el("stage3d");
    if (stage) stage.classList.remove("show");
}
async function ensureStage3D() {
    S3.loading = true;
    s3status("Memuat Rin 3D…");
    try {
        if (typeof window === "undefined" || typeof window.WebGLRenderingContext === "undefined") {
            throw new Error("WebGL tidak tersedia");
        }
        let THREE = await import("three");
        let VRM = await import("@pixiv/three-vrm");
        let GLTFLoaderMod = await import("three/addons/loaders/GLTFLoader.js");
        let container = s3el("stage3dCanvas");
        if (!container) throw new Error("wadah panggung tidak ada");
        let renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(container.clientWidth || 300, container.clientHeight || 400);
        container.innerHTML = "";
        container.appendChild(renderer.domElement);
        let scene = new THREE.Scene();
        let camera = new THREE.PerspectiveCamera(26, (container.clientWidth || 300) / (container.clientHeight || 400), 0.1, 20);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a9e, 1.2));
        let dir = new THREE.DirectionalLight(0xffffff, 1.5);
        dir.position.set(1, 2, 2);
        scene.add(dir);
        let loader = new GLTFLoaderMod.GLTFLoader();
        loader.register(function (parser) { return new VRM.VRMLoaderPlugin(parser); });
        let gltf = await loader.loadAsync("rin-3d.vrm");
        let vrm = gltf.userData.vrm;
        if (!vrm) throw new Error("bukan model VRM");
        // v2.5.1: model VRM 0.0 menghadap -Z, putar 180° supaya menghadap kamera.
        VRM.VRMUtils.rotateVRM0(vrm);
        applyRestPose3D(vrm);
        scene.add(vrm.scene);
        scene.updateMatrixWorld(true);
        // Frame setengah badan dari posisi kepala (pinggang ke atas).
        // v2.5.2: framing lebih rapat (rambut ±0.12, puncak kepala 1.38).
        let head = vrm.humanoid.getNormalizedBoneNode("head");
        let hp = new THREE.Vector3();
        head.getWorldPosition(hp);
        camera.position.set(0, hp.y, 1.35);
        camera.lookAt(0, hp.y - 0.065, 0);
        S3.vrm = vrm; S3.renderer = renderer; S3.scene = scene;
        S3.camera = camera; S3.THREE = THREE;
        let blushOk = false; // v2.8.3: catat kalau pipi merah gagal dibuat
        try { blushOk = createBlush3D(); } catch (e) {}
        // Seret untuk memutar model; ketuk (tanpa seret) = sentuhan (v2.8).
        let el = renderer.domElement;
        el.style.touchAction = "none";
        el.addEventListener("pointerdown", function (e) {
            S3.dragX = e.clientX; S3.dragRotY = vrm.scene.rotation.y;
            S3.tapX = e.clientX; S3.tapY = e.clientY; S3.tapT = performance.now();
            try { el.setPointerCapture(e.pointerId); } catch (err) {}
        });
        el.addEventListener("pointermove", function (e) {
            if (S3.dragX === null) return;
            if (S3.tapX !== null && (Math.abs(e.clientX - S3.tapX) > 10 || Math.abs(e.clientY - S3.tapY) > 10)) S3.tapX = null;
            vrm.scene.rotation.y = S3.dragRotY + (e.clientX - S3.dragX) * 0.006;
        });
        ["pointerup", "pointercancel"].forEach(function (ev) {
            el.addEventListener(ev, function (e) {
                if (ev === "pointerup" && S3.tapX !== null) {
                    let up = { x: e.clientX, y: e.clientY, t: performance.now() };
                    let down = { x: S3.tapX, y: S3.tapY, t: S3.tapT };
                    if (isTapGesture(down, up)) handleTouch3D(e);
                }
                S3.dragX = null; S3.tapX = null;
            });
        });
        if (typeof window !== "undefined" && window.addEventListener) {
            window.addEventListener("resize", function () {
                if (!S3.open || !S3.renderer || !S3.camera) return;
                let c = s3el("stage3dCanvas");
                if (!c || !c.clientWidth || !c.clientHeight) return;
                S3.camera.aspect = c.clientWidth / c.clientHeight;
                S3.camera.updateProjectionMatrix();
                S3.renderer.setSize(c.clientWidth, c.clientHeight);
            });
        }
        S3.loading = false;
        S3.ready = true;
        s3status("");
        if (!blushOk) s3status("Blush gagal dibuat"); // v2.8.3: diagnosa di layar
        applyMood3D();
        startStageLoop();
    } catch (e) {
        S3.loading = false;
        s3status("Rin 3D tidak bisa dimuat di perangkat ini. Coba lagi nanti ya.");
        showToast("Hmph! Rin 3D gagal dimuat");
    }
}
function startStageLoop() {
    if (!S3.ready || !S3.open || S3.raf) return;
    if (!S3.clock) S3.clock = new S3.THREE.Clock();
    S3.nextBlink = performance.now() / 1000 + 2;
    let tick = function () {
        if (!S3.open) return;
        S3.raf = requestAnimationFrame(tick);
        try {
        let dt = Math.min(S3.clock.getDelta(), 0.05);
        let t = S3.clock.elapsedTime;
        let vrm = S3.vrm;
        if (!vrm) return;
        applyRestPose3D(vrm); // v2.5.1: jaga pose santai tetap menempel
        // Napas idle + goyang halus.
        let spine = vrm.humanoid.getNormalizedBoneNode("spine");
        if (spine) spine.rotation.x = 0.04 + Math.sin(t * 1.2) * 0.02;
        let chest = vrm.humanoid.getNormalizedBoneNode("chest");
        if (chest) chest.rotation.x = Math.sin(t * 1.2 + 0.4) * 0.02;
        let neck = vrm.humanoid.getNormalizedBoneNode("neck");
        if (neck) {
            neck.rotation.y = Math.sin(t * 0.5) * 0.08;
            neck.rotation.z = Math.sin(t * 0.7) * 0.03;
        }
        // Kedip tiap 2-5 detik.
        let now = performance.now() / 1000;
        if (now >= S3.nextBlink) {
            s3expr("blink", 1);
            S3.blinkUntil = now + 0.15;
            S3.nextBlink = now + 2 + Math.random() * 3;
        }
        if (S3.blinkUntil && now >= S3.blinkUntil) {
            s3expr("blink", 0);
            S3.blinkUntil = 0;
        }
        // v2.8.8: selama sentuhan yang bikin blush, mata tetap merem
        // (tahan di tiap frame supaya kedip otomatis tidak membukanya).
        if (S3.touchActive && (S3.touchKind === "head" || S3.touchKind === "face")) s3expr("blink", 1);
        // v2.8: animasi reaksi sentuhan, lalu kembali ke ekspresi mood chat.
        if (S3.touchActive) {
            if (now >= S3.touchUntil) {
                S3.touchActive = false;
                vrm.scene.position.y = 0;
                if (neck) neck.rotation.x = 0;
                applyMood3D();
            } else {
                let p = 1 - (S3.touchUntil - now) / 1.8;
                let w = Math.sin(Math.min(Math.max(p, 0), 1) * Math.PI);
                if (S3.touchKind === "head") {
                    if (neck) { neck.rotation.z += 0.12 * w; neck.rotation.x = -0.06 * w; }
                } else {
                    if (spine) spine.rotation.x += 0.05 * w;
                    vrm.scene.position.y = 0.015 * w;
                }
            }
        }
        // v2.8.2: pipi merah memudar masuk, lalu hilang setelah ~3,5 detik.
        if (S3.blushMats && S3.blushMats.length) {
            let target = (S3.blushUntil && now < S3.blushUntil) ? 0.6 : 0;
            S3.blush += (target - S3.blush) * Math.min(1, dt * 8);
            if (S3.blush < 0.01) S3.blush = 0;
            S3.blushMats.forEach(function (m) { m.opacity = S3.blush; });
        }
        // Gerak bibir saat Rin bersuara (simulasi, bukan dari audio).
        if (S3.speaking) {
            if (now >= S3.mouthUntil) {
                let shapes = ["aa", "ih", "ou", "ee", "oh"];
                let s = shapes[Math.floor(Math.random() * shapes.length)];
                s3mouth(s, 0.5 + Math.random() * 0.4);
                S3.mouthUntil = now + 0.09;
            }
        } else if (S3.touchActive && (S3.touchKind === "head" || S3.touchKind === "face")) {
            // v2.8.8: mulut manyun (U) saat blush, ala referensi.
            s3mouth("ou", 0.7);
        } else if (S3.touchActive) {
            // v2.8.1: mulut terbuka (O) supaya muka kaget jelas kelihatan.
            s3mouth("oh", 0.7);
        } else {
            s3mouth("", 0);
        }
        if (vrm.springBoneManager) vrm.springBoneManager.update(dt);
        vrm.update(dt);
        S3.renderer.render(S3.scene, S3.camera);
        } catch (e) {
            // v2.5.1: jangan diam-diam membeku — tampilkan error sekali.
            if (!S3.loopError) {
                S3.loopError = true;
                s3status("Animasi 3D berhenti: " + (e && e.message ? e.message : e));
            }
        }
    };
    tick();
}
function stopStageLoop() {
    if (S3.raf) cancelAnimationFrame(S3.raf);
    S3.raf = 0;
    if (S3.vrm) s3mouth("", 0);
}

/* =================================================================
   17. Init (sekali saja, di akhir file)
   ================================================================ */

extendPresets();
loadTheme();
loadStore();
loadPersona();
loadMemory();
loadVoice(); // v2
loadVoiceSpeed(); // v2.9.1
renderVoiceToggle(); // v2
if (typeof speechSynthesis !== "undefined" && speechSynthesis.addEventListener) {
    // v2: daftar suara kadang baru terisi belakangan (async)
    speechSynthesis.addEventListener("voiceschanged", function () { pickRinVoice(); });
}
initHeaderFace();
initAttach();
initProfile();
renderChat();
renderList();

