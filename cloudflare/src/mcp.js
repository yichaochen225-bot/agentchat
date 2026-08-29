import { CLOUD_PROVIDERS, PROVIDERS, getProvider, publicProvider } from "./providers.js";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_RESOURCE_URI = "ui://agentchat/result/v1.html";
export const MCP_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

const MAX_PROMPT_CHARS = 12000;
const MAX_COMPARE_PROVIDERS = 3;

const UI_META = {
  ui: {
    resourceUri: MCP_RESOURCE_URI,
    csp: {
      connectDomains: [],
      resourceDomains: []
    },
    prefersBorder: true
  },
  "openai/outputTemplate": MCP_RESOURCE_URI,
  "openai/widgetDescription": "展示 AgentChat 多模型执行结果，并列出每个 AI 的回答、耗时和失败原因。"
};

const TOOL_DEFINITIONS = [
  {
    name: "agentchat_list_providers",
    title: "查看 AI Provider",
    description: "Use this when the user wants to see which AgentChat AI providers are connected or available.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false
    },
    _meta: {
      "openai/toolInvocation/invoking": "读取 AI Provider…",
      "openai/toolInvocation/invoked": "已读取 AI Provider"
    }
  },
  {
    name: "agentchat_run",
    title: "运行一个 AI",
    description: "Use this when the user wants AgentChat to send one task to a selected AI, or automatically route it to the first available AI.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          minLength: 1,
          maxLength: MAX_PROMPT_CHARS,
          description: "要交给 AI 的任务"
        },
        provider: {
          type: "string",
          enum: ["auto", ...CLOUD_PROVIDERS.map((item) => item.key)],
          default: "auto",
          description: "选择 auto、Gemini、Claude 或 DeepSeek"
        }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true
    },
    _meta: {
      ...UI_META,
      "openai/toolInvocation/invoking": "正在调用 AgentChat…",
      "openai/toolInvocation/invoked": "AgentChat 已返回结果"
    }
  },
  {
    name: "agentchat_compare",
    title: "并行比较多个 AI",
    description: "Use this when the user wants multiple AgentChat AI providers to answer the same task so their outputs can be compared.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          minLength: 1,
          maxLength: MAX_PROMPT_CHARS,
          description: "要同时交给多个 AI 的任务"
        },
        providers: {
          type: "array",
          minItems: 1,
          maxItems: MAX_COMPARE_PROVIDERS,
          uniqueItems: true,
          items: {
            type: "string",
            enum: CLOUD_PROVIDERS.map((item) => item.key)
          },
          description: "要并行调用的 Provider，最多三个"
        }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true
    },
    _meta: {
      ...UI_META,
      "openai/toolInvocation/invoking": "正在并行调用多个 AI…",
      "openai/toolInvocation/invoked": "多 AI 比较完成"
    }
  },
  {
    name: "agentchat_open_login",
    title: "打开 AI 授权页面",
    description: "Use this when the user asks to authorize or log in to a specific AgentChat AI provider. The user must complete the login, password, MFA, or CAPTCHA manually.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: CLOUD_PROVIDERS.map((item) => item.key),
          description: "要授权的 Provider"
        }
      },
      required: ["provider"],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true
    },
    _meta: {
      "openai/toolInvocation/invoking": "准备授权页面…",
      "openai/toolInvocation/invoked": "授权页面已准备好"
    }
  }
];

