import { DurableObject } from "cloudflare:workers";
import { launch } from "@cloudflare/playwright";
import { CLOUD_PROVIDERS, PROVIDERS, getProvider, publicProvider } from "./providers.js";
import { decryptJson, encryptJson } from "./crypto.js";
import { probeProvider, runProvider } from "./runner.js";

const AUTH_STATE_KEY = "auth:storage-state:v1";
const IDLE_CLOSE_MS = 5 * 60 * 1000;

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

function serializeError(error) {
  return {
    error: error?.message || String(error),
    code: error?.code || "INTERNAL_ERROR",
    details: error?.details || undefined
  };
}

function isAuthorized(request, env) {
  const expected = String(env.AGENTCHAT_API_TOKEN || "").trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const provided = String(match?.[1] || "").trim();
  return provided === expected;
}

function requireConfiguredSecrets(env) {
  const missing = [];
  if (!String(env.AGENTCHAT_API_TOKEN || "").trim()) missing.push("AGENTCHAT_API_TOKEN");
  if (!String(env.AUTH_STATE_KEY || "").trim()) missing.push("AUTH_STATE_KEY");
  return missing;
}

async function proxyToBrowser(request, env, internalPath) {
  const id = env.AGENTCHAT_BROWSER.idFromName("primary");
  const stub = env.AGENTCHAT_BROWSER.get(id);
  const source = new URL(request.url);
  const target = new URL(internalPath, source.origin);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  return stub.fetch(new Request(target, {
    method: request.method,
    headers: request.headers,
    body
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      const missing = requireConfiguredSecrets(env);
      return json({
        ok: true,
        service: "agentchat-cloud",
        version: "0.1.0",
        runtime: "cloudflare-browser-run",
        configured: missing.length === 0,
        missing
      });
    }

    if (url.pathname === "/api/providers" && request.method === "GET") {
      return json({ providers: PROVIDERS.map(publicProvider) });
    }

    if (url.pathname.startsWith("/api/")) {
      if (!isAuthorized(request, env)) return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);

      const routes = new Map([
        ["/api/browser/status", "/status"],
        ["/api/provider/status", "/provider-status"],
        ["/api/provider/live-view", "/live-view"],
        ["/api/provider/save-auth", "/save-auth"],
        ["/api/provider/clear-auth", "/clear-auth"],
        ["/api/ask", "/ask"]
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
    this.context = null;
    this.pages = new Map();
    this.lastUseAt = 0;
  }

  async ensureBrowser() {
    if (this.browser && this.browser.isConnected()) return this.browser;
    this.browser = await launch(this.env.BROWSER, { keep_alive: 600000 });
    this.context = null;
    this.pages.clear();
    return this.browser;
  }

  async loadStorageState() {
    const encrypted = await this.state.storage.get(AUTH_STATE_KEY);
    if (!encrypted) return undefined;
    return decryptJson(encrypted, this.env.AUTH_STATE_KEY);
  }

  async ensureContext() {
    const browser = await this.ensureBrowser();
    if (this.context) return this.context;
    const storageState = await this.loadStorageState();
    this.context = await browser.newContext(storageState ? { storageState } : {});
    return this.context;
  }

  async providerPage(provider) {
    const context = await this.ensureContext();
    const cached = this.pages.get(provider.key);
    if (cached && !cached.isClosed()) return cached;
    const page = await context.newPage();
    this.pages.set(provider.key, page);
    return page;
  }

  async persistAuthState() {
    const context = await this.ensureContext();
    const storageState = await context.storageState({ indexedDB: true });
    const encrypted = await encryptJson(storageState, this.env.AUTH_STATE_KEY);
    await this.state.storage.put(AUTH_STATE_KEY, encrypted);
    return { saved: true, origins: storageState.origins?.length || 0, cookies: storageState.cookies?.length || 0 };
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
    const page = await this.providerPage(provider);
    if (!page.url() || page.url() === "about:blank") {
      await page.goto(provider.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    }
    const cdp = await page.context().newCDPSession(page);
    const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", {
      mode: "tab",
      expiresInMs: 10 * 60 * 1000
    });
    await cdp.detach().catch(() => {});
    return {
      provider: provider.key,
      liveViewUrl: devtoolsFrontendUrl,
      expiresInMs: 10 * 60 * 1000,
      instructions: `请在 Live View 中完成 ${provider.name} 登录，然后回到 AgentChat 点击“保存登录态”。`
    };
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
    const error = new Error("All cloud providers failed");
    error.code = "ALL_PROVIDERS_FAILED";
    error.details = attempts;
    throw error;
  }

  async fetch(request) {
    await this.touch();
    const url = new URL(request.url);

    try {
      if (url.pathname === "/status" && request.method === "GET") {
        return json(await this.status());
      }

      const body = request.method === "GET" ? {} : await request.json().catch(() => ({}));
      const provider = body.provider ? getProvider(body.provider) : null;

      if (url.pathname === "/provider-status" && request.method === "POST") {
        if (!provider || !provider.cloudEnabled) return json({ error: "Provider is not enabled in Cloud v0.1", code: "PROVIDER_NOT_ENABLED" }, 400);
        const page = await this.providerPage(provider);
        return json(await probeProvider(page, provider));
      }

      if (url.pathname === "/live-view" && request.method === "POST") {
        if (!provider || !provider.cloudEnabled) return json({ error: "Provider is not enabled in Cloud v0.1", code: "PROVIDER_NOT_ENABLED" }, 400);
        return json(await this.liveView(provider));
      }

      if (url.pathname === "/save-auth" && request.method === "POST") {
        return json(await this.persistAuthState());
      }

      if (url.pathname === "/clear-auth" && request.method === "POST") {
        return json(await this.clearAuthState());
      }

      if (url.pathname === "/ask" && request.method === "POST") {
        const prompt = String(body.prompt || "").trim();
        if (!prompt) return json({ error: "Prompt is required", code: "INVALID_PROMPT" }, 400);
        if (!body.provider || body.provider === "auto") return json(await this.askAuto(prompt));
        if (!provider || !provider.cloudEnabled) return json({ error: "Provider is not enabled in Cloud v0.1", code: "PROVIDER_NOT_ENABLED" }, 400);
        return json(await this.askOne(provider, prompt));
      }

      return json({ error: "Not found", code: "NOT_FOUND" }, 404);
    } catch (error) {
      const payload = serializeError(error);
      const status = payload.code === "AUTH_REQUIRED" ? 409 : payload.code === "INVALID_PROMPT" ? 400 : 500;
      return json(payload, status);
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
