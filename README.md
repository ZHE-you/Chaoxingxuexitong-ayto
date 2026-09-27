# 学习通自动刷课脚本（单文件版）

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen.svg)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-3.4.3-orange.svg)](package.json)
[![Build](https://github.com/ZHE-you/Chaoxingxuexitong-ayto/actions/workflows/verify.yml/badge.svg)](https://github.com/ZHE-you/Chaoxingxuexitong-ayto/actions/workflows/verify.yml)

> ⚠️ **免责声明**：本项目仅用于脚本调试、前端自动化研究与页面行为分析，请遵守目标平台（学习通 / 超星）的使用规定，勿用于违规用途。因使用本脚本产生的任何后果由使用者自行承担。

自动播放学习通课程视频、视频结束后自动切换到下一小节，并在页面结构异常（章节测验、无视频课件等）时安全停止，避免循环跳转。

**整个项目只有一个脚本文件 [`xuexitong.user.js`](xuexitong.user.js)**：它既能直接粘贴到浏览器控制台运行，也能作为 Tampermonkey 油猴脚本导入（文件顶部的 `// ==UserScript==` 元信息头在控制台里只是注释，不影响运行）。

## ✨ 特性

- **自动播放**：识别 iframe 内的真实 `<video>` 元素并自动 `play()`
- **断点恢复**：播放被中断或卡住时自动恢复（含静音兜底）
- **自动续播**：视频结束后在课程目录树中定位并点击下一小节
- **学习步骤接管**：从“学习目标”步骤自动切到“视频”步骤；手动点击“视频”页签后自动重新接管
- **章节测验保护**：受限跳转（最多 3 次），防止页面循环
- **无视频页安全停止**：默认不自动跳过无法识别的课件页，避免触发平台“任务未完成”提示（可手动或配置开启）
- **单文件零构建**：无需任何构建步骤，一份源码同时服务于控制台与油猴

## 📁 目录结构

```text
.
├── xuexitong.user.js     # 唯一脚本文件：控制台 + 油猴通用
├── tests/
│   └── verify-v3.mjs     # 语法校验（node --check）
├── proxy/                # AI 答题中转代理（解决浏览器跨域 + 隐藏 Key）
│   ├── README.md             # 部署与使用说明
│   ├── local-proxy.mjs       # 本地 Node 版（零依赖，npm run proxy）
│   ├── cloudflare-worker.js  # Cloudflare Worker 版
│   └── wrangler.toml         # Worker 部署配置模板
├── img/                  # 文档截图与赞赏码
├── archive/              # 历史版本（v2 / 旧版）及旧文档
│   ├── v2.js
│   ├── xuexitong.js
│   └── README_v2.md
├── ISSUES_REVIEW.md      # 历史 issue 复盘与优化记录
├── package.json
├── LICENSE
└── .github/workflows/    # CI：单文件语法校验
```

## 🚀 使用方法

### 方法一：控制台执行（推荐快速验证）

1. 打开学习通课程播放页
2. 按 `F12` 打开开发者工具，进入 `Console` 面板
3. 复制 [`xuexitong.user.js`](xuexitong.user.js) 的**全部内容**，粘贴并执行
4. 首次执行后，可在控制台使用以下命令重新接管：

```javascript
app.run();        // 重新初始化并播放（刷新页面 / 手动切换小节后调用）
app.nextUnit();   // 手动切换到下一小节
```

> 文件顶部的 `// ==UserScript== ... // ==/UserScript==` 只是注释，粘贴进控制台会被忽略，无需删改。

### 方法二：Tampermonkey 油猴

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 将 [`xuexitong.user.js`](xuexitong.user.js) 拖入浏览器窗口，或在其管理面板“添加新脚本”里粘贴保存
3. 确认脚本已启用，刷新学习通播放页面即可自动运行

> 脚本**复用页面自带的 jQuery**（学习通页面已内置），不会额外引入第二个 jQuery；仅当页面完全没有 jQuery 时才动态注入一份作为兜底。

## 🎛️ 控制面板

脚本启动后会在页面**右上角**自动生成一个悬浮控制台（无需任何配置），可直接在页面上操作，不必再敲命令：

- **状态 / 章节信息**：实时显示「运行中 / 已暂停 / 空闲」以及当前所在「第 X 章 第 Y 节 · 标题」。
- **播放倍速**：滑块范围 `0.5x – 4x`，**拖动即时生效**，会同步应用到正在播放的视频，并自动记住你的选择。
- **开始 / 继续**：首次点击开始刷课；暂停后点击则从当前进度继续。
- **暂停**：暂停视频并**停止自动续播**（之前脚本会一直尝试把暂停的视频拉起来播，现在由你掌控）。
- **下一节**：手动切换到下一个视频 / 章节。
- **重新运行**：重置状态并重新初始化（相当于刷新页面后重来）。
- **停止**：彻底停止脚本监控并暂停视频。
- **开关**：`自动播放`、`无视频自动跳过`、`静音播放` 三个勾选项，改动后即时生效并保存。
- 面板顶部蓝条可**拖动**改变位置，右上角 `—` 可**收起 / 展开**。

> `静音播放` 开启后，所有视频（包括自动播放、保活续播、暂停后继续）都会静音，勾选可**立即**应用到正在播放的视频；关闭则恢复声音。
>
> 倍速、自动播放、无视频跳过、静音四项配置会通过 `localStorage` 在本机保存，下次打开同一站点时自动恢复。
>
> 若不想看到面板，可在控制台执行 `app.destroy()` 移除它（同时停止脚本）。

## 🤖 AI 答题（题库优先 + AI 兜底）

针对**视频中途插入题**与**章节小测验**，控制台面板里可开启自动答题。思路参考 [Mortal004/Xuexitong_shuake](https://github.com/Mortal004/Xuexitong_shuake)：先在本地题库检索，搜不到再调用大模型兜底。

- **启用**：展开面板「🤖 AI 答题」→ 勾选「启用自动答题」。脚本每 2.5 秒扫描题目（主页面 + 同域 iframe），命中即答。
- **题库优先**：用「导入题库」载入整理好的 `JSON`（`{"题目":"答案"}` 或 `[{"q":"...","a":"..."}]`）；答对/搜到的题会沉淀进「导出题库」，下次直接命中，省 token。题库经 `localStorage` 保存。
- **AI 兜底**：题库未命中时把题目与选项发给大模型取答案。在「API 设置」里填：
**🔌 必须先跑一个中转代理（关键）**

浏览器直连大模型官方接口（DeepSeek / OpenAI）会被 **CORS 跨域策略拦截**，因此 AI 答题必须经过中转代理。本仓库已在 [`proxy/`](proxy/README.md) 提供开箱即用的两种方案：

```bash
# 最省事：本地 Node 代理（零依赖，Node 20+ 自带 fetch）
UPSTREAM_KEY=sk-你的密钥 npm run proxy
```

启动后在面板「API 设置」里填：

| 项目 | 值 |
|---|---|
| API 地址 | `http://127.0.0.1:8787/v1/chat/completions` |
| API Key | **建议留空**（密钥写在 `.env` 里，详见下方密钥章节） |
| 模型名 | `deepseek-chat` |

想多设备 / 长期在线用，改用 Cloudflare Worker 版（免费额度足够，Key 存云端）：

```bash
cd proxy
npx wrangler login
npx wrangler secret put UPSTREAM_KEY
npx wrangler deploy
```

部署后 API 地址填 `https://<你的 Worker 域名>/v1/chat/completions`。详细环境变量、自测 curl 命令与安全提醒见 [`proxy/README.md`](proxy/README.md)。

- **API 设置**项说明：
  - **API 地址**：OpenAI 兼容的 `/v1/chat/completions` 端点，即上面代理的地址。
  - **API Key**：**建议留空**（见下方「密钥怎么填」）。留空后由代理注入真实密钥，浏览器里不存任何密钥。
  - **模型名**：如 `deepseek-chat`（默认）。

## 🔑 密钥怎么填（三种方式，按安全程度排序）

> ⚠️ **先说风险**：脚本里填的 Key 会以**明文**存在浏览器的 `localStorage`。同一页面上运行的任何脚本、第三方浏览器扩展、以及能接触这台电脑的人都能读到它。**不要在学校机房 / 公用电脑上使用方式三。**

| 方式 | 安全 | 浏览器里存的是什么 | 适用场景 |
| --- | --- | --- | --- |
| **① 密钥只存在代理端**（⭐ 推荐） | 最高 | **什么都不存** | 只在本机用 |
| **② 代理存真 Key + 浏览器存口令** | 高 | 仅一个可随时作废的口令 | 多人 / 多设备共用一个代理 |
| **③ 直接填真实密钥** | 低 | 真实密钥明文 | 临时测试，用完即删 |

### 方式 ①：密钥只存在代理端（推荐）

把真实密钥写进配置文件，脚本面板的 Key **留空**：

```bash
cp proxy/.env.example proxy/.env      # 复制模板
# 编辑 proxy/.env，填入 UPSTREAM_KEY=sk-你的密钥
node proxy/local-proxy.mjs            # 直接启动，无需再敲环境变量
```

`.env` 查找顺序：`当前目录/.env` → `proxy/.env` → `~/.xuexitong-proxy.env`（已存在的环境变量优先，方便临时覆盖）。

此时脚本面板只需填 **API 地址**，Key **留空**即可 —— 代理收到请求后会自己加上真实密钥再转发。

> 根目录 `.gitignore` 已排除 `.env` / `.env.*`（但保留 `.env.example`），不会被误提交。

### 方式 ②：代理存真 Key，浏览器只填口令

在 `proxy/.env` 里同时写：

```ini
UPSTREAM_KEY=sk-你的真实密钥
PROXY_TOKEN=一串随机字符串        # 例如 openssl rand -hex 16 生成
```

脚本面板「API Key」填**那个随机字符串**。这样即使口令泄露，真实 Key 仍在代理端；换一个 `PROXY_TOKEN` 就能立即作废访问权限。

### 方式 ③：直接填真实密钥（临时用）

面板 Key 栏直接填 `sk-...`，用完记得清空：

```javascript
// 在控制台执行，彻底清除已存的密钥
app.configs.aiApiKey = ''; localStorage.removeItem('xtAi_apiKey');
```

### 🔒 无论用哪种方式都建议做

1. 在上游控制台给这个密钥设一个**较低的月度额度上限**，防止意外消耗
2. **不要**把密钥写进任何会被 git 提交的文件（`wrangler.toml` 的 vars、`*.js` 源码里）
3. 若曾经把密钥提交到 GitHub → 立即到上游控制台**吊销该密钥**（改代码救不回来，Git 历史仍在）
- **手动触发**：点「立即扫描」可立刻扫一轮（调试用）。
- **题型支持**：单选 / 判断 / 多选（自动点选选项）、填空 / 问答（填入文本）。匹配失败时控制台会打印题目与答案，便于手动修正后加入题库。
- **范围限定**：本功能**只处理视频中途题与章节小测验**，不触碰作业与考试，规避风险。

> 题库与 AI 答案仅供参考，请自行判断正确性；答题功能需在真实学习通页面验证题目选择器（页面结构可能随版本变化）。

## ⚙️ 配置说明

脚本顶部 `configs` 可调整行为（直接修改 `xuexitong.user.js` 后重新执行 / 重新导入即可）：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `playbackRate` | `1.5` | 播放倍速（平台可能服务端限制最高倍速） |
| `autoplay` | `true` | 加载完成后是否自动播放 |
| `retryInterval` | `2000` | 播放失败后的重试间隔（毫秒） |
| `maxRetries` | `10` | 最大重试次数 |
| `videoCheckInterval` | `1000` | 视频状态轮询间隔（毫秒） |
| `guardNoProgressMs` | `7000` | 判定“卡住无进度”的阈值（毫秒） |
| `guardResumeCooldownMs` | `1500` | 恢复播放的冷却时间（毫秒） |
| `autoAdvanceNoVideo` | `false` | 是否在无视频小节自动切换（默认关闭，安全起见） |
| `muted` | `false` | 是否静音播放（控制台「静音播放」开关对应此值） |
| `aiEnabled` | `false` | 是否启用 AI 自动答题 |
| `aiApiBase` | `https://api.deepseek.com/v1/chat/completions` | 大模型接口地址（建议填中转代理，官方接口禁跨域） |
| `aiApiKey` | `''` | 大模型 API Key（明文存本机 localStorage，公共电脑慎用） |
| `aiModel` | `deepseek-chat` | 模型名 |

将 `autoAdvanceNoVideo` 改为 `true` 可让脚本自动跳过无视频小节（请先确认课程结构安全）。

## 🔧 校验

本仓库零运行时依赖（仅用 Node 内置模块），要求 **Node.js ≥ 20.11**。修改脚本后可用以下命令做语法校验：

```bash
npm test            # 等价于 node tests/verify-v3.mjs
npm run proxy       # 启动本地 AI 答题中转代理（详见 proxy/README.md）
```

CI（`.github/workflows/verify.yml`）在每次 push / PR 时自动执行该校验。

## ❓ 常见问题

**Q：为什么有时控制台会报 `AbortError`？**
`The play() request was interrupted by a call to pause()` 通常不是视频损坏，而是页面初始化或平台重置播放状态时产生的瞬时中断。脚本会优先尝试恢复播放，而非判定失败。

**Q：为什么日志会重复出现？**
同一页面反复粘贴执行脚本，会导致监听器与定时器叠加。请刷新页面后只执行一次；使用油猴版时不要再在控制台重复粘贴。

**Q：为什么“无视频/课件”页不会自动跳过？**
默认 `autoAdvanceNoVideo = false`，避免在课件未完成时反复触发平台的“当前章节还有任务未完成”提示。确认安全后可手动 `app.nextUnit()` 或开启该配置。

**Q：控制台一直刷 `$.getNetScroll is not a function` 怎么办？**
这是**重复引入 jQuery** 造成的：学习通页面自带 jQuery（1.7.2），并在其上挂载了页面自己的插件（如 `$.getNetScroll`）。一旦再引入第二份 jQuery，页面的 `window.$` / `window.jQuery` 会被替换成新版本，页面插件随之丢失，页面代码每次调用就抛错并持续刷屏。
本脚本自 **v3.3.1** 起已改为**复用页面自带 jQuery**、不再引入第二份 jQuery。若你仍在旧版本上遇到该报错，请更新脚本；另外请勿在控制台手动额外加载 jQuery，刷新页面后只执行脚本本身即可。

**Q：AI 答题报 `Failed to fetch` / CORS 错误怎么办？**
这是浏览器跨域策略拦截，**官方 DeepSeek / OpenAI 接口不允许浏览器直连**，必须走中转代理。请按 [AI 答题](#-ai-答题题库优先--ai-兜底) 小节的说明启动本地代理（`npm run proxy`）或部署 Cloudflare Worker，再把「API 地址」改成代理地址。若本地代理已启动仍失败：① 确认终端还开着；② 用 `curl` 自测代理本身是否通（命令见 `proxy/README.md`）；③ 少数浏览器会拦截 HTTPS 页面向 `http://127.0.0.1` 的请求，此时改用 Worker 版。返回 `401 未授权` 则是 Key / 访问口令不匹配。

**Q：为什么倍速 / 任务点不被接受？**
平台可能服务端强制倍速与完成情况，本脚本不尝试绕过，这属于平台限制。

## 📜 历史版本

旧版实现（v2 及更早）已归档在 [`archive/`](archive/) 目录，仅供对照参考，不再维护。详细的问题复盘见 [`ISSUES_REVIEW.md`](ISSUES_REVIEW.md)。

## ❤️ 支持作者

本项目完全免费开源，脚本会持续跟进学习通页面结构的变化。如果它帮你省下了时间，欢迎请作者喝杯咖啡 ☕，你的支持是持续维护的最大动力。

<div align="center">

<img src="img/donate.jpg" alt="赞赏码" width="260">

**感谢支持**

</div>

> 赞赏纯属自愿，与功能使用无关；不开赞赏同样可以使用全部功能。

## 📄 许可证

[MIT](LICENSE) © 2026 夏至子 ([ZHE-you](https://github.com/ZHE-you))
