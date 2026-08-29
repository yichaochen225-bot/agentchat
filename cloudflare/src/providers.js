export const PROVIDERS = [
  {
    key: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/u/0/app",
    hosts: ["gemini.google.com"],
    authHosts: ["accounts.google.com", "consent.google.com"],
    authPathPatterns: [],
    cloudEnabled: true,
    signedOutSelectors: [
      'a[href*="accounts.google.com/ServiceLogin"]',
      'a[href*="accounts.google.com/signin"]',
      'a[href*="accounts.google.com/AccountChooser"]'
    ],
    editorSelectors: [
      ".ql-editor",
      '[contenteditable="true"][role="textbox"]',
      "rich-textarea"
    ],
    sendSelectors: [
      'button[aria-label*="傳送"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]'
    ],
    sendFallback: "ControlOrMeta+Enter",
    stopSelectors: [
      'button[aria-label*="停止"]',
      'button[aria-label*="Stop"]'
    ],
    responseSelectors: [
      ".model-response-text, message-content",
      ".markdown.markdown-main-panel"
    ],
    minResponseLength: 10,
    stabilityMs: 8000,
    timeoutMs: 240000
  },
  {
    key: "claude",
    name: "Claude",
    url: "https://claude.ai/",
    hosts: ["claude.ai"],
    authHosts: ["auth.anthropic.com"],
    authPathPatterns: [/^\/login(?:\/|$)/i],
    cloudEnabled: true,
    signedOutSelectors: [],
    editorSelectors: [
      ".ProseMirror",
      'div[role="textbox"]',
      '[contenteditable="true"]'
    ],
    sendSelectors: [
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      'button[aria-label="Send"]'
    ],
    sendFallback: "Enter",
    stopSelectors: [
      'button[aria-label*="Stop"]',
      '[data-testid="stop-button"]'
    ],
    responseSelectors: [
      ".prose",
      '[class*="font-claude-message"]',
      '[class*="msg-content"]',
      '[class*="msg-assistant"]'
    ],
    minResponseLength: 5,
    stabilityMs: 8000,
    timeoutMs: 180000
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    url: "https://chat.deepseek.com/",
    hosts: ["chat.deepseek.com"],
    authHosts: [],
    authPathPatterns: [/\/(?:sign[_-]?in|login)(?:\/|$)/i],
    cloudEnabled: true,
    signedOutSelectors: [],
    editorSelectors: [
      'textarea[placeholder*="给 DeepSeek 发送消息"]',
      'textarea[placeholder*="DeepSeek"]',
      'textarea[placeholder*="Message"]',
      "#chat-input",
      "textarea",
      '[contenteditable="true"][role="textbox"]'
    ],
    sendSelectors: [
      ".ds-button--primary.ds-button--filled.ds-button--circle"
    ],
    sendFallback: "Enter",
    stopSelectors: [
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]'
    ],
    responseSelectors: [
      ".ds-markdown",
      ".ds-assistant-message-main-content",
      '[class*="ds-markdown"]',
      '[class*="markdown"]'
    ],
    minResponseLength: 5,
    stabilityMs: 10000,
    timeoutMs: 180000
  },
  { key: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", cloudEnabled: false },
  { key: "qwen", name: "Qwen", url: "https://www.qianwen.com/?source=tongyigw", cloudEnabled: false },
  { key: "kimi", name: "Kimi", url: "https://www.kimi.com/", cloudEnabled: false },
  { key: "minimax", name: "MiniMax", url: "https://agent.minimaxi.com/", cloudEnabled: false },
  { key: "chatglm", name: "ChatGLM", url: "https://chatglm.cn/main/alltoolsdetail?lang=zh", cloudEnabled: false },
  { key: "doubao", name: "Doubao", url: "https://www.doubao.com/chat/", cloudEnabled: false },
  { key: "mimo", name: "MiMo", url: "https://aistudio.xiaomimimo.com/", cloudEnabled: false }
];

export const CLOUD_PROVIDERS = PROVIDERS.filter((provider) => provider.cloudEnabled);

export function getProvider(key) {
  return PROVIDERS.find((provider) => provider.key === key) || null;
}

export function publicProvider(provider) {
  return {
    key: provider.key,
    name: provider.name,
    cloudEnabled: Boolean(provider.cloudEnabled),
    phase: provider.cloudEnabled ? "v0.2" : "planned"
  };
}

