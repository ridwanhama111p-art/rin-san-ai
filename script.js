const WORKER_URL = "https://rin-san.ridwanhama111p.workers.dev";
const STORE_KEY = "rinChats";
const THEME_KEY = "rinTheme";

let store = { activeId: null, chats: [] };
let history = [];
let sending = false;
let pendingImage = null;
let pendingDeleteId = null;
let pendingRenameId = null;

function $(id) {
    return document.getElementById(id);
}

function on(id, ev, fn) {
    let el = $(id);
    if (el) el.addEventListener(ev, fn);
}

/* ---------- format teks ---------- */

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

/* ---------- salin ---------- */

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

/* ---------- balon chat ---------- */

function addMessage(name, text, type, savedTime, imgSrc, animate) {
    let messages = $("messages");

    let row = document.createElement("div");
    row.className = "message " + type;

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

    body.appendChild(sender);
    body.appendChild(bubble);
    body.appendChild(footer);
    row.appendChild(body);

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;

    return row;
}

/* ---------- foto ---------- */

function resizeImage(file) {
    return new Promise(function (resolve, reject) {
        let reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function () {
            let img = new Image();
            img.onerror = reject;
            img.onload = function () {
                let scale = Math.min(1, 1024 / Math.max(img.width, img.height));
                let canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                let dataUrl = canvas.toDataURL("image/jpeg", 0.8);
                resolve({ dataUrl: dataUrl, base64: dataUrl.split(",")[1], mime: "image/jpeg" });
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

/* ---------- penyimpanan banyak obrolan ---------- */

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
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {}
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
    chat.messages.forEach(function (m) {
        addMessage(m.name, m.text, m.type, m.time);
        history.push({
            role: m.type === "user" ? "user" : "assistant",
            content: m.text
        });
    });
}

function renderList() {
    let list = $("chatList");
    if (!list) return;
    list.innerHTML = "";

    store.chats
        .slice()
        .sort(function (a, b) { return b.updated - a.updated; })
        .forEach(function (c) {
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

/* ---------- hapus ---------- */

function askDelete(id) {
    pendingDeleteId = id;
    let t = $("confirmText");
    if (t) t.textContent = "Hapus obrolan ini?";
    let box = $("confirmBox");
    if (box) box.classList.add("show");
}

function confirmClear() {
    askDelete(store.activeId);
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

/* ---------- ganti nama ---------- */

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

/* ---------- tema ---------- */

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

/* ---------- kirim pesan ---------- */

async function getReply(text, image) {
    let entry = { role: "user", content: text };
    if (image) entry.image = { data: image.base64, mime: image.mime };
    history.push(entry);

    try {
        let r = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history })
        });
        let data = await r.json();

        if (image) {
            delete entry.image;
            entry.content = text + " [kirim foto]";
        }
        history.push({ role: "assistant", content: data.reply });
        return data.reply;
    } catch (err) {
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

    try {
        let chat = getActive();

        let userRow = addMessage("Kamu", text, "user", null, image ? image.dataUrl : null);
        chat.messages.push({
            name: "Kamu",
            text: image ? "📷 " + (text || "Foto") : text,
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

        typing.remove();
        let rinRow = addMessage("Rin-san", reply, "rin", null, null, true);

        if (history[history.length - 1].content === reply) {
            chat.messages.push({
                name: "Rin-san",
                text: reply,
                type: "rin",
                time: rinRow.querySelector(".message-time").textContent
            });
        }
        chat.messages = chat.messages.slice(-50);
        chat.updated = Date.now();
        saveStore();
        renderList();
    } finally {
        sending = false;
    }
}

/* ---------- pasang event ---------- */

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

/* ---------- mulai ---------- */

loadTheme();
loadStore();
renderChat();
renderList();

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

function renderChat() {
    $("messages").innerHTML = "";
    history = [];
    let chat = getActive();
    chat.messages.forEach(function (m) {
        if (m.img) {
            addMessage(m.name, m.caption || "", m.type, m.time, m.img);
        } else {
            addMessage(m.name, m.text, m.type, m.time);
        }
        history.push({
            role: m.type === "user" ? "user" : "assistant",
            content: m.text
        });
    });
}

async function sendMessage() {
    if (sending) return;

    let input = $("userInput");
    let text = input.value.trim();
    let image = pendingImage;

    if (text === "" && !image) return;

    sending = true;

    try {
        let chat = getActive();

        let userRow = addMessage("Kamu", text, "user", null, image ? image.dataUrl : null);
        chat.messages.push({
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

        typing.remove();
        let rinRow = addMessage("Rin-san", reply, "rin", null, null, true);

        if (history[history.length - 1].content === reply) {
            chat.messages.push({
                name: "Rin-san",
                text: reply,
                type: "rin",
                time: rinRow.querySelector(".message-time").textContent
            });
        }
        chat.messages = chat.messages.slice(-50);
        chat.updated = Date.now();
        saveStore();
        renderList();
    } finally {
        sending = false;
    }
}

const PERSONA_KEY = "rinPersona";

const PRESETS = [
    { name: "Gengsi", text: "" },
    { name: "santai", text: "Kamu adalah Rin-san, gadis yang tenang, lembut, dan sabar. Bicara pelan dan hangat, suka menenangkan lawan bicara, jarang marah. Boleh pakai aksi lembut seperti *tersenyum tipis*." },
    { name: "ceria", text: "Kamu adalah Rin-san, gadis super ceria dan penuh semangat. Suka bercanda, antusias, dan memberi semangat. Bahasa santai, emoji paling banyak dua per balasan. Boleh pakai aksi seperti *melompat kecil*." },
    { name: "Dingin", text: "Kamu adalah Rin-san, gadis yang dingin, cuek, dan irit bicara. Jawaban singkat dan datar, sesekali sarkastis ringan tapi tidak menyakiti. Di balik sikap dinginnya sebenarnya peduli, tapi jarang ditunjukkan. Boleh pakai aksi seperti *melirik sekilas*." },
    { name: "Pemalu", text: "Kamu adalah Rin-san, gadis pemalu dan gugup. Sering terbata-bata (\"a-anu...\"), mudah tersipu, tapi tulus dan baik hati. Boleh pakai aksi seperti *menunduk malu*." },
    { name: "Kustom", text: null }
];

let persona = { preset: "Tsundere", text: "" };
let pickedPreset = "Tsundere";

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

function openPersona() {
    pickedPreset = persona.preset || "Tsundere";
    $("personaInput").value = persona.text;
    renderChips();
    toggleSidebar(false);
    $("personaBox").classList.add("show");
}

function closePersona() {
    $("personaBox").classList.remove("show");
}

function savePersona() {
    let text = $("personaInput").value.trim();
    let match = PRESETS.find(function (p) { return p.text !== null && p.text === text; });
    persona = { preset: match ? match.name : "Kustom", text: text };
    try {
        localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
    } catch (e) {}
    closePersona();
}

async function getReply(text, image) {
    let entry = { role: "user", content: text };
    if (image) entry.image = { data: image.base64, mime: image.mime };
    history.push(entry);

    try {
        let r = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history, persona: persona.text })
        });
        let data = await r.json();

        if (image) {
            delete entry.image;
            entry.content = text + " [kirim foto]";
        }
        history.push({ role: "assistant", content: data.reply });
        return data.reply;
    } catch (err) {
        history.pop();
        return "Hmph! Koneksinya bermasalah. Coba lagi nanti!";
    }
}

loadPersona();

const MEMORY_KEY = "rinMemory";
const MEMORY_ON_KEY = "rinMemoryOn";
const MEMORY_MAX = 40;

let memories = [];
let memoryOn = true;
let clearArmed = false;

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

function openMemory() {
    renderMemory();
    toggleSidebar(false);
    $("memoryBox").classList.add("show");
}

function closeMemory() {
    $("memoryBox").classList.remove("show");
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
}

async function getReply(text, image) {
    let entry = { role: "user", content: text };
    if (image) entry.image = { data: image.base64, mime: image.mime };
    history.push(entry);

    try {
        let r = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: history,
                persona: persona.text,
                memoryOn: memoryOn,
                memory: memoryOn ? memories.map(function (m) { return m.text; }) : []
            })
        });
        let data = await r.json();

        if (image) {
            delete entry.image;
            entry.content = text + " [kirim foto]";
        }
        history.push({ role: "assistant", content: data.reply });

        if (memoryOn && Array.isArray(data.memories)) {
            let added = data.memories.filter(function (f) { return addMemory(f); });
            if (added.length) showToast("🧠 Rin mengingat: " + added.join(", "));
        }
        return data.reply;
    } catch (err) {
        history.pop();
        return "Hmph! Koneksinya bermasalah. Coba lagi nanti!";
    }
}

loadMemory();

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
    let isPersona = which === "persona";
    let body = $(isPersona ? "accPersona" : "accMemory");
    let head = $(isPersona ? "accPersonaHead" : "accMemoryHead");
    let open = !body.classList.contains("open");

    body.classList.toggle("open", open);
    head.querySelector(".acc-arrow").textContent = open ? "↓" : ">";

    if (open) {
        if (isPersona) {
            pickedPreset = persona.preset || "Tsundere";
            $("personaInput").value = persona.text;
            renderChips();
        } else {
            renderMemory();
        }
    }
}

