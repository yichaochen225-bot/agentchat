const $ = (selector) => document.querySelector(selector);

const TOKEN_STORAGE_KEY = "agentchat_api_token";
const HISTORY_STORAGE_KEY = "agentchat_history_v1";
const MAX_HISTORY = 20;
const MAX_HISTORY_RESPONSE_CHARS = 12000;
const MAX_PROMPT_CHARS = 12000;

const state = {
  token: sessionStorage.getItem(TOKEN_STORAGE_KEY) || "",
  providers: [],
  providerStates: new Map(),
  loginProvider: null,
  mode: "auto",
  compareSelection: new Set(),
  compareSelectionInitialized: false,
  history: readHistory(),
  busy: false,
  lastResultText: ""
};

const elements = {
  settingsButton: $("#settingsButton"),
  settingsDialog: $("#settingsDialog"),
  tokenInput: $("#tokenInput"),
  saveTokenButton: $("#saveTokenButton"),
  clearAuthButton: $("#clearAuthButton"),
  healthDot: $("#healthDot"),
  healthText: $("#healthText"),
  availableCount: $("#availableCount"),
  historyCount: $("#historyCount"),
  promptInput: $("#promptInput"),
  promptCount: $("#promptCount"),
  modeAutoButton: $("#modeAutoButton"),
  modeCompareButton: $("#modeCompareButton"),
  compareOptions: $("#compareOptions"),
  comparePicker: $("#comparePicker"),
  providerSelect: $("#providerSelect"),
  sendButton: $("#sendButton"),
  resultCard: $("#resultCard"),
  resultProvider: $("#resultProvider"),
  resultMeta: $("#resultMeta"),
  singleResult: $("#singleResult"),
  resultText: $("#resultText"),
  compareResults: $("#compareResults"),
  copyAllButton: $("#copyAllButton"),
  clearResultButton: $("#clearResultButton"),
  providerGrid: $("#providerGrid"),
  refreshProviders: $("#refreshProviders"),
  historyList: $("#historyList"),
  clearHistoryButton: $("#clearHistoryButton"),
  loginHelperDialog: $("#loginHelperDialog"),
  loginHelperProvider: $("#loginHelperProvider"),
  loginAccountInput: $("#loginAccountInput"),
  loginPasswordInput: $("#loginPasswordInput"),
  loginOtherInput: $("#loginOtherInput"),
  fillAccountButton: $("#fillAccountButton"),
  fillPasswordButton: $("#fillPasswordButton"),
  fillFocusedButton: $("#fillFocusedButton"),
  submitRemoteLoginButton: $("#submitRemoteLoginButton"),
  bottomNav: $(".bottom-nav"),
  toast: $("#toast")
};

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
  } catch (_) {
    toast("本机存储空间不足，历史记录只保留在当前页面");
  }
}

function historyId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? text.slice(0, length - 1) + "…" : text;
}

function toast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => elements.toast.classList.remove("show"), 3200);
}

function showDialog(dialog) {
  if (dialog && !dialog.open) dialog.showModal();
}

function apiErrorMessage(error) {
  if (error.status === 401 || error.code === "UNAUTHORIZED") {
    return "AgentChat 访问令牌未通过验证；这不是 AI Provider 的登录错误";
  }
  if (error.code === "AUTH_REQUIRED") return "这个 AI 还没有登录，请先点对应 Provider 的“登录”";
  if (error.code === "EDITOR_NOT_FOUND" || error.code === "PAGE_CHANGED") {
    return "AI 网页结构发生变化，暂时找不到输入框";
  }
  if (error.code === "RESPONSE_TIMEOUT") return "AI 页面等待回复超时，可以稍后重试";
  if (error.code === "ALL_PROVIDERS_FAILED" && Array.isArray(error.details)) {
    const failed = error.details.map((item) => {
      return (item.provider || "provider") + ": " + (item.code || "失败");
    }).join("、");
    return "所有已选 AI 都失败了（" + failed + "）";
  }
  return error.message || "请求失败";
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set("authorization", "Bearer " + state.token);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(path, Object.assign({}, options, { headers }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "HTTP " + response.status);
    error.code = data.code;
    error.details = data.details;
    error.status = response.status;
    throw error;
  }
  return data;
}

