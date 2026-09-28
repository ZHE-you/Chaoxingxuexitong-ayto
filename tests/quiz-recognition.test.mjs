/**
 * 题目识别与作答的离线测试（基于 jsdom 模拟学习通页面 DOM）
 *
 * 运行方式（二选一）：
 *   1) npm i -D jsdom && node tests/quiz-recognition.test.mjs
 *   2) JSDOM 已装在别处时：NODE_PATH=/path/to/node_modules node tests/quiz-recognition.test.mjs
 *
 * 未安装 jsdom 时脚本会优雅跳过（退出码 0），保证 CI 不因缺少可选依赖而失败。
 */
import { createRequire } from 'node:module';
// 直接以 src/core 为被测来源：识别引擎已从单文件迁移为独立模块，不再需要用括号配对从源码抠方法。
import { createEngineMethods } from '../src/core/engine.js';

const require = createRequire(import.meta.url);

let JSDOM;
try {
    ({ JSDOM } = require('jsdom'));
} catch (e) {
    console.log('⏭  未安装 jsdom，跳过 DOM 识别测试（如需运行请执行：npm i -D jsdom）');
    process.exit(0);
}

// ==================== 测试环境 ====================
// src/core/engine.js 的 createEngineMethods() 返回识别/作答方法（内部以 this 访问上下文）。
const api = createEngineMethods();
api.configs = {};

// 极简 jQuery 桩：脚本里 _getQuestionText 会先尝试用 $ 找标题节点
function makeJQuery() {
    return function $(el) {
        return {
            find(sel) {
                let found = null;
                try { found = el.querySelector(sel); } catch (e) { /* ignore */ }
                return { first: () => ({ text: () => (found ? found.textContent : '') }) };
            },
        };
    };
}

let pass = 0;
let fail = 0;
function check(desc, cond, extra) {
    if (cond) { pass++; console.log('  ✅ ' + desc); }
    else { fail++; console.log('  ❌ ' + desc + (extra ? '  → ' + extra : '')); }
}

function mount(html) {
    const dom = new JSDOM('<!DOCTYPE html><html><body>' + html + '</body></html>');
    const win = dom.window;
    global.window = win;
    global.document = win.document;
    global.Event = win.Event;
    global.KeyboardEvent = win.KeyboardEvent;
    global.$ = makeJQuery();
    return win;
}

function answer(block, type, ctrls, ans) {
    const opts = api._getOptions(block);
    const hasChoice = opts.some((o) => o.el && (o.el.type === 'radio' || o.el.type === 'checkbox'));
    let ok = false;
    if (hasChoice) ok = api._answerChoice(opts, ans);
    if (!ok) ok = api._answerFill(opts, ans);
    return ok;
}

// ==================== 夹具：覆盖 12 种题型 ====================
console.log('=== 1. 十二种题型的识别与作答 ===');

