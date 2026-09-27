// ==UserScript==
// @name         学习通自动刷课脚本
// @namespace    https://github.com/ZHE-you/Chaoxingxuexitong-ayto
// @version      3.4.3
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
                aiApiBase: 'https://api.deepseek.com/v1/chat/completions',
                aiApiKey: '',
                aiModel: 'deepseek-chat',
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
                    const store = { playbackRate: 'xtCfg_playbackRate', autoplay: 'xtCfg_autoplay', autoAdvanceNoVideo: 'xtCfg_autoAdvanceNoVideo', muted: 'xtCfg_muted', aiEnabled: 'xtAi_enabled', aiApiBase: 'xtAi_apiBase', aiApiKey: 'xtAi_apiKey', aiModel: 'xtAi_model' };
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
                        '<div class="xt-row xt-btns"><button id="xtAiScan" class="xt-btn">立即扫描</button><button id="xtAiImport" class="xt-btn">导入题库</button><button id="xtAiExport" class="xt-btn">导出题库</button></div>' +
                        '<details class="xt-ai-adv"><summary>API 设置（需中转代理）</summary>' +
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
                const aiBase = byId('xtAiBase');
                const aiKey = byId('xtAiKey');
                const aiModel = byId('xtAiModel');
                aiEnableCb.checked = !!this.configs.aiEnabled;
                aiBase.value = this.configs.aiApiBase;
                aiKey.value = this.configs.aiApiKey;
                aiModel.value = this.configs.aiModel;
                aiEnableCb.addEventListener('change', () => {
                    this.configs.aiEnabled = aiEnableCb.checked;
                    this._saveConfig('aiEnabled', aiEnableCb.checked ? '1' : '0');
                    if (aiEnableCb.checked) { this._loadAIBank(); this._startAIWatch(); }
                });
                const saveAiCfg = () => {
                    this.configs.aiApiBase = aiBase.value.trim();
                    this.configs.aiApiKey = aiKey.value.trim();
                    this.configs.aiModel = aiModel.value.trim() || 'deepseek-chat';
                    this._saveConfig('aiApiBase', this.configs.aiApiBase);
                    this._saveConfig('aiApiKey', this.configs.aiApiKey);
                    this._saveConfig('aiModel', this.configs.aiModel);
                    console.log('%c[AI答题] API 配置已保存', 'color:#2196F3');
                };
                aiBase.addEventListener('change', saveAiCfg);
                aiKey.addEventListener('change', saveAiCfg);
                aiModel.addEventListener('change', saveAiCfg);
                byId('xtAiScan').addEventListener('click', () => {
                    const n = this._scanAndAnswer();
                    console.log('%c[AI答题] 手动扫描完成，发现题目容器 ' + n + ' 个', 'color:#2196F3');
                });
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
                else if (this._isPlaying) state = '运行中';
                stateEl.textContent = state;
                const cd = this._cellData;
                infoEl.textContent = '第' + (cd.currentCellIndex + 1) + '章 第' + (cd.currentNCellIndex + 1) + '节 · ' + (cd.currentVideoTitle || '—');
                if (this._ui.aiStatEl) {
                    this._ui.aiStatEl.textContent = '已答 ' + this._aiStat.answered + ' · 失败 ' + this._aiStat.failed + (this._aiStat.lastResult ? ' · ' + this._aiStat.lastResult : '');
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

            async _askAI(question, options) {
                if (!this.configs.aiApiBase) throw new Error('未配置 API 地址（请填写中转代理地址，见 proxy/README.md）');
                const sys = '你是学习通答题助手。只根据题目给出最简洁的答案：单选题/判断题直接给正确选项字母或内容；多选题给出所有正确选项；填空题给出应填的词或短语；问答题给出简短要点。不要解释、不要序号、不要多余文字。';
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
                const resp = await fetch(this.configs.aiApiBase, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body),
                });
                if (!resp.ok) {
                    const txt = await resp.text().catch(() => '');
                    throw new Error('AI 接口返回 ' + resp.status + '：' + txt.slice(0, 160));
                }
                const data = await resp.json().catch(() => null);
                let ans = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
                return (ans || '').trim();
            },

            _getQuestionText(qEl) {
                const $q = $(qEl);
                let t = $q.find('.qTitle, .question_title, .title, .stem, .topic-title, .questionText, .zuoye-topic-title, .TiMu_title, h3').first().text();
                if (!t) t = $q.find('.qBord, .QBord, .question, .topic, .Zy_TItle').first().text();
                if (!t) {
                    const clone = $q.clone();
                    clone.find('input, label, .option, .answerBg, ul.choices, .choices, .answer, textarea, button').remove();
                    t = clone.text();
                }
                return (t || '').replace(/\s+/g, ' ').trim();
            },

            _getOptions(qEl) {
                const $q = $(qEl);
                const opts = [];
                const inputs = $q.find('input[type=radio], input[type=checkbox]');
                if (inputs.length) {
                    inputs.each(function () {
                        const letter = ($(this).closest('li, label, .option, .answerBg, tr').find('.letter, .num, b').first().text() || '').trim();
                        let text = '';
                        const lab = $(this).closest('label');
                        if (lab.length) text = lab.text();
                        else text = $(this).parent().text();
                        text = (text || '').replace(/\s+/g, ' ').trim();
                        opts.push({ el: this, letter: letter, text: text, isInput: false });
                    });
                } else {
                    $q.find('input[type=text], textarea, .input, [contenteditable]').each(function () {
                        opts.push({ el: this, letter: '', text: '', isInput: true });
                    });
                }
                return opts;
            },

            _answerChoice(opts, answer) {
                if (!answer) return false;
                const ansLetters = (answer.match(/[A-Za-z]/g) || []).map(s => s.toUpperCase());
                const ansClean = answer.replace(/[^一-龥A-Za-z0-9]/g, '').toUpperCase();
                let selected = 0;
                opts.forEach(o => {
                    if (o.el.type !== 'radio' && o.el.type !== 'checkbox') return;
                    const optLetter = (o.letter || '').replace(/[^A-Za-z]/g, '').toUpperCase();
                    const optText = (o.text || '').replace(/\s+/g, '').toUpperCase();
                    let hit = false;
                    if (optLetter && ansLetters.indexOf(optLetter) !== -1) hit = true;
                    else if (ansClean && optText && (optText.indexOf(ansClean) !== -1 || ansClean.indexOf(optText) !== -1)) hit = true;
                    if (hit) {
                        try { o.el.click(); selected++; } catch (e) {}
                    }
                });
                return selected > 0;
            },

            _answerFill(opts, answer) {
                let ok = false;
                opts.forEach(o => {
                    if (!o.isInput) return;
                    try {
                        o.el.value = answer;
                        o.el.dispatchEvent(new Event('input', { bubbles: true }));
                        o.el.dispatchEvent(new Event('change', { bubbles: true }));
                        ok = true;
                    } catch (e) {}
                });
                return ok;
            },

            _answerContainer(qEl) {
                const text = this._getQuestionText(qEl);
                if (!text) return false;
                const fp = text.slice(0, 60);
                if (this._aiHandled[fp]) return false;
                this._aiHandled[fp] = true;

                const opts = this._getOptions(qEl);
                const hasChoice = opts.some(o => o.el.type === 'radio' || o.el.type === 'checkbox');
                const isInput = opts.some(o => o.isInput);

                const answer = this._lookupBank(text);
                if (!answer) {
                    // 只校验 API 地址：Key 允许为空（由中转代理注入真实密钥，推荐）
                    if (!this.configs.aiApiBase) {
                        console.warn('%c[AI答题] 题库未命中且未配置 API 地址，跳过：' + fp, 'color:#FF9800');
                        return false;
                    }
                    const optTexts = opts.filter(o => !o.isInput).map(o => o.text);
                    this._askAI(text, optTexts).then(ans => {
                        if (!ans) { this._aiStat.failed++; return; }
                        let ok = false;
                        if (hasChoice) ok = this._answerChoice(opts, ans);
                        else if (isInput) ok = this._answerFill(opts, ans);
                        else ok = this._answerChoice(opts, ans);
                        if (ok) {
                            this._aiStat.answered++;
                            this._aiStat.lastResult = 'AI:' + ans.slice(0, 30);
                            this._addToBank(text, ans);
                            console.log('%c[AI答题] 已作答：' + fp + ' => ' + ans.slice(0, 40), 'color:#4CAF50');
                        } else {
                            this._aiStat.failed++;
                            console.warn('%c[AI答题] 答案无法匹配到选项：' + fp + ' 答案=' + ans.slice(0, 40), 'color:#FF9800');
                        }
                    }).catch(e => {
                        this._aiStat.failed++;
                        console.error('%c[AI答题] 调用失败：' + fp + ' -> ' + e.message, 'color:#F44336');
                    });
                    return true;
                }

                let ok = false;
                if (hasChoice) ok = this._answerChoice(opts, answer);
                else if (isInput) ok = this._answerFill(opts, answer);
                else ok = this._answerChoice(opts, answer);
                if (ok) {
                    this._aiStat.answered++;
                    this._aiStat.lastResult = '题库:' + answer.slice(0, 30);
                    console.log('%c[AI答题] 题库命中已作答：' + fp, 'color:#4CAF50');
                } else {
                    this._aiStat.failed++;
                    console.warn('%c[AI答题] 题库答案无法匹配：' + fp + ' 答案=' + answer.slice(0, 40), 'color:#FF9800');
                }
                return ok;
            },

            _scanAndAnswer() {
                const docs = this._getQuestionDocuments();
                const seen = {};
                let count = 0;
                docs.forEach(doc => {
                    if (!doc || !doc.querySelectorAll) return;
                    const containers = doc.querySelectorAll('.questionBox, .questionLi, .qItem, .topic-item, .type1, .type2, .type3, .type4, .type5, .ans-job, .question-panel, .exam-question, .TiMu, .Zy_TItle, .examPaper_subject, .question, .qItem-box, .topic');
                    containers.forEach(c => {
                        const txt = this._getQuestionText(c);
                        if (!txt || seen[txt]) return;
                        seen[txt] = true;
                        count++;
                        this._answerContainer(c);
                    });
                });
                return count;
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