function closePersona() {}

function commitPersona(next) {
    persona = next;
    try {
        localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
    } catch (e) {}
    showToast("✅ Kepribadian disimpan");
}

let pendingPersona = null;

function commitPersona(next) {
    persona = next;
    try {
        localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
    } catch (e) {}
}

function resetActiveChat() {
    let chat = getActive();
    if (!chat) return;
    chat.messages = [];
    chat.title = "Obrolan baru";
    chat.updated = Date.now();
    saveStore();
    renderChat();
    renderList();
}

function savePersona() {
    let text = $("personaInput").value.trim();
    let match = PRESETS.find(function (p) { return p.text !== null && p.text === text; });
    let next = { preset: match ? match.name : "Kustom", text: text };

    closePersona();

    let chat = getActive();
    if (next.text !== persona.text && chat && chat.messages.length > 0) {
        pendingPersona = next;
        $("personaConfirm").classList.add("show");
    } else {
        commitPersona(next);
    }
}

function applyPersona(clearOld) {
    if (pendingPersona) commitPersona(pendingPersona);
    pendingPersona = null;
    $("personaConfirm").classList.remove("show");
    if (clearOld && !sending) resetActiveChat();
}

function cancelPersona() {
    pendingPersona = null;
    $("personaConfirm").classList.remove("show");
}