const FIXTURE = `
<div id="wrap">
  <!-- 填空题（多空，模拟真实截图结构） -->
  <div class="TiMu">
    <div class="TiMu_title">1【填空题】设三阶方阵 A 的特征值为 1,2(二重)，则 |A|=____</div>
    <div class="TiMu_cont"><span>第1空：</span><input type="text" class="fillA">
      <span>第2空：</span><input type="text" class="fillB"></div>
  </div>

  <!-- 单选题 -->
  <div class="TiMu" id="q2">
    <div class="TiMu_title">2【单选题】下列说法正确的是</div>
    <label><input type="radio" name="q2" value="A">A. 甲说法</label>
    <label><input type="radio" name="q2" value="B">B. 乙说法</label>
    <label><input type="radio" name="q2" value="C">C. 丙说法</label>
  </div>

  <!-- 多选题 -->
  <div class="TiMu" id="q3">
    <div class="TiMu_title">3【多选题】下列属于矩阵性质的有</div>
    <label><input type="checkbox" name="q3" value="A">A. 结合律</label>
    <label><input type="checkbox" name="q3" value="B">B. 交换律</label>
    <label><input type="checkbox" name="q3" value="C">C. 分配律</label>
  </div>

  <!-- 判断题 -->
  <div class="TiMu" id="q4">
    <div class="TiMu_title">4【判断题】矩阵乘法满足交换律</div>
    <label><input type="radio" name="q4" value="T">对</label>
    <label><input type="radio" name="q4" value="F">错</label>
  </div>

  <!-- 名词解释 -->
  <div class="TiMu" id="q5">
    <div class="TiMu_title">5【名词解释】请解释什么是对角矩阵</div>
    <textarea name="q5"></textarea>
  </div>

  <!-- 听力题 -->
  <div class="TiMu" id="q6">
    <div class="TiMu_title">6【听力题】请听录音回答问题</div>
    <audio src="a.mp3"></audio>
    <label><input type="radio" name="q6" value="A">A. 选项一</label>
    <label><input type="radio" name="q6" value="B">B. 选项二</label>
  </div>

  <!-- 阅读理解（材料 + 小题） -->
  <div class="TiMu" id="q7">
    <div class="TiMu_title">7【阅读理解】阅读材料，回答下列问题</div>
    <div class="sub">1. 材料第一问的表层含义是
      <label><input type="radio" name="q7a" value="A">A. 含义一</label>
      <label><input type="radio" name="q7a" value="B">B. 含义二</label>
    </div>
  </div>

  <!-- 简答题 -->
  <div class="TiMu" id="q8">
    <div class="TiMu_title">8【简答题】简述矩阵可逆的充要条件</div>
    <textarea name="q8"></textarea>
  </div>

  <!-- 论述题 -->
  <div class="TiMu" id="q9">
    <div class="TiMu_title">9【论述题】试论述线性代数在工程中的应用</div>
    <textarea name="q9"></textarea>
  </div>

  <!-- 分录题 -->
  <div class="TiMu" id="q10">
    <div class="TiMu_title">10【分录题】编制下列业务的会计分录</div>
    <div>借：<input type="text" class="dr"> 金额：<input type="text" class="amt"></div>
    <div>贷：<input type="text" class="cr"> 金额：<input type="text" class="amt2"></div>
  </div>

  <!-- 完型填空 -->
  <div class="TiMu" id="q11">
    <div class="TiMu_title">11【完型填空】选择或填写合适的词</div>
    <div>Sentence one <input type="text" class="c1"> and <input type="text" class="c2"> end.</div>
  </div>

  <!-- 排序题（无标准控件，应被识别但跳过作答） -->
  <div class="TiMu" id="q12">
    <div class="TiMu_title">12【排序题】请将下列步骤排序</div>
    <ul class="sortable"><li>步骤A</li><li>步骤B</li></ul>
  </div>

  <!-- 连线题（无标准控件） -->
  <div class="TiMu" id="q13">
    <div class="TiMu_title">13【连线题】请将左右两列连线</div>
    <div class="match-area"><span>左1</span><span>右1</span></div>
  </div>
</div>
`;

const win = mount(FIXTURE);
const doc = win.document;
const items = api._collectQuestionBlocks(doc);

check('识别出可自动作答的题目块 11 个', items.length === 11, '实际 ' + items.length);
const unanswerable = api._collectUnanswerable(doc, items.map((it) => it.block));
check('识别出 2 个无标准控件的题（排序 / 连线，供人工处理）', unanswerable.length === 2, '实际 ' + unanswerable.length);

