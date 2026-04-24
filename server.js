/**
 * 일기장 demo — 백엔드 서버
 *
 *   브라우저 (프론트엔드)  →  이 서버 (SDK 소유)  →  Sweetbook API
 *
 * - Sweetbook SDK는 **이 서버 프로세스만** 사용합니다.
 * - 브라우저에는 SDK도, API Key도 내려가지 않습니다.
 * - 프론트는 좁은 REST 엔드포인트(/api/*)만 호출합니다.
 *
 * 실행:
 *   1) cp .env.example .env  후 SWEETBOOK_ENV, SWEETBOOK_API_KEY 채우기
 *   2) npm install
 *   3) node server.js
 */

require('dotenv/config');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { SweetbookClient } = require('bookprintapi');

const ENV = (process.env.SWEETBOOK_ENV || 'sandbox').toLowerCase();
const API_KEY = process.env.SWEETBOOK_API_KEY || '';
const PORT = parseInt(process.env.PORT || '8080', 10);

if (!API_KEY) {
    console.error('[ERROR] SWEETBOOK_API_KEY 가 .env에 설정되지 않았습니다.');
    console.error('        .env.example을 .env로 복사하고 값을 채워주세요.');
    process.exit(1);
}
if (ENV !== 'sandbox' && ENV !== 'live') {
    console.error(`[ERROR] SWEETBOOK_ENV는 sandbox 또는 live여야 합니다. 현재: ${ENV}`);
    process.exit(1);
}

const client = new SweetbookClient({ apiKey: API_KEY, environment: ENV });

// ── 정적 파일 서빙 ──
const ROOT = __dirname;
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.csv': 'text/csv; charset=utf-8',
};

function serveStatic(req, res) {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let filePath = path.join(ROOT, pathname);
    if (filePath.endsWith(path.sep) || filePath.endsWith('/')) filePath += 'index.html';
    try {
        if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch (e) { /* ignore */ }

    // 민감 파일 차단
    if (filePath.includes('node_modules') || /\.env(\.|$)/.test(path.basename(filePath))) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

// ── JSON 헬퍼 ──
function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let buf = '';
        req.on('data', (c) => { buf += c; });
        req.on('end', () => {
            if (!buf) return resolve({});
            try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

function handleSdkError(res, err) {
    const status = err.statusCode || err.status || 500;
    sendJson(res, status, { error: err.message || 'Unknown error', details: err.details });
}

// ── 라우팅 ──
const routes = [
    // 환경 정보
    { method: 'GET', path: /^\/api\/env$/, handler: async (req, res) => {
        sendJson(res, 200, { env: ENV });
    }},

    // Books
    { method: 'POST', path: /^\/api\/books$/, handler: async (req, res) => {
        const body = await readJsonBody(req);
        const data = await client.books.create({
            bookSpecUid: body.bookSpecUid,
            title: body.title,
            creationType: body.creationType || 'TEMPLATE',
            externalRef: body.externalRef,
        });
        sendJson(res, 200, data);
    }},
    { method: 'POST', path: /^\/api\/books\/([^\/]+)\/finalize$/, handler: async (req, res, q, m) => {
        const data = await client.books.finalize(m[1]);
        sendJson(res, 200, data);
    }},

    // Cover
    { method: 'POST', path: /^\/api\/books\/([^\/]+)\/cover$/, handler: async (req, res, q, m) => {
        const body = await readJsonBody(req);
        const data = await client.covers.create(m[1], body.templateUid, body.parameters || {});
        sendJson(res, 200, data);
    }},

    // Contents (내지 한 장씩)
    { method: 'POST', path: /^\/api\/books\/([^\/]+)\/contents$/, handler: async (req, res, q, m) => {
        const body = await readJsonBody(req);
        const options = {};
        if (body.breakBefore !== undefined) options.breakBefore = body.breakBefore;
        const data = await client.contents.insert(m[1], body.templateUid, body.parameters || {}, options);
        sendJson(res, 200, data);
    }},
];

const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, 'http://x');
    const pathname = urlObj.pathname;

    if (pathname.startsWith('/api/')) {
        for (const r of routes) {
            const m = pathname.match(r.path);
            if (m && r.method === req.method) {
                try { await r.handler(req, res, urlObj.searchParams, m); }
                catch (err) {
                    console.error(`[api] ${req.method} ${pathname}:`, err.message);
                    handleSdkError(res, err);
                }
                return;
            }
        }
        return sendJson(res, 404, { error: 'Not Found', path: pathname });
    }

    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`일기장 demo 서버 시작`);
    console.log(`  URL:  http://localhost:${PORT}`);
    console.log(`  환경: ${ENV}`);
    console.log(`  SDK:  bookprintapi (백엔드 전용)`);
    console.log('='.repeat(50));
});
