# 学习通自动刷课脚本 V3 稳定版

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen.svg)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-3.3.0-orange.svg)](package.json)
[![Build](https://github.com/USERNAME/REPO/actions/workflows/verify.yml/badge.svg)](https://github.com/USERNAME/REPO/actions/workflows/verify.yml)

> ⚠️ **免责声明**：本项目仅用于脚本调试、前端自动化研究与页面行为分析，请遵守目标平台（学习通 / 超星）的使用规定，勿用于违规用途。因使用本脚本产生的任何后果由使用者自行承担。

自动播放学习通课程视频、视频结束后自动切换到下一小节，并在页面结构异常（章节测验、无视频课件等）时安全停止，避免循环跳转。

## ✨ 特性

- **自动播放**：识别 iframe 内的真实 `<video>` 元素并自动 `play()`
- **断点恢复**：播放被中断或卡住时自动恢复（含静音兜底）
- **自动续播**：视频结束后在课程目录树中定位并点击下一小节
- **学习步骤接管**：从“学习目标”步骤自动切到“视频”步骤；手动点击“视频”页签后自动重新接管
- **章节测验保护**：受限跳转（最多 3 次），防止页面循环
- **无视频页安全停止**：默认不自动跳过无法识别的课件页，避免触发平台“任务未完成”提示（可手动或配置开启）
- **单源码构建**：`v3_optimized.js` 为唯一实现，油猴脚本由构建脚本生成，保证两份入口始终同步

## 📁 目录结构

```text
.
├── v3_optimized.js          # 控制台直接执行版（唯一源码）
├── v3_optimized.user.js     # Tampermonkey 油猴版（由构建脚本生成）
├── scripts/
│   └── build-userscript.mjs # 根据控制台版生成油猴版
├── tests/
│   └── verify-v3.mjs        # 语法校验 + 双入口一致性校验
├── img/                     # 文档截图
├── archive/                 # 历史版本（v2 / 旧版）及旧文档
│   ├── v2.js
│   ├── xuexitong.js
│   └── README_v2.md
├── ISSUES_REVIEW.md         # 历史 issue 复盘与优化记录
├── package.json
├── LICENSE
└── .github/workflows/       # CI：构建 + 校验
```

## 🚀 使用方法

### 方法一：控制台执行（推荐快速验证）

1. 打开学习通课程播放页
2. 按 `F12` 打开开发者工具，进入 `Console` 面板
3. 复制 [`v3_optimized.js`](v3_optimized.js) 全部内容，粘贴并执行
4. 首次执行后，可在控制台使用以下命令重新接管：

```javascript
app.run();        // 重新初始化并播放（刷新页面 / 手动切换小节后调用）
app.nextUnit();   // 手动切换到下一小节
```

### 方法二：Tampermonkey 油猴

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 导入 [`v3_optimized.user.js`](v3_optimized.user.js)（或开启“允许从…安装”后直接拖入）
3. 确认脚本已启用，刷新学习通播放页面即可自动运行

> 油猴版通过 `@require` 加载 jQuery，无需手动引入；控制台版会在运行时自动注入 jQuery。
> 发布到 GitHub 后，可在 `scripts/build-userscript.mjs` 的元数据里补充 `@updateURL` / `@downloadURL`（指向仓库的 raw 文件地址），即可开启油猴自动更新。

## ⚙️ 配置说明

脚本顶部 `configs` 可调整行为（修改 `v3_optimized.js` 后需重新构建油猴版）：

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

将 `autoAdvanceNoVideo` 改为 `true` 可让脚本自动跳过无视频小节（请先确认课程结构安全）。

## 🔧 开发与校验

本仓库要求 **Node.js ≥ 20.11**（构建脚本使用了 `import.meta.dirname`）。

```bash
# 安装依赖（本仓库零运行时依赖，仅用 Node 内置模块）
node --version

# 重新生成油猴版
npm run build        # 等价于 node scripts/build-userscript.mjs

# 语法校验 + 双入口一致性校验
npm test             # 等价于 node tests/verify-v3.mjs
```

CI（`.github/workflows/verify.yml`）在每次 push / PR 时自动执行上述构建与校验。

## ❓ 常见问题

**Q：为什么有时控制台会报 `AbortError`？**
`The play() request was interrupted by a call to pause()` 通常不是视频损坏，而是页面初始化或平台重置播放状态时产生的瞬时中断。脚本会优先尝试恢复播放，而非判定失败。

**Q：为什么日志会重复出现？**
同一页面反复粘贴执行脚本，会导致监听器与定时器叠加。请刷新页面后只执行一次；使用油猴版时不要再在控制台重复粘贴。

**Q：为什么“无视频/课件”页不会自动跳过？**
默认 `autoAdvanceNoVideo = false`，避免在课件未完成时反复触发平台的“当前章节还有任务未完成”提示。确认安全后可手动 `app.nextUnit()` 或开启该配置。

**Q：倍速 / 任务点不被接受？**
平台可能服务端强制倍速与完成情况，本脚本不尝试绕过，这属于平台限制。

## 📜 历史版本

旧版实现（v2 及更早）已归档在 [`archive/`](archive/) 目录，仅供对照参考，不再维护。详细的问题复盘见 [`ISSUES_REVIEW.md`](ISSUES_REVIEW.md)。

## 📄 许可证

[MIT](LICENSE) © 2026 xuexitongScript contributors