const typeOf = (id) => {
    const el = doc.getElementById(id);
    if (!el) return '(未找到)';
    const ctrls = items.find((it) => it.block === el);
    return api._detectQuestionType(el, ctrls ? ctrls.ctrls : []);
};
check('填空题识别正确', typeOf('q2') === 'single' && items.some((it) => api._detectQuestionType(it.block, it.ctrls) === 'fill'), '');
check('单选题识别正确', typeOf('q2') === 'single', '实际 ' + typeOf('q2'));
check('多选题识别正确', typeOf('q3') === 'multiple', '实际 ' + typeOf('q3'));
check('判断题识别正确', typeOf('q4') === 'judge', '实际 ' + typeOf('q4'));
check('名词解释识别正确', typeOf('q5') === 'term', '实际 ' + typeOf('q5'));
check('听力题识别正确', typeOf('q6') === 'listening', '实际 ' + typeOf('q6'));
check('阅读理解识别正确', typeOf('q7') === 'reading', '实际 ' + typeOf('q7'));
check('简答题识别正确', typeOf('q8') === 'short', '实际 ' + typeOf('q8'));
check('论述题识别正确', typeOf('q9') === 'essay', '实际 ' + typeOf('q9'));
check('分录题识别正确', typeOf('q10') === 'entry', '实际 ' + typeOf('q10'));
check('完型填空识别正确', typeOf('q11') === 'cloze', '实际 ' + typeOf('q11'));
check('排序题识别正确', typeOf('q12') === 'sort', '实际 ' + typeOf('q12'));
check('连线题识别正确', typeOf('q13') === 'match', '实际 ' + typeOf('q13'));

// 无固定 class 的结构（纯启发式路径）
console.log('\n=== 2. 无固定 class 的页面结构（启发式识别） ===');
const win2 = mount(`
<div>
  <div>1【填空题】已知 x=1，则 y=___，z=___</div>
  <div><input type="text" class="h1"><input type="text" class="h2"></div>
</div>
<div>
  <div>2、下列哪个正确</div>
  <div><label><input type="radio" name="hq2">A 甲</label><label><input type="radio" name="hq2">B 乙</label></div>
</div>`);
const items2 = api._collectQuestionBlocks(win2.document);
check('无 class 结构也能识别出 2 个题目块', items2.length === 2, '实际 ' + items2.length);
if (items2.length === 2) {
    const t2 = items2.map((it) => api._detectQuestionType(it.block, it.ctrls));
    check('启发式题型判断正确（fill + single）', t2.indexOf('fill') !== -1 && t2.indexOf('single') !== -1, t2.join(','));
}

// ==================== 3. 各题型的实际作答效果 ====================
console.log('\n=== 3. 作答结果校验 ===');

function blockOf(id) {
    return items.find((it) => it.block && it.block.id === id);
}

// 填空（两空）：答案用 | 分隔，应分别填入
const fillItem = items.find((it) => it.block && it.block.querySelector('.fillA'));
if (fillItem) {
    answer(fillItem.block, 'fill', fillItem.ctrls, '4|2');
    const a = doc.querySelector('.fillA').value;
    const b = doc.querySelector('.fillB').value;
    check('填空题多空按序填入（第1空=4，第2空=2）', a === '4' && b === '2', '实际 ' + a + ' / ' + b);
    // 关键回归：绝不能把同一个答案填进所有空
    check('填空题不会把所有空填成同一个值', a !== b, '实际 ' + a + ' / ' + b);
} else {
    check('填空题块存在', false, '未识别到填空题');
}

// 单选
const q2 = blockOf('q2');
if (q2) {
    answer(q2.block, 'single', q2.ctrls, 'B');
    const radios = doc.querySelectorAll('input[name=q2]');
    check('单选题按字母选中第 2 个选项', radios[1].checked && !radios[0].checked && !radios[2].checked,
        Array.from(radios).map((r) => (r.checked ? '1' : '0')).join(''));
}

// 多选
const q3 = blockOf('q3');
if (q3) {
    answer(q3.block, 'multiple', q3.ctrls, 'AC');
    const boxes = doc.querySelectorAll('input[name=q3]');
    check('多选题同时选中 A 与 C', boxes[0].checked && !boxes[1].checked && boxes[2].checked,
        Array.from(boxes).map((r) => (r.checked ? '1' : '0')).join(''));
}

// 判断题（答案为文字"错"）
const q4 = blockOf('q4');
if (q4) {
    answer(q4.block, 'judge', q4.ctrls, '错');
    const rs = doc.querySelectorAll('input[name=q4]');
    check('判断题按文本答案“错”选中第二个选项', !rs[0].checked && rs[1].checked,
        Array.from(rs).map((r) => (r.checked ? '1' : '0')).join(''));
}

