const $ = (s) => document.querySelector(s);
const TOKEN_KEY = "agentchat_api_token";
const HISTORY_KEY = "agentchat_guest_history_v1";
const MAX_PROMPT = 12000;
const PROVIDERS = [
  { key: "gemini", name: "Gemini" },
  { key: "claude", name: "Claude" },
  { key: "deepseek", name: "DeepSeek" }
];
const state = { token: sessionStorage.getItem(TOKEN_KEY) || "", history: readHistory(), busy: false };
const el = {
  prompt: $("#promptInput"), count: $("#promptCount"), select: $("#providerSelect"),
  ask: $("#askButton"), askAll: $("#askAllButton"), results: $("#results"),
  status: $("#runStatus"), history: $("#historyList"), clear: $("#clearHistoryButton"),
  settings: $("#settingsDialog"), settingsButton: $("#settingsButton"),
  token: $("#tokenInput"), saveToken: $("#saveTokenButton"), toast: $("#toast")
};
function readHistory() { try { const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
function toast(message) { el.toast.textContent = message; el.toast.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.toast.classList.remove("show"), 3200); }
function providerName(key) { return PROVIDERS.find((p) => p.key === key)?.name || key; }
function updateCount() { el.count.textContent = el.prompt.value.length + " / " + MAX_PROMPT; }
function apiError(error) {
  if (error.status === 401) return "访问令牌不正确，请打开设置重新保存";
  if (error.code === "BROWSER_RATE_LIMITED") return "Cloudflare 浏览器暂时限流，程序已暂停，请稍后再试";
  if (error.code === "ALL_PROVIDERS_FAILED") return "当前访客 AI 都不可用，可能需要登录或已达到免费次数";
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
  if (!response.ok) { const error = new Error(data.error || "HTTP " + response.status); Object.assign(error, data, { status: response.status }); throw error; }
  return data;
}
function addResult(provider, text, ok = true) {
  const card = document.createElement("article");
  card.className = "result-card " + (ok ? "success" : "error");
  const head = document.createElement("div"); head.className = "result-head";
  const title = document.createElement("strong"); title.textContent = providerName(provider);
  const badge = document.createElement("span"); badge.className = "muted"; badge.textContent = ok ? "访客回答" : "不可用";
  head.append(title, badge);
  const body = document.createElement("pre"); body.textContent = text;
  card.append(head, body); el.results.appendChild(card);
}
function saveHistory(prompt, providers) {
  state.history.unshift({ prompt: prompt.slice(0, 1200), providers, createdAt: new Date().toISOString() });
  state.history = state.history.slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  renderHistory();
}
function renderHistory() {
  el.history.replaceChildren();
  if (!state.history.length) { const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "还没有询问记录"; el.history.appendChild(empty); return; }
  for (const item of state.history) {
    const row = document.createElement("article"); row.className = "history-item";
    const text = document.createElement("div"); text.innerHTML = "<div class=\"history-prompt\"></div><div class=\"history-meta\"></div>";
    text.querySelector(".history-prompt").textContent = item.prompt;
    text.querySelector(".history-meta").textContent = item.providers.join("、") + " · " + new Date(item.createdAt).toLocaleString();
    const button = document.createElement("button"); button.className = "small-button"; button.textContent = "填入";
    button.addEventListener("click", () => { el.prompt.value = item.prompt; updateCount(); el.prompt.focus(); });
    row.append(text, button); el.history.appendChild(row);
  }
}
async function askProvider(provider, prompt) {
  const data = await api("/api/guest-ask", { provider, prompt });
  addResult(data.provider || provider, data.response || "没有返回文字");
  return data;
}
async function run(selected) {
  if (state.busy) return;
  const prompt = el.prompt.value.trim();
  if (!prompt) return toast("请先输入问题");
  if (!state.token) { el.settings.showModal(); return; }
  state.busy = true; el.ask.disabled = true; el.askAll.disabled = true; el.results.replaceChildren();
  const keys = selected === "all" ? PROVIDERS.map((p) => p.key) : [selected === "auto" ? null : selected];
  const completed = [];
  try {
    for (const key of keys) {
      el.status.textContent = completed.length + " / " + keys.length + " 个 AI";
      try {
        const data = await askProvider(key, prompt);
        completed.push(providerName(data.provider || key || "auto"));
      } catch (error) {
        const details = Array.isArray(error.details) && error.details.length
          ? error.details
          : [{ provider: key || "auto", error: apiError(error), code: error.code }];
        for (const item of details) {
          addResult(item.provider || key || "auto", item.error || item.code || apiError(error), false);
        }
        if (error.status === 401) { el.settings.showModal(); break; }
      }
    }
    el.status.textContent = completed.length ? completed.join("、") + " 已完成" : "没有可用访客 AI";
    saveHistory(prompt, completed.length ? completed : ["无可用访客"]);
  } finally { state.busy = false; el.ask.disabled = false; el.askAll.disabled = false; }
}
el.prompt.addEventListener("input", updateCount);
el.ask.addEventListener("click", () => run(el.select.value));
el.askAll.addEventListener("click", () => run("all"));
el.settingsButton.addEventListener("click", () => { el.token.value = state.token; el.settings.showModal(); });
el.saveToken.addEventListener("click", async () => {
  const candidate = el.token.value.trim(); if (!candidate) return toast("请先输入访问令牌");
  state.token = candidate; el.saveToken.disabled = true;
  try { await api("/api/browser/status", null, "GET"); sessionStorage.setItem(TOKEN_KEY, candidate); el.settings.close(); toast("访问令牌验证成功"); }
  catch (error) { state.token = ""; toast(apiError(error)); }
  finally { el.saveToken.disabled = false; }
});
el.clear.addEventListener("click", () => { if (confirm("清除本机历史记录？")) { state.history = []; localStorage.removeItem(HISTORY_KEY); renderHistory(); } });
document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => document.querySelector(b.dataset.target)?.scrollIntoView({ behavior: "smooth" })));
for (const p of PROVIDERS) { const o = document.createElement("option"); o.value = p.key; o.textContent = p.name + "（访客）"; el.select.appendChild(o); }
updateCount(); renderHistory();