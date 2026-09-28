/**
 * 构建产物冒烟测试：在 jsdom 中真实加载构建后的 xuexitong.user.js，
 * 验证「src/core 引擎」确实被注入到 app 上（即构建挂载点生效）。
 *
 * 与 quiz-recognition.test.mjs 的区别：后者直接测 src/core 模块；
 * 本测试测的是“构建产物本身能跑起来并完成引擎注入”，覆盖构建链路。
 *
 * 未安装 jsdom 时优雅跳过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let JSDOM;
try {
    ({ JSDOM } = require('jsdom'));
} catch (e) {
    console.log('⏭  未安装 jsdom，跳过构建冒烟测试（如需运行请执行：npm i -D jsdom）');
    process.exit(0);
}

const code = fs.readFileSync(path.join(__dirname, '..', 'xuexitong.user.js'), 'utf8');

// 宽松的 jQuery 桩：任意链式调用都不抛错，且 $('#coursetree').length 为真以触发启动。
function makeJQueryStub() {
    const handler = {
        get(target, prop) {
            if (prop === 'length') return 1;
            if (prop === 'text' || prop === 'val' || prop === 'html') return () => '';
            if (prop === 'get') return () => null;
            if (prop === 'each') return () => target.proxy;
            if (prop === Symbol.toPrimitive) return () => '';
            return target.proxy;
        },
        apply() { return undefined; },
    };
    const target = {};
    target.proxy = new Proxy(function () {}, handler);
    // 直接调用 $(...) 时也返回可链式对象
    return new Proxy(function () { return target.proxy; }, {
        get(t, prop) {
            if (prop === 'length') return 1;
            return target.proxy;
        },
        apply() { return target.proxy; },
    });
}

let pass = 0, fail = 0;
function check(desc, cond, extra) {
    if (cond) { pass++; console.log('  ✅ ' + desc); }
    else { fail++; console.log('  ❌ ' + desc + (extra ? '  → ' + extra : '')); }
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="coursetree"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
});
dom.window.jQuery = makeJQueryStub();
dom.window.$ = dom.window.jQuery;

console.log('=== 构建产物冒烟测试 ===');
try {
    dom.window.eval(code);
    check('脚本可在页面上下文执行（无致命语法/初始化错误）', true, '');
} catch (e) {
    check('脚本可在页面上下文执行（无致命语法/初始化错误）', false, e.message);
}

await new Promise((r) => setTimeout(r, 1400)); // 等待 waitForCoursePage 轮询触发初始化

const app = dom.window.app;
check('全局 app 已创建', !!app, String(typeof app));

const engineMethods = [
    '_blockText', '_getQuestionText', '_collectAnswerControls', '_isInsideToolUI',
    '_collectQuestionBlocks', '_detectQuestionType', '_getOptions',
    '_answerChoice', '_splitFillAnswer', '_answerFill', '_answerContainer',
    '_scanAndAnswer', '_diagnose',
];
const missing = engineMethods.filter((m) => !app || typeof app[m] !== 'function');
check('src/core 引擎方法已全部注入 app', missing.length === 0, missing.join(','));

check('app 上仍保留存量模块（如 _getQuestionDocuments）',
    !!app && typeof app._getQuestionDocuments === 'function', String(app && typeof app._getQuestionDocuments));

// 控制面板：由 src/ui 注入，应已挂到页面上，且关键控件齐全
const doc = dom.window.document;
const panel = doc.getElementById('xtControlPanel');
check('控制面板已注入页面', !!panel, String(!!panel));
const needIds = ['xtState', 'xtInfo', 'xtSpeed', 'xtPlay', 'xtPause', 'xtNext',
    'xtAutoplay', 'xtAiEnable', 'xtAiScan', 'xtAiDiag', 'xtAiSource'];
const missIds = needIds.filter((id) => !doc.getElementById(id));
check('面板关键控件齐全（' + needIds.length + ' 项）', missIds.length === 0, missIds.join(','));
check('面板样式已注入（<style> 含 #xtControlPanel）',
    !!doc.querySelector('style') && /#xtControlPanel/.test(Array.from(doc.querySelectorAll('style')).map((s) => s.textContent).join('')));

console.log('\n========================================');
console.log(fail === 0 ? '冒烟测试通过：' + pass + ' 项' : '通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================');
process.exit(fail === 0 ? 0 : 1);