// 简答题
const q8 = blockOf('q8');
if (q8) {
    answer(q8.block, 'short', q8.ctrls, '行列式不为零|矩阵满秩');
    const v = doc.querySelector('textarea[name=q8]').value;
    check('简答题要点填入文本框', v.indexOf('行列式不为零') !== -1 && v.indexOf('矩阵满秩') !== -1, '实际 ' + v);
}

// 分录题（四个空位）
const q10 = blockOf('q10');
if (q10) {
    answer(q10.block, 'entry', q10.ctrls, '银行存款|1000|应收账款|1000');
    const vals = ['.dr', '.amt', '.cr', '.amt2'].map((s) => doc.querySelector(s).value);
    check('分录题四个空位按序填入', vals.join('/') === '银行存款/1000/应收账款/1000', '实际 ' + vals.join('/'));
}

// 完型填空
const q11 = blockOf('q11');
if (q11) {
    answer(q11.block, 'cloze', q11.ctrls, 'A|B');
    const v1 = doc.querySelector('.c1').value;
    const v2 = doc.querySelector('.c2').value;
    check('完型填空两空按序填入', v1 === 'A' && v2 === 'B', '实际 ' + v1 + ' / ' + v2);
}

// 听力 / 阅读（含选项，按字母作答）
const q6 = blockOf('q6');
if (q6) {
    answer(q6.block, 'listening', q6.ctrls, 'B');
    const rs = doc.querySelectorAll('input[name=q6]');
    check('听力题按字母选中第 2 个选项', rs[1].checked && !rs[0].checked, '');
}

// 排序 / 连线：无标准控件，应答跳过而不是误填
console.log('\n=== 4. 特殊交互题的降级处理 ===');
const q12 = blockOf('q12');
if (q12) {
    const ok = answer(q12.block, 'sort', q12.ctrls, 'ABC');
    check('排序题无可执行控件时安全返回 false（不误填）', ok === false, '实际 ' + ok);
}

// ==================== 5. 答案拆分工具 ====================
console.log('\n=== 5. 多空答案拆分 ===');
check('按 | 拆分', api._splitFillAnswer('甲|乙|丙', 3).join(',') === '甲,乙,丙');
check('按 ； 拆分', api._splitFillAnswer('甲；乙；丙', 3).join(',') === '甲,乙,丙');
check('按换行拆分', api._splitFillAnswer('甲\n乙\n丙', 3).join(',') === '甲,乙,丙');
check('单值多空时按空位复制', api._splitFillAnswer('相同答案', 3).join(',') === '相同答案,相同答案,相同答案');
check('答案含数学竖线 |A| 时不被误拆（2 空）',
    api._splitFillAnswer('互为倒数|1/|A|', 2).join(' @@ ') === '互为倒数 @@ 1/|A|',
    api._splitFillAnswer('互为倒数|1/|A|', 2).join(' @@ '));
check('段数与空位数一致时正常拆分', api._splitFillAnswer('-1|0|1', 3).join(',') === '-1,0,1');

// ==================== 6. 端到端：模拟真实章节测验页面 ====================
console.log('\n=== 6. 端到端（模拟截图中的章节测验页面） ===');

// 依据用户提供的真实页面结构构造：题号 + 【填空题】标签 + "第N空:" 输入框
const realQuestions = [
    { id: 'r1', no: 1, text: '设三阶方阵 A 的特征值为 1,2(二重)，则 |A|=____', blanks: 1, ans: '2' },
    { id: 'r2', no: 2, text: '已知 n 阶矩阵 A，且 A^2=A，则矩阵 A 的特征值为____', blanks: 1, ans: '0或1' },
    { id: 'r3', no: 3, text: '设 A 为 n 阶方阵，AX=0 有非零解，则 A 必有一个特征值为____', blanks: 1, ans: '0' },
    { id: 'r4', no: 6, text: '已知三阶矩阵 A 的三个特征值为 2,4,1，则 |A^2-2A|=____', blanks: 1, ans: '0' },
    { id: 'r5', no: 8, text: '若 A 可逆，则其特征值与逆矩阵特征值关系为____，且 |A^-1|=____', blanks: 2, ans: '互为倒数|1/|A|' },
];
let realHtml = '<div class="chapterTest">';
realQuestions.forEach((q) => {
    let blanks = '';
    for (let b = 1; b <= q.blanks; b++) {
        blanks += '<span>第' + b + '空：</span><input type="text" class="' + q.id + '_' + b + '">';
    }
    realHtml += '<div class="TiMu"><div class="TiMu_title">' + q.no + '【填空题】' + q.text +
        '</div><div class="TiMu_cont">' + blanks + '</div></div>';
});
realHtml += '</div>';

