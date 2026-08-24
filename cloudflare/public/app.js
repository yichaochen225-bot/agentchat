const $ = (selector) => document.querySelector(selector);
const TOKEN_STORAGE_KEY = "agentchat_api_token";
const state = { token: sessionStorage.getItem(TOKEN_STORAGE_KEY) || "", providers: [], providerStates: new Map(), loginProvider: null };

const elements = {
  settingsButton: $("#settingsButton"), settingsDialog: $("#settingsDialog"),
  tokenInput: $("#tokenInput"), saveTokenButton: $("#saveTokenButton"), clearAuthButton: $("#clearAuthButton"),
  healthDot: $("#healthDot"), healthText: $("#healthText"), promptInput: $("#promptInput"),
  providerSelect: $("#providerSelect"), sendButton: $("#sendButton"), resultCard: $("#resultCard"),
  resultProvider: $("#resultProvider"), resultMeta: $("#resultMeta"), resultText: $("#resultText"),
  copyButton: $("#copyButton"), providerGrid: $("#providerGrid"), refreshProviders: $("#refreshProviders"), toast: $("#toast"),
  loginHelperDialog: $("#loginHelperDialog"), loginHelperProvider: $("#loginHelperProvider"),
  loginAccountInput: $("#loginAccountInput"), loginPasswordInput: $("#loginPasswordInput"), loginOtherInput: $("#loginOtherInput"),
  fillAccountButton: $("#fillAccountButton"), fillPasswordButton: $("#fillPasswordButton"), fillFocusedButton: $("#fillFocusedButton"),
  submitRemoteLoginButton: $("#submitRemoteLoginButton")
};

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => elements.toast.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set("authorization", `Bearer ${state.token}`);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.code = data.code;
    error.details = data.details;
    error.status = response.status;
    throw error;
  }
  return data;
}

function requestToken() {
  elements.tokenInput.value = state.token;
  elements.settingsDialog.showModal();
  toast("先输入 AgentChat 个人访问令牌");
}

function authErrorMessage(error) {
  if (error.status === 401 || error.code === "UNAUTHORIZED") {
    return "AgentChat 访问令牌未通过验证；这不是 DeepSeek 账号或密码错误";
  }
  return error.message;
}

async function verifyCurrentToken() {
  if (!state.token) return false;
  try {
    await api("/api/browser/status");
    return true;
  } catch (error) {
    if (error.status === 401 || error.code === "UNAUTHORIZED") return false;
    throw error;
  }
}

async function checkHealth() {
  try {
    const health = await api("/api/health");
    elements.healthDot.className = `dot ${health.configured ? "good" : ""}`;
    elements.healthText.textContent = health.configured ? "Cloudflare 后端已就绪" : `后端在线，但还缺少 Secret：${health.missing.join(", ")}`;
  } catch (error) {
    elements.healthDot.className = "dot bad";
    elements.healthText.textContent = `后端不可用：${error.message}`;
  }
}

async function loadProviders() {
  const data = await api("/api/providers");
  state.providers = data.providers;
  renderProviders();
}

function stateLabel(value) {
  return ({ ready: "已登录，可执行", auth_required: "需要登录", page_changed: "页面结构可能已变化", checking: "检测中…", error: "检测失败", unknown: "尚未检测" })[value] || value;
}

function renderProviders() {
  elements.providerGrid.innerHTML = "";
  for (const provider of state.providers) {
    const current = state.providerStates.get(provider.key) || (provider.cloudEnabled ? "unknown" : "planned");
    const card = document.createElement("article");
    card.className = "provider-card";
    card.innerHTML = `<div><div class="provider-name">${provider.name}</div><div class="provider-state">${provider.cloudEnabled ? stateLabel(current) : "计划后续接入"}</div></div><div class="provider-actions"><button class="small-button" data-action="check" data-provider="${provider.key}" ${provider.cloudEnabled ? "" : "disabled"}>检测</button><button class="small-button login" data-action="login" data-provider="${provider.key}" ${provider.cloudEnabled ? "" : "disabled"}>登录</button><button class="small-button" data-action="mobile" data-provider="${provider.key}" ${provider.cloudEnabled ? "" : "disabled"}>手机输入</button><button class="small-button" data-action="save" data-provider="${provider.key}" ${provider.cloudEnabled ? "" : "disabled"}>保存登录态</button></div>`;
    elements.providerGrid.appendChild(card);
  }
}

