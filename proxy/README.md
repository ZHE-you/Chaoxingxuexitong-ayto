# AI 答题中转代理

浏览器直连大模型官方接口（DeepSeek / OpenAI 等）会被 **CORS 跨域策略拦截**，所以 AI 答题必须经过一个中转代理。本目录提供两种方案，任选其一。

| 方案 | 适合场景 | 优点 | 缺点 |
|---|---|---|---|
| **本地 Node 版** `local-proxy.mjs` | 只在本机用、想立刻跑起来 | 零依赖、无需注册账号、一条命令启动 | 需要保持终端开着；换机器要重开 |
| **Cloudflare Worker 版** `cloudflare-worker.js` | 多设备用、想一直在线 | 免费额度充足、永久在线、Key 存在云端 | 需要 Cloudflare 账号，部署步骤略多 |

---

## 方案一：本地 Node 代理（推荐先试这个）

零第三方依赖，Node 20+ 自带 `fetch` 即可运行。

**推荐用法 —— 用 `.env` 存密钥，一条命令搞定：**

```bash
cp .env.example .env                 # 复制模板（本目录内操作）
# 编辑 .env，填入 UPSTREAM_KEY=sk-你的密钥
node local-proxy.mjs                 # 或回到仓库根目录执行 npm run proxy
```

这样脚本面板只需填 API 地址，**Key 留空**即可，真实密钥不会进入浏览器。

**或者用环境变量临时启动：**

```bash
# 在仓库根目录执行
UPSTREAM_KEY=sk-你的密钥 npm run proxy

# 等价于
UPSTREAM_KEY=sk-你的密钥 node proxy/local-proxy.mjs
```

看到 `AI 答题中转代理已启动` 即成功。然后在脚本面板「🤖 AI 答题 → API 设置」填：

| 项目 | 值 |
|---|---|
| API 地址 | `http://127.0.0.1:8787/v1/chat/completions` |
| API Key | **留空**（密钥已在代理端）或填 `PROXY_TOKEN` 的值 |
| 模型名 | `deepseek-chat` |

**`.env` 文件查找顺序**（已存在的环境变量优先级更高，方便临时覆盖）：

1. 当前工作目录 `./.env`
2. 本脚本同目录 `proxy/.env`
3. 用户主目录 `~/.xuexitong-proxy.env`

> 根目录 `.gitignore` 已排除 `.env` / `.env.*`，不会误提交。

**环境变量**

| 变量 | 默认 | 说明 |
|---|---|---|
| `UPSTREAM_BASE` | `https://api.deepseek.com/v1` | 上游地址，可换 OpenAI / one-api |
| `UPSTREAM_KEY` | 空 | 上游真实密钥；留空则原样转发脚本传入的 Key |
| `PROXY_TOKEN` | 空 | 访问口令，设了之后脚本的 Key 栏必须填它 |
| `PORT` | `8787` | 监听端口 |

以上变量既可写在 `.env` 文件里，也可用环境变量临时覆盖（环境变量优先级更高）。

> Windows PowerShell 临时设置写法：
> `$env:UPSTREAM_KEY="sk-xxx"; npm run proxy`
>
> （长期使用请写进 `.env`，避免密钥出现在命令行历史里）

> ⚠️ 代理默认只监听 `127.0.0.1`，不要改成 `0.0.0.0` 暴露到公网，除非同时设置了 `PROXY_TOKEN`。

> HTTPS 页面（`chaoxing.com`）向 `http://127.0.0.1` 发请求属于浏览器豁免的 mixed content，Chrome / Edge 正常放行。若你的浏览器仍拦截，请改用方案二。

---

## 方案二：Cloudflare Worker

### 1. 部署

```bash
cd proxy
npx wrangler login                  # 首次登录 Cloudflare
npx wrangler secret put UPSTREAM_KEY # 安全写入真实密钥（不落盘、不进 Git）
npx wrangler deploy                 # 部署
```

部署完成后终端会输出形如 `https://xuexitong-ai-proxy.<子域>.workers.dev` 的地址。

### 2. 配置变量

编辑 `wrangler.toml` 的 `[vars]` 段：

| 变量 | 说明 |
|---|---|
| `UPSTREAM_BASE` | 上游地址，默认 `https://api.deepseek.com/v1`；OpenAI 填 `https://api.openai.com/v1` |
| `ACCESS_TOKEN` | **强烈建议设置**，自定义随机字符串，防止 Worker 被白嫖 |
| `ALLOW_ANY_PATH` | 默认 `"0"`，只允许 `/v1/chat/completions` |

改完重新执行 `npx wrangler deploy` 生效。

### 3. 在脚本里填写

| 项目 | 值 |
|---|---|
| API 地址 | `https://<你的 Worker 域名>/v1/chat/completions` |
| API Key | `ACCESS_TOKEN` 的值（没设 token 就填真实密钥） |
| 模型名 | `deepseek-chat` |

---

## 自测代理是否工作

不用打开学习通，直接 curl 验证：

```bash
curl -X POST http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 你的KEY或TOKEN" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"1+1=?"}]}'
```

正常会返回一段 JSON，`choices[0].message.content` 就是答案。返回 `401 未授权` 说明 Key / token 不匹配，`502` 说明上游地址或密钥有问题。

---

## 安全提醒

- **不要把真实 Key 提交进 Git**：Worker 版请用 `wrangler secret put`；本地版请用环境变量，不要写死进文件。
- 建议在 upstream 控制台给这个 Key 设一个较低的额度上限，防止意外消耗。
- 本代理只做转发、**不记录不存储**任何题目内容，但请自行信任你所用的上游服务商。
