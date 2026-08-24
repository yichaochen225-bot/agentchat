# AgentChat Cloud v0.1

Mobile-first Cloudflare edition of AgentChat. This directory is intentionally isolated from the existing `skills/` runtime so the original local Chrome/CDP workflow can continue to track upstream.

## v0.1 scope

- Cloudflare Worker API + static PWA
- Browser Run via `@cloudflare/playwright`
- Durable Object browser/session owner
- Gemini, Claude, and DeepSeek first-pass browser adapters
- Auto fallback across the three Cloud-enabled providers
- Live View login from a phone
- Encrypted Playwright `storageState` persistence in Durable Object storage
- API bearer token gate for every browser-consuming endpoint

The remaining AgentChat providers stay visible as `planned` and can be ported after the browser/login/runtime path is proven.

## Architecture

```text
iPhone PWA
   |
   v
Cloudflare Worker (auth + API + static assets)
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

## Deploy

Requirements: a Cloudflare account with Workers and Browser Run enabled.

```bash
cd cloudflare
npm install

# Personal API gate used by the PWA.
npx wrangler secret put AGENTCHAT_API_TOKEN

# Used to derive the AES-GCM key that encrypts saved browser auth state.
# Use a long random value and do not reuse the API token.
npx wrangler secret put AUTH_STATE_KEY

npm run deploy
```

After deployment:

1. Open the Worker URL on iPhone Safari.
2. Open Settings and enter the same value used for `AGENTCHAT_API_TOKEN`.
3. Under Providers, tap **登录** for Gemini / Claude / DeepSeek.
4. Complete login in Cloudflare Live View.
5. Return to AgentChat and tap **保存登录态**.
6. Tap **检测**. A provider reporting `ready` can be used from the composer.
7. Add the site to the iPhone Home Screen if desired.

## Security model

- Provider account passwords are never stored by AgentChat Cloud.
- Browser authentication state is serialized with Playwright `storageState`, encrypted with AES-256-GCM using a key derived from the `AUTH_STATE_KEY` Worker secret, and stored inside the user's Durable Object storage.
- Browser-consuming endpoints require `Authorization: Bearer <AGENTCHAT_API_TOKEN>`.
- The token is currently stored in the PWA's localStorage for this personal-use prototype. A production multi-user version should replace this with Cloudflare Access / OAuth and per-user Durable Objects.
- CAPTCHA/MFA is not bypassed. Use Live View for manual intervention.
- Session recording is not enabled.

## Current limitations

- v0.1 is a vertical slice, not production-ready multi-user SaaS.
- Provider web UIs can change without notice. Selector failures are surfaced as `EDITOR_NOT_FOUND` / `page_changed` rather than bypassed.
- Browser Run traffic can be identified as automated traffic by sites. Cloudflare's own documentation explicitly notes that custom user agents do not change that fact.
- Streaming, DAG orchestration, file uploads, D1/R2 history, and ChatGPT MCP exposure are intentionally deferred until the three-provider path is stable.

## Local development

```bash
npm run dev
```

Browser Run is a remote Cloudflare binding. For real-browser local tests, configure Wrangler remote bindings according to current Cloudflare Browser Run documentation.
