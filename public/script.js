const $ = id => document.getElementById(id);

const historyBox = $("history");
const messagesBox = $("messages");
const welcome = $("welcome");
const input = $("messageInput");
const sendButton = $("sendButton");

let conversations = [];
let activeChat = null;
let isGenerating = false;
let controller = null;

const STORAGE_KEY = "darkgpt_conversations";

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function load() {
    try {
        conversations = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "[]"
        );

        if (!Array.isArray(conversations)) conversations = [];
    } catch {
        conversations = [];
    }

    renderHistory();
}

function newChat() {
    if (isGenerating) controller?.abort();

    activeChat = {
        id: crypto.randomUUID(),
        title: "New chat",
        messages: [],
        updatedAt: Date.now()
    };

    conversations.unshift(activeChat);
    save();
    renderHistory();
    renderMessages();
    $("sidebar").classList.remove("open");
    input.focus();
}

function selectChat(id) {
    if (isGenerating) controller?.abort();

    activeChat = conversations.find(chat => chat.id === id);

    renderHistory();
    renderMessages();

    $("sidebar").classList.remove("open");
}

function deleteChat(id, event) {
    event.stopPropagation();

    if (activeChat?.id === id && isGenerating) {
        controller?.abort();
    }

    conversations = conversations.filter(
        chat => chat.id !== id
    );

    if (activeChat?.id === id) {
        activeChat = null;
    }

    save();

    if (!activeChat) {
        if (conversations.length) {
            activeChat = conversations[0];
        } else {
            newChat();
            return;
        }
    }

    renderHistory();
    renderMessages();
}

function renderHistory() {
    historyBox.innerHTML = "";

    conversations
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .forEach(chat => {
            const item = document.createElement("div");

            item.className =
                "history-item" +
                (activeChat?.id === chat.id ? " active" : "");

            const name = document.createElement("span");
            name.className = "history-name";
            name.textContent = chat.title || "New chat";

            const del = document.createElement("button");
            del.className = "delete-chat";
            del.textContent = "×";
            del.title = "Delete conversation";

            del.onclick = event => deleteChat(chat.id, event);

            item.append(name, del);
            item.onclick = () => selectChat(chat.id);

            historyBox.appendChild(item);
        });
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function markdown(text) {
    let safe = escapeHTML(text);
    const blocks = [];

    safe = safe.replace(/```([\w-]*)\n?([\s\S]*?)```/g,
        (_, language, code) => {
            const index = blocks.length;

            blocks.push(
                `<pre><code>${code.trimEnd()}</code></pre>`
            );

            return `@@CODE${index}@@`;
        }
    );

    safe = safe.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*(.*?)\*/g, "<em>$1</em>");
    safe = safe.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    safe = safe.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    safe = safe.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    safe = safe.replace(/^- (.+)$/gm, "• $1");

    safe = safe.replace(/\n/g, "<br>");

    safe = safe.replace(/@@CODE(\d+)@@/g,
        (_, index) => blocks[Number(index)]
    );

    return safe;
}

function addMessage(role, content, temporary = false) {
    const row = document.createElement("div");
    row.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "S" : "D";

    const body = document.createElement("div");
    body.className = "message-body";

    if (temporary) {
        body.innerHTML = `<span class="typing">DARK GPT is thinking...</span>`;
    } else {
        body.innerHTML = markdown(content);
    }

    row.append(avatar, body);

    if (role === "assistant" && !temporary) {
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const copy = document.createElement("button");
        copy.textContent = "Copy";
        copy.onclick = () => {
            navigator.clipboard.writeText(content)
                .then(() => toast("Copied!"))
                .catch(() => toast("Copy failed"));
        };

        actions.append(copy);
        body.append(actions);
    }

    if (role === "assistant" && !temporary) {
        body.querySelectorAll("pre").forEach(pre => {
            const button = document.createElement("button");
            button.className = "code-copy";
            button.textContent = "Copy code";

            button.onclick = () => {
                const code = pre.querySelector("code").innerText;

                navigator.clipboard.writeText(code)
                    .then(() => toast("Code copied!"))
                    .catch(() => toast("Copy failed"));
            };

            pre.appendChild(button);
        });
    }

    messagesBox.appendChild(row);

    return row;
}

