/**
 * 学习通自动刷课脚本 —— AI 答题中转代理（Cloudflare Worker 版）
 *
 * 作用：解决浏览器直连大模型官方 API 的 CORS 跨域限制，并可隐藏真实 Key。
 *
 * 部署后在脚本控制台面板「🤖 AI 答题 → API 设置」里填：
 *   API 地址：https://<你的子域>.workers.dev/v1/chat/completions
 *   API Key ：若 Worker 配了 UPSTREAM_KEY，这里填 ACCESS_TOKEN（没配 token 就随便填任意值）
 *   模型名 ：deepseek-chat（对应 UPSTREAM_BASE 的上游）
 *
 * 环境变量（在 Cloudflare 控制台 → Settings → Variables，或用 wrangler secret）：
 *   UPSTREAM_BASE  上游地址，默认 https://api.deepseek.com/v1
 *                  换成 OpenAI：https://api.openai.com/v1
 *                  换成自建 one-api/new-api：https://your-domain/v1
 *   UPSTREAM_KEY   上游真实密钥（建议用 secret 存，不要写在 wrangler.toml 里）
 *   ACCESS_TOKEN   可选。设了之后，脚本传来的 Bearer 必须等于它才放行（防白嫖）
 *   ALLOW_ANY_PATH 可选，默认 "0"。设为 "1" 时放行任意路径（否则只放行聊天补全相关路径）
 */

export default {
    async fetch(request, env) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
            'Access-Control-Max-Age': '86400',
        };

        // 预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return json({ error: '仅支持 POST 请求' }, 405, corsHeaders);
        }

        const upstreamBase = (env.UPSTREAM_BASE || 'https://api.deepseek.com/v1').replace(/\/+$/, '');

        // 解析并映射路径：/v1/chat/completions -> 上游BASE + /chat/completions
        const url = new URL(request.url);
        let path = url.pathname;
        if (!path || path === '/' || path === '/v1' || path === '/v1/') {
            path = '/chat/completions';
        } else {
            path = path.replace(/^\/v1\//, '/');
        }

        // 安全限制：默认只放行聊天补全相关路径，避免 Worker 被当成任意代理滥用
        const allowAnyPath = String(env.ALLOW_ANY_PATH || '0') === '1';
        if (!allowAnyPath && !/^\/chat\/completions$/.test(path)) {
            return json({ error: '路径不被允许：' + path }, 403, corsHeaders);
        }

        // 客户端传来的 Bearer
        const auth = request.headers.get('Authorization') || '';
        const clientBearer = auth.replace(/^Bearer\s+/i, '').trim();

        // 访问控制：设了 ACCESS_TOKEN 就必须校验
        if (env.ACCESS_TOKEN && clientBearer !== env.ACCESS_TOKEN) {
            return json({ error: '未授权：API Key 与 Worker 的 ACCESS_TOKEN 不一致' }, 401, corsHeaders);
        }

        // 决定转发给上游的密钥：优先 Worker 环境变量里存的真实 Key
        let upstreamKey = env.UPSTREAM_KEY || '';
        if (!upstreamKey) {
            if (env.ACCESS_TOKEN) {
                return json({ error: 'Worker 未配置 UPSTREAM_KEY' }, 500, corsHeaders);
            }
            upstreamKey = clientBearer; // 未隐藏 Key 时，原样转发客户端传入的 Key
        }
        if (!upstreamKey) {
            return json({ error: '缺少密钥：请配置 Worker 的 UPSTREAM_KEY，或在脚本面板填写 API Key' }, 401, corsHeaders);
        }

        // 读取并校验请求体
        let rawBody = '';
        try {
            rawBody = await request.text();
        } catch (e) {
            return json({ error: '读取请求体失败' }, 400, corsHeaders);
        }

        let parsed = null;
        try {
            parsed = rawBody ? JSON.parse(rawBody) : null;
        } catch (e) {
            return json({ error: '请求体不是合法 JSON' }, 400, corsHeaders);
        }
        if (!parsed || !Array.isArray(parsed.messages)) {
            return json({ error: '请求体缺少 messages 字段' }, 400, corsHeaders);
        }

        // 可选：强制覆盖模型名（多上游共用同一 Worker 时有用）
        if (env.FORCE_MODEL) parsed.model = env.FORCE_MODEL;

        const targetUrl = upstreamBase + path;

        let upstreamResp;
        try {
            upstreamResp = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + upstreamKey,
                },
                body: JSON.stringify(parsed),
            });
        } catch (e) {
            return json({ error: '请求上游失败：' + (e && e.message ? e.message : String(e)) }, 502, corsHeaders);
        }

        const respText = await upstreamResp.text();
        return new Response(respText, {
            status: upstreamResp.status,
            headers: {
                ...corsHeaders,
                'Content-Type': upstreamResp.headers.get('Content-Type') || 'application/json',
            },
        });
    },
};

function json(obj, status, corsHeaders) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
}
