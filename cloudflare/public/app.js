const $ = (selector) => document.querySelector(selector);
const TOKEN_KEY = "agentchat_api_token";
const HISTORY_KEY = "agentchat_history_v2";
const MAX_PROMPT = 12000;
const FALLBACK_PROVIDERS = [
  { key: "gemini", name: "Gemini", cloudEnabled: true },
  { key: "chatgpt", name: "ChatGPT", cloudEnabled: true },
  { key: "claude", name: "Claude", cloudEnabled: true },
  { key: "qwen", name: "Qwen", cloudEnabled: true },
  { key: "kimi", name: "Kimi", cloudEnabled: true },
  { key: "minimax", name: "MiniMax", cloudEnabled: true },
  { key: "mimo", name: "MiMo", cloudEnabled: true },
  { key: "deepseek", name: "DeepSeek", cloudEnabled: true }
];

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || "",
  providers: FALLBACK_PROVIDERS,
  providerStatus: new Map(),
  history: readHistory(),
  busy: false,
  pendingLogin: null,
  authStateSaved: false
};

const el = {
  prompt: $("#promptInput"),
  count: $("#promptCount"),
  access: $("#accessSelect"),
  select: $("#providerSelect"),
  ask: $("#askButton"),
  askAll: $("#askAllButton"),
  results: $("#results"),
  status: $("#runStatus"),
  history: $("#historyList"),
  clearHistory: $("#clearHistoryButton"),
  settings: $("#settingsDialog"),
  settingsButton: $("#settingsButton"),
  token: $("#tokenInput"),
  saveToken: $("#saveTokenButton"),
  toast: $("#toast"),
  systemDot: $("#systemDot"),
  systemStatus: $("#systemStatus"),
  providerCount: $("#providerCount"),
  readyCount: $("#readyCount"),
  savedState: $("#savedState"),
  providerGrid: $("#providerGrid"),
  refreshProviders: $("#refreshProvidersButton"),
  saveAuth: $("#saveAuthButton"),
  clearAuth: $("#clearAuthButton")
};

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.toast.classList.remove("show"), 3400);
}

function providerName(key) {
  return state.providers.find((provider) => provider.key === key)?.name || key || "Auto";
}

function apiError(error) {
  if (error.status === 401) return "访问令牌不正确，请打开设置重新连接";
  if (error.code === "BROWSER_RATE_LIMITED") return "Cloudflare 浏览器暂时限流，请稍后重试";
  if (error.code === "AUTH_REQUIRED") return "这个 AI 需要先登录";
  if (error.code === "EDITOR_NOT_FOUND") return "网页输入框没有识别到，可能是网页结构变化";
  if (error.code === "ALL_PROVIDERS_FAILED") return "当前没有可用的 AI Provider";
  if (error.code === "RESPONSE_TIMEOUT") return "AI 回答超时";
  return error.message || "请求失败";
}

async function api(path, body, method = "POST") {
  const headers = {};
  if (state.token) headers.authorization = "Bearer " + state.token;
  const options = { method, headers };
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(body || {});
  }
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "HTTP " + response.status);
    Object.assign(error, data, { status: response.status });
    throw error;
  }
  return data;
}

function requireToken() {
  if (state.token) return true;
  el.settings.showModal();
  toast("先连接 AgentChat");
  return false;
}

function updateCount() {
  el.count.textContent = el.prompt.value.length + " / " + MAX_PROMPT;
}

function statusLabel(status) {
  return ({
    ready: "已登录",
    guest: "访客可用",
    auth_required: "需要登录",
    page_changed: "页面变化",
    unknown: "未知"
  })[status] || "未检测";
}

function statusClass(status) {
  if (status === "ready") return "ready";
  if (status === "guest") return "guest";
  if (status === "auth_required") return "auth";
  if (status === "page_changed") return "warn";
  return "idle";
}

function updateMetrics() {
  const enabled = state.providers.filter((provider) => provider.cloudEnabled !== false);
  const usable = enabled.filter((provider) => {
    const value = state.providerStatus.get(provider.key)?.state;
    return value === "ready" || value === "guest";
  });
  el.providerCount.textContent = String(enabled.length);
  el.readyCount.textContent = String(usable.length);
  el.savedState.textContent = state.authStateSaved ? "已保存" : "未保存";
}

function renderProviderSelect() {
  const current = el.select.value || "auto";
  el.select.replaceChildren();
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = "自动选择可用 AI";
  el.select.appendChild(auto);
  for (const provider of state.providers.filter((item) => item.cloudEnabled !== false)) {
    const option = document.createElement("option");
    option.value = provider.key;
    option.textContent = provider.name;
    el.select.appendChild(option);
  }
  if ([...el.select.options].some((option) => option.value === current)) el.select.value = current;
}

