// 题目识别引擎：从作答控件反向锚定题目容器，并按题型作答。
// 说明：迁移自旧单文件（逐字迁移，仅做作用域包装），现为唯一来源，可直接编辑。
import { TYPE_TAG_RE, TYPE_LABELS, TYPE_NAMES } from './types.js';

// 返回一组方法，由 main 注入到 app 上（方法内部以 this 访问 app 状态）。
export function createEngineMethods() {
    return {
            // ==================== 题目识别引擎 ====================
            // 学习通各页面（章节测验 / 作业 / 考试 / 视频插入题）的 DOM 结构差异很大且随版本变化，
            // 因此这里不依赖固定 class，而是「从作答控件反向锚定题目容器」：
            // 先收集所有可作答控件，再向上找最近的、含题型标签（如【填空题】）或题号（如 1.）的
            // 祖先元素作为题目边界。固定 class 仅作快速路径。
            _blockText(el) {
                if (!el) return '';
                try {
                    const clone = el.cloneNode(true);
                    clone.querySelectorAll('input, textarea, select, button, script, style').forEach((n) => n.remove());
                    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
                } catch (e) {
                    return (el.textContent || '').replace(/\s+/g, ' ').trim();
                }
            },

            // 题干：优先取已知标题节点，取不到就用「去掉选项区后的整块文本」
            _getQuestionText(qEl) {
                const $q = $(qEl);
                let t = $q.find('.qTitle, .question_title, .topic-title, .questionText, .zuoye-topic-title, .TiMu_title, .stem, h3, .title').first().text();
                if (!t) t = $q.find('.qBord, .QBord, .question, .topic, .Zy_TItle').first().text();
                if (!t) t = this._blockText(qEl);
                return (t || '').replace(/\s+/g, ' ').trim();
            },

            // 某个选项控件的标签文本
            _controlLabelText(el) {
                try {
                    const lab = el.closest && el.closest('label');
                    if (lab) {
                        const t = this._blockText(lab);
                        if (t) return t;
                    }
                    let p = el.parentElement;
                    for (let i = 0; i < 3 && p; i++) {
                        const t = this._blockText(p);
                        if (t && t.length <= 200) return t;
                        p = p.parentElement;
                    }
                } catch (e) { /* ignore */ }
                return '';
            },

            // 从选项文本推断字母（A/B/C/D…）；推不出则按序号映射
            _inferLetter(label, idx) {
                const s = String(label || '');
                let m = s.match(/^\s*[（(]?\s*([A-Za-z])\s*[)）.、．:：]/);
                if (m) return m[1].toUpperCase();
                m = s.match(/^\s*([A-Za-z])\s+\S/);
                if (m) return m[1].toUpperCase();
                return idx < 26 ? String.fromCharCode(65 + idx) : '';
            },

            // 判断控件是否位于「页面工具 / UI」容器内（搜索框、LaTeX 弹窗、翻译框、验证码等）。
            // 这类输入框不应被当成题目作答。命中即返回 true。
            _isInsideToolUI(el) {
                const ph = (el.placeholder || '').toString();
                const nm = (el.name || '').toString();
                const id = (el.id || '').toString();
                if (/search|captcha|verify|code|keyword|kwd|searchkey/i.test(ph + '|' + nm + '|' + id)) return true;
                let n = el;
                for (let i = 0; i < 8 && n; i++) {
                    const cls = (n.className || '').toString();
                    if (/latex-inline-pop|translationBox|trans-question-box|DySearch|dataSearch|Search|captcha|verifycode|code-img|AlertCon|search-box|searchBox|searchInput|header-search/i.test(cls)) return true;
                    n = n.parentElement;
                }
                return false;
            },

            // 收集所有可作答控件（跳过隐藏 / 禁用 / 只读）
            _collectAnswerControls(doc) {
                const out = [];
                if (!doc || !doc.querySelectorAll) return out;
                let list = [];
                try {
                    list = doc.querySelectorAll('input[type=radio], input[type=checkbox], input[type=text], textarea, [contenteditable="true"], [contenteditable=""]');
                } catch (err) {
                    return out;
                }
                list.forEach((el) => {
                    if (!el || el.disabled || el.readOnly) return;
                    if (el.type === 'hidden') return;
                    // 排除脚本自身的控制面板：面板里也有 checkbox，绝不能被当成题目作答
                    try {
                        if (el.closest && el.closest('#xtControlPanel')) return;
                    } catch (err2) { /* ignore */ }
                    // 排除页面工具 / UI 控件：搜索框、LaTeX 输入弹窗、翻译框、验证码等
                    // （学习通 studentstudy 框架页里这类输入框极多，绝不能被当成填空题作答）
                    if (this._isInsideToolUI(el)) return;
                    const isChoice = el.type === 'radio' || el.type === 'checkbox';
                    try {
                        const st = doc.defaultView && doc.defaultView.getComputedStyle ? doc.defaultView.getComputedStyle(el) : null;
                        // 学习通常把 radio/checkbox 视觉隐藏、用自定义样式呈现（label 或 div 做外观），
                        // 这类控件依然可以 click / 赋值，因此不能因不可见而跳过；
                        // 文本框若被隐藏，多半是存放答案的隐藏域，应跳过。
                        if (st && (st.display === 'none' || st.visibility === 'hidden') && !isChoice) return;
                    } catch (err3) { /* ignore */ }
                    out.push(el);
                });
                return out;
            },

            _looksLikeQuestionBlock(el, doc) {
                if (!el || el.nodeType !== 1 || el === doc.body || el === doc.documentElement) return false;
                let n = 0;
                try {
                    n = el.querySelectorAll('input[type=radio], input[type=checkbox], input[type=text], textarea').length;
                } catch (e) { return false; }
                if (n === 0 || n > 60) return false;   // 无控件，或大到像整卷容器
                const txt = this._blockText(el).slice(0, 200);
                if (TYPE_TAG_RE.test(txt)) return true;                             // 【填空题】
                if (/^\s*[（(]?\s*\d+\s*[)）．.、,，]\s*\S/.test(txt)) return true;     // 1. / （1）
                return false;
            },

            // 从控件向上找题目容器
            // 注意：不能用 [class*="TiMu"] 这类子串匹配 —— 形如 .TiMu_cont 的「内容区」也会命中，
            // 而它不含题干（题型标签丢失会导致题型误判）。这里要求候选块必须通过「像题目」校验。
            _findQuestionBlock(ctrl, doc) {
                const knownSel = '.TiMu, .questionLi, .questionBox, .qItem, .topic-item, .ans-job, .exam-question, .examPaper_subject, .question-panel, .question-item';
                try {
                    const direct = ctrl.closest ? ctrl.closest(knownSel) : null;
                    if (direct && direct !== doc.body && this._looksLikeQuestionBlock(direct, doc)) return direct;
                } catch (e) { /* ignore */ }
                let el = ctrl;
                for (let i = 0; i < 12 && el; i++) {
                    el = el.parentElement;
                    if (!el || el === doc.body || el === doc.documentElement) break;
                    if (this._looksLikeQuestionBlock(el, doc)) return el;
                }
                // 找不到任何「像题目」的祖先块时，不再用父节点兜底——
                // 否则框架页里的搜索框 / 验证码 / LaTeX 弹窗等孤立输入框会被误判成题目。
                return null;
            },

            // 汇总一个文档里的题目块（含各自应有的控件），只保留最内层避免父子重复作答
            _collectQuestionBlocks(doc) {
                const ctrls = this._collectAnswerControls(doc);
                const map = new Map();
                ctrls.forEach((c) => {
                    const b = this._findQuestionBlock(c, doc);
                    if (!b) return;
                    if (!map.has(b)) map.set(b, []);
                    map.get(b).push(c);
                });
                const blocks = Array.from(map.keys());
                // 只保留最内层：若某块包含另一个题目块，说明它只是外层容器
                return blocks
                    .filter((b) => !blocks.some((o) => o !== b && b.contains(o)))
                    .map((b) => ({ block: b, ctrls: map.get(b) }));
            },

            // 找出「带题型标签但没有任何标准作答控件」的题目块。
            // 典型是排序题、连线题（用拖拽/点选交互，没有 input），
            // 这类题无法自动作答，需要识别出来提示用户手动处理。
            _collectUnanswerable(doc, knownBlocks) {
                const known = knownBlocks || [];
                let all = [];
                try {
                    all = doc.querySelectorAll('div, li, section, article, td, fieldset');
                } catch (err) { return []; }
                const cands = [];
                all.forEach((el) => {
                    // 已识别为可作答题目的块，以及它的内部节点与外层容器，都不算「无控件题」
                    if (known.some((b) => b === el || b.contains(el) || el.contains(b))) return;
                    const raw = el.textContent || '';
                    if (!raw || raw.length > 600) return;      // 题块通常很短，超大块直接跳过
                    const tag = (raw.match(TYPE_TAG_RE) || [''])[0];
                    if (!tag) return;
                    let isType = false;
                    for (const pair of TYPE_LABELS) {
                        if (pair[0].test(tag)) { isType = true; break; }
                    }
                    if (!isType) return;                       // 如【答题要求】这类非题型标签，忽略
                    let n = 0;
                    try { n = el.querySelectorAll('input, textarea, [contenteditable]').length; } catch (err2) { return; }
                    if (n > 0) return;                         // 有控件说明能被自动作答
                    cands.push(el);
                });
                return cands.filter((el) => !cands.some((c) => c !== el && el.contains(c)));
            },

            // 题型识别：题干标签优先，其次按控件类型与选项特征推断
            _detectQuestionType(block, ctrls) {
                const head = this._blockText(block).slice(0, 200);
                const tag = (head.match(TYPE_TAG_RE) || [''])[0];
                if (tag) {
                    for (const pair of TYPE_LABELS) {
                        if (pair[0].test(tag)) return pair[1];
                    }
                }
                const brief = head.slice(0, 60);
                for (const pair of TYPE_LABELS) {
                    if (pair[0].test(brief)) return pair[1];
                }
                const hasCheckbox = ctrls.some((c) => c.type === 'checkbox');
                const hasRadio = ctrls.some((c) => c.type === 'radio');
                const hasText = ctrls.some((c) => c.tagName === 'TEXTAREA' || c.isContentEditable || (c.tagName === 'INPUT' && (c.type === 'text' || c.type === '')));
                if (hasCheckbox) return 'multiple';
                if (hasRadio) {
                    const labels = ctrls.filter((c) => c.type === 'radio').map((c) => this._controlLabelText(c));
                    // 只有明确的「对/错」式二元选项才判为判断题，避免把普通单选题误判
                    if (labels.length === 2) {
                        const joined = labels.join('')
                            .replace(/[\s（()）.,．、,:：]/g, '')
                            .replace(/^[A-Za-z](?=[\u4e00-\u9fa5])/g, '');
                        if (/^(对|错|正确|错误|是|否|√|×|T|F|TRUE|FALSE)+$/i.test(joined)) return 'judge';
                    }
                    return 'single';
                }
                if (hasText) return 'fill';
                return 'unknown';
            },

            // 兼容旧调用：返回选项数组（radio/checkbox 优先，否则为输入框）
            _getOptions(qEl) {
                const choice = [];
                try {
                    qEl.querySelectorAll('input[type=radio], input[type=checkbox]').forEach((el) => choice.push(el));
                } catch (e) { /* ignore */ }
                if (choice.length) {
                    return choice.map((el, idx) => {
                        const text = this._controlLabelText(el);
                        return { el: el, letter: this._inferLetter(text, idx), text: text, isInput: false };
                    });
                }
                const inputs = [];
                try {
                    qEl.querySelectorAll('input[type=text], textarea, [contenteditable="true"]').forEach((el) => inputs.push(el));
                } catch (e) { /* ignore */ }
                return inputs.map((el) => ({ el: el, letter: '', text: '', isInput: true }));
            },

            // 赋值：兼容 React / Vue 受控组件（绕开 value setter 再派发事件）
            _setValue(el, val) {
                const v = val === undefined || val === null ? '' : String(val);
                try {
                    if (el.isContentEditable) {
                        el.textContent = v;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                    const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
                    const proto = el.tagName === 'TEXTAREA'
                        ? (win.HTMLTextAreaElement && win.HTMLTextAreaElement.prototype)
                        : (win.HTMLInputElement && win.HTMLInputElement.prototype);
                    const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
                    if (desc && desc.set) desc.set.call(el, v);
                    else el.value = v;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })); } catch (e) { /* ignore */ }
                    return true;
                } catch (e) {
                    try { el.value = v; return true; } catch (e2) { return false; }
                }
            },

            // 单选 / 多选 / 判断：按「选项字母」或「选项文本」匹配后点选
            _answerChoice(opts, answer) {
                if (!answer) return false;
                const ansUp = String(answer).toUpperCase();
                const ansLetters = (ansUp.match(/[A-Z]/g) || []);
                const ansClean = ansUp.replace(/[^0-9A-Z\u4e00-\u9fa5]/g, '');
                const ansHasChinese = /[\u4e00-\u9fa5]/.test(ansUp);
                const choice = opts.filter((o) => o.el && (o.el.type === 'radio' || o.el.type === 'checkbox'));
                if (!choice.length) return false;
                let selected = 0;
                choice.forEach((o) => {
                    const optLetter = String(o.letter || '').replace(/[^A-Z]/g, '').toUpperCase();
                    const optClean = String(o.text || '').replace(/[^0-9A-Z\u4e00-\u9fa5]/g, '').toUpperCase();
                    const optBody = optClean.replace(/^[A-Z]/, '');   // 去掉选项字母前缀
                    let hit = false;
                    if (optLetter && ansLetters.indexOf(optLetter) !== -1) hit = true;
                    else if (ansHasChinese && optBody && ansClean && optBody.length <= ansClean.length && ansClean.indexOf(optBody) !== -1) hit = true;
                    else if (ansHasChinese && optBody && ansClean.length >= 2 && optBody.indexOf(ansClean) !== -1) hit = true;
                    if (hit) {
                        try { o.el.click(); selected++; } catch (e) {
                            try { o.el.checked = true; } catch (e2) { /* ignore */ }
                        }
                    }
                });
                return selected > 0;
            },

            // 把答案拆成多段：支持 | ; 换行 , 、 等分隔，供多空题按空分配
            _splitFillAnswer(answer, n) {
                const raw = String(answer || '').trim();
                if (!raw) return [];
                // 只有一个空位时整体填入，绝不做拆分（避免简答题答案被截断）
                if (n <= 1) return [raw];
                // 先用占位符保护成对的竖线（绝对值记号），如 |A|、|A^2-2A|、|x|
                // 否则它们会被误当成多空答案的分隔符，导致答案被切断
                const MARK = '\u0001';
                const a = raw.replace(/\|([A-Za-z][^|]{0,12})\|/g, MARK + '$1' + MARK);
                const trySplit = (s, re) => s.split(re).map((x) => x.trim()).filter((x) => x !== '');
                let parts = trySplit(a, /\s*[|｜‖]\s*/);
                if (parts.length < n) {
                    const alt = trySplit(a, /\s*(?:;|；|\r?\n)\s*/);
                    if (alt.length > parts.length) parts = alt;
                }
                if (parts.length < n) {
                    const alt = trySplit(a, /\s*[,，、]\s*/);
                    if (alt.length > parts.length) parts = alt;
                }
                if (parts.length > n) {
                    const head = parts.slice(0, n - 1);
                    head.push(parts.slice(n - 1).join('|'));
                    parts = head;
                } else if (n > 1 && parts.length === 1) {
                    parts = new Array(n).fill(parts[0]);
                }
                return parts.map((x) => x.split(MARK).join('|'));
            },

            // 填空 / 完型 / 简答 / 论述 / 名词解释 / 分录：按空位依次填入
            _answerFill(opts, answer) {
                const blanks = opts.filter((o) => o.isInput && o.el);
                if (!blanks.length) return false;
                const parts = this._splitFillAnswer(answer, blanks.length);
                let ok = false;
                blanks.forEach((o, i) => {
                    const v = parts[i] !== undefined ? parts[i] : (parts.length ? parts[parts.length - 1] : answer);
                    if (this._setValue(o.el, v)) ok = true;
                });
                return ok;
            },

            // 对单个题目容器作答：题库优先，未命中走 AI；按题型与实际控件类型分发作答
            _answerContainer(qEl, type, ctrls) {
                if (!type) {
                    const own = ctrls || this._collectAnswerControls(qEl.ownerDocument || document);
                    type = this._detectQuestionType(qEl, own);
                }
                const text = this._getQuestionText(qEl);
                if (!text) return false;
                const fp = (type || 'unknown') + '|' + text.slice(0, 60);
                if (this._aiHandled[fp]) return false;
                this._aiHandled[fp] = true;

                const opts = this._getOptions(qEl);
                const hasChoice = opts.some((o) => o.el && (o.el.type === 'radio' || o.el.type === 'checkbox'));
                const isInput = opts.some((o) => o.isInput);
                if (!hasChoice && !isInput) {
                    // 排序 / 连线等特殊交互没有标准控件，留待人工处理
                    console.warn('%c[AI答题] 该题缺少可作答控件（' + (TYPE_NAMES[type] || type) + '），跳过：' + text.slice(0, 40), 'color:#FF9800');
                    return false;
                }

                // 分发：优先按控件实际类型作答（题型只用于提示词与日志）
                const apply = (ans) => {
                    let ok = false;
                    if (hasChoice) ok = this._answerChoice(opts, ans);
                    if (!ok && isInput) ok = this._answerFill(opts, ans);
                    return ok;
                };
                // 给 AI 的题目文本带上题型，便于模型按题型给出规范格式
                const typeName = TYPE_NAMES[type] || '';
                const aiQuestion = typeName ? (text + '\n（本题题型：' + typeName + '）') : text;

                const banked = this._lookupBank(text);
                if (banked) {
                    if (apply(banked)) {
                        this._aiStat.answered++;
                        this._aiStat.lastResult = '题库:' + banked.slice(0, 30);
                        console.log('%c[AI答题] 题库命中已作答（' + typeName + '）：' + text.slice(0, 40), 'color:#4CAF50');
                        return true;
                    }
                    this._aiStat.failed++;
                    console.warn('%c[AI答题] 题库答案无法填入：' + text.slice(0, 40) + ' 答案=' + banked.slice(0, 40), 'color:#FF9800');
                    return false;
                }

                // 只配了题库也能答题，因此没有 AI 地址不直接拦截
                if (this.configs.aiSource === 'custom' && !this.configs.aiApiBase && !this.configs.bankUrl) {
                    console.warn('%c[AI答题] 题库未命中，且未配置自定义 API / 外部题库，跳过：' + text.slice(0, 40), 'color:#FF9800');
                    return false;
                }
                const optTexts = opts.filter((o) => !o.isInput).map((o) => o.text);
                // 优先级：本地题库 → 外部题库 → AI
                const getAns = this.configs.bankUrl
                    ? this._askBankApi(text, optTexts).then((bankAns) => bankAns || this._resolveAnswer(aiQuestion, optTexts))
                    : this._resolveAnswer(aiQuestion, optTexts);
                getAns.then((ans) => {
                    if (!ans) { this._aiStat.failed++; return; }
                    if (apply(ans)) {
                        this._aiStat.answered++;
                        this._aiStat.lastResult = 'AI:' + ans.slice(0, 30);
                        this._addToBank(text, ans);
                        console.log('%c[AI答题] 已作答（' + typeName + '）：' + text.slice(0, 40) + ' => ' + ans.slice(0, 40), 'color:#4CAF50');
                    } else {
                        this._aiStat.failed++;
                        console.warn('%c[AI答题] 答案无法填入（' + typeName + '）：' + text.slice(0, 40) + ' 答案=' + ans.slice(0, 40), 'color:#FF9800');
                    }
                }).catch((e) => {
                    this._aiStat.failed++;
                    console.error('%c[AI答题] 调用失败：' + text.slice(0, 40) + ' -> ' + e.message, 'color:#F44336');
                });
                return true;
            },

            _scanAndAnswer(verbose) {
                const docs = this._getQuestionDocuments();
                const seen = {};
                let count = 0;
                let submitted = 0;
                let manual = 0;
                let obfuscated = 0;
                docs.forEach((doc) => {
                    if (!doc) return;
                    let items = [];
                    try {
                        items = this._collectQuestionBlocks(doc);
                    } catch (e) {
                        console.warn('%c[AI答题] 收集题目失败：' + e.message, 'color:#F44336');
                        return;
                    }
                    items.forEach((it) => {
                        const txt = this._getQuestionText(it.block);
                        if (!txt || seen[txt]) return;
                        seen[txt] = true;
                        count++;
                        const type = this._detectQuestionType(it.block, it.ctrls);
                        if (verbose) {
                            console.log('%c[AI答题] 识别到「' + (TYPE_NAMES[type] || type) + '」控件 ' + it.ctrls.length + ' 个：' + txt.slice(0, 40), 'color:#607D8B');
                        }
                        if (this._answerContainer(it.block, type, it.ctrls)) submitted++;
                    });
                    // 无标准控件的题目（排序 / 连线等）单独提示，避免用户以为脚本漏答
                    try {
                        this._collectUnanswerable(doc, items.map((it) => it.block)).forEach((el) => {
                            const stem = this._getQuestionText(el);
                            const txt = stem.slice(0, 40);
                            if (!txt || seen['NA|' + txt]) return;
                            seen['NA|' + txt] = true;
                            manual++;
                            if (this._looksObfuscated(stem)) {
                                obfuscated++;
                                console.warn('%c[AI答题] 该题文字疑似「字体加密」（乱码），无法识别：' + txt, 'color:#FF9800');
                            } else {
                                console.log('%c[AI答题] 该题没有标准作答控件，需手动处理：' + txt, 'color:#FF9800');
                            }
                        });
                    } catch (e) { /* ignore */ }
                });
                console.log('%c[AI答题] 扫描完成：识别题目 ' + count + ' 个，提交作答 ' + submitted + ' 个' +
                    (manual ? '，需手动处理 ' + manual + ' 个' : '') +
                    (obfuscated ? '（其中 ' + obfuscated + ' 个疑似「字体加密」，请点「诊断」查看 @font-face）' : ''), 'color:#2196F3');
                return count;
            },

            // 扫描文档里的 @font-face（学习通的「字体反爬」会把题目正文换成自定义字体）。
            // 返回 [{family, kind, preview}]，kind 为 base64嵌入 / URL / unknown。
            _findFontFaces(doc) {
                const out = [];
                try {
                    const sheets = doc.styleSheets || [];
                    for (let i = 0; i < sheets.length; i++) {
                        let rules = null;
                        try { rules = sheets[i].cssRules; } catch (e) { continue; } // 跨域样式表读不到
                        if (!rules) continue;
                        for (let j = 0; j < rules.length; j++) {
                            const r = rules[j];
                            const type = r.type;
                            const isFace = type === 5 || (r.constructor && r.constructor.name === 'CSSFontFaceRule');
                            if (!isFace) continue;
                            const style = r.style;
                            const src = (style && style.getPropertyValue && style.getPropertyValue('src')) || r.cssText || '';
                            let kind = 'unknown', preview = String(src).slice(0, 160);
                            if (/data:/i.test(src)) {
                                const m = src.match(/data:([^;,]+)/i);
                                kind = 'base64嵌入(' + (m ? m[1] : '') + ')';
                                preview = 'data:…（共 ' + src.length + ' 字符）';
                            } else if (/url\(/i.test(src)) {
                                const m = src.match(/url\((['"]?)([^'")]+)\1\)/i);
                                kind = 'URL';
                                preview = m ? m[2].slice(0, 200) : preview;
                            }
                            const fam = (style && style.getPropertyValue && style.getPropertyValue('font-family')) || r.fontFamily || '';
                            out.push({ family: fam, kind, preview });
                        }
                    }
                } catch (e) { /* ignore */ }
                return out;
            },

            // 启发式判断一段文字是否被「字体反爬」加密：
            // 学习通把常用字替换成一批冷僻字，这些冷僻字高度集中在少数区间且密集出现。
            _looksObfuscated(text) {
                const s = String(text || '');
                if (s.length < 8) return false;
                const rare = /[\u3400-\u4DBF\u5C90-\u5D30\u7F50-\u7F60\u9FA6-\u9FFF]/g;
                const m = s.match(rare);
                const n = m ? m.length : 0;
                return n >= 3 && n / s.length > 0.15;
            },

            // 简要描述一个元素的直接子节点（tag.class），并标出疑似「选项 / 可点击」的元素。
            _describeChildren(el) {
                const items = [];
                try {
                    const kids = el.children || [];
                    for (let i = 0; i < kids.length && i < 12; i++) {
                        const k = kids[i];
                        const cls = k.className ? '.' + String(k.className).trim().split(/\s+/).slice(0, 3).join('.') : '';
                        const clickable = !!(k.onclick) || /option|answer|choice|radio|select|item|topic|TiMu|ans/i.test(String(k.className || ''));
                        items.push(k.tagName.toLowerCase() + cls + (clickable ? '★' : ''));
                    }
                } catch (e) { /* ignore */ }
                return items.join('  ');
            },

            // DOM 诊断：把识别过程与页面结构打印到控制台，便于在真实页面定位结构差异
            _diagnose() {
                const docs = this._getQuestionDocuments();
                console.log('%c======== [AI答题] DOM 诊断开始 ========', 'color:#673AB7;font-weight:bold');
                console.log('origin：' + location.origin);
                console.log('URL：' + location.href.slice(0, 140));
                // 环境信息：用于判断「题目在 iframe 里」还是「选项不是标准控件」
                let iframes = [];
                try {
                    document.querySelectorAll('iframe').forEach((f) => {
                        let same = false;
                        try {
                            same = !!(f.contentDocument && f.contentDocument.location && f.contentDocument.location.hostname === location.hostname);
                        } catch (err) { same = false; }
                        iframes.push((f.src || '(无 src)').slice(0, 100) + '   [' + (same ? '同域可访问' : '跨域无法访问') + ']');
                    });
                } catch (err) { /* ignore */ }
                console.log('iframe 数量：' + iframes.length);
                iframes.forEach((t) => console.log('   - ' + t));
                console.log('可访问文档数（主文档 + 同域 iframe，已递归）：' + docs.length);
                let totalReal = 0, totalSuspect = 0;
                docs.forEach((doc, di) => {
                    let ctrls = [], items = [];
                    try {
                        ctrls = this._collectAnswerControls(doc);
                        items = this._collectQuestionBlocks(doc);
                    } catch (err) {
                        console.warn('文档 #' + (di + 1) + ' 解析失败：' + err.message);
                        return;
                    }
                    // 是否像「测验文档」：整篇含题型标签（【填空题】等）才算
                    let markerCount = 0;
                    try {
                        const m = doc.body && doc.body.innerHTML ? doc.body.innerHTML.match(/【\s*[^】]{1,8}\s*】/g) : null;
                        markerCount = m ? m.length : 0;
                    } catch (e) { /* ignore */ }
                    const isQuiz = markerCount > 0;
                    const label = doc === document ? '主文档' : ('iframe #' + di);
                    console.log('--- 文档 #' + (di + 1) + '（' + label + '）：可作答控件 ' + ctrls.length + ' 个，识别题目 ' + items.length + ' 个；题型标签 ' + markerCount + ' 个 → ' + (isQuiz ? '疑似测验文档' : '非测验文档（框架页/内容页，可忽略）') + ' ---');
                    // 字体反爬检测（学习通常把题目正文换成自定义字体，DOM 文本因此变成乱码）
                    const faces = this._findFontFaces(doc);
                    if (faces.length) {
                        console.log('   ⚠️ 检测到 @font-face ' + faces.length + ' 个（可能是字体反爬）：');
                        faces.forEach((f, fi) => console.log('      [' + (fi + 1) + '] family=' + (f.family || '(空)') + '  来源=' + f.kind + '  ' + f.preview));
                        let probe = items.length ? items[0].block : null;
                        if (!probe) { try { probe = doc.querySelector('.TiMu, .questionLi, .question, [class*="TiMu"]'); } catch (e) {} }
                        if (probe) {
                            let ff = '';
                            try { ff = ((doc.defaultView || window).getComputedStyle(probe).fontFamily) || ''; } catch (e) {}
                            console.log('      题块计算字体 font-family: ' + ff);
                        }
                        console.log('      → 若题干显示为乱码，说明正文被字体加密，须先「字体解密」才能识别。');
                    }
                    items.forEach((it, k) => {
                        const type = this._detectQuestionType(it.block, it.ctrls);
                        const stem = this._getQuestionText(it.block);
                        const real = !!stem && (TYPE_TAG_RE.test(stem) || /^\s*[（(]?\s*\d+\s*[)）．.、,，]/.test(stem));
                        const suspicious = !real;
                        if (real) totalReal++; else totalSuspect++;
                        const chain = [];
                        let el = it.block;
                        for (let d = 0; d < 4 && el && el.nodeType === 1; d++) {
                            const cls = el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : '';
                            chain.push(el.tagName.toLowerCase() + cls);
                            el = el.parentElement;
                        }
                        const c0 = it.ctrls[0];
                        const html = c0 ? (c0.outerHTML || '').replace(/\s+/g, ' ').slice(0, 220) : '';
                        console.log((real ? '  ✅ ' : '  ⚠️ ') + '#' + (k + 1) + ' [' + (TYPE_NAMES[type] || type) + '] 控件 ' + it.ctrls.length + ' 个' + (suspicious ? '【可疑：题干为空或像工具】' : ''));
                        console.log('     路径: ' + chain.join('  <  '));
                        console.log('     题干: ' + stem.slice(0, 100));
                        if (this._looksObfuscated(stem)) console.log('     ⚠️ 该题干疑似「字体加密」（乱码），需要字体解密后才有正确文本');
                        if (html) console.log('     控件HTML: ' + html);
                    });
                    try {
                        const un = this._collectUnanswerable(doc, items.map((it) => it.block));
                        if (un.length) {
                            console.log('   —— 以下 ' + un.length + ' 题无标准控件（排序 / 连线等，需适配）——');
                            un.forEach((el, ui) => {
                                const stem = this._getQuestionText(el);
                                console.log('   [无控件] #' + (ui + 1) + ' ' + stem.slice(0, 60));
                                if (this._looksObfuscated(stem)) console.log('      ⚠️ 题干疑似字体加密（乱码）');
                                console.log('      直接子节点: ' + (this._describeChildren(el) || '(无)') + '   （★=疑似选项/可点击）');
                                console.log('      控件统计: input/textarea/contenteditable = ' + el.querySelectorAll('input, textarea, [contenteditable]').length +
                                    '，img = ' + el.querySelectorAll('img').length + '，a = ' + el.querySelectorAll('a').length);
                                console.log('      HTML: ' + (el.innerHTML || '').replace(/\s+/g, ' ').slice(0, 700));
                            });
                        }
                    } catch (err) { /* ignore */ }
                });
                console.log('汇总：真实题目 ' + totalReal + ' 个，可疑 ' + totalSuspect + ' 个');
                console.log('%c======== 诊断结束（可截图此段反馈） ========', 'color:#673AB7;font-weight:bold');
                return docs.length;
            },
    };
}
