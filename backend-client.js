/**
 * 브라우저 → 이 demo의 백엔드(/api/*)를 부르는 얇은 클라이언트
 *
 * 기존 코드가 쓰던 SDK 시그니처와 동일하게 만들어, app.js/book-builder.js의
 * `client.books.create(...)`, `client.contents.insert(...)` 호출을 그대로 유지합니다.
 *
 * SDK 자체는 이 브라우저에 있지 않고, demo의 백엔드 프로세스 안에서만 사용됩니다.
 */
window.createBackendClient = function createBackendClient() {
    async function call(method, url, { body } = {}) {
        const init = { method, headers: body ? { 'Content-Type': 'application/json' } : {} };
        if (body !== undefined) init.body = JSON.stringify(body);
        const res = await fetch(url, init);
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
        if (!res.ok) {
            const err = new Error((data && data.error) || `HTTP ${res.status}`);
            err.statusCode = res.status;
            err.details = data && data.details;
            throw err;
        }
        // 서버가 돌려준 응답을 SDK 호출 시 받던 형태로 그대로 전달
        return data;
    }

    return {
        books: {
            create: (data) => call('POST', '/api/books', { body: data }),
            finalize: (uid) => call('POST', `/api/books/${encodeURIComponent(uid)}/finalize`),
        },
        covers: {
            create: (bookUid, templateUid, parameters) =>
                call('POST', `/api/books/${encodeURIComponent(bookUid)}/cover`,
                     { body: { templateUid, parameters } }),
        },
        contents: {
            insert: (bookUid, templateUid, parameters, options = {}) =>
                call('POST', `/api/books/${encodeURIComponent(bookUid)}/contents`,
                     { body: { templateUid, parameters, breakBefore: options.breakBefore } }),
        },
    };
};