function requestToken() {
  elements.tokenInput.value = state.token;
  showDialog(elements.settingsDialog);
  toast("先输入 AgentChat 个人访问令牌");
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
    const configured = Boolean(health.configured);
    elements.healthDot.className = "dot " + (configured ? "good" : "");
    if (configured) {
      elements.healthText.textContent = "Cloudflare 后端已就绪 · v" + (health.version || "0.2");
    } else {
      const missing = Array.isArray(health.missing) ? health.missing.join("、") : "Secret";
      elements.healthText.textContent = "后端在线，但还缺少 Secret：" + missing;
    }
  } catch (error) {
    elements.healthDot.className = "dot bad";
    elements.healthText.textContent = "后端不可用：" + apiErrorMessage(error);
  }
}

async function loadProviders() {
  const data = await api("/api/providers");
  state.providers = Array.isArray(data.providers) ? data.providers : [];
  renderComparePicker();
  renderProviders();
  updateStats();
}

async function loadProvidersSafe() {
  try {
    await loadProviders();
  } catch (error) {
    state.providers = [];
    renderComparePicker();
    renderProviders();
    updateStats();
    toast("Provider 列表加载失败：" + apiErrorMessage(error));
  }
}

function stateLabel(value) {
  return ({
    ready: "已登录，可执行",
    auth_required: "需要登录",
    page_changed: "页面结构可能已变化",
    checking: "检测中…",
    error: "检测失败",
    unknown: "尚未检测",
    planned: "暂未接入"
  })[value] || value || "尚未检测";
}

function providerName(key) {
  const provider = state.providers.find((item) => item.key === key);
  return provider ? provider.name : key;
}

function updateStats() {
  const enabled = state.providers.filter((provider) => provider.cloudEnabled).length;
  elements.availableCount.textContent = String(enabled);
  elements.historyCount.textContent = String(state.history.length);
}

function createActionButton(label, action, provider, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "small-button" + (action === "login" ? " login" : "");
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.provider = provider.key;
  button.disabled = Boolean(disabled);
  return button;
}

function renderProviders() {
  elements.providerGrid.replaceChildren();

  for (const provider of state.providers) {
    const enabled = Boolean(provider.cloudEnabled);
    const current = state.providerStates.get(provider.key) || (enabled ? "unknown" : "planned");

    const card = document.createElement("article");
    card.className = "provider-card";

    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "provider-name";
    name.textContent = provider.name;

    const status = document.createElement("div");
    status.className = "provider-state " + (current === "ready" ? "is-ready" : "");
    status.textContent = enabled ? stateLabel(current) : "暂未接入云端 Browser Run";

    info.append(name, status);

    const actions = document.createElement("div");
    actions.className = "provider-actions";
    actions.append(
      createActionButton("检测", "check", provider, !enabled),
      createActionButton("登录", "login", provider, !enabled),
      createActionButton("手机输入", "mobile", provider, !enabled),
      createActionButton("保存登录态", "save", provider, !enabled)
    );

    card.append(info, actions);
    elements.providerGrid.appendChild(card);
  }
}

function renderComparePicker() {
  elements.comparePicker.replaceChildren();
  const cloudProviders = state.providers.filter((provider) => provider.cloudEnabled);

  if (!state.compareSelectionInitialized) {
    state.compareSelection = new Set(cloudProviders.map((provider) => provider.key));
    state.compareSelectionInitialized = true;
  } else {
    state.compareSelection = new Set(
      [...state.compareSelection].filter((key) => cloudProviders.some((provider) => provider.key === key))
    );
  }

  if (!cloudProviders.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "暂无可并行的云端 Provider";
    elements.comparePicker.appendChild(empty);
    return;
  }

  for (const provider of cloudProviders) {
    const label = document.createElement("label");
    label.className = "compare-choice";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = provider.key;
    input.checked = state.compareSelection.has(provider.key);
    input.addEventListener("change", () => {
      if (input.checked) state.compareSelection.add(provider.key);
      else state.compareSelection.delete(provider.key);
    });

    const text = document.createElement("span");
    text.textContent = provider.name;

    label.append(input, text);
    elements.comparePicker.appendChild(label);
  }
}

function selectedCompareProviders() {
  const keys = [...elements.comparePicker.querySelectorAll("input:checked")].map((input) => input.value);
  state.compareSelection = new Set(keys);
  return keys;
}