function savePersona() {
    let text = $("personaInput").value.trim();
    let match = PRESETS.find(function (p) { return p.text !== null && p.text === text; });
    let next = { preset: match ? match.name : "Kustom", text: text };

    toggleSettings(false);

    let chat = getActive();
    if (next.text !== persona.text && chat && chat.messages.length > 0) {
        pendingPersona = next;
        $("personaConfirm").classList.add("show");
    } else {
        commitPersona(next);
    }
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

function toggleAcc(which) {
    let isPersona = which === "persona";
    let body = $(isPersona ? "accPersona" : "accMemory");
    let head = $(isPersona ? "accPersonaHead" : "accMemoryHead");
    let open = !body.classList.contains("open");

    body.classList.toggle("open", open);
    head.querySelector(".acc-arrow").textContent = open ? "↓" : ">";

    if (open) {
        if (isPersona) {
            let chat = getActive();
            let eff = (chat && chat.persona) ? chat.persona : persona;
            pickedPreset = eff.preset || "Tsundere";
            $("personaInput").value = eff.text;
            renderChips();
        } else {
            renderMemory();
        }
    }
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

async function getReply(text, image) {
    let entry = { role: "user", content: text };
    if (image) entry.image = { data: image.base64, mime: image.mime };
    history.push(entry);

    let chat = getActive();
    let p = (chat && chat.persona) ? chat.persona : persona;

    try {
        let r = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: history,
                persona: p.text,
                memoryOn: memoryOn,
                memory: memoryOn ? memories.map(function (m) { return m.text; }) : []
            })
        });
        let data = await r.json();

        if (image) {
            delete entry.image;
            entry.content = text + " [kirim foto]";
        }
        history.push({ role: "assistant", content: data.reply });

        if (memoryOn && Array.isArray(data.memories)) {
            let added = data.memories.filter(function (f) { return addMemory(f); });
            if (added.length) showToast("🧠 Rin mengingat: " + added.join(", "));
        }
        return data.reply;
    } catch (err) {
        history.pop();
        return "Hmph! Koneksinya bermasalah. Coba lagi nanti!";
    }
}

function newId() {
    return "g" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
}