async function checkProvider(key) {
  if (!state.token) return requestToken();
  state.providerStates.set(key, "checking"); renderProviders();
  try {
    const result = await api("/api/provider/status", { method: "POST", body: JSON.stringify({ provider: key }) });
    state.providerStates.set(key, result.state); renderProviders(); toast(`${key}: ${stateLabel(result.state)}`);
  } catch (error) {
    state.providerStates.set(key, "error"); renderProviders(); toast(authErrorMessage(error));
  }
}

async function openLogin(key) {
  if (!state.token) return requestToken();

  try {
    const valid = await verifyCurrentToken();
    if (!valid) {
      requestToken();
      return toast("AgentChat 访问令牌未通过验证；请先重新保存令牌");
    }
  } catch (error) {
    return toast(error.message);
  }

  const popup = window.open("about:blank", "_blank");
  try {
    const result = await api("/api/provider/live-view", { method: "POST", body: JSON.stringify({ provider: key }) });
    if (popup) popup.location.replace(result.liveViewUrl); else location.href = result.liveViewUrl;
    toast(`已打开 ${key} Live View；iPhone 无法输入时返回并点“手机输入”`);
  } catch (error) {
    if (popup) popup.close();
    toast(authErrorMessage(error));
  }
}

function openMobileLogin(key) {
  if (!state.token) return requestToken();
  const provider = state.providers.find((item) => item.key === key);
  state.loginProvider = key;
  elements.loginHelperProvider.textContent = provider?.name || key;
  elements.loginAccountInput.value = "";
  elements.loginPasswordInput.value = "";
  elements.loginOtherInput.value = "";
  elements.loginHelperDialog.showModal();
}

async function sendRemoteLoginAction(action, value) {
  if (!state.token) return requestToken();
  if (!state.loginProvider) return toast("请先选择 Provider");
  try {
    const result = await api("/api/provider/remote-input", {
      method: "POST",
      body: JSON.stringify({ provider: state.loginProvider, action, value })
    });
    toast(result.message || "已发送到远程登录页");
    return result;
  } catch (error) {
    toast(authErrorMessage(error));
    throw error;
  }
}

async function saveLogin() {
  if (!state.token) return requestToken();
  try {
    const result = await api("/api/provider/save-auth", { method: "POST", body: "{}" });
    toast(`登录态已加密保存：${result.cookies} 个 Cookie`);
  } catch (error) { toast(authErrorMessage(error)); }
}

async function refreshCloudProviders() {
  for (const provider of state.providers.filter((p) => p.cloudEnabled)) await checkProvider(provider.key);
}

async function sendPrompt() {
  const prompt = elements.promptInput.value.trim();
  if (!prompt) return toast("请先输入任务");
  if (!state.token) return requestToken();
  const provider = elements.providerSelect.value;
  elements.sendButton.disabled = true; elements.sendButton.textContent = "执行中…";
  elements.resultCard.classList.remove("hidden"); elements.resultProvider.textContent = provider === "auto" ? "AUTO" : provider.toUpperCase();
  elements.resultMeta.textContent = "正在等待网页版 AI"; elements.resultText.textContent = "AgentChat 正在通过 Cloudflare Browser Run 执行任务。";
  const started = performance.now();
  try {
    const result = await api("/api/ask", { method: "POST", body: JSON.stringify({ provider, prompt }) });
    elements.resultProvider.textContent = (result.provider || provider).toUpperCase();
    elements.resultMeta.textContent = `${((performance.now() - started) / 1000).toFixed(1)}s`;
    elements.resultText.textContent = result.response || "没有返回文本";
  } catch (error) {
    elements.resultProvider.textContent = error.code || "ERROR"; elements.resultMeta.textContent = "执行失败";
    if (error.status === 401 || error.code === "UNAUTHORIZED") elements.resultText.textContent = "AgentChat 访问令牌未通过验证。请打开设置重新保存令牌；这不是 AI Provider 的登录错误。";
    else if (error.code === "AUTH_REQUIRED") elements.resultText.textContent = "对应 Provider 需要登录。请在下方点击“登录”。";
    else if (error.code === "ALL_PROVIDERS_FAILED") elements.resultText.textContent = ["自动模式的 Provider 都失败了：", ...(Array.isArray(error.details) ? error.details : []).map((x) => `• ${x.provider}: ${x.code} — ${x.error}`)].join("\n");
    else elements.resultText.textContent = error.message;
  } finally { elements.sendButton.disabled = false; elements.sendButton.textContent = "开始执行"; }
}