function setMode(mode) {
  state.mode = mode === "compare" ? "compare" : "auto";
  const compare = state.mode === "compare";

  elements.modeAutoButton.classList.toggle("active", !compare);
  elements.modeCompareButton.classList.toggle("active", compare);
  elements.modeAutoButton.setAttribute("aria-pressed", String(!compare));
  elements.modeCompareButton.setAttribute("aria-pressed", String(compare));
  elements.providerSelect.hidden = compare;
  elements.compareOptions.hidden = !compare;
  elements.providerSelect.setAttribute("aria-hidden", String(compare));
  elements.sendButton.textContent = compare ? "并行回答" : "开始执行";
}

function updatePromptCount() {
  const length = elements.promptInput.value.length;
  elements.promptCount.textContent = String(length) + " / " + String(MAX_PROMPT_CHARS);
  elements.promptCount.classList.toggle("warn", length > MAX_PROMPT_CHARS * 0.85);
  elements.promptCount.classList.toggle("bad", length > MAX_PROMPT_CHARS);
}

function formatDuration(durationMs) {
  const duration = Number(durationMs) || 0;
  return duration < 1000 ? Math.max(1, Math.round(duration)) + "ms" : (duration / 1000).toFixed(1) + "s";
}

function showResult(kind) {
  elements.resultCard.classList.remove("hidden");
  elements.singleResult.classList.toggle("hidden", kind !== "single");
  elements.compareResults.classList.toggle("hidden", kind !== "compare");
}

function renderSinglePending(provider) {
  showResult("single");
  elements.resultProvider.textContent = provider === "auto" ? "AUTO" : providerName(provider).toUpperCase();
  elements.resultMeta.textContent = "正在等待网页版 AI";
  elements.resultText.textContent = "AgentChat 正在通过 Cloudflare Browser Run 执行任务…";
  state.lastResultText = "";
}

function renderSingleResponse(result, durationMs) {
  const response = String(result.response || "没有返回文本").trim();
  showResult("single");
  elements.resultProvider.textContent = providerName(result.provider).toUpperCase();
  elements.resultMeta.textContent = formatDuration(durationMs);
  elements.resultText.textContent = response;
  state.lastResultText = response;
  return response;
}

function renderSingleError(error) {
  showResult("single");
  elements.resultProvider.textContent = error.code || "ERROR";
  elements.resultMeta.textContent = "执行失败";
  elements.resultText.textContent = apiErrorMessage(error);
  state.lastResultText = "";
}

function createCompareItem(result) {
  const item = document.createElement("article");
  const pending = Boolean(result.pending);
  const success = !pending && result.ok !== false;
  item.className = "compare-item " + (pending ? "pending" : success ? "success" : "error");

  const head = document.createElement("div");
  head.className = "compare-item-head";

  const title = document.createElement("strong");
  title.textContent = providerName(result.provider);

  const meta = document.createElement("span");
  meta.className = "muted";
  if (pending) meta.textContent = "等待返回…";
  else if (success) meta.textContent = formatDuration(result.durationMs);
  else meta.textContent = result.code || "失败";

  head.append(title, meta);

  const body = document.createElement("pre");
  if (pending) {
    body.className = "compare-loading";
    body.textContent = "正在执行…";
  } else if (success) {
    body.textContent = String(result.response || "没有返回文本");
  } else {
    body.className = "error-text";
    body.textContent = String(result.error || "该 Provider 执行失败");
  }

  item.append(head, body);
  return item;
}

function renderComparePending(keys) {
  showResult("compare");
  elements.resultProvider.textContent = "COMPARE";
  elements.resultMeta.textContent = keys.length + " 个模型并行执行";
  elements.compareResults.replaceChildren(...keys.map((key) => createCompareItem({ provider: key, pending: true })));
  state.lastResultText = "";
}

function buildCompareText(results) {
  return results.map((result) => {
    const header = "===== " + providerName(result.provider) + " =====";
    const body = result.ok === false
      ? String(result.error || "执行失败")
      : String(result.response || "没有返回文本");
    return header + "\n" + body;
  }).join("\n\n");
}

