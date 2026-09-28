// 控制面板的样式与结构（单一来源）。
// 说明：CSS/HTML 抽成独立模块，便于前端/UI 迭代；构建时打包为全局 XT_UI 注入脚本。
//
// 设计要点：
//   1) 标签页（控制 / AI 答题 / 关于）—— 用隐藏 radio + CSS :checked 实现，
//      零 JS、零框架、体积小（对比参考脚本的 Vue3+Element Plus 方案，省下约 1MB 运行时）；
//   2) 自带 box-sizing / margin / padding 重置，避免被学习通页面的全局样式撑破或串味；
//   3) 面板 max-height:calc(100vh-32px) + body 内滚动，内容再长也不会超出屏幕被裁掉；
//   4) 所有交互元素 id 保持不变，面板逻辑（事件绑定）无需改动。

export const PANEL_CSS = `
#xtControlPanel{position:fixed;top:16px;right:16px;z-index:2147483647;width:288px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#1f2937;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.16);user-select:none;overflow:hidden;}
#xtControlPanel,#xtControlPanel *,#xtControlPanel *::before,#xtControlPanel *::after{box-sizing:border-box;margin:0;padding:0;}
#xtControlPanel .xt-header{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;cursor:move;font-weight:600;letter-spacing:.2px;}
#xtControlPanel .xt-header>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xtControlPanel .xt-min{flex:0 0 auto;width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.22);border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:14px;line-height:1;}
#xtControlPanel .xt-min:hover{background:rgba(255,255,255,.38);}
#xtControlPanel .xt-body{flex:1 1 auto;min-height:0;padding:10px;overflow-y:auto;overflow-x:hidden;}
#xtControlPanel .xt-body::-webkit-scrollbar{width:8px;}
#xtControlPanel .xt-body::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:8px;}
#xtControlPanel .xt-body::-webkit-scrollbar-thumb:hover{background:#9ca3af;}
#xtControlPanel.xt-collapsed{max-height:none;}
#xtControlPanel.xt-collapsed .xt-body{display:none;}
/* 标签页（纯 CSS） */
#xtControlPanel .xt-tabradio{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}
#xtControlPanel .xt-tabbar{display:flex;gap:2px;border-bottom:1px solid #eef0f3;margin-bottom:10px;}
#xtControlPanel .xt-tab{flex:1;text-align:center;font-size:12px;color:#6b7280;padding:7px 4px;cursor:pointer;border-bottom:2px solid transparent;transition:color .15s,border-color .15s;white-space:nowrap;}
#xtControlPanel .xt-tab:hover{color:#2563eb;}
#xtTabCtrl:checked ~ .xt-tabbar label[for="xtTabCtrl"],
#xtTabAi:checked ~ .xt-tabbar label[for="xtTabAi"],
#xtTabAbout:checked ~ .xt-tabbar label[for="xtTabAbout"]{color:#2563eb;font-weight:600;border-bottom-color:#2563eb;}
#xtControlPanel .xt-pane{display:none;}
#xtTabCtrl:checked ~ .xt-panes .xt-pane-ctrl,
#xtTabAi:checked ~ .xt-panes .xt-pane-ai,
#xtTabAbout:checked ~ .xt-panes .xt-pane-about{display:block;}
/* 分区卡片 */
#xtControlPanel .xt-sec{padding:8px;border:1px solid #eef0f3;border-radius:9px;margin-bottom:8px;background:#fcfdff;}
#xtControlPanel .xt-sec:last-child{margin-bottom:0;}
#xtControlPanel .xt-status{font-size:12px;color:#4b5563;margin-bottom:2px;}
#xtControlPanel .xt-status b{color:#2563eb;}
#xtControlPanel .xt-info{font-size:11px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#xtControlPanel .xt-row{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;}
#xtControlPanel .xt-row:last-child{margin-bottom:0;}
#xtControlPanel .xt-speed{flex-direction:column;align-items:stretch;gap:4px;}
#xtControlPanel .xt-speed label{display:flex;justify-content:space-between;font-size:12px;color:#4b5563;}
#xtControlPanel .xt-speed label span{color:#2563eb;font-weight:600;}
#xtControlPanel input[type=range]{width:100%;accent-color:#2563eb;}
#xtControlPanel .xt-btn{flex:1;min-width:60px;padding:7px 6px;border:1px solid #d0d5dd;border-radius:8px;background:#f9fafb;color:#374151;cursor:pointer;font-size:12px;line-height:1.2;transition:background .15s,border-color .15s;}
#xtControlPanel .xt-btn:hover{background:#eef2ff;border-color:#c7d2fe;}
#xtControlPanel .xt-btn:active{transform:translateY(1px);}
#xtControlPanel .xt-btn.xt-primary{background:#2563eb;color:#fff;border-color:#2563eb;}
#xtControlPanel .xt-btn.xt-primary:hover{background:#1d4ed8;border-color:#1d4ed8;}
#xtControlPanel .xt-btn.xt-danger{background:#fff;color:#dc2626;border-color:#fca5a5;}
#xtControlPanel .xt-btn.xt-danger:hover{background:#fef2f2;}
#xtControlPanel .xt-checks{display:flex;gap:10px;}
#xtControlPanel .xt-checks label{display:flex;align-items:center;gap:5px;font-size:12px;color:#4b5563;flex:1 1 auto;}
#xtControlPanel input[type=checkbox]{accent-color:#2563eb;cursor:pointer;}
#xtControlPanel .xt-tip{font-size:10px;color:#9ca3af;line-height:1.5;}
#xtControlPanel details.xt-ai-adv>summary{cursor:pointer;font-size:11px;color:#6b7280;outline:none;list-style:none;}
#xtControlPanel details.xt-ai-adv>summary::-webkit-details-marker{display:none;}
#xtControlPanel details.xt-ai-adv>summary::after{content:'\\25BE';float:right;color:#cbd5e1;transition:transform .15s;}
#xtControlPanel details.xt-ai-adv[open]>summary::after{transform:rotate(180deg);}
#xtControlPanel details.xt-ai-adv[open]>summary{margin-bottom:8px;}
#xtControlPanel .xt-ai-en{display:flex;align-items:center;gap:5px;font-size:12px;color:#4b5563;margin-bottom:6px;}
#xtControlPanel .xt-ai-stat{font-size:11px;color:#9ca3af;margin-bottom:6px;word-break:break-all;}
#xtControlPanel .xt-inp{width:100%;margin-bottom:5px;padding:6px 8px;border:1px solid #d0d5dd;border-radius:7px;font-size:12px;background:#fff;color:#1f2937;outline:none;}
#xtControlPanel .xt-inp:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.12);}
#xtControlPanel .xt-sel{width:100%;margin:3px 0;padding:5px 7px;border:1px solid #d0d7de;border-radius:7px;font-size:11px;background:#fff;color:#1f2937;outline:none;}
#xtControlPanel .xt-sel:focus{border-color:#2563eb;}
#xtControlPanel .xt-about-title{font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;}
#xtControlPanel .xt-about-list{padding-left:16px;}
#xtControlPanel .xt-about-list li{font-size:11px;color:#6b7280;line-height:1.75;}
#xtControlPanel .xt-about-list code{background:#eef2f7;padding:0 4px;border-radius:3px;font-size:10px;color:#2563eb;}
#xtControlPanel .xt-about-list strong{color:#374151;}
`;