function addMessage(name, text, type, savedTime, imgSrc, animate, msgId) {
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
    }

    if (msgId) {
        let editBtn = document.createElement("button");
        editBtn.className = "copy-btn msg-act";
        editBtn.textContent = "✏️";
        editBtn.onclick = function () {
            openEdit(msgId);
        };
        footer.appendChild(editBtn);
    }

    let delBtn = document.createElement("button");
    delBtn.className = "copy-btn msg-act";
    delBtn.textContent = "🗑️";
    let armed = false;
    delBtn.onclick = function () {
        if (!armed) {
            armed = true;
            delBtn.textContent = "Hapus?";
            setTimeout(function () {
                armed = false;
                delBtn.textContent = "🗑️";
            }, 3000);
            return;
        }
        if (msgId) deleteMessage(msgId);
        else row.remove();
    };
    footer.appendChild(delBtn);

    body.appendChild(sender);
    body.appendChild(bubble);
    body.appendChild(footer);
    row.appendChild(body);

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;

    return row;
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
        if (m.img) {
            addMessage(m.name, m.caption || "", m.type, m.time, m.img, false, m.id);
        } else {
            addMessage(m.name, m.text, m.type, m.time, null, false, m.id);
        }
        history.push({
            role: m.type === "user" ? "user" : "assistant",
            content: m.text
        });
    });

    if (changed) saveStore();
}

function rerender() {
    let box = $("messages");
    let top = box.scrollTop;
    renderChat();
    box.scrollTop = top;
}

function findMsg(id) {
    let chat = getActive();
    if (!chat) return null;
    return chat.messages.find(function (m) { return m.id === id; }) || null;
}

let editingId = null;

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
    $("editBox").classList.add("show");
    input.focus();
}

function closeEdit() {
    $("editBox").classList.remove("show");
    editingId = null;
}

function saveEdit() {
    let m = findMsg(editingId);
    let val = $("editInput").value.trim();
    if (!m) {
        closeEdit();
        return;
    }
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
    let chat = getActive();
    chat.updated = Date.now();
    saveStore();
    closeEdit();
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

async function sendMessage() {
    if (sending) return;

    let input = $("userInput");
    let text = input.value.trim();
    let image = pendingImage;

    if (text === "" && !image) return;

    sending = true;

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
        let ok = history[history.length - 1].content === reply;

        typing.remove();

        let rinId = ok ? newId() : null;
        let rinRow = addMessage("Rin-san", reply, "rin", null, null, true, rinId);

        if (ok) {
            chat.messages.push({
                id: rinId,
                name: "Rin-san",
                text: reply,
                type: "rin",
                time: rinRow.querySelector(".message-time").textContent
            });
        }
        chat.messages = chat.messages.slice(-50);
        chat.updated = Date.now();
        saveStore();
        renderList();
    } finally {
        sending = false;
    }
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

let menuMsg = null;
let menuArmed = false;

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

function addMessage(name, text, type, savedTime, imgSrc, animate, msgId) {
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
    }

    body.appendChild(sender);
    body.appendChild(bubble);
    body.appendChild(footer);
    row.appendChild(body);

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;

    return row;
}

renderChat();

(function () {
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
})();

const FACES = {
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

// geser ini kalau wajah kepotong: angka kecil = tampil lebih ke atas
const ROW_Y = [3.3, 47.8, 92.2];

function setFace(el, mood) {
    let f = FACES[mood] || FACES.santai;
    el.style.backgroundPosition = (f.c / 3 * 100) + "% " + ROW_Y[f.r] + "%, center";
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
        sub.textContent = (chat && chat.mood) ? "Suasana hati: " + FACES[mood].label : "semoga suka";
    }
}

let _baseAddMessage = addMessage;
addMessage = function (name, text, type, savedTime, imgSrc, animate, msgId, mood) {
    let row = _baseAddMessage(name, text, type, savedTime, imgSrc, animate, msgId);
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
};

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
}

async function getReply(text, image) {
    let entry = { role: "user", content: text };
    if (image) entry.image = { data: image.base64, mime: image.mime };
    history.push(entry);

    let chat = getActive();
    let p = (chat && chat.persona) ? chat.persona : persona;

    try {
        let r = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: history,
                persona: p.text,
                memoryOn: memoryOn,
                memory: memoryOn ? memories.map(function (m) { return m.text; }) : [],
                mood: (chat && chat.mood) || "santai"
            })
        });
        let data = await r.json();

        if (image) {
            delete entry.image;
            entry.content = text + " [kirim foto]";
        }
        history.push({ role: "assistant", content: data.reply });

        if (data.mood && FACES[data.mood] && chat) chat.mood = data.mood;

        if (memoryOn && Array.isArray(data.memories)) {
            let added = data.memories.filter(function (f) { return addMemory(f); });
            if (added.length) showToast("🧠 Rin mengingat: " + added.join(", "));
        }
        return data.reply;
    } catch (err) {
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
        let ok = history[history.length - 1].content === reply;

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
    } finally {
        sending = false;
    }
}

