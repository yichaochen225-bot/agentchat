import { DurableObject } from "cloudflare:workers";
import { launch } from "@cloudflare/playwright";
import { CLOUD_PROVIDERS, PROVIDERS, getProvider, publicProvider } from "./providers.js";
import { decryptJson, encryptJson } from "./crypto.js";
import { probeProvider, runProvider } from "./runner.js";
import { handleMcpRequest } from "./mcp.js";

const AUTH_STATE_KEY = "auth:storage-state:v1";
const IDLE_CLOSE_MS = 5 * 60 * 1000;
const MAX_API_BODY_BYTES = 96 * 1024;
const MAX_PROMPT_CHARS = 12000;
const MAX_COMPARE_PROVIDERS = 3;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

function createError(message, code, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function serializeError(error) {
  return {
    error: error?.message || String(error),
    code: error?.code || "INTERNAL_ERROR",
    details: error?.details || undefined
  };
}

function errorStatus(code) {
  return ({
    INVALID_PROMPT: 400,
    INVALID_PROVIDER_SELECTION: 400,
    COMPARE_NO_PROVIDERS: 400,
    REQUEST_TOO_LARGE: 413,
    AUTH_REQUIRED: 409,
    PROVIDER_NOT_ENABLED: 400,
    ALL_PROVIDERS_FAILED: 502,
    RESPONSE_TIMEOUT: 504
  })[code] || 500;
}

function isAuthorized(request, env) {
  const expected = String(env.AGENTCHAT_API_TOKEN || "").trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\\s+(.+)$/i);
  const provided = String(match?.[1] || "").trim();
  return provided === expected;
}

function requireConfiguredSecrets(env) {
  const missing = [];
  if (!String(env.AGENTCHAT_API_TOKEN || "").trim()) missing.push("AGENTCHAT_API_TOKEN");
  if (!String(env.AUTH_STATE_KEY || "").trim()) missing.push("AUTH_STATE_KEY");
  return missing;
}

function normalizePrompt(value) {
  const prompt = String(value || "").trim();
  if (!prompt) throw createError("Prompt is required", "INVALID_PROMPT");
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw createError("Prompt exceeds " + MAX_PROMPT_CHARS + " characters", "INVALID_PROMPT");
  }
  return prompt;
}

function resolveCompareProviders(value) {
  const raw = Array.isArray(value)
    ? value
    : CLOUD_PROVIDERS.map((provider) => provider.key);
  const keys = [...new Set(raw.map((key) => String(key || "").trim()).filter(Boolean))];

  if (!keys.length) throw createError("At least one provider is required", "COMPARE_NO_PROVIDERS");
  if (keys.length > MAX_COMPARE_PROVIDERS) {
    throw createError("Compare mode supports at most " + MAX_COMPARE_PROVIDERS + " providers", "INVALID_PROVIDER_SELECTION");
  }

  const providers = keys.map((key) => getProvider(key));
  if (providers.some((provider) => !provider || !provider.cloudEnabled)) {
    throw createError("One or more selected providers are not enabled", "INVALID_PROVIDER_SELECTION");
  }
  return providers;
}

async function proxyToBrowser(request, env, internalPath) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
    return json({ error: "Request body is too large", code: "REQUEST_TOO_LARGE" }, 413);
  }

  const id = env.AGENTCHAT_BROWSER.idFromName("primary");
  const stub = env.AGENTCHAT_BROWSER.get(id);
  const source = new URL(request.url);
  const target = new URL(internalPath, source.origin);
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.arrayBuffer();

  if (body && body.byteLength > MAX_API_BODY_BYTES) {
    return json({ error: "Request body is too large", code: "REQUEST_TOO_LARGE" }, 413);
  }

  return stub.fetch(new Request(target, {
    method: request.method,
    headers: request.headers,
    body
  }));
}