function renderComparePayload(payload, durationMs) {
  const results = Array.isArray(payload.results) ? payload.results : [];
  showResult("compare");
  elements.resultProvider.textContent = "COMPARE";

  const successCount = results.filter((result) => result.ok !== false).length;
  elements.resultMeta.textContent = successCount + " / " + results.length + " 个模型完成 · " + formatDuration(payload.durationMs || durationMs);
  elements.compareResults.replaceChildren(...results.map(createCompareItem));
  state.lastResultText = buildCompareText(results);
  return { results, successCount };
}

function addHistory(entry) {
  const item = Object.assign({
    id: historyId(),
    createdAt: new Date().toISOString()
  }, entry);

  state.history = [item].concat(state.history).slice(0, MAX_HISTORY);
  persistHistory();
  renderHistory();
  updateStats();
}

function sanitizeResponse(value) {
  return truncate(String(value || ""), MAX_HISTORY_RESPONSE_CHARS);
}

function saveSingleHistory(prompt, route, result, durationMs) {
  addHistory({
    mode: "single",
    prompt: truncate(prompt, 1200),
    route: route,
    provider: result.provider,
    response: sanitizeResponse(result.response),
    durationMs: Math.round(durationMs)
  });
}

function saveCompareHistory(prompt, results, durationMs) {
  addHistory({
    mode: "compare",
    prompt: truncate(prompt, 1200),
    durationMs: Math.round(durationMs),
    results: results.map((result) => ({
      provider: result.provider,
      ok: result.ok !== false,
      code: result.code || "",
      error: truncate(result.error || "", 500),
      response: sanitizeResponse(result.response)
    }))
  });
}

function formatHistoryTime(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch (_) {
    return "";
  }
}

function renderHistory() {
  elements.historyList.replaceChildren();

  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "完成一次任务后，最近结果会保存在这台设备上。";
    elements.historyList.appendChild(empty);
    updateStats();
    return;
  }

  for (const item of state.history) {
    const card = document.createElement("article");
    card.className = "history-item";

    const main = document.createElement("div");
    main.className = "history-main";

    const prompt = document.createElement("div");
    prompt.className = "history-prompt";
    prompt.textContent = truncate(item.prompt, 100);

    const meta = document.createElement("div");
    meta.className = "history-meta";
    if (item.mode === "compare") {
      const total = Array.isArray(item.results) ? item.results.length : 0;
      const complete = Array.isArray(item.results) ? item.results.filter((result) => result.ok).length : 0;
      meta.textContent = "并行对比 · " + complete + "/" + total + " 完成 · " + formatHistoryTime(item.createdAt);
    } else {
      meta.textContent = "智能路由 · " + providerName(item.provider || item.route || "auto") + " · " + formatHistoryTime(item.createdAt);
    }

    const preview = document.createElement("div");
    preview.className = "history-preview";
    if (item.mode === "compare") {
      preview.textContent = "已保存 " + (Array.isArray(item.results) ? item.results.length : 0) + " 个模型的回答";
    } else {
      preview.textContent = truncate(item.response, 150);
    }

    main.append(prompt, meta, preview);

    const reuse = document.createElement("button");
    reuse.type = "button";
    reuse.className = "small-button";
    reuse.textContent = "填入";
    reuse.dataset.historyId = item.id;
    reuse.setAttribute("aria-label", "重新使用这条任务");

    card.append(main, reuse);
    elements.historyList.appendChild(card);
  }

  updateStats();
}

function reuseHistory(id) {
  const item = state.history.find((entry) => entry.id === id);
  if (!item) return;

  elements.promptInput.value = item.prompt || "";
  updatePromptCount();

  if (item.mode === "compare") {
    state.compareSelectionInitialized = true;
    state.compareSelection = new Set((item.results || []).map((result) => result.provider));
    renderComparePicker();
    setMode("compare");
  } else {
    setMode("auto");
    if (item.route && item.route !== "auto") elements.providerSelect.value = item.route;
  }

  elements.promptInput.focus();
  document.querySelector("#conversationSection").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("任务已填入，可以修改后重新执行");
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) return toast("当前没有可复制的结果");

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.focus();
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    toast("已复制结果");
  } catch (_) {
    toast("复制失败，请长按结果文字复制");
  }
}

