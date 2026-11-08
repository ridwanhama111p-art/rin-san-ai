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

    if (type === "rin" && text) {
        let copyBtn = document.createElement("button");
        copyBtn.className = "copy-btn";
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