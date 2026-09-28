// 构建脚本：把 src/core 打包为 IIFE，注入 src/template.user.js 的构建标记位，
// 产出单文件 dist/xuexitong.user.js（同时覆盖根目录 xuexitong.user.js，供 @updateURL 直接拉取）。
//
// 使用 esbuild-wasm（纯 WASM，无原生依赖）。若本机装有原生 esbuild，可改用之，接口一致。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild-wasm';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(ROOT, 'src/template.user.js');
const OUT_DIST = path.join(ROOT, 'dist/xuexitong.user.js');
const OUT_ROOT = path.join(ROOT, 'xuexitong.user.js');

const BANNER = '// ⚠️ 本文件由 src/ 构建生成，请勿直接编辑；改动请改 src/ 后执行 npm run build。';

async function bundleEngine() {
    const result = await esbuild.build({
        entryPoints: [path.join(ROOT, 'src/core/index.js')],
        bundle: true,
        format: 'iife',
        globalName: 'XT_ENGINE',
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

async function main() {
    await esbuild.initialize({ worker: false });

    const engine = await bundleEngine();
    let out = fs.readFileSync(TEMPLATE, 'utf8');

    // 1) 题型定义区块 → 打包后的引擎（含 TYPE_* 常量）
    out = replaceRegion(out, 'TYPES', engine);

    // 2) 识别引擎方法区块 → 由 src/core 注入（此处留说明）
    out = replaceRegion(out, 'ENGINE', '            // 题目识别引擎方法由 src/core 注入，见文件末尾 Object.assign(app, XT_ENGINE.createEngineMethods())');

    // 3) mount 标记 → 实际注入调用
    out = out.replace('        // ==XT-BUILD:MOUNT==',
        '        // 注入 src/core 迁移过来的识别引擎方法\n' +
        '        try { Object.assign(app, XT_ENGINE.createEngineMethods()); } catch (e) { console.error(\'[构建] 引擎注入失败：\' + e.message); }');

    // 4) 生成文件横幅
    out = out.replace('// ==/UserScript==\n', '// ==/UserScript==\n' + BANNER + '\n');

    fs.mkdirSync(path.dirname(OUT_DIST), { recursive: true });
    fs.writeFileSync(OUT_DIST, out, 'utf8');
    fs.writeFileSync(OUT_ROOT, out, 'utf8');

    const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
    console.log(`构建完成：dist/xuexitong.user.js（${kb} KB）`);
    console.log('已同步覆盖根目录 xuexitong.user.js（供 @updateURL 拉取）');
}

main().catch((e) => { console.error('构建失败：' + e.message); process.exit(1); });
