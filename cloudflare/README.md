# AgentChat Cloud v0.2

AgentChat Cloud is a mobile-first multi-AI workspace powered by Cloudflare Browser Run. It lets the user manually authorize supported AI web sessions, send one prompt through a selected or automatic route, and compare up to three providers in parallel.

## Architecture

```text
iPhone PWA
   |
   v
Cloudflare Worker (auth + API + static assets + MCP)
   |
   v
AgentChatBrowser Durable Object
   |
   v
Cloudflare Browser Run / Playwright
   |
   +--> Gemini
   +--> Claude
   +--> DeepSeek
```

## What changed in v0.2

- Added auto and parallel compare modes for Gemini, Claude, and DeepSeek.
- Added local-only history and copy/clear result actions.
- Improved mobile navigation and connection/authorization status cards.
- Kept login user-controlled: the user completes login, password, CAPTCHA, and MFA in Cloudflare Live View; AgentChat only stores the encrypted browser session state.
- Added a token-protected `/mcp` endpoint and an MCP Apps-compatible result widget for a private ChatGPT Developer Mode connection.

## Supported cloud providers

The current Cloudflare Browser Run implementation enables:

- Google Gemini
- Anthropic Claude
- DeepSeek

Other providers remain listed in the provider manifest but are not enabled until their web flow has been implemented and tested.

## Run locally

```bash
cd cloudflare
npm install
npm run dev
```

The browser dashboard is served at the Wrangler local URL. The `/api/*` routes are protected by the site API token configured in `wrangler.jsonc` or a deployment secret.

## Deploy

Requirements: a Cloudflare account with Workers and Browser Run enabled.

```bash
cd cloudflare
npm install
npx wrangler secret put AGENTCHAT_API_TOKEN
npx wrangler secret put AUTH_STATE_KEY
npx wrangler secret put MCP_API_TOKEN
npm run deploy
```

Use `AGENTCHAT_API_TOKEN` for the browser dashboard and `AUTH_STATE_KEY` as a long random secret for encrypted browser state. `MCP_API_TOKEN` is separate from both; keep it private and pass it as a Bearer token when configuring a private MCP connector.

After deployment, open the Worker URL, enter the dashboard token in Settings, use each Provider's **登录** button, complete the login in Live View, then tap **保存登录态** and **检测**.

## ChatGPT App / MCP connection

The repository now contains a developer-mode MCP scaffold:

- endpoint: `POST /mcp`
- UI resource: `ui://agentchat/result/v1.html`
- tools: list providers, run one AI, compare multiple AIs, and open a manual authorization page
- widget: `/mcp-widget.html`

The endpoint is intentionally token-protected and stateless for a personal prototype. Before a public ChatGPT App launch, replace the simple shared token and JSON-RPC handler with OAuth 2.1 and a production Streamable HTTP MCP transport, then configure the HTTPS public endpoint in ChatGPT Developer Mode.

When `agentchat_open_login` is used, the user must finish the login flow themselves. Do not send passwords, verification codes, cookies, or API keys to the MCP tool.

## Security notes

- Browser auth state is encrypted before it is stored in the Durable Object.
- The frontend keeps the dashboard token in session storage and does not send it to the MCP endpoint.
- MCP access requires `MCP_API_TOKEN`; never commit the secret to Git.
- Provider site changes can break selectors, so run a real login/status check after enabling each provider.
- This remains a personal prototype, not a multi-user SaaS. Add Cloudflare Access/OAuth and per-user Durable Objects before sharing it broadly.

## Local development

```bash
cd cloudflare
npm install
npm run dev
```

Browser Run is a remote Cloudflare binding. For real-browser local tests, configure Wrangler remote bindings according to current Cloudflare Browser Run documentation.