function rpcSuccess(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

function toolText(text) {
  return [{ type: "text", text: String(text) }];
}

function normalizePrompt(value) {
  const prompt = String(value || "").trim();
  if (!prompt) {
    const error = new Error("Prompt is required");
    error.code = "INVALID_PROMPT";
    throw error;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    const error = new Error("Prompt exceeds " + MAX_PROMPT_CHARS + " characters");
    error.code = "INVALID_PROMPT";
    throw error;
  }
  return prompt;
}

function normalizeProviderKey(value) {
  const key = String(value || "auto").trim().toLowerCase();
  if (key === "auto") return key;
  const provider = getProvider(key);
  if (!provider || !provider.cloudEnabled) {
    const error = new Error("Provider is not enabled in AgentChat Cloud");
    error.code = "PROVIDER_NOT_ENABLED";
    throw error;
  }
  return key;
}

function normalizeCompareProviders(value) {
  const raw = Array.isArray(value)
    ? value
    : CLOUD_PROVIDERS.map((provider) => provider.key);
  const keys = [...new Set(raw.map((key) => String(key || "").trim().toLowerCase()).filter(Boolean))];
  if (!keys.length) {
    const error = new Error("At least one provider is required");
    error.code = "COMPARE_NO_PROVIDERS";
    throw error;
  }
  if (keys.length > MAX_COMPARE_PROVIDERS) {
    const error = new Error("Compare mode supports at most " + MAX_COMPARE_PROVIDERS + " providers");
    error.code = "INVALID_PROVIDER_SELECTION";
    throw error;
  }
  for (const key of keys) {
    const provider = getProvider(key);
    if (!provider || !provider.cloudEnabled) {
      const error = new Error("Provider is not enabled in AgentChat Cloud");
      error.code = "INVALID_PROVIDER_SELECTION";
      throw error;
    }
  }
  return keys;
}

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return String(match?.[1] || "").trim();
}

function mcpHeaders(extra = {}) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "Authorization, Content-Type, Accept, Mcp-Session-Id",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-expose-headers": "Mcp-Session-Id",
    ...extra
  };
}

function mcpTokenConfigured(env) {
  return String(env.MCP_API_TOKEN || "").trim();
}

function isAuthorized(request, env) {
  const expected = mcpTokenConfigured(env);
  return Boolean(expected) && bearerToken(request) === expected;
}

async function callAgentChat(env, path, body, method = "POST") {
  const id = env.AGENTCHAT_BROWSER.idFromName("primary");
  const stub = env.AGENTCHAT_BROWSER.get(id);
  const request = new Request("https://agentchat.internal" + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const response = await stub.fetch(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "AgentChat internal request failed");
    error.code = data.code || "AGENTCHAT_REQUEST_FAILED";
    error.details = data.details;
    throw error;
  }
  return data;
}

async function readWidget(env, request) {
  const url = new URL("/mcp-widget.html", request.url);
  const response = await env.ASSETS.fetch(new Request(url));
  if (!response.ok) throw new Error("MCP widget asset is unavailable");
  return response.text();
}

async function callTool(name, args, env, request) {
  if (name === "agentchat_list_providers") {
    return {
      structuredContent: {
        providers: PROVIDERS.map(publicProvider)
      },
      content: toolText("AgentChat 当前有 " + CLOUD_PROVIDERS.length + " 个云端 Provider 可用："
        + CLOUD_PROVIDERS.map((provider) => provider.name).join("、") + "。")
    };
  }

  if (name === "agentchat_run") {
    const prompt = normalizePrompt(args?.prompt);
    const provider = normalizeProviderKey(args?.provider);
    const result = await callAgentChat(env, "/ask", { prompt, provider });
    return {
      structuredContent: {
        mode: "single",
        provider: result.provider,
        response: result.response,
        attempts: result.attempts || []
      },
      content: toolText("AgentChat 已通过 " + result.provider + " 返回一个回答。"),
      _meta: { agentchat: { mode: "single", provider: result.provider } }
    };
  }

  if (name === "agentchat_compare") {
    const prompt = normalizePrompt(args?.prompt);
    const providers = normalizeCompareProviders(args?.providers);
    const result = await callAgentChat(env, "/compare", { prompt, providers });
    return {
      structuredContent: {
        mode: "compare",
        results: result.results,
        successCount: result.successCount,
        totalCount: result.totalCount,
        durationMs: result.durationMs
      },
      content: toolText("AgentChat 已并行调用 " + result.totalCount + " 个 AI，"
        + result.successCount + " 个成功返回。"),
      _meta: { agentchat: { mode: "compare", providers } }
    };
  }

  if (name === "agentchat_open_login") {
    const providerKey = normalizeProviderKey(args?.provider);
    if (providerKey === "auto") {
      const error = new Error("Choose a specific provider to open its login page");
      error.code = "INVALID_PROVIDER_SELECTION";
      throw error;
    }
    const result = await callAgentChat(env, "/live-view", { provider: providerKey });
    return {
      structuredContent: {
        provider: providerKey,
        liveViewUrl: result.liveViewUrl,
        expiresInMs: result.expiresInMs
      },
      content: toolText("已准备 " + providerName(providerKey) + " 的 Live View 授权页面。"
        + "请手动完成登录、验证码或 MFA，然后在 AgentChat 网页中保存登录态。"
        + "\n\n授权地址：" + result.liveViewUrl)
    };
  }

  const error = new Error("Unknown tool: " + name);
  error.code = "METHOD_NOT_FOUND";
  throw error;
}

