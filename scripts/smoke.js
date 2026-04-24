/**
 * 스모크 테스트 — 리팩토링 후에도 백엔드가 제 역할을 하는지 최소 검증.
 *
 * 실행: node scripts/smoke.js
 *
 * 동작:
 *   1) 서버가 기동 중이어야 함 (별도 터미널에서 `npm start`)
 *   2) GET /api/env            → 200 + { env: 'sandbox' | 'live' }
 *   3) POST /api/books         → 200 + bookUid 반환 (실제 생성)
 *
 * sandbox에서만 실행하세요. live 환경이면 실패로 간주합니다.
 */

const BASE = process.env.SMOKE_BASE || 'http://localhost:8080';

async function call(method, path, body) {
    const init = { method, headers: body ? { 'Content-Type': 'application/json' } : {} };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(BASE + path, init);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {}
    return { status: res.status, data, text };
}

async function run() {
    let failed = 0;
    const log = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };

    // 1) env
    const envRes = await call('GET', '/api/env');
    log(envRes.status === 200, `GET /api/env → ${envRes.status}`);
    if (envRes.status !== 200) throw new Error('서버 미기동?');
    if (envRes.data.env !== 'sandbox') {
        console.log(`  ! 현재 env=${envRes.data.env}. 스모크는 sandbox에서만 실행합니다.`);
        process.exit(2);
    }
    log(true, `env=${envRes.data.env}`);

    // 2) book create
    const book = await call('POST', '/api/books', {
        bookSpecUid: 'SQUAREBOOK_HC',
        title: `smoke-${Date.now()}`,
        creationType: 'TEMPLATE',
    });
    log(book.status === 200, `POST /api/books → ${book.status}`);
    const bookUid = book.data?.bookUid || book.data?.data?.bookUid;
    log(!!bookUid, `bookUid 발급: ${bookUid}`);

    if (failed === 0) {
        console.log('\n스모크 통과.');
        process.exit(0);
    }
    console.log(`\n스모크 실패: ${failed}건`);
    process.exit(1);
}

run().catch((err) => {
    console.error('스모크 오류:', err.message);
    process.exit(1);
});