async function fillFirstVisible(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = Math.min(await locator.count().catch(() => 0), 6);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) continue;
      await candidate.fill(value, { timeout: 5000 });
      return true;
    }
  }
  return false;
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = Math.min(await locator.count().catch(() => 0), 6);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) continue;
      await candidate.click({ timeout: 5000 });
      return true;
    }
  }
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const missing = requireConfiguredSecrets(env);
      return json({
        ok: true,
        service: "agentchat-cloud",
        version: "0.2.0",
        runtime: "cloudflare-browser-run",
        configured: missing.length === 0,
        missing,
        mcpConfigured: Boolean(String(env.MCP_API_TOKEN || "").trim())
      });
    }

    if (url.pathname === "/mcp") return handleMcpRequest(request, env);

    if (url.pathname === "/api/providers" && request.method === "GET") {
      return json({ providers: PROVIDERS.map(publicProvider) });
    }

    if (url.pathname.startsWith("/api/")) {
      if (!isAuthorized(request, env)) {
        return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
      }

      const routes = new Map([
        ["/api/browser/status", "/status"],
        ["/api/provider/status", "/provider-status"],
        ["/api/provider/live-view", "/live-view"],
        ["/api/provider/remote-input", "/remote-input"],
        ["/api/provider/save-auth", "/save-auth"],
        ["/api/provider/clear-auth", "/clear-auth"],
        ["/api/ask", "/ask"],
        ["/api/compare", "/compare"]
      ]);
      const internal = routes.get(url.pathname);
      if (!internal) return json({ error: "Not found", code: "NOT_FOUND" }, 404);
      return proxyToBrowser(request, env, internal);
    }

    return env.ASSETS.fetch(request);
  }
};