async function checkProvider(key) {
  if (!state.token) {
    requestToken();
    return;
  }

  state.providerStates.set(key, "checking");
  renderProviders();

  try {
    const result = await api("/api/provider/status", {
      method: "POST",
      body: JSON.stringify({ provider: key })
    });
    state.providerStates.set(key, result.state);
    renderProviders();
    toast(providerName(key) + "： " + stateLabel(result.state));
  } catch (error) {
    state.providerStates.set(key, "error");
    renderProviders();
    toast(apiErrorMessage(error));
  }
}

async function openLogin(key) {
  if (!state.token) {
    requestToken();
    return;
  }

  try {
    const valid = await verifyCurrentToken();
    if (!valid) {
      requestToken();
      toast("访问令牌未通过验证，请重新保存");
      return;
    }
  } catch (error) {
    toast(apiErrorMessage(error));
    return;
  }

  const popup = window.open("about:blank", "_blank");
  try {
    const result = await api("/api/provider/live-view", {
      method: "POST",
      body: JSON.stringify({ provider: key })
    });
    if (popup) popup.location.replace(result.liveViewUrl);
    else window.location.assign(result.liveViewUrl);
    toast("已打开 " + providerName(key) + " Live View；请手动完成授权");
  } catch (error) {
    if (popup) popup.close();
    toast(apiErrorMessage(error));
  }
}

function openMobileLogin(key) {
  if (!state.token) {
    requestToken();
    return;
  }

  state.loginProvider = key;
  elements.loginHelperProvider.textContent = providerName(key);
  elements.loginAccountInput.value = "";
  elements.loginPasswordInput.value = "";
  elements.loginOtherInput.value = "";
  showDialog(elements.loginHelperDialog);
}

async function sendRemoteLoginAction(action, value) {
  if (!state.token) {
    requestToken();
    return null;
  }
  if (!state.loginProvider) {
    toast("请先选择 Provider");
    return null;
  }

  try {
    const result = await api("/api/provider/remote-input", {
      method: "POST",
      body: JSON.stringify({ provider: state.loginProvider, action, value })
    });
    toast(result.message || "已发送到远程登录页");
    return result;
  } catch (error) {
    toast(apiErrorMessage(error));
    throw error;
  }
}

async function saveLogin() {
  if (!state.token) {
    requestToken();
    return;
  }

  try {
    const result = await api("/api/provider/save-auth", {
      method: "POST",
      body: "{}"
    });
    toast("登录态已加密保存：" + String(result.cookies || 0) + " 个 Cookie");
  } catch (error) {
    toast(apiErrorMessage(error));
  }
}

async function refreshCloudProviders() {
  if (!state.token) {
    requestToken();
    return;
  }

  const providers = state.providers.filter((provider) => provider.cloudEnabled);
  elements.refreshProviders.disabled = true;
  elements.refreshProviders.textContent = "检测中…";
  try {
    await Promise.all(providers.map((provider) => checkProvider(provider.key)));
  } finally {
    elements.refreshProviders.disabled = false;
    elements.refreshProviders.textContent = "刷新";
  }
}

async function sendSingle(prompt, startedAt) {
  const route = elements.providerSelect.value;
  renderSinglePending(route);

  try {
    const result = await api("/api/ask", {
      method: "POST",
      body: JSON.stringify({ provider: route, prompt })
    });
    const durationMs = Math.round(performance.now() - startedAt);
    const response = renderSingleResponse(result, durationMs);
    saveSingleHistory(prompt, route, Object.assign({}, result, { response }), durationMs);
    toast(providerName(result.provider) + " 已完成");
  } catch (error) {
    renderSingleError(error);
    toast(apiErrorMessage(error));
  }
}

async function sendCompare(prompt, startedAt) {
  const providers = selectedCompareProviders();
  if (!providers.length) {
    toast("至少选择一个要并行执行的 AI");
    return;
  }

  renderComparePending(providers);

  try {
    const payload = await api("/api/compare", {
      method: "POST",
      body: JSON.stringify({ providers, prompt })
    });
    const durationMs = Math.round(performance.now() - startedAt);
    const rendered = renderComparePayload(payload, durationMs);
    saveCompareHistory(prompt, rendered.results, durationMs);
    toast(rendered.successCount + "/" + rendered.results.length + " 个 AI 已完成");
  } catch (error) {
    const fallbackResults = Array.isArray(error.details)
      ? error.details.map((item) => ({
        provider: item.provider,
        ok: false,
        code: item.code,
        error: item.error
      }))
      : [{ provider: "compare", ok: false, error: apiErrorMessage(error) }];

    renderComparePayload({ results: fallbackResults }, Math.round(performance.now() - startedAt));
    toast(apiErrorMessage(error));
  }
}

