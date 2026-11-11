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

let voiceOn = false; // v2: baca otomatis balasan Rin
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

    let payload = JSON.stringify({
        messages: history,
        persona: p.text,
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
    let map = {
        persona: { body: "accPersona", head: "accPersonaHead" },
        memory: { body: "accMemory", head: "accMemoryHead" },
        backup: { body: "accBackup", head: "accBackupHead" }
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
        }
    }
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
function renderVoiceToggle() {
    let b = $("voiceToggle");
    if (!b) return;
    b.textContent = voiceOn ? "Suara Rin: Aktif ✅" : "Suara Rin: Mati ⏸️";
    b.classList.toggle("on", voiceOn);
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
function speakRin(text, msgId) {
    if (typeof speechSynthesis === "undefined" ||
        typeof SpeechSynthesisUtterance === "undefined") {
        showToast("Browser ini tidak mendukung suara");
        return;
    }
    let clean = stripSpeechMarkup(text);
    if (!clean) return;
    stopSpeaking();
    let u = new SpeechSynthesisUtterance(clean);
    u.lang = "id-ID";
    u.rate = 1;
    u.pitch = 1.05;
    let v = pickRinVoice();
    if (v) u.voice = v;
    speakingMsgId = msgId || null;
    markSpeakingButtons();
    u.onend = function () {
        if (speakingMsgId === msgId) {
            speakingMsgId = null;
            markSpeakingButtons();
        }
    };
    u.onerror = function () {
        if (speakingMsgId === msgId) {
            speakingMsgId = null;
            markSpeakingButtons();
        }
    };
    try {
        speechSynthesis.speak(u);
    } catch (e) {
        speakingMsgId = null;
        markSpeakingButtons();
    }
}
function stopSpeaking() {
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
   17. Init (sekali saja, di akhir file)
   ================================================================ */

extendPresets();
loadTheme();
loadStore();
loadPersona();
loadMemory();
loadVoice(); // v2
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

