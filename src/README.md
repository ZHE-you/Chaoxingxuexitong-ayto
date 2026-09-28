# src/ —— 模块化源码（团队协作层）

油猴脚本**必须单文件分发**（`@updateURL` 直接拉取根目录的 `xuexitong.user.js`），
因此工程采用「**开发期多模块 → 构建期打包为单文件**」的结构：

```
src/
├── core/            【核心引擎】题型识别 + 作答（已迁移 ✅）
│   ├── types.js        题型定义（标签正则 / 映射 / 中文名）
│   ├── engine.js       识别引擎：控件收集 → 题目块锚定 → 题型判断 → 作答
│   └── index.js        打包入口
├── template.user.js 构建模板：承载尚未迁移的存量代码 + 构建标记位
└── (规划中，待逐块迁入)
    ├── ai/        官方 AI / 本地题库 / 外部题库 / 自定义接口
    ├── course/    视频播放控制 / 学时上报（含快速模式）
    ├── ui/        控制面板（HTML 模板 + 独立 CSS + 交互）
    └── utils/     MD5、DOM 工具、本地存储
```

## 构建流程

```bash
npm run build     # src/ → dist/xuexitong.user.js，并同步覆盖根目录 xuexitong.user.js
npm run verify    # 构建 + 产物校验 + 单元测试 + 冒烟测试（一条命令跑全套）
```

- 打包器：`esbuild-wasm`（纯 WASM，无原生依赖，克隆即可构建）。
- `build.mjs` 以 `src/core/index.js` 为入口打包为 IIFE（全局 `XT_ENGINE`），注入模板的构建标记位：
  - `==XT-BUILD:TYPES==` → 引擎包（含 `TYPE_*` 常量）
  - `==XT-BUILD:ENGINE==` → 由 `src/core` 注入（模板此块留空）
  - `==XT-BUILD:MOUNT==` → `Object.assign(app, XT_ENGINE.createEngineMethods())`

## 迁移进度

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| `core`（题型识别 / 作答） | ✅ 已迁移 | 唯一来源为 `src/core/*.js`，模板中不再保留副本 |
| `utils`（md5 / dom / storage） | ⬜ 待迁移 | 暂留在 `src/template.user.js` |
| `ui`（控制面板） | ⬜ 待迁移 | 暂留在模板 |
| `ai`（AI / 题库） | ⬜ 待迁移 | 暂留在模板 |
| `course`（播放 / 学时） | ⬜ 待迁移 | 暂留在模板 |

> 迁移策略：每次只搬一个内聚区块，从模板删除后改由 src 注入，跑通 `npm run verify` 再继续，保证随时可发布。

## 新增/迁移一个模块的步骤

1. 在 `src/<模块>/` 编写独立 ES 模块（仅用相对导入；不要引入 npm 运行时依赖）。
2. 若需注入到 `app`，导出工厂函数（如 `createXxxMethods()`），方法内部用 `this` 访问 `app` 状态。
3. 在 `src/template.user.js` 用 `==XT-BUILD:<NAME>:START/END==` 标出待替换区块（或新增 MOUNT 注入）。
4. 在 `build.mjs` 增加对应 `replaceRegion` 调用。
5. 为模块补单元测试（直接 `import`），并在 `tests/verify-v3.mjs` 的产物断言里加校验。

## 约定

- **单一来源**：同一逻辑只允许存在于一处（src 或 template），禁止两边各留一份。
- **可测性**：核心逻辑写成不依赖全局的纯函数；与 `app` 状态耦合的部分用 `this`/参数显式传入。
- **零运行时依赖**：分发包不得引入 npm 运行时依赖，构建工具仅作 devDependency。
- **产物不手改**：`xuexitong.user.js` 与 `dist/` 均为生成物，改动一律回到 `src/`。
