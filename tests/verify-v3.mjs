// 产物校验：确认构建生成的 xuexitong.user.js 语法合法、引擎已注入、无残留构建标记，
// 且 dist/ 与根目录产物一致（根目录产物供 @updateURL 直接拉取）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'xuexitong.user.js');
const dist = resolve(root, 'dist/xuexitong.user.js');

// 1) 语法校验
execFileSync(process.execPath, ['--check', target], { stdio: 'inherit' });

// 2) 构建产物一致性
const out = fs.readFileSync(target, 'utf8');
const must = [
    '// ==UserScript==',
    'var XT_ENGINE',
    'createEngineMethods',
    'Object.assign(app, XT_ENGINE.createEngineMethods())',
    'var XT_UI',
    'XT_UI.PANEL_CSS',
    'XT_UI.PANEL_HTML',
];
const mustNot = ['==XT-BUILD:'];
const errs = [];
for (const m of must) if (!out.includes(m)) errs.push('缺少：' + m);
for (const m of mustNot) if (out.includes(m)) errs.push('存在未替换的构建标记：' + m);

if (fs.existsSync(dist)) {
    const d = fs.readFileSync(dist, 'utf8');
    if (d !== out) errs.push('dist/xuexitong.user.js 与根目录产物不一致（请重新运行 npm run build）');
}

if (errs.length) {
    console.error('产物校验失败：\n - ' + errs.join('\n - '));
    process.exit(1);
}
console.log('xuexitong.user.js 校验通过：语法 OK、引擎已注入、无残留标记、dist 与根目录一致。');