async function sendPrompt() {
  if (state.busy) return;

  const prompt = elements.promptInput.value.trim();
  if (!prompt) {
    toast("请先输入任务");
    elements.promptInput.focus();
    return;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    toast("任务太长，请控制在 " + MAX_PROMPT_CHARS + " 字以内");
    return;
  }
  if (!state.token) {
    requestToken();
    return;
  }

  state.busy = true;
  elements.sendButton.disabled = true;
  elements.sendButton.setAttribute("aria-busy", "true");
  elements.modeAutoButton.disabled = true;
  elements.modeCompareButton.disabled = true;
  elements.providerSelect.disabled = true;

  const startedAt = performance.now();
  try {
    if (state.mode === "compare") await sendCompare(prompt, startedAt);
    else await sendSingle(prompt, startedAt);
  } finally {
    state.busy = false;
    elements.sendButton.disabled = false;
    elements.sendButton.removeAttribute("aria-busy");
    elements.modeAutoButton.disabled = false;
    elements.modeCompareButton.disabled = false;
    elements.providerSelect.disabled = false;
  }
}

elements.settingsButton.addEventListener("click", () => {
  elements.tokenInput.value = state.token;
  showDialog(elements.settingsDialog);
});

elements.saveTokenButton.addEventListener("click", async () => {
  const candidate = elements.tokenInput.value.trim();
  if (!candidate) {
    state.token = "";
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    elements.settingsDialog.close();
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
      toast("令牌不匹配：请确认与 Cloudflare 的 AGENTCHAT_API_TOKEN 完全一致");
      return;
    }
    sessionStorage.setItem(TOKEN_STORAGE_KEY, candidate);
    elements.settingsDialog.close();
    toast("AgentChat 访问令牌验证成功");
  } catch (error) {
    state.token = previous;
    toast(apiErrorMessage(error));
  } finally {
    elements.saveTokenButton.disabled = false;
    elements.saveTokenButton.textContent = "保存到本机";
  }
});

elements.clearAuthButton.addEventListener("click", async () => {
  if (!state.token) {
    requestToken();
    return;
  }
  if (!confirm("确定清除 Cloudflare 中保存的 AI 登录态吗？")) return;

  try {
    await api("/api/provider/clear-auth", { method: "POST", body: "{}" });
    state.providerStates.clear();
    renderProviders();
    toast("云端 AI 登录态已清除");
  } catch (error) {
    toast(apiErrorMessage(error));
  }
});

elements.providerGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
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

elements.modeAutoButton.addEventListener("click", () => setMode("auto"));
elements.modeCompareButton.addEventListener("click", () => setMode("compare"));
elements.promptInput.addEventListener("input", updatePromptCount);
elements.promptInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendPrompt();
});

elements.refreshProviders.addEventListener("click", refreshCloudProviders);
elements.sendButton.addEventListener("click", sendPrompt);
elements.copyAllButton.addEventListener("click", () => copyText(state.lastResultText));
elements.clearResultButton.addEventListener("click", () => {
  elements.resultCard.classList.add("hidden");
  state.lastResultText = "";
});
elements.clearHistoryButton.addEventListener("click", () => {
  if (!state.history.length) return;
  if (!confirm("清除这台设备上的全部历史记录吗？")) return;
  state.history = [];
  localStorage.removeItem(HISTORY_STORAGE_KEY);
  renderHistory();
  toast("本机历史记录已清除");
});
elements.historyList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-history-id]");
  if (button) reuseHistory(button.dataset.historyId);
});
elements.bottomNav.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-target]");
  if (!button || button.disabled) return;
  const target = document.querySelector(button.dataset.target);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.bottomNav.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

renderHistory();
renderComparePicker();
renderProviders();
updateStats();
setMode("auto");
updatePromptCount();
await Promise.all([checkHealth(), loadProvidersSafe()]);