export const PANEL_HTML = `
<div class="xt-header"><span>学习通刷课控制台</span><button class="xt-min" title="收起/展开">\u2014</button></div>
<div class="xt-body">
  <input type="radio" name="xtTab" id="xtTabCtrl" class="xt-tabradio" checked>
  <input type="radio" name="xtTab" id="xtTabAi" class="xt-tabradio">
  <input type="radio" name="xtTab" id="xtTabAbout" class="xt-tabradio">
  <div class="xt-tabbar">
    <label class="xt-tab" for="xtTabCtrl">控制</label>
    <label class="xt-tab" for="xtTabAi">AI 答题</label>
    <label class="xt-tab" for="xtTabAbout">关于</label>
  </div>
  <div class="xt-panes">
    <section class="xt-pane xt-pane-ctrl">
      <div class="xt-sec">
        <div class="xt-status">状态：<b id="xtState">空闲</b></div>
        <div class="xt-info" id="xtInfo">\u2014</div>
      </div>
      <div class="xt-sec">
        <div class="xt-row xt-speed"><label>播放倍速 <span id="xtSpeedVal">1.5</span>x</label><input type="range" id="xtSpeed" min="0.5" max="4" step="0.5" value="1.5"></div>
        <div class="xt-row xt-btns"><button id="xtPlay" class="xt-btn xt-primary">开始</button><button id="xtPause" class="xt-btn">暂停</button><button id="xtNext" class="xt-btn">下一节</button></div>
        <div class="xt-row xt-btns"><button id="xtRerun" class="xt-btn">重新运行</button><button id="xtStop" class="xt-btn xt-danger">停止</button></div>
        <div class="xt-row xt-checks"><label><input type="checkbox" id="xtAutoplay"> 自动播放</label><label><input type="checkbox" id="xtSkipNoVideo"> 无视频跳过</label></div>
        <div class="xt-row xt-checks"><label><input type="checkbox" id="xtMuted"> 静音播放</label></div>
      </div>
      <div class="xt-tip">倍速/静音即时生效；暂停后不再自动续播。配置自动保存。</div>
    </section>
    <section class="xt-pane xt-pane-ai">
      <div class="xt-sec">
        <label class="xt-ai-en"><input type="checkbox" id="xtAiEnable"> 启用自动答题</label>
        <div class="xt-ai-stat" id="xtAiStat">已答 0 · 失败 0</div>
        <select id="xtAiSource" class="xt-sel">
          <option value="official">🆓 官方 AI（免费零配置）</option>
          <option value="custom">🔧 自定义接口（需代理）</option>
          <option value="auto">🔄 自动（官方优先+回落）</option>
        </select>
        <div class="xt-row xt-btns"><button id="xtAiScan" class="xt-btn">立即扫描</button><button id="xtAiDiag" class="xt-btn">诊断</button></div>
        <div class="xt-row xt-btns"><button id="xtAiImport" class="xt-btn">导入题库</button><button id="xtAiExport" class="xt-btn">导出题库</button></div>
      </div>
      <div class="xt-sec">
        <details class="xt-ai-adv" open><summary>⚡ 快速模式 / API 设置</summary>
          <label class="xt-ai-en"><input type="checkbox" id="xtFastVideo"> ⚡ 快速学时上报（免真实播放）</label>
          <select id="xtAiPreset" class="xt-sel">
            <option value="">— 服务商快速填充 —</option>
            <option value="deepseek">DeepSeek</option>
            <option value="qwen">通义千问</option>
            <option value="doubao">豆包（火山引擎）</option>
            <option value="zhipu">智谱 GLM</option>
            <option value="xinghuo">讯飞星火</option>
            <option value="siliconflow">硅基流动</option>
            <option value="openai">OpenAI</option>
            <option value="local">本地代理 npm run proxy</option>
          </select>
          <input type="text" id="xtBankUrl" class="xt-inp" placeholder="外部题库接口 URL（可选，命中则不消耗 AI）">
          <input type="text" id="xtAiBase" class="xt-inp" placeholder="API 地址（如 http://127.0.0.1:8787/v1/chat/completions）">
          <input type="password" id="xtAiKey" class="xt-inp" placeholder="API Key（留空则由代理注入，推荐）">
          <input type="text" id="xtAiModel" class="xt-inp" placeholder="模型名(默认 deepseek-chat)">
          <div class="xt-tip">🔒 推荐把真实密钥写在代理的环境变量 / .env 里，此处留空即可——这样密钥不会存在浏览器中。</div>
        </details>
      </div>
    </section>
    <section class="xt-pane xt-pane-about">
      <div class="xt-sec">
        <div class="xt-about-title">使用提示</div>
        <ul class="xt-about-list">
          <li>AI 答题需在<strong>真正的测验 / 作业 / 考试页</strong>使用；课程框架页扫描显示 0 题属正常。</li>
          <li>题库优先：命中本地 / 外部题库则不消耗 AI。</li>
          <li>官方 AI 跨域：把脚本头部 <code>@grant</code> 改为 <code>GM_xmlhttpRequest</code> 即可。</li>
          <li>密钥推荐写在代理的 <code>.env</code>，面板留空最安全。</li>
        </ul>
      </div>
      <div class="xt-tip">本项目仅供学习与前端自动化研究，请遵守平台使用规定。</div>
    </section>
  </div>
</div>
`;