function renderProviders() {
  el.providerGrid.replaceChildren();
  for (const provider of state.providers.filter((item) => item.cloudEnabled !== false)) {
    const status = state.providerStatus.get(provider.key)?.state || "idle";
    const card = document.createElement("article");
    card.className = "provider-card";

    const top = document.createElement("div");
    top.className = "provider-top";
    const identity = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = provider.name;
    const sub = document.createElement("span");
    sub.textContent = provider.key;
    identity.append(name, sub);
    const badge = document.createElement("span");
    badge.className = "provider-badge " + statusClass(status);
    badge.textContent = statusLabel(status);
    top.append(identity, badge);

    const actions = document.createElement("div");
    actions.className = "provider-actions";
    const check = document.createElement("button");
    check.className = "small-button";
    check.type = "button";
    check.textContent = "检测";
    check.addEventListener("click", () => refreshProvider(provider.key));
    const login = document.createElement("button");
    login.className = "small-button accent";
    login.type = "button";
    login.textContent = status === "ready" ? "重新登录" : "登录";
    login.addEventListener("click", () => loginProvider(provider.key));
    actions.append(check, login);

    card.append(top, actions);
    el.providerGrid.appendChild(card);
  }
  updateMetrics();
}

async function loadProviders() {
  try {
    const response = await fetch("/api/providers", { cache: "no-store" });
    const data = await response.json();
    if (response.ok && Array.isArray(data.providers) && data.providers.length) {
      state.providers = data.providers;
    }
  } catch (_) {}
  renderProviderSelect();
  renderProviders();
}

async function refreshSystem() {
  if (!state.token) {
    el.systemDot.className = "dot idle";
    el.systemStatus.textContent = "尚未连接 AgentChat";
    state.authStateSaved = false;
    updateMetrics();
    return;
  }
  try {
    const data = await api("/api/browser/status", null, "GET");
    state.authStateSaved = Boolean(data.authStateSaved);
    el.systemDot.className = "dot good";
    el.systemStatus.textContent = data.browserConnected ? "云端浏览器在线" : "连接正常 · 浏览器按需启动";
    updateMetrics();
  } catch (error) {
    el.systemDot.className = "dot bad";
    el.systemStatus.textContent = apiError(error);
    if (error.status === 401) sessionStorage.removeItem(TOKEN_KEY);
  }
}

async function refreshProvider(key, quiet = false) {
  if (!requireToken()) return null;
  state.providerStatus.set(key, { state: "checking" });
  renderProviders();
  try {
    const data = await api("/api/provider/status", { provider: key });
    state.providerStatus.set(key, data);
    renderProviders();
    if (!quiet) toast(providerName(key) + "：" + statusLabel(data.state));
    return data;
  } catch (error) {
    state.providerStatus.set(key, { state: "unknown", error: apiError(error) });
    renderProviders();
    if (!quiet) toast(providerName(key) + "：" + apiError(error));
    return null;
  }
}

async function refreshAllProviders() {
  if (!requireToken()) return;
  el.refreshProviders.disabled = true;
  try {
    for (const provider of state.providers.filter((item) => item.cloudEnabled !== false)) {
      await refreshProvider(provider.key, true);
    }
    toast("全部 Provider 检测完成");
  } finally {
    el.refreshProviders.disabled = false;
  }
}

async function loginProvider(key) {
  if (!requireToken()) return;
  const popup = window.open("about:blank", "_blank");
  state.pendingLogin = key;
  try {
    const data = await api("/api/provider/live-view", { provider: key });
    if (popup) {
      popup.location.href = data.liveViewUrl;
    } else {
      window.location.href = data.liveViewUrl;
    }
    toast("在打开的官方网页完成 " + providerName(key) + " 登录，然后返回 AgentChat");
  } catch (error) {
    if (popup) popup.close();
    state.pendingLogin = null;
    toast(apiError(error));
  }
}

async function saveAuthState(silent = false) {
  if (!requireToken()) return false;
  el.saveAuth.disabled = true;
  try {
    const data = await api("/api/provider/save-auth", {});
    state.authStateSaved = true;
    updateMetrics();
    if (!silent) toast("登录会话已加密保存（" + (data.cookies || 0) + " 个 Cookie）");
    return true;
  } catch (error) {
    if (!silent) toast(apiError(error));
    return false;
  } finally {
    el.saveAuth.disabled = false;
  }
}

async function clearAuthState() {
  if (!requireToken()) return;
  if (!confirm("清除云端保存的所有 AI 登录会话？")) return;
  try {
    await api("/api/provider/clear-auth", {});
    state.authStateSaved = false;
    state.providerStatus.clear();
    renderProviders();
    updateMetrics();
    toast("云端登录会话已清除");
  } catch (error) {
    toast(apiError(error));
  }
}

function addResult(provider, text, ok = true, meta = "") {
  const card = document.createElement("article");
  card.className = "result-card " + (ok ? "success" : "error");
  const head = document.createElement("div");
  head.className = "result-head";
  const title = document.createElement("strong");
  title.textContent = providerName(provider);
  const badge = document.createElement("span");
  badge.className = "muted";
  badge.textContent = meta || (ok ? "完成" : "不可用");
  head.append(title, badge);
  const body = document.createElement("pre");
  body.textContent = text;
  card.append(head, body);
  el.results.appendChild(card);
}