elements.settingsButton.addEventListener("click", () => { elements.tokenInput.value = state.token; elements.settingsDialog.showModal(); });
elements.saveTokenButton.addEventListener("click", async () => {
  const candidate = elements.tokenInput.value.trim();
  if (!candidate) {
    state.token = "";
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    toast("访问令牌已清除");
    return;
  }

  const previous = state.token;
  state.token = candidate;
  elements.saveTokenButton.disabled = true;
  elements.saveTokenButton.textContent = "正在验证…";
  try {
    const valid = await verifyCurrentToken();
    if (!valid) {
      state.token = previous;
      return toast("令牌不匹配：请确认与 Cloudflare 的 AGENTCHAT_API_TOKEN 完全一致");
    }
    sessionStorage.setItem(TOKEN_STORAGE_KEY, candidate);
    elements.settingsDialog.close();
    toast("AgentChat 访问令牌验证成功");
  } catch (error) {
    state.token = previous;
    toast(error.message);
  } finally {
    elements.saveTokenButton.disabled = false;
    elements.saveTokenButton.textContent = "保存到本机";
  }
});

elements.clearAuthButton.addEventListener("click", async () => {
  if (!state.token) return requestToken();
  if (!confirm("确定清除 Cloudflare 中保存的 AI 登录态吗？")) return;
  try { await api("/api/provider/clear-auth", { method: "POST", body: "{}" }); state.providerStates.clear(); renderProviders(); toast("云端 AI 登录态已清除"); } catch (error) { toast(authErrorMessage(error)); }
});

elements.providerGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]"); if (!button) return;
  const key = button.dataset.provider;
  if (button.dataset.action === "check") checkProvider(key);
  if (button.dataset.action === "login") openLogin(key);
  if (button.dataset.action === "mobile") openMobileLogin(key);
  if (button.dataset.action === "save") saveLogin();
});

elements.fillAccountButton.addEventListener("click", async () => {
  const value = elements.loginAccountInput.value;
  if (!value) return toast("请先输入账号 / 邮箱 / 手机号");
  await sendRemoteLoginAction("account", value).catch(() => {});
});

elements.fillPasswordButton.addEventListener("click", async () => {
  const value = elements.loginPasswordInput.value;
  if (!value) return toast("请先输入密码");
  try {
    await sendRemoteLoginAction("password", value);
  } catch (_) {
  } finally {
    elements.loginPasswordInput.value = "";
  }
});

elements.fillFocusedButton.addEventListener("click", async () => {
  const value = elements.loginOtherInput.value;
  if (!value) return toast("请先输入验证码或其他内容");
  try {
    await sendRemoteLoginAction("focused", value);
    elements.loginOtherInput.value = "";
  } catch (_) {}
});

elements.submitRemoteLoginButton.addEventListener("click", async () => {
  await sendRemoteLoginAction("submit", "").catch(() => {});
});

elements.refreshProviders.addEventListener("click", refreshCloudProviders);
elements.sendButton.addEventListener("click", sendPrompt);
elements.copyButton.addEventListener("click", async () => { await navigator.clipboard.writeText(elements.resultText.textContent || ""); toast("已复制"); });
elements.promptInput.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendPrompt(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
await Promise.all([checkHealth(), loadProviders()]);
