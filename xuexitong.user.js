// ==UserScript==
// @name         学习通自动刷课脚本
// @namespace    https://github.com/ZHE-you/Chaoxingxuexitong-ayto
// @version      3.6.1
// @description  自动播放、自动切换下一节，并在页面结构异常时安全停止。单文件：可直接粘贴到浏览器控制台，也可导入 Tampermonkey。
// @author       夏至子 (ZHE-you)
// @homepageURL  https://github.com/ZHE-you/Chaoxingxuexitong-ayto
// @supportURL   https://github.com/ZHE-you/Chaoxingxuexitong-ayto/issues
// @updateURL    https://raw.githubusercontent.com/ZHE-you/Chaoxingxuexitong-ayto/main/xuexitong.user.js
// @downloadURL  https://raw.githubusercontent.com/ZHE-you/Chaoxingxuexitong-ayto/main/xuexitong.user.js
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
//
// 提示：学习通官方 AI 接口位于 stat2-ans 域，而课程页在 mooc1 / mooc2-ans 域，
// 属于跨子域请求，浏览器 fetch 会被 CORS 拦截（表现为 Failed to fetch）。
// 若想让「官方 AI」在测验页可用，可把上面的「@grant none」改成
// 「@grant GM_xmlhttpRequest」——脚本会自动改用 GM 请求绕过跨域；
// 代价是脚本运行在油猴沙箱中，控制台的 app 命令（app.run() 等）将不可用。