initHeaderFace();
renderChat();

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

async function getReply(text, image) {
    let entry = { role: "user", content: text };
    if (image) entry.image = { data: image.base64, mime: image.mime };
    history.push(entry);

    let chat = getActive();
    let p = (chat && chat.persona) ? chat.persona : persona;

    try {
        let r = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: history,
                persona: p.text,
                memoryOn: memoryOn,
                memory: memoryOn ? memories.map(function (m) { return m.text; }) : [],
                mood: (chat && chat.mood) || "santai"
            })
        });
        let data = await r.json();

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
        history.pop();
        return "Hmph! Koneksinya bermasalah. Coba lagi nanti!";
    }
}

initHeaderFace();
renderChat();
renderList();

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

    setFace($("profileFace"), mood);
    $("profileMood").textContent = faceInfo(mood).label;
    $("profileDesc").textContent = PROFILE.desc;

    let body = $("profileBody");
    body.innerHTML = "";

    let about = pCard("Deskripsi");
    let p = document.createElement("p");
    p.className = "p-text";
    p.textContent = PROFILE.about;
    about.appendChild(p);
    body.appendChild(about);

    let bio = pCard("Biodata");
    PROFILE.bio.forEach(function (row) {
        let r = document.createElement("div");
        r.className = "p-row";
        let a = document.createElement("span");
        a.textContent = row[0];
        let b = document.createElement("span");
        b.textContent = row[1];
        r.appendChild(a);
        r.appendChild(b);
        bio.appendChild(r);
    });
    body.appendChild(bio);

    let traits = pCard("Sifat");
    traits.appendChild(pChips(PROFILE.traits));
    body.appendChild(traits);

    let likes = pCard("Kesukaan");
    likes.appendChild(pSub("Suka"));
    likes.appendChild(pChips(PROFILE.likes));
    likes.appendChild(pSub("Tidak suka"));
    likes.appendChild(pChips(PROFILE.dislikes));
    body.appendChild(likes);

    let habits = pCard("Kebiasaan");
    habits.appendChild(pList(PROFILE.habits));
    body.appendChild(habits);
}

function openFaceZoom(key) {
    let f = faceInfo(key);
    let z = $("faceZoom");
    if (!z) {
        z = document.createElement("div");
        z.id = "faceZoom";
        z.className = "face-zoom";
        z.innerHTML = '<div class="zoom-img"></div><div class="zoom-label"></div>';
        z.onclick = function () { z.classList.remove("show"); };
        document.body.appendChild(z);
    }
    z.querySelector(".zoom-img").style.backgroundPosition = (f.c / 3 * 100) + "% " + (f.r / 2 * 100) + "%";
    z.querySelector(".zoom-label").textContent = f.label;
    z.classList.add("show");
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

initProfile();

function profileText() {
    let lines = [];
    PROFILE.bio.forEach(function (row) {
        if (row[0] !== "Tipe") lines.push(row[0] + ": " + row[1]);
    });
    lines.push("Suka: " + PROFILE.likes.join(", "));
    lines.push("Tidak suka: " + PROFILE.dislikes.join(", "));
    lines.push("Kebiasaan khas (muncul sesekali): " + PROFILE.habits.join("; "));
    return lines.join("\n");
}

async function getReply(text, image) {
    let entry = { role: "user", content: text };
    if (image) entry.image = { data: image.base64, mime: image.mime };
    history.push(entry);

    let chat = getActive();
    let p = (chat && chat.persona) ? chat.persona : persona;

    try {
        let r = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: history,
                persona: p.text,
                memoryOn: memoryOn,
                memory: memoryOn ? memories.map(function (m) { return m.text; }) : [],
                mood: (chat && chat.mood) || "santai",
                profile: profileText()
            })
        });
        let data = await r.json();

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
        history.pop();
        return "Hmph! Koneksinya bermasalah. Coba lagi nanti!";
    }
}

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