function saveHistory(prompt, providers, access) {
  state.history.unshift({
    prompt: prompt.slice(0, 1600),
    providers,
    access,
    createdAt: new Date().toISOString()
  });
  state.history = state.history.slice(0, 30);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  el.history.replaceChildren();
  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "还没有询问记录";
    el.history.appendChild(empty);
    return;
  }
  for (const item of state.history) {
    const row = document.createElement("article");
    row.className = "history-item";
    const text = document.createElement("div");
    const prompt = document.createElement("div");
    prompt.className = "history-prompt";
    prompt.textContent = item.prompt;
    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = (item.providers || []).join("、") + " · " + (item.access === "guest" ? "访客" : "会话") + " · " + new Date(item.createdAt).toLocaleString();
    text.append(prompt, meta);
    const button = document.createElement("button");
    button.className = "small-button";
    button.textContent = "填入";
    button.addEventListener("click", () => {
      el.prompt.value = item.prompt;
      updateCount();
      el.prompt.focus();
      document.querySelector("#composerSection")?.scrollIntoView({ behavior: "smooth" });
    });
    row.append(text, button);
    el.history.appendChild(row);
  }
}

async function askProvider(provider, prompt, access) {
  const path = access === "guest" ? "/api/guest-ask" : "/api/ask";
  const data = await api(path, { provider, prompt });
  addResult(data.provider || provider || "auto", data.response || "没有返回文字", true, data.access === "guest" ? "访客回答" : "会话回答");
  return data;
}

async function run(selected) {
  if (state.busy) return;
  if (!requireToken()) return;
  const prompt = el.prompt.value.trim();
  if (!prompt) return toast("请先输入任务");
  const access = el.access.value;
  const enabledProviders = state.providers.filter((provider) => provider.cloudEnabled !== false);
  const keys = selected === "all" ? enabledProviders.map((provider) => provider.key) : [selected === "auto" ? null : selected];
  const completed = [];

  state.busy = true;
  el.ask.disabled = true;
  el.askAll.disabled = true;
  el.results.replaceChildren();

  try {
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      el.status.textContent = (index + 1) + " / " + keys.length + " · " + providerName(key || "auto");
      try {
        const data = await askProvider(key, prompt, access);
        completed.push(providerName(data.provider || key || "auto"));
      } catch (error) {
        const details = Array.isArray(error.details) && error.details.length
          ? error.details
          : [{ provider: key || "auto", error: apiError(error), code: error.code }];
        for (const item of details) {
          addResult(item.provider || key || "auto", item.error || item.code || apiError(error), false, item.code || "失败");
        }
        if (error.status === 401) {
          el.settings.showModal();
          break;
        }
      }
    }
    el.status.textContent = completed.length ? completed.join("、") + " 已完成" : "没有成功返回";
    saveHistory(prompt, completed.length ? completed : ["无可用 AI"], access);
    document.querySelector("#resultsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    state.busy = false;
    el.ask.disabled = false;
    el.askAll.disabled = false;
  }
}

el.prompt.addEventListener("input", updateCount);
el.ask.addEventListener("click", () => run(el.select.value));
el.askAll.addEventListener("click", () => run("all"));
el.refreshProviders.addEventListener("click", refreshAllProviders);
el.saveAuth.addEventListener("click", () => saveAuthState(false));
el.clearAuth.addEventListener("click", clearAuthState);
el.settingsButton.addEventListener("click", () => {
  el.token.value = state.token;
  el.settings.showModal();
});

el.saveToken.addEventListener("click", async () => {
  const candidate = el.token.value.trim();
  if (!candidate) return toast("请先输入访问令牌");
  state.token = candidate;
  el.saveToken.disabled = true;
  try {
    await api("/api/browser/status", null, "GET");
    sessionStorage.setItem(TOKEN_KEY, candidate);
    el.settings.close();
    toast("AgentChat 连接成功");
    await refreshSystem();
  } catch (error) {
    state.token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    toast(apiError(error));
  } finally {
    el.saveToken.disabled = false;
  }
});

el.clearHistory.addEventListener("click", () => {
  if (confirm("清除这台 iPhone 上的历史记录？")) {
    state.history = [];
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector(button.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !state.pendingLogin) return;
  const key = state.pendingLogin;
  setTimeout(async () => {
    const status = await refreshProvider(key, true);
    if (status?.state === "ready") {
      await saveAuthState(true);
      toast(providerName(key) + " 登录成功，会话已加密保存");
      state.pendingLogin = null;
    } else if (status) {
      toast(providerName(key) + " 当前状态：" + statusLabel(status.state));
    }
  }, 1200);
});

async function init() {
  updateCount();
  renderHistory();
  await loadProviders();
  await refreshSystem();
  if (!state.token) setTimeout(() => el.settings.showModal(), 250);
}

init();
