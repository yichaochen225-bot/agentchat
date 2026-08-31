export const PROVIDERS = [
  {
    key: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/u/0/app",
    hosts: ["gemini.google.com"],
    authHosts: ["accounts.google.com", "consent.google.com"],
    authPathPatterns: [],
    cloudEnabled: true,
    settleMs: 2400,
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
    key: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    hosts: ["chatgpt.com"],
    authHosts: ["auth.openai.com"],
    authPathPatterns: [/^\/(?:auth\/)?login(?:\/|$)/i],
    cloudEnabled: true,
    settleMs: 4200,
    signedOutSelectors: [
      'a[href*="/auth/login"]',
      'button:has-text("Log in")'
    ],
    editorSelectors: [
      "#prompt-textarea",
      '[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]:not(.ProseMirror-hide)',
      'textarea:not(.wcDTda_fallbackTextarea)'
    ],
    sendSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label="发送提示"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send"]'
    ],
    sendFallback: "Enter",
    stopSelectors: [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop"]'
    ],
    responseSelectors: [
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"]',
      ".agent-turn",
      '[class*="response"]'
    ],
    minResponseLength: 5,
    stabilityMs: 10000,
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
    settleMs: 2600,
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
    key: "qwen",
    name: "Qwen",
    url: "https://www.qianwen.com/?source=tongyigw",
    hosts: ["qianwen.com", "www.qianwen.com"],
    authHosts: ["login.aliyun.com", "signin.aliyun.com"],
    authPathPatterns: [/\/(?:login|signin)(?:\/|$)/i],
    cloudEnabled: true,
    settleMs: 3400,
    signedOutSelectors: [],
    editorSelectors: [
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      "textarea",
      '[role="textbox"]',
      '[class*="editor"]'
    ],
    sendSelectors: [],
    sendFallback: "Enter",
    stopSelectors: ['[class*="stop"]', '[class*="pause-generat"]'],
    responseSelectors: [
      '[class*="message-select-wrapper-answer"]',
      '[class*="chat-answers-card-wrap"]',
      '[class*="message-select-content-inner"]',
      '[class*="message-select-content"]',
      ".chat-round.last-message-item",
      '[class*="answer"]',
      '[class*="markdown"]'
    ],
    minResponseLength: 5,
    stabilityMs: 8000,
    timeoutMs: 210000
  },
  {
    key: "kimi",
    name: "Kimi",
    url: "https://www.kimi.com/",
    hosts: ["kimi.com", "www.kimi.com"],
    authHosts: ["moonshot.cn", "kimi.moonshot.cn"],
    authPathPatterns: [/\/(?:login|signin)(?:\/|$)/i],
    cloudEnabled: true,
    settleMs: 4200,
    signedOutSelectors: [],
    editorSelectors: [
      ".chat-input-editor",
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      '[role="textbox"]'
    ],
    sendSelectors: [
      ".send-button-container",
      'button[aria-label*="发送"]',
      '[class*="send-btn"]',
      '[class*="send-button"]'
    ],
    sendFallback: "Enter",
    stopSelectors: ['button[aria-label*="停止"]', 'button[aria-label*="Stop"]', '[class*="stop"]'],
    responseSelectors: [
      '[class*="chat-content-item-assistant"]',
      '[class*="segment-content"]',
      '[class*="chat-content-list"] [class*="assistant"]',
      '[class*="assistant"]',
      '[class*="markdown"]'
    ],
    minResponseLength: 5,
    stabilityMs: 10000,
    timeoutMs: 240000
  },
  {
    key: "minimax",
    name: "MiniMax",
    url: "https://agent.minimaxi.com/",
    hosts: ["agent.minimaxi.com"],
    authHosts: ["minimaxi.com", "www.minimaxi.com"],
    authPathPatterns: [/\/(?:login|signin)(?:\/|$)/i],
    cloudEnabled: true,
    settleMs: 4200,
    signedOutSelectors: [],
    editorSelectors: [
      '[class*="ProseMirror"]',
      '[class*="tiptap"]',
      "textarea",
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[class*="editor"]'
    ],
    sendSelectors: ['[aria-label="发送消息"]', '[class*="send"]', '[class*="submit"]'],
    sendFallback: "Enter",
    stopSelectors: ['button[aria-label*="停止"]', 'button[aria-label*="Stop"]'],
    responseSelectors: [
      '[class*="message-content"]',
      '[class*="matrix-markdown"]',
      ".markdown-body",
      '[class*="answer"]',
      '[class*="response"]'
    ],
    minResponseLength: 5,
    stabilityMs: 10000,
    timeoutMs: 240000
  },
  {
    key: "mimo",
    name: "MiMo",
    url: "https://aistudio.xiaomimimo.com/",
    hosts: ["aistudio.xiaomimimo.com"],
    authHosts: ["account.xiaomi.com", "auth0.com"],
    authPathPatterns: [/\/(?:login|signin)(?:\/|$)/i],
    cloudEnabled: true,
    settleMs: 4200,
    signedOutSelectors: [],
    editorSelectors: [
      'textarea[placeholder*="有问题，尽管问"]',
      'textarea[placeholder*="Shift + Enter"]',
      "textarea",
      '[contenteditable="true"]',
      '[role="textbox"]'
    ],
    sendSelectors: [
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      '[class*="send"] button:not([disabled])'
    ],
    sendFallback: "Enter",
    stopSelectors: ['button[aria-label*="停止"]', 'button[aria-label*="Stop"]'],
    responseSelectors: [".markdown-prose", '.Markdown_markdown__', '[class*="markdown"]'],
    minResponseLength: 5,
    stabilityMs: 15000,
    timeoutMs: 240000
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    url: "https://chat.deepseek.com/",
    hosts: ["chat.deepseek.com"],
    authHosts: [],
    authPathPatterns: [/\/(?:sign[_-]?in|login)(?:\/|$)/i],
    cloudEnabled: true,
    settleMs: 2600,
    signedOutSelectors: [],
    editorSelectors: [
      'textarea[placeholder*="给 DeepSeek 发送消息"]',
      'textarea[placeholder*="DeepSeek"]',
      'textarea[placeholder*="Message"]',
      "#chat-input",
      "textarea",
      '[contenteditable="true"][role="textbox"]'
    ],
    sendSelectors: [".ds-button--primary.ds-button--filled.ds-button--circle"],
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
  }
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
    phase: provider.cloudEnabled ? "v0.3" : "planned"
  };
}