function renderMessages() {
    messagesBox.innerHTML = "";

    const hasMessages =
        activeChat && activeChat.messages.length > 0;

    welcome.style.display = hasMessages ? "none" : "block";

    if (!activeChat) return;

    activeChat.messages.forEach(message => {
        addMessage(message.role, message.content);
    });

    scrollBottom();
}

function scrollBottom() {
    $("chatArea").scrollTop = $("chatArea").scrollHeight;
}

function toast(message) {
    const element = $("toast");

    element.textContent = message;
    element.classList.add("show");

    setTimeout(() => element.classList.remove("show"), 2200);
}

function updateButton() {
    sendButton.textContent = isGenerating ? "■" : "↑";
    sendButton.title = isGenerating ? "Stop generation" : "Send";
}

async function sendMessage(text) {
    text = text.trim();

    if (!text) return;

    if (isGenerating) {
        controller?.abort();
        return;
    }

    if (!activeChat) newChat();

    activeChat.messages.push({
        role: "user",
        content: text
    });

    if (activeChat.title === "New chat") {
        activeChat.title = text.slice(0, 35);
    }

    activeChat.updatedAt = Date.now();

    save();
    renderHistory();
    renderMessages();

    input.value = "";
    input.style.height = "auto";

    const typingRow = addMessage("assistant", "", true);

    isGenerating = true;
    controller = new AbortController();
    updateButton();

    try {
        const model = $("modelSelect").value;

        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            signal: controller.signal,
            body: JSON.stringify({
                messages: activeChat.messages,
                model
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Request failed.");
        }

        typingRow.remove();

        activeChat.messages.push({
            role: "assistant",
            content: data.answer
        });

        activeChat.updatedAt = Date.now();

        save();
        renderMessages();
        renderHistory();

    } catch (error) {
        typingRow.remove();

        if (error.name === "AbortError") {
            toast("Generation stopped.");
        } else {
            toast(error.message || "Something went wrong.");
        }

    } finally {
        isGenerating = false;
        controller = null;
        updateButton();
        scrollBottom();
    }
}

/* CHAT FORM */

$("chatForm").addEventListener("submit", event => {
    event.preventDefault();

    if (isGenerating) {
        controller?.abort();
        return;
    }

    sendMessage(input.value);
});

input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height =
        Math.min(input.scrollHeight, 180) + "px";
});

input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        $("chatForm").requestSubmit();
    }
});

/* NEW CHAT */

$("newChat").onclick = newChat;

/* SUGGESTIONS */

document.querySelectorAll(".suggestion").forEach(button => {
    button.onclick = () => {
        sendMessage(button.dataset.prompt);
    };
});

/* SIDEBAR */

$("openSidebar").onclick = () => {
    $("sidebar").classList.add("open");
};

$("closeSidebar").onclick = () => {
    $("sidebar").classList.remove("open");
};

/* SETTINGS */

$("settingsButton").onclick = () => {
    $("settingsModal").classList.add("open");
};

$("closeSettings").onclick = () => {
    $("settingsModal").classList.remove("open");
};

$("settingsModal").onclick = event => {
    if (event.target === $("settingsModal")) {
        $("settingsModal").classList.remove("open");
    }
};

function setTheme(theme) {
    document.body.classList.toggle("light", theme === "light");

    localStorage.setItem("darkgpt_theme", theme);
    $("appearance").value = theme;
}

$("themeButton").onclick = () => {
    setTheme(
        document.body.classList.contains("light")
            ? "dark"
            : "light"
    );
};

$("appearance").onchange = event => {
    setTheme(event.target.value);
};

$("clearHistory").onclick = () => {
    if (!confirm("Delete all conversations?")) return;

    if (isGenerating) controller?.abort();

    conversations = [];
    activeChat = null;

    save();
    newChat();

    toast("History cleared.");
};

/* MODEL SELECTOR */

async function loadModels() {
    try {
        const response = await fetch("/api/models");
        const data = await response.json();

        const select = $("modelSelect");
        select.innerHTML = "";

        data.models.forEach(model => {
            const option = document.createElement("option");
            option.value = model;
            option.textContent = model;

            select.appendChild(option);
        });

        select.value = data.default;

    } catch (error) {
        console.error("Model loading error:", error);
    }
}

/* START */

load();
loadModels();

setTheme(localStorage.getItem("darkgpt_theme") || "dark");

if (conversations.length) {
    activeChat = conversations[0];
    renderMessages();
} else {
    newChat();
}
