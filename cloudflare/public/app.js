const $ = (selector) => document.querySelector(selector);

const MAX_PROMPT_CHARS = 12000;
const HISTORY_KEY = "agentchat_free_history_v1";
const MAX_HISTORY = 20;

const PROVIDERS = [
  { key: "gemini", name: "Gemini", note: "Google 官方网页", url: "https://gemini.google.com/app" },
  { key: "claude", name: "Claude", note: "Anthropic 官方网页", url: "https://claude.ai/" },
  { key: "deepseek", name: "DeepSeek", note: "官方聊天网页", url: "https://chat.deepseek.com/" },
  { key: "qwen", name: "通义千问", note: "阿里官方网页", url: "https://www.qianwen.com/" },
  { key: "kimi", name: "Kimi", note: "月之暗面官方网页", url: "https://www.kimi.com/" },
  { key: "doubao", name: "豆包", note: "字节官方网页", url: "https://www.doubao.com/chat/" }
];

const state = {
  prompt: "",
  history: readHistory()
};

const elements = {
  promptInput: $("#promptInput"),
  promptCount: $("#promptCount"),
  providerGrid: $("#providerGrid"),
  providerCount: $("#providerCount"),
  historyCount: $("#historyCount"),
  historyList: $("#historyList"),
  toast: $("#toast"),
  helpButton: $("#helpButton"),
  helpDialog: $("#helpDialog"),
  copyButton: $("#copyButton"),
  openAllButton: $("#openAllButton"),
  clearHistoryButton: $("#clearHistoryButton")
};

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function persistHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch (_) {}
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => elements.toast.classList.remove("show"), 3000);
}

function updatePrompt() {
  state.prompt = elements.promptInput.value;
  elements.promptCount.textContent = state.prompt.length + " / " + MAX_PROMPT_CHARS;
  elements.promptCount.classList.toggle("warn", state.prompt.length > MAX_PROMPT_CHARS * 0.85);
}

async function copyPrompt() {
  const prompt = state.prompt.trim();
  if (!prompt) {
    toast("请先输入问题");
    elements.promptInput.focus();
    return false;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    toast("问题太长");
    return false;
  }
  try {
    await navigator.clipboard.writeText(prompt);
  } catch (_) {
    const helper = document.createElement("textarea");
    helper.value = prompt;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  elements.copyButton.textContent = "已复制";
  setTimeout(() => { elements.copyButton.textContent = "复制问题"; }, 1500);
  return true;
}

function addHistory(provider) {
  state.history.unshift({
    id: Date.now().toString(36),
    provider: provider.name,
    prompt: state.prompt.trim().slice(0, 1200),
    createdAt: new Date().toISOString()
  });
  state.history = state.history.slice(0, MAX_HISTORY);
  persistHistory();
  renderHistory();
}

function openProvider(provider) {
  copyPrompt().then((copied) => {
    if (!copied) return;
    addHistory(provider);
    window.open(provider.url, "_blank", "noopener,noreferrer");
    toast(provider.name + " 已打开，粘贴问题即可");
  });
}

function renderProviders() {
  elements.providerGrid.replaceChildren();
  for (const provider of PROVIDERS) {
    const card = document.createElement("article");
    card.className = "provider-card";
    const info = document.createElement("div");
    info.innerHTML = "<div class=\"provider-name\"></div><div class=\"provider-state\"></div>";
    info.querySelector(".provider-name").textContent = provider.name;
    info.querySelector(".provider-state").textContent = provider.note;
    const button = document.createElement("button");
    button.className = "small-button login";
    button.type = "button";
    button.textContent = "复制并打开";
    button.addEventListener("click", () => openProvider(provider));
    card.append(info, button);
    elements.providerGrid.appendChild(card);
  }
  elements.providerCount.textContent = String(PROVIDERS.length);
}

function formatTime(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch (_) { return ""; }
}

function renderHistory() {
  elements.historyList.replaceChildren();
  elements.historyCount.textContent = String(state.history.length);
  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "还没有打开记录";
    elements.historyList.appendChild(empty);
    return;
  }
  for (const item of state.history) {
    const card = document.createElement("article");
    card.className = "history-item";
    card.innerHTML = "<div><div class=\"history-prompt\"></div><div class=\"history-meta\"></div></div><button class=\"small-button\">再次复制</button>";
    card.querySelector(".history-prompt").textContent = item.prompt;
    card.querySelector(".history-meta").textContent = item.provider + " · " + formatTime(item.createdAt);
    card.querySelector("button").addEventListener("click", async () => {
      elements.promptInput.value = item.prompt;
      updatePrompt();
      await copyPrompt();
      toast("问题已复制");
    });
    elements.historyList.appendChild(card);
  }
}

elements.promptInput.addEventListener("input", updatePrompt);
elements.copyButton.addEventListener("click", copyPrompt);
elements.openAllButton.addEventListener("click", async () => {
  if (!await copyPrompt()) return;
  for (const provider of PROVIDERS) {
    window.open(provider.url, "_blank", "noopener,noreferrer");
  }
  toast("问题已复制；请逐个粘贴到官方页面");
});
elements.clearHistoryButton.addEventListener("click", () => {
  if (!state.history.length || confirm("清除本机历史记录？")) {
    state.history = [];
    persistHistory();
    renderHistory();
    toast("本机历史已清除");
  }
});
elements.helpButton.addEventListener("click", () => elements.helpDialog.showModal());
document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(button.dataset.target)?.scrollIntoView({ behavior: "smooth" }));
});
renderProviders();
renderHistory();
updatePrompt();