const doc3 = mount(realHtml).document;
const items3 = api._collectQuestionBlocks(doc3);
check('真实页面结构识别出 5 道题', items3.length === 5, '实际 ' + items3.length);

const app = Object.assign({}, api, {
    configs: { aiSource: 'custom', aiApiBase: '', bankUrl: '' },
    _aiHandled: {},
    _aiStat: { answered: 0, failed: 0, lastResult: '' },
    _lookupBank: (q) => {
        const hit = realQuestions.find((r) => q.indexOf(r.text.slice(0, 12)) !== -1);
        return hit ? hit.ans : '';
    },
    _addToBank: () => { /* 测试桩 */ },
});
const submitted = items3.map((it) => app._answerContainer(it.block, app._detectQuestionType(it.block, it.ctrls), it.ctrls));
check('5 道题全部提交作答', submitted.every((x) => x === true), submitted.join(','));
check('作答统计为 5 道', app._aiStat.answered === 5, '实际 ' + app._aiStat.answered);

const val = (sel) => (doc3.querySelector(sel) || {}).value;
check('第 1 题填入正确（|A|=2）', val('.r1_1') === '2', val('.r1_1'));
check('第 2 题填入正确（0或1）', val('.r2_1') === '0或1', val('.r2_1'));
check('第 3 题填入正确（0）', val('.r3_1') === '0', val('.r3_1'));
check('第 4 题填入正确（0）', val('.r4_1') === '0', val('.r4_1'));
check('第 5 题两空分别填入（互为倒数 / 1/|A|）',
    val('.r5_1') === '互为倒数' && val('.r5_2') === '1/|A|', val('.r5_1') + ' / ' + val('.r5_2'));

// 去重：同一题不应被重复作答
const again = app._answerContainer(items3[0].block, 'fill', items3[0].ctrls);
check('同一题不会被重复作答', again === false, '实际 ' + again);

// ==================== 7. 回归：面板自识别 / 隐藏式选项 ====================
console.log('\n=== 7. 回归测试（面板开关 / 隐藏式单选） ===');

// 回归 1：脚本自身的控制面板里有 checkbox，绝不能被当成题目（曾把"静音播放"识别成多选题）
const winP = mount(`
<div id="xtControlPanel">
  <div class="xt-body">
    <label><input type="checkbox" id="p1"> 自动播放</label>
    <label><input type="checkbox" id="p2"> 无视频跳过</label>
    <label><input type="checkbox" id="p3"> 静音播放</label>
    <label><input type="checkbox" id="p4"> 启用自动答题</label>
  </div>
</div>
<div class="TiMu">
  <div class="TiMu_title">1【单选题】下列叙述正确的是</div>
  <label><input type="radio" name="pq">A 甲</label>
  <label><input type="radio" name="pq">B 乙</label>
</div>`);
const itemsP = api._collectQuestionBlocks(winP.document);
check('面板内的开关未被识别为题目（只识别出 1 道真题）', itemsP.length === 1, '实际 ' + itemsP.length);
check('识别出的是单选题而非多选题',
    itemsP.length === 1 && api._detectQuestionType(itemsP[0].block, itemsP[0].ctrls) === 'single',
    itemsP.length ? api._detectQuestionType(itemsP[0].block, itemsP[0].ctrls) : '—');