function providerName(key) {
  const provider = getProvider(key);
  return provider ? provider.name : key;
}

async function dispatchRpc(message, env, request) {
  if (!message || message.jsonrpc !== "2.0") {
    return rpcError(message?.id ?? null, -32600, "Invalid Request");
  }

  const id = message.id;
  const method = message.method;
  const params = message.params || {};

  if (method === "initialize") {
    return rpcSuccess(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {},
        resources: { read: {} }
      },
      serverInfo: {
        name: "agentchat-cloud",
        version: "0.2.0"
      },
      instructions: "AgentChat 可以调用 Gemini、Claude 和 DeepSeek 的网页版会话。需要登录时，让用户手动完成授权，不要索取密码或验证码。"
    });
  }

  if (method === "ping") return rpcSuccess(id, {});

  if (method === "tools/list") {
    return rpcSuccess(id, { tools: TOOL_DEFINITIONS });
  }

  if (method === "resources/list") {
    return rpcSuccess(id, {
      resources: [{
        uri: MCP_RESOURCE_URI,
        name: "AgentChat 多模型结果",
        description: "展示 AgentChat 单模型或并行比较结果。",
        mimeType: MCP_RESOURCE_MIME_TYPE
      }]
    });
  }

  if (method === "resources/read") {
    if (params.uri !== MCP_RESOURCE_URI) {
      return rpcError(id, -32002, "Unknown resource");
    }
    const text = await readWidget(env, request);
    return rpcSuccess(id, {
      contents: [{
        uri: MCP_RESOURCE_URI,
        mimeType: MCP_RESOURCE_MIME_TYPE,
        text
      }]
    });
  }

  if (method === "tools/call") {
    if (!params.name) return rpcError(id, -32602, "Tool name is required");
    try {
      return rpcSuccess(id, await callTool(params.name, params.arguments || {}, env, request));
    } catch (error) {
      return rpcSuccess(id, {
        isError: true,
        content: toolText(error.message || String(error)),
        structuredContent: {
          error: error.code || "INTERNAL_ERROR",
          message: error.message || String(error)
        }
      });
    }
  }

  if (typeof method === "string" && method.startsWith("notifications/")) return null;
  return rpcError(id, -32601, "Method not found");
}

export async function handleMcpRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: mcpHeaders() });
  }

  if (request.method !== "POST") {
    return new Response("AgentChat MCP endpoint: use POST /mcp", {
      status: 405,
      headers: mcpHeaders({ allow: "POST, OPTIONS" })
    });
  }

  if (!mcpTokenConfigured(env)) {
    return new Response(JSON.stringify({
      error: "MCP_API_TOKEN is not configured",
      code: "MCP_NOT_CONFIGURED"
    }), { status: 503, headers: mcpHeaders() });
  }

  if (!isAuthorized(request, env)) {
    return new Response(JSON.stringify({
      error: "Unauthorized",
      code: "UNAUTHORIZED"
    }), {
      status: 401,
      headers: mcpHeaders({ "www-authenticate": 'Bearer realm="agentchat-mcp"' })
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")), {
      status: 400,
      headers: mcpHeaders()
    });
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const message of messages) {
    const response = await dispatchRpc(message, env, request);
    if (response) responses.push(response);
  }

  if (!responses.length) return new Response(null, { status: 202, headers: mcpHeaders() });
  const payload = Array.isArray(body) ? responses : responses[0];
  return new Response(JSON.stringify(payload), { status: 200, headers: mcpHeaders() });
}