export class AgentChatBrowser extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env = env;
    this.browser = null;
    this.browserPromise = null;
    this.context = null;
    this.contextPromise = null;
    this.pages = new Map();
    this.pagePromises = new Map();
    this.lastUseAt = 0;
  }

  async ensureBrowser() {
    if (this.browser && this.browser.isConnected()) return this.browser;
    if (this.browserPromise) return this.browserPromise;

    this.browserPromise = launch(this.env.BROWSER, { keep_alive: 600000 })
      .then((browser) => {
        this.browser = browser;
        this.context = null;
        this.pages.clear();
        return browser;
      })
      .finally(() => {
        this.browserPromise = null;
      });

    return this.browserPromise;
  }

  async loadStorageState() {
    const encrypted = await this.state.storage.get(AUTH_STATE_KEY);
    if (!encrypted) return undefined;
    return decryptJson(encrypted, this.env.AUTH_STATE_KEY);
  }

  async ensureContext() {
    if (this.context) return this.context;
    if (this.contextPromise) return this.contextPromise;

    this.contextPromise = (async () => {
      const browser = await this.ensureBrowser();
      const storageState = await this.loadStorageState();
      const context = await browser.newContext(storageState ? { storageState } : {});
      this.context = context;
      return context;
    })().finally(() => {
      this.contextPromise = null;
    });

    return this.contextPromise;
  }

  async providerPage(provider) {
    const cached = this.pages.get(provider.key);
    if (cached && !cached.isClosed()) return cached;

    const pending = this.pagePromises.get(provider.key);
    if (pending) return pending;

    const pagePromise = this.ensureContext()
      .then((context) => context.newPage())
      .then((page) => {
        this.pages.set(provider.key, page);
        return page;
      })
      .finally(() => {
        this.pagePromises.delete(provider.key);
      });

    this.pagePromises.set(provider.key, pagePromise);
    return pagePromise;
  }

  async ensureProviderPage(provider) {
    const page = await this.providerPage(provider);
    if (!page.url() || page.url() === "about:blank") {
      await page.goto(provider.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    }
    return page;
  }

  async persistAuthState() {
    const context = await this.ensureContext();
    const storageState = await context.storageState({ indexedDB: true });
    const encrypted = await encryptJson(storageState, this.env.AUTH_STATE_KEY);
    await this.state.storage.put(AUTH_STATE_KEY, encrypted);
    return {
      saved: true,
      origins: storageState.origins?.length || 0,
      cookies: storageState.cookies?.length || 0
    };
  }

  async clearAuthState() {
    await this.state.storage.delete(AUTH_STATE_KEY);
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
      this.pages.clear();
    }
    return { cleared: true };
  }

  async touch() {
    this.lastUseAt = Date.now();
    await this.state.storage.setAlarm(Date.now() + IDLE_CLOSE_MS);
  }

  async status() {
    return {
      browserConnected: Boolean(this.browser?.isConnected()),
      contextActive: Boolean(this.context),
      openProviderPages: [...this.pages.entries()]
        .filter(([, page]) => !page.isClosed())
        .map(([key]) => key),
      authStateSaved: Boolean(await this.state.storage.get(AUTH_STATE_KEY))
    };
  }

  async liveView(provider) {
    const page = await this.ensureProviderPage(provider);
    const cdp = await page.context().newCDPSession(page);
    const result = await cdp.send("Cloudflare.getLiveView", {
      mode: "tab",
      expiresInMs: 10 * 60 * 1000
    });
    await cdp.detach().catch(() => {});
    return {
      provider: provider.key,
      liveViewUrl: result.devtoolsFrontendUrl,
      expiresInMs: 10 * 60 * 1000,
      instructions: "请在 Live View 中完成 " + provider.name + " 登录；iPhone 无法输入时，返回 AgentChat 使用“手机输入”。"
    };
  }

  async remoteInput(provider, action, value) {
    const page = await this.ensureProviderPage(provider);

    if (action === "account") {
      const ok = await fillFirstVisible(page, [
        'input[placeholder*="Phone number"]',
        'input[placeholder*="email address"]',
        'input[placeholder*="Email"]',
        'input[type="email"]',
        'input[type="tel"]',
        'input[name*="email"]',
        'input[name*="phone"]',
        'input[type="text"]'
      ], String(value || ""));
      if (!ok) throw createError("找不到可见的账号输入框。请先在 Live View 打开登录页面。", "LOGIN_FIELD_NOT_FOUND");
      return { ok: true, provider: provider.key, action, message: "账号已填入远程页面" };
    }

    if (action === "password") {
      const password = String(value || "");
      if (!password) throw createError("密码不能为空", "INVALID_LOGIN_INPUT");
      const ok = await fillFirstVisible(page, [
        'input[type="password"]',
        'input[autocomplete="current-password"]'
      ], password);
      if (!ok) {
        throw createError("找不到可见的密码输入框。若页面分两步登录，请先提交账号进入密码页。", "LOGIN_FIELD_NOT_FOUND");
      }
      return { ok: true, provider: provider.key, action, message: "密码已填入远程页面；AgentChat 未保存密码" };
    }

    if (action === "focused") {
      const text = String(value || "");
      if (!text) throw createError("输入内容不能为空", "INVALID_LOGIN_INPUT");
      const editable = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element) return false;
        const tag = element.tagName?.toLowerCase();
        return tag === "input" || tag === "textarea" || element.getAttribute?.("contenteditable") === "true";
      }).catch(() => false);
      if (!editable) {
        throw createError("远程页面当前没有选中输入框。请先在 Live View 点一下验证码或目标输入框，再返回这里发送。", "REMOTE_FIELD_NOT_FOCUSED");
      }
      await page.keyboard.insertText(text);
      return { ok: true, provider: provider.key, action, message: "内容已输入到远程当前焦点" };
    }

    if (action === "submit") {
      const clicked = await clickFirstVisible(page, [
        'button:has-text("Log in")',
        'button:has-text("Login")',
        'button:has-text("Next")',
        'button:has-text("Continue")',
        'button[type="submit"]',
        '[role="button"]:has-text("Log in")',
        '[role="button"]:has-text("Next")'
      ]);
      if (!clicked) await page.keyboard.press("Enter");
      return { ok: true, provider: provider.key, action, message: "已提交远程登录 / 下一步" };
    }

    throw createError("Unsupported remote input action", "INVALID_LOGIN_ACTION");
  }

  async askOne(provider, prompt) {
    const page = await this.providerPage(provider);
    const result = await runProvider(page, provider, prompt);
    await this.persistAuthState().catch(() => {});
    return result;
  }

  async askAuto(prompt) {
    const attempts = [];
    for (const provider of CLOUD_PROVIDERS) {
      try {
        const result = await this.askOne(provider, prompt);
        return { ...result, mode: "auto", attempts };
      } catch (error) {
        attempts.push({ provider: provider.key, ...serializeError(error) });
      }
    }
    throw createError("All cloud providers failed", "ALL_PROVIDERS_FAILED", attempts);
  }

  async askCompare(prompt, providerKeys) {
    const providers = resolveCompareProviders(providerKeys);
    const startedAt = Date.now();

    const results = await Promise.all(providers.map(async (provider) => {
      const providerStartedAt = Date.now();
      try {
        const result = await this.askOne(provider, prompt);
        return {
          ok: true,
          provider: provider.key,
          response: result.response,
          durationMs: Date.now() - providerStartedAt
        };
      } catch (error) {
        return {
          ok: false,
          provider: provider.key,
          code: error?.code || "INTERNAL_ERROR",
          error: error?.message || String(error),
          durationMs: Date.now() - providerStartedAt
        };
      }
    }));

    const successCount = results.filter((result) => result.ok).length;
    if (!successCount) {
      throw createError("All selected providers failed", "ALL_PROVIDERS_FAILED", results);
    }

    return {
      mode: "compare",
      results,
      successCount,
      totalCount: results.length,
      durationMs: Date.now() - startedAt
    };
  }

  async fetch(request) {
    await this.touch();
    const url = new URL(request.url);

    try {
      if (url.pathname === "/status" && request.method === "GET") {
        return json(await this.status());
      }

      let body = {};
      if (request.method !== "GET") {
        try {
          body = await request.json();
        } catch (_) {
          return json({ error: "Request body must be valid JSON", code: "INVALID_JSON" }, 400);
        }
      }

      const provider = body.provider ? getProvider(String(body.provider)) : null;

      if (url.pathname === "/provider-status" && request.method === "POST") {
        if (!provider || !provider.cloudEnabled) {
          return json({ error: "Provider is not enabled in Cloud v0.2", code: "PROVIDER_NOT_ENABLED" }, 400);
        }
        const page = await this.providerPage(provider);
        return json(await probeProvider(page, provider));
      }

      if (url.pathname === "/live-view" && request.method === "POST") {
        if (!provider || !provider.cloudEnabled) {
          return json({ error: "Provider is not enabled in Cloud v0.2", code: "PROVIDER_NOT_ENABLED" }, 400);
        }
        return json(await this.liveView(provider));
      }

      if (url.pathname === "/remote-input" && request.method === "POST") {
        if (!provider || !provider.cloudEnabled) {
          return json({ error: "Provider is not enabled in Cloud v0.2", code: "PROVIDER_NOT_ENABLED" }, 400);
        }
        return json(await this.remoteInput(provider, String(body.action || ""), body.value));
      }

      if (url.pathname === "/save-auth" && request.method === "POST") {
        return json(await this.persistAuthState());
      }

      if (url.pathname === "/clear-auth" && request.method === "POST") {
        return json(await this.clearAuthState());
      }

      if (url.pathname === "/ask" && request.method === "POST") {
        const prompt = normalizePrompt(body.prompt);
        if (!body.provider || body.provider === "auto") return json(await this.askAuto(prompt));
        if (!provider || !provider.cloudEnabled) {
          return json({ error: "Provider is not enabled in Cloud v0.2", code: "PROVIDER_NOT_ENABLED" }, 400);
        }
        return json(await this.askOne(provider, prompt));
      }

      if (url.pathname === "/compare" && request.method === "POST") {
        const prompt = normalizePrompt(body.prompt);
        return json(await this.askCompare(prompt, body.providers));
      }

      return json({ error: "Not found", code: "NOT_FOUND" }, 404);
    } catch (error) {
      const payload = serializeError(error);
      return json(payload, errorStatus(payload.code));
    }
  }

  async alarm() {
    if (!this.lastUseAt || Date.now() - this.lastUseAt >= IDLE_CLOSE_MS) {
      if (this.context) await this.context.close().catch(() => {});
      this.context = null;
      this.pages.clear();
      if (this.browser) await this.browser.close().catch(() => {});
      this.browser = null;
      return;
    }
    await this.state.storage.setAlarm(this.lastUseAt + IDLE_CLOSE_MS);
  }
}