// 回归 2：学习通常把 radio 视觉隐藏，用 label / div 做外观，这类控件仍须可作答
const winH = mount(`
<div class="TiMu">
  <div class="TiMu_title">2【单选题】隐藏式选项</div>
  <div class="opt"><input type="radio" name="hq" id="h1" style="display:none"><label for="h1">A 甲选项</label></div>
  <div class="opt"><input type="radio" name="hq" id="h2" style="display:none"><label for="h2">B 乙选项</label></div>
</div>`);
const itemsH = api._collectQuestionBlocks(winH.document);
check('视觉隐藏的 radio 仍被收集', itemsH.length === 1 && itemsH[0].ctrls.length === 2,
    '题块 ' + itemsH.length + '，控件 ' + (itemsH[0] ? itemsH[0].ctrls.length : 0));
if (itemsH.length === 1) {
    answer(itemsH[0].block, 'single', itemsH[0].ctrls, 'B');
    const rs = winH.document.querySelectorAll('input[name=hq]');
    check('隐藏式单选仍能按字母选中', rs[1].checked && !rs[0].checked, '');
}

// ==================== 8. 回归：框架页误报（搜索框 / LaTeX 弹窗 / 翻译框 / 验证码） ====================
console.log('\n=== 8. 回归测试（框架页工具控件误报） ===');

// 复现用户真实页面诊断：studentstudy 框架页里充满了与答题无关的输入框，
// 它们绝不能被当成「填空题」识别与作答。
const winF = mount(`
<div class="chapter"><div class="dataSearch_chapter"><div class="DySeleft fl">
  <input type="text" id="f_search" placeholder="搜索本章内容">
</div></div></div>
<div class="AlertCon02"><div class="con03"><div class="DySearch">
  <input type="text" id="f_captcha" placeholder="看不清">
</div></div></div>
<div class="edui-editor edui-default"><div class="latex-inline-pop">
  <div class="latex-inline-pop-inner" contenteditable="true" id="f_latex">按ESC键完成输入</div>
</div></div>
<div class="translationBg"><div class="translationBox">
  <div class="trans-question-box" contenteditable="true" id="f_trans">请翻译</div>
</div></div>`);
const itemsF = api._collectQuestionBlocks(winF.document);
check('框架页的工具控件未被识别为题目（应当 0 道）', itemsF.length === 0, '实际 ' + itemsF.length);

// 逐个确认这些控件确实被 _isInsideToolUI 拦截
const fSearch = winF.document.getElementById('f_search');
const fCaptcha = winF.document.getElementById('f_captcha');
const fLatex = winF.document.getElementById('f_latex');
const fTrans = winF.document.getElementById('f_trans');
check('搜索框被识别为工具控件', api._isInsideToolUI(fSearch) === true, '');
check('验证码输入框被识别为工具控件', api._isInsideToolUI(fCaptcha) === true, '');
check('LaTeX 弹窗被识别为工具控件', api._isInsideToolUI(fLatex) === true, '');
check('翻译框被识别为工具控件', api._isInsideToolUI(fTrans) === true, '');

// ==================== 9. 字体反爬（字体加密）识别 ====================
console.log('\n=== 9. 字体加密启发式识别 ===');
// 学习通把题目正文换成乱码冷僻字（字形反爬），这些乱码高度集中在少数区间且密集出现
check('识别出「字体加密」乱码题干（行列式→行罓式 等）',
    api._looksObfuscated('【单选题】岢下罓构成的6阶行罓式岟开式的岣岥岤，岠“+”的有 ( )') === true, '');
check('正常题干不误判为加密',
    api._looksObfuscated('设三阶方阵 A 的特征值为 1,2(二重)，则 |A|=____') === false, '');
check('短文本不误判',
    api._looksObfuscated('【判断题】矩阵乘法满足交换律') === false, '');
check('无 @font-face 时返回空数组',
    api._findFontFaces(winF.document).length === 0, '');

console.log('\n========================================');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================');
process.exit(fail === 0 ? 0 : 1);
