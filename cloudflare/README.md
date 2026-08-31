# AgentChat Cloud · iPhone PWA

AgentChat Cloud 把本地 AgentChat 的网页 AI 编排能力搬到 Cloudflare Browser Run。iPhone 只负责控制、登录和查看结果，远程浏览器负责打开 AI 官方网页、发送任务并读取回答。

当前云端 Provider：

- Gemini
- ChatGPT
- Claude
- Qwen
- Kimi
- MiniMax
- MiMo
- DeepSeek

## 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yichaochen225-bot/agentchat/tree/master/cloudflare)

Cloudflare 会从 `cloudflare/` 子目录创建 Worker、Durable Object、Browser Run binding 和静态 PWA 资源。部署页会要求配置运行时 Secret：

- `AGENTCHAT_API_TOKEN`：至少 32 个字符的私有随机字符串。部署后在 iPhone AgentChat 设置中输入同一个值，用来保护控制 API。
- `AUTH_STATE_KEY`：另一个不同的至少 32 字符随机字符串，用来 AES-GCM 加密保存浏览器登录状态。
- `MCP_API_TOKEN`：可选，仅使用 MCP 时设置。

这些 Secret 不是 Google、OpenAI、Anthropic 或其他 AI 的账号密码。

## iPhone 使用

1. 打开部署完成后的 `*.workers.dev` 地址。
2. 输入部署时设置的 `AGENTCHAT_API_TOKEN`。
3. 打开“账户”，对需要登录的 AI 点击“登录”。
4. 在远程官方网页完成登录、MFA、验证码或其他人类验证。
5. 返回 AgentChat，检测状态并点击“加密保存当前登录”。
6. 在“询问”中选择“已登录会话”或“访客模式”，然后指定一个 AI、自动 fallback，或依次询问全部 AI。
7. Safari → 共享 → 添加到主屏幕，即可作为 PWA 独立运行。

## Passkey 与安全边界

- AgentChat 不读取 iPhone 密码库，也不会获得 Passkey 私钥。
- iPhone 上的设备 Passkey 不能直接注入 Cloudflare 的远程浏览器会话。
- 如果 AI/Google 登录页提供跨设备 Passkey 流程，可以使用官方流程；否则请使用该登录页提供的其他官方认证方式。
- CAPTCHA、人类验证和 MFA 必须由用户本人完成；项目不尝试绕过它们。
- 登录完成后，AgentChat 只持久化浏览器 storage state，并使用 `AUTH_STATE_KEY` 加密后写入 Durable Object storage。
- PWA 中的 AgentChat 访问令牌只存放在 `sessionStorage`，关闭会话后需要重新输入。

## Cloudflare 免费额度

Browser Run 可用于 Workers Free 和 Paid。Free 当前包含每天 10 分钟 Browser Run 时间和最多 3 个并发 Browser Sessions；长时间运行 8 个 AI 很容易消耗完免费额度。Paid 当前包含每月 10 小时，超出部分按 Browser Run 定价计费。

项目复用一个 Browser 实例并为不同 Provider 开标签页，以降低启动频率和并发开销。

## Cloudflare Workers Builds

如果不使用上面的一键部署，也可以把当前 GitHub 仓库直接连接到 Cloudflare Workers Builds：

- Repository: `yichaochen225-bot/agentchat`
- Root directory: `cloudflare`
- Build command: 留空
- Deploy command: `npx wrangler deploy`
- Production branch: `master`

GitHub Actions 仍会执行语法检查和单元测试。如果仓库配置了 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`，Actions 也会直接部署；没有配置时只跳过部署步骤，不会把测试标成失败。

## 本地检查

```bash
cd cloudflare
npm install
npm run check
```
