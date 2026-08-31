# AgentChat Free Web Mode

AgentChat 是一个手机优先的免费多 AI 网页入口，不使用 AI API，也不保存 Google 密码、验证码或 Cookie。

## 使用方式

1. 在 AgentChat 输入问题。
2. 点击某个 AI 的“复制并打开”。
3. 手机会复制问题并打开 AI 官方网页。
4. 在官方网页使用 iPhone Apple 密码自动填充、Passkey 或“使用 Google 登录”。
5. 完成人机验证后，把问题粘贴进去发送。

当前入口：

- Gemini
- Claude
- DeepSeek
- 通义千问
- Kimi
- 豆包

## 安全边界

- AgentChat 不能读取 iPhone 密码库。
- 密码自动填充只由 Safari/Apple 密码在官方网页完成。
- AgentChat 不接触密码、Google 验证码、MFA 或人机验证。
- 不使用 Cloudflare 远程浏览器，因此不会因为批量启动远程浏览器触发 429。
- 网页版 AI 的登录状态由手机浏览器自己管理，不会复制到服务器。

## 部署

项目仍然可以部署到 Cloudflare Workers。`cloudflare/public` 是当前免费网页模式的前端，推送到 `master` 后由 Cloudflare Workers Builds 或 GitHub Actions 部署。

Cloudflare Workers Builds 设置：

- Root directory: `cloudflare`
- Build command: `None`
- Deploy command: `npx wrangler deploy`
- Production branch: `master`

## 重要限制

不使用 API 时，网页无法安全地跨域读取各 AI 的对话内容，也不能代替用户点击发送、处理 CAPTCHA 或绕过登录保护。因此当前设计是“复制问题 + 打开官方页面 + 手机自动填充”，这是免费网页方案中安全且可靠的边界。
