// 构建脚本：把 src/ 各模块打包为 IIFE，注入 src/template.user.js 的构建标记位，
// 产出单文件 dist/xuexitong.user.js（同时覆盖根目录 xuexitong.user.js，供 @updateURL 直接拉取），
// 并额外生成控制面板的独立预览页（preview/panel.html），方便前端/UI 迭代。
//
// 使用 esbuild-wasm（纯 WASM，无原生依赖）。若本机装有原生 esbuild，可改用之，接口一致。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild-wasm';
import { PANEL_CSS, PANEL_HTML } from './src/ui/panel.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(ROOT, 'src/template.user.js');
const OUT_DIST = path.join(ROOT, 'dist/xuexitong.user.js');
const OUT_ROOT = path.join(ROOT, 'xuexitong.user.js');
const OUT_PREVIEW = path.join(ROOT, 'preview/panel.html');

const BANNER = '// ⚠️ 本文件由 src/ 构建生成，请勿直接编辑；改动请改 src/ 后执行 npm run build。';

async function bundle(entry, globalName) {
    const result = await esbuild.build({
        entryPoints: [path.join(ROOT, entry)],
        bundle: true,
        format: 'iife',
        globalName,
        target: 'es2018',
        write: false,
        logLevel: 'silent',
    });
    return result.outputFiles[0].text.trim();
}

function replaceRegion(text, name, replacement) {
    const start = `==XT-BUILD:${name}:START==`;
    const end = `==XT-BUILD:${name}:END==`;
    const s = text.indexOf(start);
    const e = text.indexOf(end);
    if (s < 0 || e < 0) throw new Error(`模板缺少构建标记 ${name}`);
    const lineStart = text.lastIndexOf('\n', s) + 1;
    const lineEnd = text.indexOf('\n', e) + 1;
    return text.slice(0, lineStart) + replacement + '\n' + text.slice(lineEnd);
}

function writePanelPreview() {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>控制面板预览 · 学习通刷课脚本</title>
<style>
  html,body{margin:0;height:100%;}
  body{background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;}
  .preview-note{position:fixed;left:20px;top:16px;max-width:360px;font-size:13px;color:#64748b;line-height:1.7;}
  .preview-note h1{font-size:16px;color:#1f2937;margin:0 0 6px;}
  .preview-note code{background:#e2e8f0;padding:1px 5px;border-radius:4px;font-size:12px;}
${PANEL_CSS}
</style>
</head>
<body>
  <div class="preview-note">
    <h1>控制面板预览</h1>
    这是脚本控制面板的独立预览（与线上完全同源：<code>src/ui/panel.js</code>）。<br>
    可拖动右上角面板、收起展开、调整窗口大小观察是否被裁切。<br>
    <b>此文件为构建产物</b>，改动请编辑 <code>src/ui/panel.js</code>。
  </div>
${PANEL_HTML}
</body>
</html>
`;
    fs.mkdirSync(path.dirname(OUT_PREVIEW), { recursive: true });
    fs.writeFileSync(OUT_PREVIEW, html, 'utf8');
    return html.length;
}

async function main() {
    await esbuild.initialize({ worker: false });

    const engine = await bundle('src/core/index.js', 'XT_ENGINE');
    const ui = await bundle('src/ui/index.js', 'XT_UI');

    let out = fs.readFileSync(TEMPLATE, 'utf8');

    // 1) 题型定义区块 → 核心引擎包（含 TYPE_* 常量）
    out = replaceRegion(out, 'TYPES', engine);

    // 2) UI 包（面板 CSS/HTML）
    out = replaceRegion(out, 'UI-BUNDLE', ui);

    // 3) 识别引擎方法区块 → 由 src/core 注入（此处留说明）
    out = replaceRegion(out, 'ENGINE', '            // 题目识别引擎方法由 src/core 注入，见文件末尾 Object.assign(app, XT_ENGINE.createEngineMethods())');

    // 4) mount 标记 → 实际注入调用
    out = out.replace('        // ==XT-BUILD:MOUNT==',
        '        // 注入 src/core 迁移过来的识别引擎方法\n' +
        '        try { Object.assign(app, XT_ENGINE.createEngineMethods()); } catch (e) { console.error(\'[构建] 引擎注入失败：\' + e.message); }');

    // 5) 生成文件横幅
    out = out.replace('// ==/UserScript==\n', '// ==/UserScript==\n' + BANNER + '\n');

    fs.mkdirSync(path.dirname(OUT_DIST), { recursive: true });
    fs.writeFileSync(OUT_DIST, out, 'utf8');
    fs.writeFileSync(OUT_ROOT, out, 'utf8');

    const previewLen = writePanelPreview();

    const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
    console.log(`构建完成：dist/xuexitong.user.js（${kb} KB）`);
    console.log('已同步覆盖根目录 xuexitong.user.js（供 @updateURL 拉取）');
    console.log(`已生成控制面板预览：preview/panel.html（${(previewLen / 1024).toFixed(1)} KB）`);
}

main().catch((e) => { console.error('构建失败：' + e.message); process.exit(1); });
