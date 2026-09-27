/**
 * 学习通自动刷课脚本 —— AI 答题中转代理（本地 Node 版，零依赖）
 *
 * 适合：不想注册 Cloudflare、只想立刻在本机跑起来的场景。
 *
 * 用法：
 *   UPSTREAM_KEY=sk-xxxx node proxy/local-proxy.mjs
 *   # 或已配 package.json：
 *   npm run proxy
 *
 * 然后在脚本控制台面板「🤖 AI 答题 → API 设置」填：
 *   API 地址：http://127.0.0.1:8787/v1/chat/completions
 *   API Key ：你的真实密钥（若设置了 PROXY_TOKEN，则填该口令）
 *   模型名 ：deepseek-chat
 *
 * 环境变量：
 *   UPSTREAM_BASE  上游地址，默认 https://api.deepseek.com/v1
 *   UPSTREAM_KEY   上游真实密钥
 *   PROXY_TOKEN    可选，设置了就必须用它作为 Bearer 才放行
 *   PORT           监听端口，默认 8787
 */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const UPSTREAM_BASE = (process.env.UPSTREAM_BASE || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
const UPSTREAM_KEY = process.env.UPSTREAM_KEY || '';
const PROXY_TOKEN = process.env.PROXY_TOKEN || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
    'Access-Control-Max-Age': '86400',
};

function send(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }
    if (req.method !== 'POST') {
        send(res, 405, { error: '仅支持 POST 请求' });
        return;
    }

    // 路径映射：/v1/chat/completions -> 上游BASE + /chat/completions
    const reqUrl = new URL(req.url, 'http://' + (req.headers.host || HOST));
    let path = reqUrl.pathname;
    if (!path || path === '/' || path === '/v1' || path === '/v1/') {
        path = '/chat/completions';
    } else {
        path = path.replace(/^\/v1\//, '/');
    }
    if (!/^\/chat\/completions$/.test(path)) {
        send(res, 403, { error: '路径不被允许：' + path });
        return;
    }

    const clientBearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    if (PROXY_TOKEN && clientBearer !== PROXY_TOKEN) {
        send(res, 401, { error: '未授权：API Key 与代理的 PROXY_TOKEN 不一致' });
        return;
    }

    let upstreamKey = UPSTREAM_KEY || clientBearer;
    if (!upstreamKey) {
        send(res, 401, { error: '缺少密钥：请设置环境变量 UPSTREAM_KEY，或在脚本面板填写 API Key' });
        return;
    }

    let chunks = [];
    let size = 0;
    for await (const c of req) {
        chunks.push(c);
        size += c.length;
        if (size > 1024 * 1024) {
            send(res, 413, { error: '请求体过大' });
            req.destroy();
            return;
        }
    }
    let parsed = null;
    try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
        send(res, 400, { error: '请求体不是合法 JSON' });
        return;
    }
    if (!parsed || !Array.isArray(parsed.messages)) {
        send(res, 400, { error: '请求体缺少 messages 字段' });
        return;
    }

    const target = UPSTREAM_BASE + path;
    const started = Date.now();
    try {
        const upstreamResp = await fetch(target, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + upstreamKey,
            },
            body: JSON.stringify(parsed),
        });
        const text = await upstreamResp.text();
        console.log(
            `[本地代理] ${upstreamResp.status} ${Date.now() - started}ms -> ${target} model=${parsed.model || '-'}`
        );
        res.writeHead(upstreamResp.status, {
            ...corsHeaders,
            'Content-Type': upstreamResp.headers.get('content-type') || 'application/json',
            'Content-Length': Buffer.byteLength(text),
        });
        res.end(text);
    } catch (e) {
        console.error('[本地代理] 上游请求失败：', e && e.message ? e.message : e);
        send(res, 502, { error: '请求上游失败：' + (e && e.message ? e.message : String(e)) });
    }
});

server.listen(PORT, HOST, () => {
    console.log('============================================================');
    console.log(' AI 答题中转代理已启动（本地 Node 版）');
    console.log(` 监听地址: http://${HOST}:${PORT}`);
    console.log(` 上游地址: ${UPSTREAM_BASE}`);
    console.log(` 密钥来源: ${UPSTREAM_KEY ? '环境变量 UPSTREAM_KEY' : '由脚本传入（原样转发）'}`);
    console.log(` 访问口令: ${PROXY_TOKEN ? '已启用' : '未启用（不设口令请勿暴露到公网）'}`);
    console.log('');
    console.log(' 在脚本控制台面板「🤖 AI 答题 → API 设置」填写：');
    console.log(`   API 地址: http://${HOST}:${PORT}/v1/chat/completions`);
    console.log(`   API Key : ${PROXY_TOKEN ? 'PROXY_TOKEN 的值' : '你的真实密钥'}`);
    console.log('============================================================');
});