(function () {
    const APP_KEY = '__xuexitongPlayerV3';
    const BOOT_TIMER_KEY = '__xuexitongPlayerV3BootTimer';

    const previousApp = window[APP_KEY];
    if (previousApp && typeof previousApp.destroy === 'function') {
        previousApp.destroy();
    }
    if (window[BOOT_TIMER_KEY]) {
        clearInterval(window[BOOT_TIMER_KEY]);
        window[BOOT_TIMER_KEY] = null;
    }

    // 关键：学习通页面自带 jQuery（1.7.2）并在其上挂载了大量页面插件（如 $.getNetScroll）。
    // 这里绝不能覆盖页面的 window.jQuery / window.$ —— 否则页面自身的插件会丢失，
    // 控制台将不断刷出 “$.getNetScroll is not a function”。
    // 因此：页面已有 jQuery 直接复用；仅当页面完全没有时才注入，作为兜底。
    if (typeof window.jQuery === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.type = 'text/javascript';
        script.onload = function () {
            console.log('页面未内置 jQuery，已注入一份供脚本使用。');
            waitForCoursePage();
        };
        script.onerror = function () {
            console.error('jQuery 加载失败，脚本无法运行。');
        };
        document.head.appendChild(script);
    } else {
        waitForCoursePage();
    }

    // ==================== 工具：MD5（用于计算学时上报的 enc 签名） ====================
    // 学习通「提交学时」接口要求一个 md5 签名，浏览器里没有内置，这里自带一个精简实现。
    function md5hex(str) {
        function safeAdd(x, y) {
            const lsw = (x & 0xffff) + (y & 0xffff);
            const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
            return (msw << 16) | (lsw & 0xffff);
        }
        function rol(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
        function cmn(q, a, b, x, s, t) { return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

        const input = unescape(encodeURIComponent(str));
        let len = input.length;
        const words = [];
        for (let i = 0; i < len; i++) words[i >> 2] |= (input.charCodeAt(i) & 0xff) << ((i % 4) * 8);
        words[len >> 2] |= 0x80 << ((len % 4) * 8);
        words[(((len + 8) >> 6) + 1) * 16 - 2] = len * 8;

        let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (let i = 0; i < words.length; i += 16) {
            const oa = a, ob = b, oc = c, od = d;
            a = ff(a, b, c, d, words[i + 0], 7, -680876936);
            d = ff(d, a, b, c, words[i + 1], 12, -389564586);
            c = ff(c, d, a, b, words[i + 2], 17, 606105819);
            b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
            a = ff(a, b, c, d, words[i + 4], 7, -176418897);
            d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
            c = ff(c, d, a, b, words[i + 6], 17, -1473231341);
            b = ff(b, c, d, a, words[i + 7], 22, -45705983);
            a = ff(a, b, c, d, words[i + 8], 7, 1770035416);
            d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
            c = ff(c, d, a, b, words[i + 10], 17, -42063);
            b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
            a = ff(a, b, c, d, words[i + 12], 7, 1804603682);
            d = ff(d, a, b, c, words[i + 13], 12, -40341101);
            c = ff(c, d, a, b, words[i + 14], 17, -1502002290);
            b = ff(b, c, d, a, words[i + 15], 22, 1236535329);

            a = gg(a, b, c, d, words[i + 1], 5, -165796510);
            d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
            c = gg(c, d, a, b, words[i + 11], 14, 643717713);
            b = gg(b, c, d, a, words[i + 0], 20, -373897302);
            a = gg(a, b, c, d, words[i + 5], 5, -701558691);
            d = gg(d, a, b, c, words[i + 10], 9, 38016083);
            c = gg(c, d, a, b, words[i + 15], 14, -660478335);
            b = gg(b, c, d, a, words[i + 4], 20, -405537848);
            a = gg(a, b, c, d, words[i + 9], 5, 568446438);
            d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
            c = gg(c, d, a, b, words[i + 3], 14, -187363961);
            b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
            a = gg(a, b, c, d, words[i + 13], 5, -1444681467);
            d = gg(d, a, b, c, words[i + 2], 9, -51403784);
            c = gg(c, d, a, b, words[i + 7], 14, 1735328473);
            b = gg(b, c, d, a, words[i + 12], 20, -1926607734);

            a = hh(a, b, c, d, words[i + 5], 4, -378558);
            d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
            c = hh(c, d, a, b, words[i + 11], 16, 1839030562);
            b = hh(b, c, d, a, words[i + 14], 23, -35309556);
            a = hh(a, b, c, d, words[i + 1], 4, -1530992060);
            d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
            c = hh(c, d, a, b, words[i + 7], 16, -155497632);
            b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
            a = hh(a, b, c, d, words[i + 13], 4, 681279174);
            d = hh(d, a, b, c, words[i + 0], 11, -358537222);
            c = hh(c, d, a, b, words[i + 3], 16, -722521979);
            b = hh(b, c, d, a, words[i + 6], 23, 76029189);
            a = hh(a, b, c, d, words[i + 9], 4, -640364487);
            d = hh(d, a, b, c, words[i + 12], 11, -421815835);
            c = hh(c, d, a, b, words[i + 15], 16, 530742520);
            b = hh(b, c, d, a, words[i + 2], 23, -995338651);

            a = ii(a, b, c, d, words[i + 0], 6, -198630844);
            d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
            c = ii(c, d, a, b, words[i + 14], 15, -1416354905);
            b = ii(b, c, d, a, words[i + 5], 21, -57434055);
            a = ii(a, b, c, d, words[i + 12], 6, 1700485571);
            d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
            c = ii(c, d, a, b, words[i + 10], 15, -1051523);
            b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
            a = ii(a, b, c, d, words[i + 8], 6, 1873313359);
            d = ii(d, a, b, c, words[i + 15], 10, -30611744);
            c = ii(c, d, a, b, words[i + 6], 15, -1560198380);
            b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
            a = ii(a, b, c, d, words[i + 4], 6, -145523070);
            d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
            c = ii(c, d, a, b, words[i + 2], 15, 718787259);
            b = ii(b, c, d, a, words[i + 9], 21, -343485551);

            a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
        }
        function hex(n) {
            let s = '';
            for (let j = 0; j < 4; j++) s += ('0' + ((n >> (j * 8)) & 0xff).toString(16)).slice(-2);
            return s;
        }
        return hex(a) + hex(b) + hex(c) + hex(d);
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // ==================== 题型定义 ====================
    // 学习通题干通常带【题型】标签，这是最可靠的结构锚点（不随 class 命名变化）。
    const TYPE_TAG_RE = /【\s*[^】]{1,8}\s*】/;
    // 标签文本 → 内部题型
    const TYPE_LABELS = [
        [/单选/, 'single'],
        [/多选/, 'multiple'],
        [/判断/, 'judge'],
        [/完型填空|完形填空/, 'cloze'],
        [/填空/, 'fill'],
        [/名词解释/, 'term'],
        [/听力/, 'listening'],
        [/阅读|材料题?/, 'reading'],
        [/简答|计算|分析|案例/, 'short'],
        [/论述/, 'essay'],
        [/分录/, 'entry'],
        [/排序/, 'sort'],
        [/连线|匹配/, 'match'],
    ];
    // 内部题型 → 中文名（用于给 AI 的提示与日志）
    const TYPE_NAMES = {
        single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题',
        cloze: '完型填空题', term: '名词解释', listening: '听力题', reading: '阅读理解',
        short: '简答题', essay: '论述题', entry: '分录题', sort: '排序题',
        match: '连线题', unknown: '未知题型',
    };
    // 脚本自身控制面板的 id：识别题目时必须排除它（面板里也有 checkbox）
    const PANEL_ID = 'xtControlPanel';

    // 主观题（需要用文字作答，且答案可能含多个要点）
    const SUBJECTIVE_TYPES = ['short', 'essay', 'term', 'entry', 'fill', 'cloze'];

    function waitForCoursePage() {
        let attempts = 0;
        const maxAttempts = 20;
        window[BOOT_TIMER_KEY] = setInterval(() => {
            if ($('#coursetree').length > 0) {
                clearInterval(window[BOOT_TIMER_KEY]);
                window[BOOT_TIMER_KEY] = null;
                initializePlayer();
                return;
            }
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(window[BOOT_TIMER_KEY]);
                window[BOOT_TIMER_KEY] = null;
                console.error('%c脚本启动超时：未检测到课程目录（#coursetree）。请确认当前处于课程播放页。', 'color:#F44336;font-weight:bold');
            }
        }, 1000);
    }

    function initializePlayer() {
        const app = {
            configs: {
                playbackRate: 1.5,
                autoplay: true,
                retryInterval: 2000,
                maxRetries: 10,
                videoCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
                autoAdvanceNoVideo: false,
                muted: false,
                aiEnabled: false,
                // aiSource: 'official' = 学习通自带 AI（免费、零配置）
                //           'custom'   = 自定义 OpenAI 兼容接口（需中转代理）
                //           'auto'     = 先官方 AI，失败自动回落自定义接口
                aiSource: 'official',
                aiApiBase: 'https://api.deepseek.com/v1/chat/completions',
                aiApiKey: '',
                aiModel: 'deepseek-chat',
                // 外部在线题库接口（可选）：命中则直接作答，不消耗 AI token
                bankUrl: '',
                // 快速模式：直接向学习通「提交学时」接口上报进度，不必真实播放视频
                fastVideo: false,
                vtStepSec: 58,      // 每次上报推进的秒数
                vtLoopMax: 400,     // 单个视频最多上报轮数，防止死循环
            },
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _userPaused: false,
            _started: false,
            _ui: null,
            _qaBank: {},
            _aiHandled: {},
            _aiWatchTimer: null,
            _aiStat: { answered: 0, failed: 0, lastResult: '' },
            _uiTimer: null,
            _currentRetryCount: 0,
            _checkInterval: null,
            _eventVideoEl: null,
            _boundVideoHandlers: null,
            _nextUnitPending: false,
            _chapterAdvanceTimes: 0,
            _cellData: {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentVideoTitle: "",
            },
            get cellData() {
                return this._cellData;
            },
            run() {
                console.log("%c=== 学习通自动刷课脚本 V3 优化版启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
                this._started = true;
                this._userPaused = false;
                this._nextUnitPending = false;
                this._chapterAdvanceTimes = 0;
                this._getTreeContainer();
                this._initCellData();
                this._videoEl = null;
                this._getVideoEl();
                this._clearCheckInterval();
                this._bindStepNavigation();
                this._loadAIBank();
                this._startAIWatch();
                this.play();
            },
            nextUnit() {
                if (this._nextUnitPending) {
                    console.warn('%c已有小节切换正在进行，忽略重复请求', 'color:#FF9800');
                    return;
                }
                this._nextUnitPending = true;
                this._clearCheckInterval();
                console.log("%c=== 准备切换到下一小节 ===", "color:#2196F3;font-size:14px");
                try {
                    const el = this._getTreeContainer();
                    const cells = el.children("ul").children("li");
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');

                    if (nCells.length > this._cellData.currentNCellIndex + 1) {
                        const nextNIndex = this._cellData.currentNCellIndex + 1;
                        console.log(`%c切换到同章节下一个视频: ${nextNIndex + 1}/${nCells.length}`, "color:#FF9800");
                        this.playCurrentIndex(nCells.get(nextNIndex));
                    } else {
                        const nextIndex = this._cellData.currentCellIndex + 1;
                        if (nextIndex >= cells.length) {
                            console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                            console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
                            console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                            return;
                        }
                        console.log(`%c切换到下一个章节: ${nextIndex + 1}/${cells.length}`, "color:#FF9800");
                        this._cellData.currentCellIndex = nextIndex;
                        this._cellData.currentNCellIndex = 0;
                        this.playCurrentIndex();
                    }
                } catch (error) {
                    this._nextUnitPending = false;
                    console.error('切换下一小节失败:', error);
                }
            },
            _clearCheckInterval() {
                if (this._checkInterval) {
                    clearInterval(this._checkInterval);
                    this._checkInterval = null;
                }
            },
            _startVideoMonitoring() {
                this._clearCheckInterval();
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                this._checkInterval = setInterval(() => {
                    this._checkVideoStatus();
                }, this.configs.videoCheckInterval);
            },
            _tryResumePlayback(reason) {
                if (this._userPaused) return;
                const now = Date.now();
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
                    return;
                }
                this._guardLastResumeTs = now;

                const video = this._getVideoEl();
                if (!video || !this._isPlaying) return;

                console.log(`%c触发视频保活恢复(${reason})`, "color:#607D8B");
                video.play().catch((e) => {
                    console.warn("直接恢复播放失败，尝试静音恢复:", e);
                    video.muted = true;
                    video.play().catch((err) => {
                        console.error("静音恢复播放失败:", err);
                    });
                });
            },
            _checkVideoStatus() {
                try {
                    const video = this._getVideoEl();
                    if (!video) return;

                    if (video.paused && this._isPlaying && !this._userPaused) {
                        console.log("%c检测到视频暂停，尝试恢复播放...", "color:#FF5722");
                        this._tryResumePlayback("paused");
                    } else if (this._isPlaying && !video.ended) {
                        const now = Date.now();
                        const current = Number(video.currentTime || 0);
                        if (this._guardLastWallTs === 0) {
                            this._guardLastWallTs = now;
                            this._guardLastTime = current;
                        } else {
                            const stalled = Math.abs(current - this._guardLastTime) < 0.01;
                            const stalledMs = now - this._guardLastWallTs;
                            if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
                                this._tryResumePlayback("no-progress");
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(video.currentTime || 0);
                            } else if (!stalled) {
                                this._guardLastWallTs = now;
                                this._guardLastTime = current;
                            }
                        }
                    }

                    if (video.ended && this._isPlaying && !this._userPaused) {
                        console.log("%c检测到视频结束，准备切换下一个...", "color:#9C27B0");
                        this._isPlaying = false;
                        setTimeout(() => this.nextUnit(), 1000);
                    }
                } catch (e) {
                    console.error("视频状态检查失败:", e);
                }
            },
            _tryTimes: 0,
            _stepSwitchAt: 0,
            _stepSwitchPending: false,
            _delayedNextUnitTimer: null,
            _guardLastTime: 0,
            _guardLastWallTs: 0,
            _guardLastResumeTs: 0,
            async play() {
                try {
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (this._currentStepTitle() === '视频') {
                            throw new Error('视频组件尚未加载完成');
                        }
                        if (this._advanceLearningStep()) {
                            console.log("%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试", "color:#607D8B");
                            setTimeout(() => {
                                this.play();
                            }, 2000);
                            return;
                        }
                        if (this._isChapterTest()) {
                            this._advanceChapterTest();
                            return;
                        }
                        this._isPlaying = false;
                        this._clearCheckInterval();
                        if (this.configs.autoAdvanceNoVideo) {
                            console.warn('%c当前小节未发现视频，按配置切换到下一小节', 'color:#FF9800');
                            this.nextUnit();
                        } else {
                            console.warn('%c当前小节未发现视频或可识别的学习步骤，已安全停止。确认无需完成课件后，可执行 app.nextUnit()。', 'color:#FF9800');
                        }
                        return;
                    }

                    this._isPlaying = true;
                    this._videoEventHandle();
                    el.playbackRate = this.configs.playbackRate;
                    el.muted = this.configs.muted;

                    try {
                        await el.play();
                        this._tryTimes = 0;
                        console.log(`%c视频开始播放，倍速: ${el.playbackRate}x`, "color:#4CAF50");
                        this._startVideoMonitoring();
                    } catch (playError) {
                        console.error("视频播放失败:", playError);
                        this._handlePlayError(playError);
                    }
                } catch (e) {
                    if (this._tryTimes >= this.configs.maxRetries) {
                        console.error("%c视频播放失败，已达到最大重试次数", "color:#F44336;font-weight:bold", e);
                        this._clearCheckInterval();
                        return;
                    }
                    this._tryTimes++;
                    console.log(`%c播放失败，${this.configs.retryInterval/1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, "color:#FF9800");
                    setTimeout(() => {
                        this.play();
                    }, this.configs.retryInterval);
                }
            },
            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) {
                    return true;
                }

                const prevTitle = document.getElementsByClassName("prev_title")[0];
                const currentStepTitle = prevTitle ? (prevTitle.title || prevTitle.textContent || "").trim() : "";

                if (currentStepTitle === "章节测验" || currentStepTitle === "视频") {
                    return false;
                }

                const clickElement = (el, label) => {
                    if (!el) return false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    console.log(`%c尝试点击${label}`, "color:#2196F3");
                    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                    return true;
                };

                const videoTab = $(".prev_white:visible").filter((_, el) => {
                    const text = ($(el).text() || "").replace(/\s+/g, "");
                    return text === "2视频" || text === "视频";
                }).get(0);
                if (clickElement(videoTab, "“视频”页签")) {
                    return true;
                }

                return false;
            },
            _currentStepTitle() {
                const prevTitle = document.getElementsByClassName('prev_title')[0];
                return prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
            },
            _isChapterTest() {
                return this._currentStepTitle() === '章节测验';
            },
            _advanceChapterTest() {
                if (this._chapterAdvanceTimes >= 3) {
                    console.error('%c章节测验页面连续跳转失败，已停止以避免页面循环。请手动处理后执行 app.run()。', 'color:#F44336;font-weight:bold');
                    return;
                }

                const nextButton = $('#prevNextFocusNext:visible, #right1:visible, .nextChapter:visible').first().get(0);
                if (!nextButton) {
                    console.warn('%c未找到章节测验的下一步按钮，已停止。', 'color:#FF9800');
                    return;
                }

                this._chapterAdvanceTimes++;
                console.log('%c检测到章节测验，尝试进入下一学习步骤', 'color:#607D8B');
                nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                setTimeout(() => { if (!this._userPaused) this.play(); }, 2000);
            },
            _bindStepNavigation() {
                if (this._stepNavigationBound) {
                    return;
                }
                this._stepNavigationBound = true;

                const reenterVideoMode = () => {
                    this._videoEl = null;
                    this._isPlaying = false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    setTimeout(() => {
                        try {
                            this._initCellData();
                        } catch (e) {}
                        if (!this._userPaused) this.play();
                    }, 1800);
                };

                $(document).off('click.xuexitongPlayerV3', '.prev_white').on('click.xuexitongPlayerV3', '.prev_white', (e) => {
                    const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
                    if (text.includes("视频")) {
                        console.log(`%c检测到步骤切换点击：${text}，准备重新接管视频页`, "color:#607D8B");
                        reenterVideoMode();
                    }
                });
            },
            _handlePlayError(error) {
                console.error("播放错误详情:", error);
                const video = this._getVideoEl();
                if (video) {
                    video.muted = true;
                    video.play().then(() => {
                        console.log("%c静音播放成功", "color:#4CAF50");
                        this._tryTimes = 0;
                        this._startVideoMonitoring();
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                            this._delayedNextUnitTimer = null;
                        }
                    }).catch(e => {
                        console.error("静音播放也失败:", e);
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                        }
                        this._isPlaying = false;
                        if (this._tryTimes >= this.configs.maxRetries) {
                            console.error('%c静音播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                            return;
                        }
                        this._tryTimes++;
                        this._delayedNextUnitTimer = setTimeout(() => {
                            this._delayedNextUnitTimer = null;
                            this.play();
                        }, this.configs.retryInterval);
                    });
                }
            },
            playCurrentIndex(nCell) {
                this._nextUnitPending = false;
                if (!nCell) {
                    const el = this._getTreeContainer();
                    const cells = el.children("ul").children("li");
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                    nCell = nCells.get(this._cellData.currentNCellIndex);
                }

                const $nCell = $(nCell);
                const clickableSpan = $nCell.find(".posCatalog_name")[0];
                if (!clickableSpan) {
                    console.error("%c===========找不到可点击的课程节点，播放下一个视频失败==============", "color:#F44336");
                    return;
                }

                console.log(`%c点击切换到: ${$(clickableSpan).attr('title') || '未知标题'}`, "color:#2196F3");
                $(clickableSpan).click();
                this._videoEl = null;
                this._isPlaying = false;

                console.log("%c等待视频加载...", "color:#FF9800");
                setTimeout(() => {
                    this._initCellData();
                    if (this.configs.autoplay && !this._userPaused) {
                        this.play();
                    }
                }, 3000);
            },
            _initCellData() {
                const el = this._getTreeContainer();
                const cells = el.children("ul").children("li");
                this._cellData.cells = cells.length;
                let nCellCounts = 0;
                let foundCurrent = false;

                cells.each((i, v) => {
                    const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
                    nCellCounts += nCells.length;
                    nCells.each((j, e) => {
                        const _el = $(e);
                        if (_el.hasClass("posCatalog_active")) {
                            this._cellData.currentCellIndex = i;
                            this._cellData.currentNCellIndex = j;
                            foundCurrent = true;
                            const titleSpan = _el.find('.posCatalog_name')[0];
                            if (titleSpan) {
                                this._cellData.currentVideoTitle = $(titleSpan).attr('title');
                            }
                        }
                    });
                });

                this._cellData.nCells = nCellCounts;

                if (!foundCurrent && nCellCounts > 0) {
                    console.warn("%c未找到当前激活的视频节点，可能需要手动选择", "color:#FF9800");
                }

                console.log(`%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`, "color:#607D8B");
            },
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    const el = $('#coursetree');
                    if (el.length <= 0) {
                        throw new Error("找不到视频列表");
                    }
                    this._treeContainerEl = el;
                }
                return this._treeContainerEl;
            },
            _getVideoEl() {
                if (!this._videoEl) {
                    try {
                        const findVideo = (frame, depth) => {
                            if (depth > 2) return null;
                            const frameDocument = frame.contentDocument || frame.contentWindow?.document;
                            if (!frameDocument) return null;
                            const $frameDocument = $(frameDocument);
                            const directVideo = $frameDocument.find('video#video_html5_api, video[id*="video_html5"]').get(0);
                            if (directVideo) return directVideo;

                            const nestedFrames = $frameDocument.find('iframe.ans-insertvideo-online, iframe[src*="video"]');
                            for (const nestedFrame of nestedFrames.toArray()) {
                                const nestedVideo = findVideo(nestedFrame, depth + 1);
                                if (nestedVideo) return nestedVideo;
                            }
                            return null;
                        };

                        for (const frame of $('iframe').toArray()) {
                            const video = findVideo(frame, 0);
                            if (video) {
                                this._videoEl = video;
                                break;
                            }
                        }
                    } catch (e) {
                        console.error("获取视频元素失败:", e);
                        return null;
                    }
                }
                if (!this._videoEl) return null;
                return this._videoEl;
            },
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log("videoEl未加载");
                    return;
                }

                if (this._eventVideoEl === el) return;
                this._detachVideoEvents();
                this._eventVideoEl = el;
                this._boundVideoHandlers = {
                    ended: this._handleVideoEnded.bind(this),
                    loadedmetadata: this._handleVideoLoaded.bind(this),
                    play: this._handleVideoPlay.bind(this),
                    pause: this._handleVideoPause.bind(this),
                };

                el.addEventListener('ended', this._boundVideoHandlers.ended);
                el.addEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                el.addEventListener('play', this._boundVideoHandlers.play);
                el.addEventListener('pause', this._boundVideoHandlers.pause);
            },
            _detachVideoEvents() {
                if (!this._eventVideoEl || !this._boundVideoHandlers) return;
                this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
                this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
                this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
                this._eventVideoEl = null;
                this._boundVideoHandlers = null;
            },
            _handleVideoEnded(e) {
                const title = this._cellData.currentVideoTitle;
                console.warn(`%c============'${title}' 播放完成=============`, "color:#4CAF50;font-weight:bold");
                this._isPlaying = false;
                this._clearCheckInterval();
                setTimeout(() => this.nextUnit(), 1000);
            },
            _handleVideoLoaded(e) {
                console.log(`%c============视频加载完成=============`, "color:#2196F3");
                // 快速模式：不真实播放，改为直接向学时接口上报进度；失败则自动回退普通播放
                if (this.configs.fastVideo && !this._fastRunning) {
                    this._fastRunCurrentVideo().then((ok) => {
                        if (!ok && this.configs.autoplay && !this._isPlaying && !this._userPaused) {
                            console.log('%c[快速模式] 未能接管，改由普通播放继续', 'color:#FF9800');
                            this.play();
                        }
                    });
                    return;
                }
                if (this.configs.autoplay && !this._isPlaying && !this._userPaused) {
                    this.play();
                }
            },
            _handleVideoPlay(e) {
                const title = this._cellData.currentVideoTitle;
                console.info(`%c============'${title}' 开始播放=============`, "color:#4CAF50");
                this._isPlaying = true;
                this._stepSwitchPending = false;
                const video = this._getVideoEl();
                this._guardLastTime = Number(video?.currentTime || 0);
                this._guardLastWallTs = Date.now();
                if (this._delayedNextUnitTimer) {
                    clearTimeout(this._delayedNextUnitTimer);
                    this._delayedNextUnitTimer = null;
                }
            },
            _handleVideoPause(e) {
                console.log(`%c============视频暂停=============`, "color:#FF9800");
            },
            _bindPageGuards() {
                const preventPause = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                };
                const resumePlaybackNow = () => this._tryResumePlayback('page-event');
                this._pageGuards = { preventPause, resumePlaybackNow };
                document.addEventListener('mouseleave', preventPause);
                window.addEventListener('mouseleave', preventPause);
                document.addEventListener('mouseout', preventPause);
                window.addEventListener('mouseout', preventPause);
                window.addEventListener('blur', resumePlaybackNow);
                document.addEventListener('visibilitychange', resumePlaybackNow);
            },
            destroy() {
                this._isPlaying = false;
                this._userPaused = true;
                this._clearCheckInterval();
                this._detachVideoEvents();
                if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
                if (this._uiTimer) { clearInterval(this._uiTimer); this._uiTimer = null; }
                if (this._aiWatchTimer) { clearInterval(this._aiWatchTimer); this._aiWatchTimer = null; }
                this._ui = null;
                $(document).off('.xuexitongPlayerV3');
                const panel = document.getElementById('xtControlPanel');
                if (panel) panel.remove();
                if (this._pageGuards) {
                    const { preventPause, resumePlaybackNow } = this._pageGuards;
                    document.removeEventListener('mouseleave', preventPause);
                    window.removeEventListener('mouseleave', preventPause);
                    document.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('blur', resumePlaybackNow);
                    document.removeEventListener('visibilitychange', resumePlaybackNow);
                    this._pageGuards = null;
                }
            },
            _loadSavedConfigs() {
                try {
                    const map = {
                        playbackRate: ['xtCfg_playbackRate', (v) => parseFloat(v)],
                        autoplay: ['xtCfg_autoplay', (v) => v === '1'],
                        autoAdvanceNoVideo: ['xtCfg_autoAdvanceNoVideo', (v) => v === '1'],
                        muted: ['xtCfg_muted', (v) => v === '1'],
                        aiEnabled: ['xtAi_enabled', (v) => v === '1'],
                        aiApiBase: ['xtAi_apiBase', (v) => v],
                        aiApiKey: ['xtAi_apiKey', (v) => v],
                        aiModel: ['xtAi_model', (v) => v],
                        aiSource: ['xtAi_source', (v) => v],
                        bankUrl: ['xtAi_bankUrl', (v) => v],
                        fastVideo: ['xtAi_fastVideo', (v) => v === '1'],
                    };
                    for (const key in map) {
                        const [k, parse] = map[key];
                        const raw = localStorage.getItem(k);
                        if (raw !== null) {
                            const val = parse(raw);
                            if (key === 'playbackRate' && (isNaN(val) || val <= 0)) continue;
                            this.configs[key] = val;
                        }
                    }
                } catch (e) {}
            },
            _saveConfig(key, value) {
                try {
                    const store = { playbackRate: 'xtCfg_playbackRate', autoplay: 'xtCfg_autoplay', autoAdvanceNoVideo: 'xtCfg_autoAdvanceNoVideo', muted: 'xtCfg_muted', aiEnabled: 'xtAi_enabled', aiApiBase: 'xtAi_apiBase', aiApiKey: 'xtAi_apiKey', aiModel: 'xtAi_model', aiSource: 'xtAi_source', bankUrl: 'xtAi_bankUrl', fastVideo: 'xtAi_fastVideo' };
                    localStorage.setItem(store[key], String(value));
                } catch (e) {}
            },
            pause() {
                if (this._userPaused) return;
                this._userPaused = true;
                this._isPlaying = false;
                this._clearCheckInterval();
                const v = this._getVideoEl();
                if (v) v.pause();
                console.log('%c[控制台] 已暂停，不再自动续播', 'color:#FF9800');
            },
            resume() {
                this._userPaused = false;
                const v = this._getVideoEl();
                if (v) {
                    v.playbackRate = this.configs.playbackRate;
                    v.muted = this.configs.muted;
                    v.play().then(() => {
                        this._isPlaying = true;
                        this._startVideoMonitoring();
                    }).catch(() => {});
                } else {
                    this.play();
                }
            },
            stop() {
                this._userPaused = true;
                this._isPlaying = false;
                this._started = false;
                this._clearCheckInterval();
                this._detachVideoEvents();
                const v = this._getVideoEl();
                if (v) v.pause();
                console.log('%c[控制台] 已停止', 'color:#F44336');
            },
            _buildUI() {
                if (document.getElementById('xtControlPanel')) return;
                const css = `
#xtControlPanel{position:fixed;top:16px;right:16px;z-index:2147483647;width:248px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#222;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);user-select:none;overflow:hidden;}
#xtControlPanel .xt-header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;cursor:move;font-weight:600;}
#xtControlPanel .xt-min{background:rgba(255,255,255,.25);border:none;color:#fff;width:22px;height:22px;border-radius:5px;cursor:pointer;font-size:14px;line-height:1;}
#xtControlPanel .xt-body{padding:10px;}
#xtControlPanel.xt-collapsed .xt-body{display:none;}
#xtControlPanel .xt-status{font-size:12px;color:#555;margin-bottom:2px;}
#xtControlPanel .xt-status b{color:#2563eb;}
#xtControlPanel .xt-info{font-size:11px;color:#888;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xtControlPanel .xt-row{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;}
#xtControlPanel .xt-speed{flex-direction:column;align-items:stretch;gap:4px;}
#xtControlPanel .xt-speed label{display:flex;justify-content:space-between;font-size:12px;color:#444;}
#xtControlPanel input[type=range]{width:100%;}
#xtControlPanel .xt-btn{flex:1;min-width:64px;padding:7px 4px;border:1px solid #d0d5dd;border-radius:7px;background:#f9fafb;color:#222;cursor:pointer;font-size:12px;}
#xtControlPanel .xt-btn:hover{background:#eef2ff;}
#xtControlPanel .xt-btn.xt-primary{background:#2563eb;color:#fff;border-color:#2563eb;}
#xtControlPanel .xt-btn.xt-primary:hover{background:#1d4ed8;}
#xtControlPanel .xt-btn.xt-danger{background:#fff;color:#dc2626;border-color:#fca5a5;}
#xtControlPanel .xt-btn.xt-danger:hover{background:#fef2f2;}
#xtControlPanel .xt-checks label{display:flex;align-items:center;gap:4px;font-size:12px;color:#444;flex:1;}
#xtControlPanel .xt-tip{font-size:10px;color:#aaa;line-height:1.4;}
#xtControlPanel details.xt-ai{margin:8px 0 4px;border-top:1px dashed #e0e0e0;padding-top:6px;}
#xtControlPanel details.xt-ai>summary{cursor:pointer;font-size:12px;font-weight:600;color:#2563eb;outline:none;}
#xtControlPanel .xt-ai-body{padding:6px 2px 0;}
#xtControlPanel .xt-ai-en{display:flex;align-items:center;gap:4px;font-size:12px;color:#444;margin-bottom:6px;}
#xtControlPanel .xt-ai-stat{font-size:11px;color:#888;margin-bottom:6px;word-break:break-all;}
#xtControlPanel .xt-inp{width:100%;box-sizing:border-box;margin-bottom:5px;padding:5px;border:1px solid #d0d5dd;border-radius:6px;font-size:12px;}
#xtControlPanel .xt-ai-body .xt-btn{margin-bottom:5px;}
#xtControlPanel details.xt-ai-adv{margin-top:4px;}
#xtControlPanel details.xt-ai-adv>summary{cursor:pointer;font-size:11px;color:#666;outline:none;}
#xtControlPanel .xt-sel{width:100%;box-sizing:border-box;margin:3px 0;padding:4px 6px;border:1px solid #d0d7de;border-radius:4px;font-size:11px;background:#fff;color:#24292f;outline:none;}
#xtControlPanel details.xt-ai-adv .xt-sel{margin-top:2px;}
`;
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);

                const panel = document.createElement('div');
                panel.id = 'xtControlPanel';
                panel.innerHTML =
                    '<div class="xt-header"><span>学习通刷课控制台</span><button class="xt-min" title="收起/展开">—</button></div>' +
                    '<div class="xt-body">' +
                        '<div class="xt-status">状态：<b id="xtState">空闲</b></div>' +
                        '<div class="xt-info" id="xtInfo">—</div>' +
                        '<div class="xt-row xt-speed"><label>播放倍速 <span id="xtSpeedVal">1.5</span>x</label><input type="range" id="xtSpeed" min="0.5" max="4" step="0.5" value="1.5"></div>' +
                        '<div class="xt-row xt-btns"><button id="xtPlay" class="xt-btn xt-primary">开始</button><button id="xtPause" class="xt-btn">暂停</button><button id="xtNext" class="xt-btn">下一节</button></div>' +
                        '<div class="xt-row xt-btns"><button id="xtRerun" class="xt-btn">重新运行</button><button id="xtStop" class="xt-btn xt-danger">停止</button></div>' +
                        '<div class="xt-row xt-checks"><label><input type="checkbox" id="xtAutoplay"> 自动播放</label><label><input type="checkbox" id="xtSkipNoVideo"> 无视频跳过</label></div>' +
                        '<div class="xt-row xt-checks"><label><input type="checkbox" id="xtMuted"> 静音播放</label></div>' +
                        '<details class="xt-ai" open><summary>🤖 AI 答题（题库优先）</summary>' +
                        '<div class="xt-ai-body">' +
                        '<label class="xt-ai-en"><input type="checkbox" id="xtAiEnable"> 启用自动答题</label>' +
                        '<div class="xt-ai-stat" id="xtAiStat">已答 0 · 失败 0</div>' +
                        '<select id="xtAiSource" class="xt-sel">' +
                        '<option value="official">🆓 官方 AI（免费零配置）</option>' +
                        '<option value="custom">🔧 自定义接口（需代理）</option>' +
                        '<option value="auto">🔄 自动（官方优先+回落）</option>' +
                        '</select>' +
                        '<div class="xt-row xt-btns"><button id="xtAiScan" class="xt-btn">立即扫描</button><button id="xtAiDiag" class="xt-btn">诊断</button></div>' +
                        '<div class="xt-row xt-btns"><button id="xtAiImport" class="xt-btn">导入题库</button><button id="xtAiExport" class="xt-btn">导出题库</button></div>' +
                        '<details class="xt-ai-adv"><summary>⚡ 快速模式 / API 设置</summary>' +
                        '<label class="xt-ai-en"><input type="checkbox" id="xtFastVideo"> ⚡ 快速学时上报（免真实播放）</label>' +
                        '<select id="xtAiPreset" class="xt-sel">' +
                        '<option value="">— 服务商快速填充 —</option>' +
                        '<option value="deepseek">DeepSeek</option>' +
                        '<option value="qwen">通义千问</option>' +
                        '<option value="doubao">豆包（火山引擎）</option>' +
                        '<option value="zhipu">智谱 GLM</option>' +
                        '<option value="xinghuo">讯飞星火</option>' +
                        '<option value="siliconflow">硅基流动</option>' +
                        '<option value="openai">OpenAI</option>' +
                        '<option value="local">本地代理 npm run proxy</option>' +
                        '</select>' +
                        '<input type="text" id="xtBankUrl" class="xt-inp" placeholder="外部题库接口 URL（可选，命中则不消耗 AI）">' +
                        '<input type="text" id="xtAiBase" class="xt-inp" placeholder="API 地址（如 http://127.0.0.1:8787/v1/chat/completions）">' +
                        '<input type="password" id="xtAiKey" class="xt-inp" placeholder="API Key（留空则由代理注入，推荐）">' +
                        '<input type="text" id="xtAiModel" class="xt-inp" placeholder="模型名(默认 deepseek-chat)">' +
                        '<div class="xt-tip">🔒 推荐把真实密钥写在代理的环境变量 / .env 里，此处留空即可——这样密钥不会存在浏览器中。</div>' +
                        '</details>' +
                        '</div></details>' +
                        '<div class="xt-tip">倍速/静音即时生效；暂停后不再自动续播。配置自动保存。</div>' +
                    '</div>';
                document.body.appendChild(panel);

                const byId = (id) => document.getElementById(id);
                const speed = byId('xtSpeed');
                const speedVal = byId('xtSpeedVal');
                const stateEl = byId('xtState');
                const infoEl = byId('xtInfo');
                const autoplayCb = byId('xtAutoplay');
                const skipCb = byId('xtSkipNoVideo');
                const muteCb = byId('xtMuted');

                speed.value = this.configs.playbackRate;
                speedVal.textContent = this.configs.playbackRate;
                autoplayCb.checked = !!this.configs.autoplay;
                skipCb.checked = !!this.configs.autoAdvanceNoVideo;
                muteCb.checked = !!this.configs.muted;

                const aiEnableCb = byId('xtAiEnable');
                const aiStatEl = byId('xtAiStat');
                const aiSource = byId('xtAiSource');
                const aiPreset = byId('xtAiPreset');
                const bankUrl = byId('xtBankUrl');
                bankUrl.value = this.configs.bankUrl || '';
                const aiBase = byId('xtAiBase');
                const aiKey = byId('xtAiKey');
                const aiModel = byId('xtAiModel');
                const fastVideoCb = byId('xtFastVideo');
                aiEnableCb.checked = !!this.configs.aiEnabled;
                aiSource.value = this.configs.aiSource || 'official';
                fastVideoCb.checked = !!this.configs.fastVideo;
                aiBase.value = this.configs.aiApiBase;
                aiKey.value = this.configs.aiApiKey;
                aiModel.value = this.configs.aiModel;

                // 服务商预设：大部分官方 API 禁止浏览器跨域，标注 ⚠ 的必须走中转代理
                const AI_PRESETS = {
                    deepseek: { base: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
                    qwen: { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
                    doubao: { base: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-pro-32k' },
                    zhipu: { base: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
                    xinghuo: { base: 'https://spark-api-open.xf-yun.com/v1/chat/completions', model: 'generalv3.5' },
                    siliconflow: { base: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-7B-Instruct' },
                    openai: { base: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
                    local: { base: 'http://127.0.0.1:8787/v1/chat/completions', model: 'deepseek-chat' },
                };
                aiPreset.addEventListener('change', () => {
                    const preset = AI_PRESETS[aiPreset.value];
                    if (!preset) return;
                    aiBase.value = preset.base;
                    aiModel.value = preset.model;
                    console.log('%c[AI答题] 已填充 ' + aiPreset.value + ' 预设。注意：官方接口通常禁止浏览器跨域，' +
                        '建议改用 local 预设（npm run proxy）或自建中转代理。', 'color:#FF9800');
                    saveAiCfg();
                });
                aiSource.addEventListener('change', () => {
                    this.configs.aiSource = aiSource.value;
                    this._saveConfig('aiSource', aiSource.value);
                    console.log('%c[AI答题] 答案来源切换为：' + aiSource.selectedOptions[0].textContent.trim(), 'color:#2196F3');
                });
                fastVideoCb.addEventListener('change', () => {
                    this.configs.fastVideo = fastVideoCb.checked;
                    this._saveConfig('fastVideo', fastVideoCb.checked ? '1' : '0');
                    console.log('%c[快速模式] 已' + (fastVideoCb.checked ? '启用' : '关闭') +
                        '。启用后下一次视频加载时不真实播放，改为向学时接口直接上报进度。', 'color:#9C27B0');
                });
                aiEnableCb.addEventListener('change', () => {
                    this.configs.aiEnabled = aiEnableCb.checked;
                    this._saveConfig('aiEnabled', aiEnableCb.checked ? '1' : '0');
                    if (aiEnableCb.checked) { this._loadAIBank(); this._startAIWatch(); }
                });
                const saveAiCfg = () => {
                    this.configs.aiApiBase = aiBase.value.trim();
                    this.configs.aiApiKey = aiKey.value.trim();
                    this.configs.aiModel = aiModel.value.trim() || 'deepseek-chat';
                    this.configs.bankUrl = bankUrl.value.trim();
                    this._saveConfig('aiApiBase', this.configs.aiApiBase);
                    this._saveConfig('aiApiKey', this.configs.aiApiKey);
                    this._saveConfig('aiModel', this.configs.aiModel);
                    this._saveConfig('bankUrl', this.configs.bankUrl);
                    console.log('%c[AI答题] API 配置已保存', 'color:#2196F3');
                };
                bankUrl.addEventListener('change', saveAiCfg);
                aiBase.addEventListener('change', saveAiCfg);
                aiKey.addEventListener('change', saveAiCfg);
                aiModel.addEventListener('change', saveAiCfg);
                byId('xtAiScan').addEventListener('click', () => {
                    this._scanAndAnswer(true);
                });
                byId('xtAiDiag').addEventListener('click', () => this._diagnose());
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json,application/json';
                fileInput.style.display = 'none';
                fileInput.addEventListener('change', () => {
                    const f = fileInput.files && fileInput.files[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            const data = JSON.parse(reader.result);
                            let added = 0;
                            if (Array.isArray(data)) {
                                data.forEach(it => { if (it && it.q) { this._qaBank[it.q] = it.a; added++; } });
                            } else {
                                for (const k in data) { this._qaBank[k] = data[k]; added++; }
                            }
                            this._saveAIBank();
                            console.log('%c[AI答题] 题库导入成功，新增 ' + added + ' 条', 'color:#4CAF50');
                        } catch (e) { console.error('%c[AI答题] 题库导入失败：' + e.message, 'color:#F44336'); }
                    };
                    reader.readAsText(f);
                });
                document.body.appendChild(fileInput);
                byId('xtAiImport').addEventListener('click', () => fileInput.click());
                byId('xtAiExport').addEventListener('click', () => {
                    try {
                        const blob = new Blob([JSON.stringify(this._qaBank || {}, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = 'xuexitong_qa_bank.json';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
                        console.log('%c[AI答题] 题库已导出', 'color:#4CAF50');
                    } catch (e) {}
                });

                speed.addEventListener('input', () => {
                    const v = parseFloat(speed.value);
                    if (isNaN(v) || v <= 0) return;
                    speedVal.textContent = v;
                    this.configs.playbackRate = v;
                    this._saveConfig('playbackRate', v);
                    const video = this._getVideoEl();
                    if (video) video.playbackRate = v;
                });
                autoplayCb.addEventListener('change', () => {
                    this.configs.autoplay = autoplayCb.checked;
                    this._saveConfig('autoplay', autoplayCb.checked ? '1' : '0');
                });
                skipCb.addEventListener('change', () => {
                    this.configs.autoAdvanceNoVideo = skipCb.checked;
                    this._saveConfig('autoAdvanceNoVideo', skipCb.checked ? '1' : '0');
                });
                muteCb.addEventListener('change', () => {
                    this.configs.muted = muteCb.checked;
                    this._saveConfig('muted', muteCb.checked ? '1' : '0');
                    const video = this._getVideoEl();
                    if (video) video.muted = muteCb.checked;
                });
                byId('xtPlay').addEventListener('click', () => {
                    if (!this._started) this.run(); else this.resume();
                });
                byId('xtPause').addEventListener('click', () => this.pause());
                byId('xtNext').addEventListener('click', () => this.nextUnit());
                byId('xtRerun').addEventListener('click', () => this.run());
                byId('xtStop').addEventListener('click', () => this.stop());
                panel.querySelector('.xt-min').addEventListener('click', () => {
                    panel.classList.toggle('xt-collapsed');
                });

                this._makeDraggable(panel, panel.querySelector('.xt-header'));

                this._ui = { stateEl, infoEl, aiStatEl };
                this._updateStatus();
                this._uiTimer = setInterval(() => this._updateStatus(), 800);
            },
            _updateStatus() {
                if (!this._ui) return;
                const { stateEl, infoEl } = this._ui;
                let state = '空闲';
                if (this._userPaused) state = '已暂停';
                else if (this._fastRunning) state = '⚡快速';
                else if (this._isPlaying) state = '运行中';
                stateEl.textContent = state;
                const cd = this._cellData;
                let info = '第' + (cd.currentCellIndex + 1) + '章 第' + (cd.currentNCellIndex + 1) + '节 · ' + (cd.currentVideoTitle || '—');
                if (this._fastRunning && this._fastProgress) info += ' ⚡' + this._fastProgress;
                infoEl.textContent = info;
                if (this._ui.aiStatEl) {
                    const src = this._aiStat.lastSource ? ' · ' + this._aiStat.lastSource : '';
                    this._ui.aiStatEl.textContent = '已答 ' + this._aiStat.answered + ' · 失败 ' + this._aiStat.failed + (this._aiStat.lastResult ? ' · ' + this._aiStat.lastResult : '') + src;
                }
            },
            // ===== AI 答题模块（题库优先 + AI 兜底）=====
            // 适用范围：视频中途插入题、章节小测验。（不含作业/考试）
            // 浏览器直连大模型官方 API 通常被 CORS 拦截，请把 aiApiBase 设为
            // 你自建的中转代理（Cloudflare Worker / one-api / nginx 反代）地址。

            _getQuestionDocuments() {
                const docs = [document];
                try {
                    document.querySelectorAll('iframe').forEach((f) => {
                        try {
                            const fd = f.contentDocument;
                            if (fd && fd.location && fd.location.hostname === location.hostname) docs.push(fd);
                        } catch (e) { /* 跨域 iframe 跳过 */ }
                    });
                } catch (e) {}
                return docs;
            },

            _loadAIBank() {
                try {
                    const raw = localStorage.getItem('xtQA_bank');
                    this._qaBank = raw ? JSON.parse(raw) : {};
                } catch (e) { this._qaBank = {}; }
                if (!this._qaBank || typeof this._qaBank !== 'object') this._qaBank = {};
            },
            _saveAIBank() {
                try { localStorage.setItem('xtQA_bank', JSON.stringify(this._qaBank || {})); } catch (e) {}
            },
            _lookupBank(q) {
                if (!this._qaBank) return null;
                q = (q || '').trim();
                if (!q) return null;
                if (this._qaBank[q]) return this._qaBank[q];
                for (const key in this._qaBank) {
                    if (!key) continue;
                    if (q.indexOf(key) !== -1 || key.indexOf(q) !== -1) return this._qaBank[key];
                }
                return null;
            },
            _addToBank(q, a) {
                if (!q || !a) return;
                q = q.trim(); a = String(a).trim();
                if (!this._qaBank) this._qaBank = {};
                if (!this._qaBank[q]) {
                    this._qaBank[q] = a;
                    this._saveAIBank();
                    console.log('%c[AI答题] 已加入题库：' + q.slice(0, 30), 'color:#8BC34A');
                }
            },

            // ==================== 课程 / 视频参数提取 ====================
            // 从当前页面 URL、iframe 地址与 cookie 中解析接口所需的各种 ID。
            _getCourseIds() {
                const res = { courseId: '', clazzId: '', cpi: '', knowledgeId: '', objectId: '', jobid: '', userId: '' };
                try {
                    const params = new URLSearchParams(location.search);
                    res.courseId = params.get('courseId') || params.get('courseid') || '';
                    res.clazzId = params.get('clazzId') || params.get('clazzid') || '';
                    res.cpi = params.get('cpi') || '';
                    res.knowledgeId = params.get('knowledgeId') || params.get('knowledgeid') || '';
                } catch (e) { /* ignore */ }

                document.querySelectorAll('iframe').forEach((f) => {
                    try {
                        const u = f.src || f.getAttribute('src') || '';
                        if (!u) return;
                        const m = u.match(/objectId=([^&]+)/i) || u.match(/[?&]k=([^&]+)/i);
                        if (m && !res.objectId) res.objectId = decodeURIComponent(m[1]);
                    } catch (e) { /* ignore */ }
                });

                const ck = document.cookie.match(/(?:^|;\s*)UID=([^;]*)/) || document.cookie.match(/(?:^|;\s*)_uid=([^;]*)/);
                if (ck) res.userId = ck[1];
                return res;
            },

            // ==================== 任务点卡片数据 ====================
            // 参考 yatori-go-core 的做法：从 cards 接口取出内含 attachments / defaults 的
            // mArg JSON，其中包含 otherInfo、jobid、objectId、rt 以及各种 enc —— 这些正是
            // 学时上报接口所必需的参数。
            // 这里用 location.origin 构造地址，保证同源请求、规避跨域问题（浏览器方案的优势）。
            async _fetchCardsData(ids) {
                const q = [
                    'clazzid=' + encodeURIComponent(ids.clazzId),
                    'courseid=' + encodeURIComponent(ids.courseId),
                    'knowledgeid=' + encodeURIComponent(ids.knowledgeId),
                    'num=0', 'ut=s',
                    'cpi=' + encodeURIComponent(ids.cpi),
                    'v=2025-0424-1038-3', 'mooc2=1',
                    'isMicroCourse=false', 'editorPreview=0',
                ].join('&');
                const url = location.origin + '/mooc-ans/knowledge/cards?' + q;
                const resp = await fetch(url, { credentials: 'include', headers: { 'Accept': '*/*' } });
                if (!resp.ok) throw new Error('获取任务点卡片失败：HTTP ' + resp.status);
                const text = await resp.text();
                const m = text.match(/mArg\s*=\s*([^;]{6,})/);
                if (!m) throw new Error('任务点卡片中未找到 mArg');
                let data;
                try {
                    data = JSON.parse(m[1].trim());
                } catch (e) {
                    throw new Error('mArg 解析失败');
                }
                return data;
            },

            // otherInfo 形如 nodeId_x-cpi_x-rt_0.9-ds_0-ff_1... ，rt 隐含在其中
            _parseRtFromOtherInfo(otherInfo) {
                const m = String(otherInfo || '').match(/-rt_([^&-]+)/);
                if (!m) return null;
                const v = parseFloat(m[1]);
                return isNaN(v) ? null : v;
            },

            // 从 cards 数据中挑出一个尚未完成的视频 / 音频任务点
            _pickMediaPoint(data) {
                const atts = (data && data.attachments) || [];
                const d = (data && data.defaults) || {};
                for (const a of atts) {
                    if (!a) continue;
                    const t = (a.type || '').toLowerCase();
                    if (t !== 'video' && t !== 'audio') continue;
                    if (!a.job) continue;                 // 非任务点视频无需上报学时
                    if (a.isPassed) continue;             // 已完成则交给下一个任务点
                    const duration = Number(a.attDuration || 0);
                    if (!duration) continue;
                    const objectId = a.objectId || (a.property && a.property.objectid) || '';
                    if (!objectId) continue;
                    const otherInfo = a.otherInfo || '';
                    return {
                        type: t,
                        duration: duration,
                        playTimeMs: Number(a.playTime || 0), // 注意：接口返回的是毫秒
                        objectId: objectId,
                        jobid: a.jobid || (a.property && a.property.jobid) || '',
                        otherInfo: otherInfo,
                        rt: this._parseRtFromOtherInfo(otherInfo) || Number(d.rt) || 0.9,
                        attDurationEnc: a.attDurationEnc || '',
                        videoFaceCaptureEnc: a.videoFaceCaptureEnc || '',
                        title: (a.property && a.property.name) || '',
                        cpi: d.cpi || '',
                        dtoken: d.ktoken || '',
                        userid: d.userid || '',
                    };
                }
                return null;
            },

            // 查询视频元数据（时长 / dtoken / rt 等），学时上报签名依赖这些数据
            async _fetchVideoStatus(objectId, fid) {
                const url = 'https://mooc1-api.chaoxing.com/ananas/status/' + objectId +
                    '?k=' + encodeURIComponent(fid || '') + '&flag=normal&_dc=' + Date.now();
                const resp = await fetch(url, { credentials: 'include', headers: { 'Accept': '*/*' } });
                if (!resp.ok) throw new Error('获取视频状态失败：HTTP ' + resp.status);
                const d = await resp.json().catch(() => null);
                if (!d) throw new Error('视频状态解析失败');
                return {
                    duration: Number(d.duration || 0),
                    dtoken: d.dtoken || '',
                    rt: d.rt || 0.9,
                    attDurationEnc: d.attDurationEnc || '',
                    videoFaceCaptureEnc: (d.tracking && d.tracking.videoFaceCaptureEnc) || '',
                    isPassed: !!d.isPassed,
                    playTime: Number(d.playTime || 0),
                };
            },

            // 计算学时上报的 enc 签名（算法参照学习通 Web 端实现）
            _calcEnc(p, playingTime, duration) {
                const clipTime = '0_' + duration;
                const raw = '[' + p.clazzId + '][' + p.userId + '][' + p.jobid + '][' + p.objectId +
                    '][' + playingTime * 1000 + '][d_yHJ!$pdA~5][' + duration * 1000 + '][' + clipTime + ']';
                return md5hex(raw);
            },

            // 提交一次学时记录
            async _submitStudyTime(p, playingTime, duration, isdrag, view) {
                const enc = this._calcEnc(p, playingTime, duration);
                const query = [
                    'clazzId=' + encodeURIComponent(p.clazzId),
                    'playingTime=' + playingTime,
                    'duration=' + duration,
                    'clipTime=0_' + duration,
                    'objectId=' + encodeURIComponent(p.objectId),
                    // otherInfo 必须使用任务点卡片里的真值：服务端靠它识别 nodeId / cpi / rt 等，
                    // 写死常量会导致任务点无法关联，学时永远判不通过
                    'otherInfo=' + encodeURIComponent(p.otherInfo || 'otherInfo'),
                    'courseId=' + encodeURIComponent(p.courseId),
                    'jobid=' + encodeURIComponent(p.jobid || ''),
                    'userid=' + encodeURIComponent(p.userId),
                    'isdrag=' + isdrag,
                    'view=' + view,
                    'enc=' + enc,
                    'rt=' + (Math.round((Number(p.rt) || 0.9) * 100) / 100),
                    'videoFaceCaptureEnc=' + encodeURIComponent(p.videoFaceCaptureEnc || ''),
                    'dtype=Video',
                    '_t=' + Date.now(),
                    'attDuration=' + duration,
                    'attDurationEnc=' + encodeURIComponent(p.attDurationEnc || ''),
                ].join('&');
                const url = 'https://mooc1.chaoxing.com/mooc-ans/multimedia/log/a/' +
                    p.cpi + '/' + p.dtoken + '?' + query;
                const resp = await fetch(url, { method: 'GET', credentials: 'include', headers: { 'Accept': '*/*' } });
                const text = await resp.text();
                if (!resp.ok) throw new Error('学时上报 HTTP ' + resp.status);
                return text;
            },

            // ==================== 快速模式：接口级学时上报 ====================
            // 不必真实播放视频，直接按步进向服务端的学时接口上报进度直到 isPassed。
            // 任何一步失败都会安全返回 false，由调用方回退到普通播放模式。
            _fastRunning: false,
            _fastProgress: '',
            async _fastRunCurrentVideo() {
                const ids = this._getCourseIds();
                const missing = ['courseId', 'clazzId', 'cpi', 'knowledgeId'].filter((k) => !ids[k]);
                if (missing.length) {
                    console.warn('%c[快速模式] 页面 URL 缺少参数：' + missing.join(', ') + '，回退普通播放', 'color:#FF9800');
                    return false;
                }

                // 首选数据源：任务点卡片（参数最全，含 otherInfo / jobid / 各种 enc）
                let cards = null;
                let point = null;
                try {
                    cards = await this._fetchCardsData(ids);
                    point = this._pickMediaPoint(cards);
                } catch (e) {
                    console.warn('%c[快速模式] 任务点卡片获取失败：' + e.message, 'color:#FF9800');
                }

                // 卡片里已没有未完成的任务点 —— 说明本节已学完，直接进下一节
                if (cards && !point) {
                    console.log('%c[快速模式] 本节任务点均已完成，切换下一节', 'color:#4CAF50');
                    setTimeout(() => this.nextUnit(), 1200);
                    return true;
                }

                // 兜底数据源：ananas/status（卡片接口不可用时）
                let st = null;
                if (!point) {
                    if (ids.objectId) {
                        try {
                            st = await this._fetchVideoStatus(ids.objectId, ids.clazzId);
                        } catch (e) {
                            console.warn('%c[快速模式] 备用数据源失败：' + e.message, 'color:#FF9800');
                        }
                    }
                    if (!st || !st.duration) {
                        console.warn('%c[快速模式] 无法获取视频时长，回退普通播放', 'color:#FF9800');
                        return false;
                    }
                }

                const p = point ? {
                    clazzId: ids.clazzId, courseId: ids.courseId, cpi: point.cpi || ids.cpi,
                    userId: point.userid || ids.userId, objectId: point.objectId, jobid: point.jobid,
                    dtoken: point.dtoken, rt: point.rt,
                    attDurationEnc: point.attDurationEnc, videoFaceCaptureEnc: point.videoFaceCaptureEnc,
                    otherInfo: point.otherInfo,
                } : {
                    clazzId: ids.clazzId, courseId: ids.courseId, cpi: ids.cpi,
                    userId: ids.userId, objectId: ids.objectId, jobid: ids.jobid || '',
                    dtoken: st.dtoken, rt: st.rt || 0.9,
                    attDurationEnc: st.attDurationEnc, videoFaceCaptureEnc: st.videoFaceCaptureEnc,
                    otherInfo: 'otherInfo',
                };

                if (!p.userId || !p.dtoken) {
                    console.warn('%c[快速模式] 缺少 userId 或 dtoken，回退普通播放', 'color:#FF9800');
                    return false;
                }

                const duration = point ? point.duration : st.duration;

                this._fastRunning = true;
                // 暂停真实播放，避免与接口上报重复计时
                try { if (this._videoEl) this._videoEl.pause(); } catch (e) { /* ignore */ }

                // cards 接口返回的 playTime 是毫秒，需换算成秒
                let playingTime = Math.floor((point ? point.playTimeMs : (st.playTime || 0)) / 1000);
                // 进度已到终点却未通过（常见于被打回）：从头重报，否则永远停在终点出不去
                if (playingTime >= duration) playingTime = 0;

                let loops = 0;
                let view = 'pc';
                let done = false;
                let overTime = 0;
                const step = Math.max(5, Number(this.configs.vtStepSec) || 58);
                // 「过超提交」：到达终点后仍按小步进继续提交若干次，等待服务端判定通过
                const extendSec = 5;
                const limitTime = Math.max(500, Math.floor(duration / 2));
                console.log('%c[快速模式] 开始上报（数据源 ' + (point ? 'cards' : 'status') +
                    '，时长 ' + duration + 's，起点 ' + playingTime + 's）', 'color:#9C27B0;font-weight:bold');

                while (loops < this.configs.vtLoopMax && !done) {
                    if (this._userPaused) {
                        console.log('%c[快速模式] 已暂停', 'color:#2196F3');
                        this._fastRunning = false;
                        return false;
                    }
                    let text = '';
                    try {
                        text = await this._submitStudyTime(p, playingTime, duration, 0, view);
                    } catch (e) {
                        if (/HTTP 403/.test(e.message) && view === 'pc') {
                            console.log('%c[快速模式] 触发 403，切换手机端模式重试', 'color:#FF9800');
                            view = 'json';
                            loops++;
                            await sleep(1500);
                            continue;
                        }
                        console.warn('%c[快速模式] 上报失败，回退普通播放：' + e.message, 'color:#F44336');
                        this._fastRunning = false;
                        return false;
                    }

                    let isPassed = null;
                    let outTimeMsg = '';
                    try {
                        const j = JSON.parse(text);
                        isPassed = j.isPassed;
                        outTimeMsg = j.OutTimeMsg || '';
                    } catch (e) { /* 非 JSON 响应按未完成处理 */ }

                    const percent = ((playingTime / duration) * 100).toFixed(1);
                    this._fastProgress = '上报 ' + playingTime + '/' + duration + 's (' + percent + '%)';
                    console.log('%c[快速模式] ' + this._fastProgress, 'color:#9C27B0');

                    if (outTimeMsg === '观看时长超过阈值') { done = true; break; }
                    if (isPassed === true && playingTime >= duration) { done = true; break; }

                    // 进度已到终点：进入过超提交，按 5s 步进继续上报等待服务端判定
                    if (playingTime >= duration) {
                        overTime += extendSec;
                        if (overTime >= limitTime) {
                            console.warn('%c[快速模式] 过超提交超时（>' + limitTime + 's），回退普通播放', 'color:#FF9800');
                            break;
                        }
                        loops++;
                        await sleep(extendSec * 1000);
                        continue;
                    }

                    playingTime = Math.min(duration, playingTime + step);
                    loops++;
                    // 保留短暂间隔降低风控概率；相比真实播放仍是数量级的提速
                    await sleep(1500);
                }

                this._fastRunning = false;
                if (done) {
                    console.log('%c[快速模式] 本节学时已完成', 'color:#4CAF50;font-weight:bold');
                    setTimeout(() => this.nextUnit(), 1200);
                    return true;
                }
                console.warn('%c[快速模式] 达到最大轮数仍未完成，回退普通播放', 'color:#FF9800');
                return false;
            },

            // ==================== 学习通官方内置 AI（免费、零配置） ====================
            _officialAiParams: null,
            _officialAiParamsTs: 0,

            async _getOfficialAiParams() {
                if (this._officialAiParams && Date.now() - this._officialAiParamsTs < 30 * 60 * 1000) {
                    return this._officialAiParams;
                }
                const ids = this._getCourseIds();
                if (!ids.courseId || !ids.clazzId) {
                    throw new Error('未能解析 courseId / clazzId，无法使用官方 AI');
                }
                const url = 'https://stat2-ans.chaoxing.com/bot/index?fromWorkbench=true&upload=true' +
                    '&clazzid=' + encodeURIComponent(ids.clazzId) +
                    '&showToolbox=false&bgColorNone=true&app_id=1192651262850' +
                    '&courseid=' + encodeURIComponent(ids.courseId) +
                    '&cpi=' + encodeURIComponent(ids.cpi || '') +
                    '&bot_id=7438777570621653018&ut=s';
                const resp = await fetch(url, { credentials: 'include', headers: { 'Accept': 'text/html,*/*' } });
                if (!resp.ok) throw new Error('官方 AI 初始化失败：HTTP ' + resp.status);
                const html = await resp.text();

                const pick = (id) => {
                    const re1 = new RegExp('id=["\']' + id + '["\'][^>]*value=["\']([^"\']*)["\']');
                    const re2 = new RegExp('value=["\']([^"\']*)["\'][^>]*id=["\']' + id + '["\']');
                    const m = html.match(re1) || html.match(re2);
                    return m ? m[1] : '';
                };
                const sm = html.match(/"studentName"\s*:\s*"([^"]+)"/);
                const params = {
                    cozeEnc: pick('cozeEnc'),
                    userId: pick('userId'),
                    courseId: pick('courseId') || ids.courseId,
                    clazzId: pick('clazzId') || ids.clazzId,
                    conversationId: pick('conversationId'),
                    courseName: pick('courseName'),
                    personId: pick('personId'),
                    studentName: sm ? sm[1] : '',
                };
                if (!params.cozeEnc || !params.userId) {
                    throw new Error('官方 AI 参数解析失败（cozeEnc / userId 为空），请改用自定义接口');
                }
                this._officialAiParams = params;
                this._officialAiParamsTs = Date.now();
                return params;
            },

            // 是否具备油猴的跨域请求能力
            _hasGMRequest() {
                try {
                    if (typeof GM_xmlhttpRequest === 'function') return true;
                    if (typeof window !== 'undefined' && typeof window.GM_xmlhttpRequest === 'function') return true;
                } catch (e) { /* ignore */ }
                return false;
            },

            // 跨域 POST：优先使用油猴的 GM_xmlhttpRequest（不受 CORS 限制），否则退回 fetch。
            // 背景：学习通官方 AI 接口在 stat2-ans 域，而课程 / 测验页在 mooc1、mooc2-ans 域，
            // 属于跨子域请求，浏览器 fetch 会被 CORS 拦截；只有 GM 请求能正常工作。
            _crossPost(url, body, headers) {
                const payload = JSON.stringify(body);
                const hdrs = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
                let gm = null;
                try {
                    if (typeof GM_xmlhttpRequest === 'function') gm = GM_xmlhttpRequest;
                    else if (typeof window !== 'undefined' && typeof window.GM_xmlhttpRequest === 'function') gm = window.GM_xmlhttpRequest;
                } catch (e) { gm = null; }
                if (gm) {
                    return new Promise((resolve, reject) => {
                        try {
                            gm({
                                method: 'POST',
                                url: url,
                                headers: hdrs,
                                data: payload,
                                timeout: 30000,
                                onload: (r) => {
                                    if (r.status >= 200 && r.status < 300) resolve(r.responseText || '');
                                    else reject(new Error('HTTP ' + r.status + '：' + String(r.responseText || '').slice(0, 160)));
                                },
                                onerror: () => reject(new Error('GM 请求失败（网络错误）')),
                                ontimeout: () => reject(new Error('GM 请求超时')),
                            });
                        } catch (e) { reject(e); }
                    });
                }
                return fetch(url, { method: 'POST', credentials: 'include', headers: hdrs, body: payload })
                    .then((resp) => {
                        if (!resp.ok) {
                            return resp.text().then((t) => { throw new Error('HTTP ' + resp.status + '：' + String(t).slice(0, 160)); });
                        }
                        return resp.text();
                    })
                    .catch((e) => {
                        const m = String((e && e.message) || e);
                        if (/Failed to fetch|fetch failed|NetworkError|Load failed|CORS|blocked/i.test(m)) {
                            throw new Error('请求被浏览器跨域策略拦截（' + m + '）。' +
                                '解决方式：① 油猴脚本把头部 @grant none 改成 @grant GM_xmlhttpRequest 后重装，脚本会自动改用 GM 请求绕开跨域；' +
                                '② 或改用「自定义接口」并配中转代理（npm run proxy）；③ 或使用外部题库。');
                        }
                        throw e;
                    });
            },

            async _askOfficialAI(question, options) {
                const p = await this._getOfficialAiParams();
                let content = '题目：' + question;
                if (options && options.length) content += '\n选项：' + options.join(' ／ ');
                content += '\n请严格按题型只返回答案本身，不要解释：选择题或判断题返回选项字母（多选给出全部字母）；' +
                    '填空题与完型填空按空位的先后顺序给出各空答案、空与空之间用 | 分隔；' +
                    '简答、论述、名词解释给出精炼要点、要点之间用 | 分隔；分录题每笔分录之间用 | 分隔。';

                const body = [{
                    role: 'user',
                    content: content,
                    baseData: {
                        conversationId: p.conversationId,
                        userId: p.userId,
                        appId: '1192651262850',
                        botId: '7438777570621653018',
                        custom_variables: {
                            courseName: p.courseName,
                            studentName: p.studentName,
                            weakKnowledgePoint: '{}',
                        },
                        shortcut_command: {},
                        sourceInfo: '',
                        sdkFlag: 'false',
                        courseid: p.courseId,
                        clazzid: p.clazzId,
                        personid: p.personId,
                    },
                }];
                const url = 'https://stat2-ans.chaoxing.com/stat2/bot/talk-v1' +
                    '?cozeEnc=' + encodeURIComponent(p.cozeEnc) +
                    '&botId=7438777570621653018' +
                    '&userId=' + encodeURIComponent(p.userId) +
                    '&appId=1192651262850' +
                    '&courseid=' + encodeURIComponent(p.courseId) +
                    '&clazzid=' + encodeURIComponent(p.clazzId) + '&ut=s';
                // 官方 AI 接口位于 stat2-ans 域，与课程页不同源，需走跨域请求通道（GM 优先）
                const text = await this._crossPost(url, body, { 'Accept': '*/*' });

                // 流式响应：每行内以 $_$ 分段，取 type=coreAnswer 的内容拼接
                let answer = '';
                text.split('\n').forEach((line) => {
                    line.trim().split('$_$').forEach((piece) => {
                        piece = piece.trim();
                        if (!piece || piece === 'server-heartbeat' || piece.indexOf('server-current-chatid') === 0) return;
                        try {
                            const chunk = JSON.parse(piece);
                            if (chunk && chunk.type === 'coreAnswer' && chunk.content) answer += chunk.content;
                        } catch (e) { /* 非 JSON 片段跳过 */ }
                    });
                });
                return answer
                    .replace(/&quot;/g, '"')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .trim();
            },

            // ==================== 外部在线题库接口 ====================
            // 设计参考 yatori-go-console 的 apiQueSetting：对接外部题库服务，
            // 命中即作答，完全不消耗 AI token。约定 POST {"question","options","type"}，
            // 响应做宽松解析，兼容 {"answer"} / {"data":{"answer"}} / [{q,a}] / 纯文本。
            async _askBankApi(question, options) {
                const base = (this.configs.bankUrl || '').trim();
                if (!base) return '';
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 8000);
                try {
                    const resp = await fetch(base, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ question: question, options: options || [], type: 'auto' }),
                        signal: ctrl.signal,
                    });
                    clearTimeout(timer);
                    if (!resp.ok) return '';
                    const text = (await resp.text()).trim();
                    if (!text) return '';
                    const pick = (o) => {
                        if (!o || typeof o !== 'object') return '';
                        let v = o.answer || o.result || o.a || '';
                        if (!v && o.data) {
                            if (typeof o.data === 'string') v = o.data;
                            else v = o.data.answer || o.data.result || o.data.a || '';
                        }
                        return String(v || '').trim();
                    };
                    let ans = '';
                    try {
                        const j = JSON.parse(text);
                        ans = pick(j);
                        if (!ans && Array.isArray(j)) {
                            const hit = j.find((it) => it && (it.q === question || it.question === question));
                            if (hit) ans = String(hit.answer || hit.a || '').trim();
                        }
                    } catch (e) {
                        ans = text; // 非 JSON：当作纯文本答案
                    }
                    ans = String(ans || '').trim().slice(0, 500);
                    if (ans) console.log('%c[题库API] 命中：' + ans.slice(0, 50), 'color:#8BC34A');
                    return ans;
                } catch (e) {
                    return '';
                }
            },

            async _askAI(question, options) {
                if (!this.configs.aiApiBase) throw new Error('未配置 API 地址（请填写中转代理地址，见 proxy/README.md）');
                const sys = '你是学习通答题助手，严格按题型给出答案，不要解释、不要序号、不要多余文字。格式约定：' +
                    '单选题返回正确选项字母（如 B）；多选题返回全部正确选项字母并连续写出（如 ACD）；' +
                    '判断题返回“对”或“错”，或返回对应选项字母；填空题与完型填空按空位的先后顺序返回答案，多个空之间用 | 分隔（如 2|3）；' +
                    '名词解释、简答题、论述题返回精炼要点，多个要点之间用 | 分隔；' +
                    '分录题每笔分录一行，笔与笔之间用 | 分隔，保持“借：xx 金额 贷：xx 金额”的形式；' +
                    '阅读理解按每一小题的先后顺序返回答案，小题之间用 | 分隔。';
                let user = '题目：' + question;
                if (options && options.length) user += '\n选项：' + options.join(' ／ ');
                const body = {
                    model: this.configs.aiModel || 'deepseek-chat',
                    messages: [
                        { role: 'system', content: sys },
                        { role: 'user', content: user }
                    ],
                    temperature: 0.2,
                };
                // 注意：API Key 可以留空。
                // 推荐做法是把真实密钥写在中转代理的环境变量/.env 里，此处留空，
                // 浏览器 localStorage 中就不存任何密钥；代理收到请求后再注入真实密钥。
                const headers = { 'Content-Type': 'application/json' };
                if (this.configs.aiApiKey) {
                    headers['Authorization'] = 'Bearer ' + this.configs.aiApiKey;
                }
                const respText = await this._crossPost(this.configs.aiApiBase, body, headers);
                let data = null;
                try { data = JSON.parse(respText); } catch (e) { data = null; }
                let ans = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
                return (ans || '').trim();
            },

            // 按配置的来源依次取答案：官方 AI（免费）→ 自定义接口（需代理）
            async _resolveAnswer(question, options) {
                const src = this.configs.aiSource || 'official';
                const errors = [];

                if (src === 'official' || src === 'auto') {
                    try {
                        const ans = await this._askOfficialAI(question, options);
                        if (ans) {
                            this._aiStat.lastSource = '官方AI';
                            return ans;
                        }
                        errors.push('官方 AI 返回空');
                    } catch (e) {
                        errors.push('官方 AI：' + (e && e.message ? e.message : e));
                    }
                }
                if (src === 'custom' || src === 'auto') {
                    if (!this.configs.aiApiBase) {
                        errors.push('未配置自定义 API 地址');
                    } else {
                        try {
                            const ans = await this._askAI(question, options);
                            if (ans) {
                                this._aiStat.lastSource = '自定义AI';
                                return ans;
                            }
                            errors.push('自定义接口返回空');
                        } catch (e) {
                            errors.push('自定义接口：' + (e && e.message ? e.message : e));
                        }
                    }
                }
                if (errors.length) {
                    console.warn('%c[AI答题] 取答案失败 → ' + errors.join(' ｜ '), 'color:#FF9800');
                }
                return '';
            },

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
                return ctrl.parentElement || null;
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
                            const txt = this._getQuestionText(el).slice(0, 40);
                            if (!txt || seen['NA|' + txt]) return;
                            seen['NA|' + txt] = true;
                            manual++;
                            console.log('%c[AI答题] 该题没有标准作答控件，需手动处理：' + txt, 'color:#FF9800');
                        });
                    } catch (e) { /* ignore */ }
                });
                console.log('%c[AI答题] 扫描完成：识别题目 ' + count + ' 个，提交作答 ' + submitted + ' 个' +
                    (manual ? '，需手动处理 ' + manual + ' 个' : ''), 'color:#2196F3');
                return count;
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
                const stat = {};
                try {
                    document.querySelectorAll('input').forEach((el) => {
                        const k = el.type || 'text';
                        stat[k] = (stat[k] || 0) + 1;
                    });
                } catch (err) { /* ignore */ }
                console.log('主文档 input 统计：' + JSON.stringify(stat));
                console.log('可作答文档数（主文档 + 同域 iframe）：' + docs.length);
                docs.forEach((doc, di) => {
                    let ctrls = [];
                    let items = [];
                    try {
                        ctrls = this._collectAnswerControls(doc);
                        items = this._collectQuestionBlocks(doc);
                    } catch (err) {
                        console.warn('文档 #' + (di + 1) + ' 解析失败：' + err.message);
                        return;
                    }
                    console.log('--- 文档 #' + (di + 1) + '：可作答控件 ' + ctrls.length + ' 个，识别题目 ' + items.length + ' 个 ---');
                    items.forEach((it, k) => {
                        const type = this._detectQuestionType(it.block, it.ctrls);
                        const chain = [];
                        let el = it.block;
                        for (let d = 0; d < 4 && el && el.nodeType === 1; d++) {
                            const cls = el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : '';
                            chain.push(el.tagName.toLowerCase() + cls);
                            el = el.parentElement;
                        }
                        console.log('#' + (k + 1) + ' [' + (TYPE_NAMES[type] || type) + '] 控件 ' + it.ctrls.length + ' 个');
                        console.log('   路径: ' + chain.join('  <  '));
                        console.log('   题干: ' + this._getQuestionText(it.block).slice(0, 100));
                    });
                    try {
                        const un = this._collectUnanswerable(doc, items.map((it) => it.block));
                        if (un.length) {
                            console.log('   —— 以下 ' + un.length + ' 题无标准控件（排序 / 连线等，需适配）——');
                            un.forEach((el) => {
                                console.log('   [无控件] ' + this._getQuestionText(el).slice(0, 50));
                                console.log('      HTML: ' + (el.innerHTML || '').replace(/\s+/g, ' ').slice(0, 260));
                            });
                        }
                    } catch (err) { /* ignore */ }
                });
                console.log('%c======== 诊断结束（可截图此段反馈） ========', 'color:#673AB7;font-weight:bold');
                return docs.length;
            },

            _aiTick() {
                if (!this.configs.aiEnabled) return;
                try { this._scanAndAnswer(); } catch (e) {
                    console.error('%c[AI答题] 扫描异常：' + e.message, 'color:#F44336');
                }
            },

            _startAIWatch() {
                if (this._aiWatchTimer) clearInterval(this._aiWatchTimer);
                this._aiWatchTimer = setInterval(() => this._aiTick(), 2500);
            },

            _makeDraggable(panel, handle) {
                let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
                handle.addEventListener('mousedown', (e) => {
                    dragging = true;
                    const rect = panel.getBoundingClientRect();
                    ox = rect.left; oy = rect.top;
                    sx = e.clientX; sy = e.clientY;
                    e.preventDefault();
                });
                document.addEventListener('mousemove', (e) => {
                    if (!dragging) return;
                    panel.style.left = (ox + e.clientX - sx) + 'px';
                    panel.style.top = (oy + e.clientY - sy) + 'px';
                    panel.style.right = 'auto';
                });
                document.addEventListener('mouseup', () => { dragging = false; });
            },
        };

        window.app = app;
        window[APP_KEY] = app;

        try { app._loadSavedConfigs(); } catch (e) {}
        app._buildUI();

        try {
            app.run();
            app._bindPageGuards();
        } catch (error) {
            console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
            console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
        }
    }
})();
