/**
 * 일기장 앱 — UI 이벤트, 파일 업로드, 책 생성 플로우
 *
 * TODO: 썸네일 미리보기 기능 (RenderClient + loadThumbnails)
 *   - SDK에 RenderClient 추가 (POST /render/page-thumbnail, GET /render/thumbnail/{bookUid}/{fileName})
 *   - 책 생성 완료/일시중지/에러 시 pageNum별 썸네일 자동 로딩
 *   - CSS는 style.css에 준비됨 (.thumbnail-section, .spread-slot 등)
 */

let client = null;
let dataItems = [];
let rawJsonData = null;  // JSON 원본 데이터 보존
let _paused = false;     // 일시중지 요청 플래그
let _saved = null;       // 이어서하기용 스냅샷

// ── 환경별 API Key 저장 ──
const _envKeys = { live: '', sandbox: '' };

function getSelectedEnv() {
    return document.querySelector('input[name="apiEnv"]:checked')?.value || 'sandbox';
}

function onEnvChange() {
    const keyInput = document.getElementById('userApiKey');
    const prev = document.querySelector('input[name="apiEnv"]:not(:checked)')?.value;
    if (prev && keyInput) _envKeys[prev] = keyInput.value;
    const env = getSelectedEnv();
    if (keyInput) keyInput.value = _envKeys[env] || '';
    const warn = document.getElementById('envWarning');
    if (warn) {
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        warn.style.display = (env === 'live' && isLocal) ? '' : 'none';
    }
    client = null;
}

// ── config.js 기본값 적용 ──
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof APP_CONFIG !== 'undefined') {
        if (APP_CONFIG.environments) {
            const envs = APP_CONFIG.environments;
            if (envs.live?.apiKey) _envKeys.live = envs.live.apiKey;
            if (envs.sandbox?.apiKey) _envKeys.sandbox = envs.sandbox.apiKey;
        } else if (APP_CONFIG.userApiKey) {
            _envKeys.live = APP_CONFIG.userApiKey;
            _envKeys.sandbox = APP_CONFIG.userApiKey;
        }
        const defaultEnv = APP_CONFIG.defaultEnv || 'sandbox';
        const radio = document.querySelector(`input[name="apiEnv"][value="${defaultEnv}"]`);
        if (radio) radio.checked = true;
        document.getElementById('userApiKey').value = _envKeys[getSelectedEnv()] || '';
    }
    document.querySelectorAll('input[name="apiEnv"]').forEach(r => {
        r.addEventListener('change', onEnvChange);
    });
    await loadTemplateUids();
    renderTemplateUidFields();
});

function getBaseUrl() {
    const env = getSelectedEnv();
    let apiUrl;
    if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.environments?.[env]?.url) {
        apiUrl = APP_CONFIG.environments[env].url;
    } else {
        const url = APP_CONFIG?.apiServers?.[0]?.url || document.getElementById('apiServer')?.value || 'https://api.sweetbook.com/v1';
        apiUrl = env === 'sandbox' ? url.replace('://dev-api.', '://dev-api-sandbox.').replace('://api.', '://api-sandbox.') : url;
    }
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        return `/proxy/api/${apiUrl}`;
    }
    return apiUrl;
}

function getClient() {
    const apiKey = document.getElementById('userApiKey').value.trim();
    const baseUrl = getBaseUrl();
    const useCookie = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.useCookie) || false;
    if (!apiKey && !useCookie) { alert('API Key를 입력하세요.'); return null; }
    _envKeys[getSelectedEnv()] = apiKey;
    client = new SweetbookClient({ apiKey: apiKey || undefined, baseUrl, useCookie });
    return client;
}

// ── DOM 요소 ──
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameEl = document.getElementById('fileName');
const fileSizeEl = document.getElementById('fileSize');
const dataPreview = document.getElementById('dataPreview');
const dataItemsContainer = document.getElementById('dataItems');
const itemCount = document.getElementById('itemCount');
const bookOptions = document.getElementById('bookOptions');
const createBookBtn = document.getElementById('createBookBtn');
const resetBtn = document.getElementById('resetBtn');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const resultMessage = document.getElementById('resultMessage');
const logArea = document.getElementById('logArea');

// ── 동적 필드 렌더링 ──
function renderTemplateUidFields() {
    const type = document.querySelector('input[name="diaryType"]:checked').value;
    const fields = TPL_FIELDS[type];
    const uids = TEMPLATE_UIDS[type];
    const container = document.getElementById('templateUidFields');
    container.innerHTML = '';
    fields.forEach(f => {
        const uidKey = f.id.replace('tpl', '');
        const key = uidKey.charAt(0).toLowerCase() + uidKey.slice(1);
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `<label for="${f.id}">${f.label}</label><input type="text" id="${f.id}" value="${uids[key] || ''}" />`;
        container.appendChild(div);
    });
}

function renderCoverFields() {
    const type = document.querySelector('input[name="diaryType"]:checked').value;
    const fields = COVER_FIELDS[type];
    const container = document.getElementById('coverFields');
    container.innerHTML = '';
    fields.forEach(f => {
        const div = document.createElement('div');
        div.className = 'form-group';
        const input = document.createElement('input');
        input.type = 'text'; input.id = f.id; input.placeholder = f.placeholder; input.required = true;
        if (f.defaultValue) input.dataset.defaultValue = f.defaultValue;
        div.innerHTML = `<label for="${f.id}">${f.label}</label>`;
        div.appendChild(input);
        container.appendChild(div);
    });
}

// ── Tab 키로 빈 필드에 placeholder 자동완성 ──
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) {
        const el = e.target;
        if (el.tagName === 'INPUT' && el.type === 'text' && !el.value.trim() && el.placeholder) {
            e.preventDefault();
            el.value = el.dataset.defaultValue || el.placeholder;
            const inputs = Array.from(document.querySelectorAll('#bookOptions input[type="text"]:not([style*="display:none"])'));
            const idx = inputs.indexOf(el);
            if (idx >= 0 && idx < inputs.length - 1) inputs[idx + 1].focus();
        }
    }
});

renderTemplateUidFields();
renderCoverFields();
document.querySelectorAll('input[name="diaryType"]').forEach(r => {
    r.addEventListener('change', () => {
        renderTemplateUidFields(); renderCoverFields();
        // 타입 변경 시 데이터 초기화
        resetUpload();
    });
});

// ── 로그 ──
function appendLog(msg, type = 'info') {
    logArea.style.display = 'block';
    const span = document.createElement('span');
    span.className = 'log-' + type;
    span.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    logArea.appendChild(span);
    logArea.scrollTop = logArea.scrollHeight;
}

// ── 파일 업로드 ──
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f); });
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
uploadArea.addEventListener('drop', e => {
    e.preventDefault(); uploadArea.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.json')) handleFile(f); else alert('JSON 파일만 업로드 가능합니다.');
});

function validateJsonForType(data, type) {
    if (typeof data !== 'object' || data === null || Array.isArray(data))
        return '일기장 JSON은 객체 형식이어야 합니다 (배열 아님)';
    if (!data.entries || !Array.isArray(data.entries) || data.entries.length === 0)
        return '"entries" 배열이 필요합니다';
    const entryTypes = new Set(data.entries.map(e => e.type).filter(Boolean));
    const hasNaejiA = data.entries.some(e => e.type === 'naeji_a' && e.day_num);
    const hasNaejiB = data.entries.some(e => e.type === 'naeji_a' && e.date);
    if (type === 'A') {
        if (hasNaejiB && !hasNaejiA)
            return '일기장B용 JSON입니다 (date 필드). 일기장A에는 day_num 필드가 필요합니다.';
        if (data.cover?.frontPhoto)
            return '일기장B용 JSON입니다 (cover.frontPhoto). 일기장A는 cover.coverPhoto를 사용합니다.';
    } else if (type === 'B') {
        if (hasNaejiA && !hasNaejiB)
            return '일기장A용 JSON입니다 (day_num 필드). 일기장B에는 date 필드가 필요합니다.';
        if (data.cover?.coverPhoto && !data.cover?.frontPhoto)
            return '일기장A용 JSON입니다 (cover.coverPhoto). 일기장B는 cover.frontPhoto를 사용합니다.';
    }
    return null;
}

function handleFile(file) {
    fileNameEl.textContent = `📄 ${file.name}`;
    fileSizeEl.textContent = `크기: ${(file.size / 1024).toFixed(2)} KB`;
    fileInfo.classList.add('show');
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            const type = document.querySelector('input[name="diaryType"]:checked').value;

            // 새 형식 (객체 with entries) 지원
            rawJsonData = null;
            if (data && typeof data === 'object' && !Array.isArray(data) && data.entries) {
                rawJsonData = data;
                const error = validateJsonForType(data, type);
                if (error) {
                    alert(`일기장${type} JSON 검증 실패:\n\n${error}`);
                    fileInfo.classList.remove('show');
                    fileInput.value = '';
                    return;
                }
                // entries에서 naeji 항목 추출 (ganji에서 year/month 추적)
                let curYear = new Date().getFullYear(), curMonth = 1;
                const items = [];
                for (const entry of data.entries) {
                    if (entry.type === 'ganji') {
                        curYear = entry.year || curYear;
                        curMonth = entry.month || curMonth;
                        continue;
                    }
                    const photoUrls = [];
                    if (entry.photo) photoUrls.push(entry.photo);
                    if (entry.photo1) photoUrls.push(entry.photo1);
                    if (entry.photo2) photoUrls.push(entry.photo2);
                    if (entry.photos) photoUrls.push(...entry.photos);
                    // date가 YYYY-MM-DD면 그대로, day_num만 있으면 ganji의 year/month로 조합
                    let date = entry.date || '';
                    if (!date && entry.day_num) {
                        date = `${curYear}-${String(curMonth).padStart(2,'0')}-${String(entry.day_num).padStart(2,'0')}`;
                    }
                    items.push({ date, textQ: entry.diary_text || '', textA: entry.title || '', photoUrls });
                }
                parseData(items);
                // 폼 자동 채우기
                if (data.cover) {
                    const fill = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
                    fill('bookTitle', data.title);
                    fill('coverDateRange', data.cover.dateRange);
                    if (type === 'A') {
                        fill('coverTitle', data.cover.title);
                    } else {
                        fill('coverSpineTitle', data.cover.spineTitle);
                    }
                }
                if (data.publish) {
                    const fill = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
                    fill('publishTitle', data.publish.title);
                    fill('publishDate', data.publish.publishDate);
                    fill('publishAuthor', data.publish.author);
                    fill('publishHashtags', data.publish.hashtags);
                }
                return;
            }

            // 레거시: 배열 형식
            if (!Array.isArray(data)) throw new Error('JSON 배열 형식이어야 합니다');
            parseData(data);
        } catch (err) { alert('JSON 오류: ' + err.message); resetUpload(); }
    };
    reader.readAsText(file);
}

function parseData(jsonArray) {
    dataItems = [];
    dataItemsContainer.innerHTML = '';
    jsonArray.forEach(item => {
        const date = item.date;
        const textQ = item.textQ || '';
        const textA = item.textA || '';
        const photoUrls = item.photoUrls || (item.photos || []).map(p => p.thumbUrl).filter(u => u);
        dataItems.push({ date, textQ, textA, photoUrls });
        const d = document.createElement('div');
        d.className = 'data-item';
        let h = `<div class="item-date">${date}</div>`;
        const dt = [textQ, textA].filter(t => t).join(' / ');
        if (dt) h += `<div class="item-text"><strong>일기:</strong> ${dt.substring(0, 150)}${dt.length > 150 ? '...' : ''}</div>`;
        if (photoUrls.length > 0) {
            h += '<div class="item-photo">';
            photoUrls.forEach((u, i) => { h += `<img src="${u}" alt="사진 ${i + 1}" style="max-width:80px;margin-right:4px;" />`; });
            h += `<span>사진 ${photoUrls.length}장</span></div>`;
        }
        d.innerHTML = h;
        dataItemsContainer.appendChild(d);
    });
    itemCount.textContent = `${dataItems.length}개 항목`;
    dataPreview.classList.add('show');
    bookOptions.classList.add('show');
    createBookBtn.disabled = false;
    autoFillFromData();
}

function autoFillFromData() {
    if (dataItems.length === 0) return;
    const dates = dataItems.map(i => i.date).sort();
    const f = dates[0], l = dates[dates.length - 1];
    const type = document.querySelector('input[name="diaryType"]:checked').value;
    const dr = document.getElementById('coverDateRange');
    if (dr && !dr.value) {
        if (type === 'A') dr.value = `${f.substring(2, 4)}.${f.substring(5, 7)} - ${l.substring(2, 4)}.${l.substring(5, 7)}`;
        else dr.value = `${f.replace(/-/g, '.')} - \n${l.replace(/-/g, '.')}`;
    }
    const today = new Date();
    const fill = (id, val) => { const el = document.getElementById(id); if (el && !el.value) el.value = val; };
    fill('publishDate', `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`);
    fill('publishHashtags', '#포토북은 #역시 #스위트북');
    const fy = parseInt(f.substring(0, 4)), fm = parseInt(f.substring(5, 7));
    const ly = parseInt(l.substring(0, 4)), lm = parseInt(l.substring(5, 7));
    fill('bookTitle', `일기장 ${fy}.${String(fm).padStart(2, '0')}~${ly}.${String(lm).padStart(2, '0')}`);
    fill('publishTitle', document.getElementById('bookTitle').value);
}

// ── 버튼 상태 관리 ──
function setButtons(state) {
    const show = (el, v) => el.style.display = v ? 'inline-block' : 'none';
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    // state: 'idle' | 'running' | 'paused' | 'stopped' | 'done'
    createBookBtn.disabled = state !== 'idle';
    show(pauseBtn, state === 'running');
    show(resumeBtn, state === 'paused' || state === 'stopped');
    resetBtn.disabled = state === 'running';
}

// ── entries 순차 처리 (일시중지/이어서하기 지원) ──
async function processEntries(ctx) {
    let { startIndex, successCount, failCount, lastResult } = ctx;
    const { bookUid, entries, tplUids, diaryType, coverPhoto, bookTitle, startTime } = ctx;
    const totalEntries = entries.length;

    for (let i = startIndex; i < entries.length; i++) {
        // 일시중지 체크
        if (_paused) {
            _saved = { ...ctx, startIndex: i, successCount, failCount, lastResult };
            appendLog(`일시중지 (${i}/${totalEntries})`, 'info');
            loading.classList.remove('show');
            setButtons('paused');
            return;
        }

        const entry = entries[i];
        try {
            if (entry.type === 'ganji') {
                loadingText.textContent = `간지 생성 중... (${i + 1}/${totalEntries})`;
                appendLog(`간지 생성 중 (ch.${entry.chapterNum})...`, 'info');
                let gp;
                if (diaryType === 'A') gp = { chapterNum: String(entry.chapterNum).padStart(2, '0'), year: String(entry.year), monthTitle: entry.monthTitle };
                else gp = { chapterNum: String(entry.chapterNum).padStart(2, '0'), seasonTitle: entry.seasonTitle, year: String(entry.year) };
                lastResult = await sdkPostContent(client, bookUid, tplUids.tplGanji, gp, 'page');
                appendLog(`간지 완료 (ch.${entry.chapterNum})`, 'success'); successCount++;
            }
            else if (entry.type === 'naeji_a') {
                const dl = `${entry.month}/${entry.day}`;
                loadingText.textContent = `${dl} 내지a 생성 중... (${i + 1}/${totalEntries})`;
                if (diaryType === 'A') {
                    appendLog(`${dl} 내지a 생성 중...`, 'info');
                    const p = { monthNum: entry.monthNum, dayNum: entry.dayNum, diaryText: entry.diaryText, photo: entry.photo1 };
                    lastResult = await sdkPostContent(client, bookUid, tplUids.tplNaejiA, p, entry.breakBefore);
                } else {
                    const p = { photo1: entry.photo1, date: entry.dateB, diaryText: entry.diaryText };
                    if (entry.title) p.title = entry.title;
                    const isLandscape = entry.photo1_width && entry.photo1_height && entry.photo1_width > entry.photo1_height;
                    const tplKey = isLandscape ? (tplUids.tplNaejiA_contain || tplUids.tplNaejiA_cover) : (tplUids.tplNaejiA_cover || tplUids.tplNaejiA);
                    const fitLabel = isLandscape ? 'contain' : 'cover';
                    appendLog(`${dl} 내지a [${fitLabel}] ${entry.photo1_width||'?'}x${entry.photo1_height||'?'}`, 'info');
                    lastResult = await sdkPostContent(client, bookUid, tplKey, p, entry.breakBefore);
                }
                appendLog(`${dl} 내지a 완료`, 'success'); successCount++;
            }
            else if (entry.type === 'naeji_textonly') {
                const dl = `${entry.month}/${entry.day}`;
                loadingText.textContent = `${dl} 텍스트 내지 생성 중... (${i + 1}/${totalEntries})`;
                appendLog(`${dl} 텍스트 내지 생성 중...`, 'info');
                if (diaryType === 'A') {
                    lastResult = await sdkPostContent(client, bookUid, tplUids.tplNaejiB, { monthNum: entry.monthNum, dayNum: entry.dayNum, diaryText: entry.diaryText }, entry.breakBefore);
                } else {
                    const tp = { date: entry.dateB, diaryText: entry.diaryText };
                    if (entry.title) tp.title = entry.title;
                    lastResult = await sdkPostContent(client, bookUid, tplUids.tplNaejiB, tp, entry.breakBefore);
                }
                appendLog(`${dl} 텍스트 내지 완료`, 'success'); successCount++;
            }
            else if (entry.type === 'naeji_gallery') {
                loadingText.textContent = `갤러리 생성 중... (${i + 1}/${totalEntries})`;
                appendLog('갤러리 생성 중...', 'info');
                let gp;
                if (diaryType === 'A') gp = { monthNum: entry.monthNum, dayNum: entry.dayNum, collagePhotos: entry.photos };
                else gp = { date: entry.dateB, collagePhotos: entry.photos };
                lastResult = await sdkPostContent(client, bookUid, tplUids.tplGallery, gp, entry.breakBefore);
                appendLog('갤러리 완료', 'success'); successCount++;
            }
        } catch (err) {
            const detail = err.details ? ` | ${JSON.stringify(err.details)}` : '';
            appendLog(`${entry.type} 오류: ${err.message}${detail}`, 'error');
            failCount++;
            _saved = { ...ctx, startIndex: i, successCount, failCount, lastResult };
            appendLog('"이어서하기"로 재시도 가능', 'info');
            loading.classList.remove('show');
            setButtons('stopped');
            return;
        }
    }

    // ── 모든 entries 완료 → 빈내지 + 발행면 + 결과 표시 ──

    // 마지막 내지가 left면 빈내지 삽입 (발행면이 left에 오도록)
    const lastSide = lastResult?.pageSide || 'right';
    if (lastSide === 'left' && tplUids.tplBlank) {
        appendLog('빈내지 삽입 (발행면 위치 조정)...', 'info');
        await sdkPostContent(client, bookUid, tplUids.tplBlank, {}, 'page');
        appendLog('빈내지 삽입 완료', 'success');
    }

    // 발행면
    loadingText.textContent = '발행면 생성 중...';
    appendLog('발행면 생성 중...', 'info');
    const publishResult = await sdkPostContent(client, bookUid, tplUids.tplPublish, {
        photo: coverPhoto || '',
        title: document.getElementById('publishTitle').value.trim() || bookTitle,
        publishDate: document.getElementById('publishDate').value.trim() || '',
        author: document.getElementById('publishAuthor').value.trim() || '',
        hashtags: document.getElementById('publishHashtags').value.trim() || '',
    }, 'page');
    appendLog('발행면 완료', 'success');

    const pageCount = publishResult?.pageCount || 0;
    const lastPageNum = publishResult?.pageNum || 0;
    const tt = Date.now() - startTime;
    appendLog(`책 생성 완료! bookUid: ${bookUid}, pageCount=${pageCount}, pageNum=${lastPageNum}, 소요시간: ${(tt / 1000).toFixed(2)}초`, 'success');
    loading.classList.remove('show');
    resultMessage.innerHTML = `✓ 일기장${diaryType} 책이 생성되었습니다! (최종화 전)<br><small>bookUid: ${bookUid}</small><br><small>총 ${pageCount}페이지 | 전체: ${totalEntries}개 | 성공: ${successCount}개 | 실패: ${failCount}개</small><br><small>생성 시간: ${(tt / 1000).toFixed(2)}초</small>`;
    resultMessage.className = 'result-message success show';

    // 제작 버튼 활성화 (24페이지 이상만)
    const finalizeBtn = document.getElementById('finalizeBtn');
    finalizeBtn.dataset.bookUid = bookUid;
    finalizeBtn.disabled = pageCount < 24;
    finalizeBtn.style.display = 'inline-block';

    _saved = null;
    setButtons('done');
}

// ── 이어서하기 ──
async function resumeBook() {
    if (!_saved) return;
    _paused = false;
    loading.classList.add('show');
    setButtons('running');
    await processEntries(_saved);
}

// ── 책 생성 ──
async function createDiaryBook() {
    const bookTitle = document.getElementById('bookTitle').value.trim();
    const apiEnv = getSelectedEnv();
    const diaryType = document.querySelector('input[name="diaryType"]:checked').value;
    if (!bookTitle) { alert('책 제목을 입력하세요.'); document.getElementById('bookTitle').focus(); return; }

    // 필수 필드 검증
    const requiredFields = [
        { id: 'publishTitle', name: '발행 제목' }, { id: 'publishDate', name: '발행일' },
        { id: 'publishAuthor', name: '저자' }, { id: 'publishHashtags', name: '해시태그' },
    ];
    // 표지 필드도 검증
    const coverFields = COVER_FIELDS[diaryType];
    for (const f of coverFields) {
        const el = document.getElementById(f.id);
        if (el && !el.value.trim()) { alert(`${f.label.replace(' *', '')}을(를) 입력하세요. (Tab 키로 기본값 자동완성 가능)`); el.focus(); return; }
    }
    for (const f of requiredFields) {
        const el = document.getElementById(f.id);
        if (el && !el.value.trim()) { alert(`${f.name}을(를) 입력하세요. (Tab 키로 기본값 자동완성 가능)`); el.focus(); return; }
    }

    if (!getClient()) return;

    const tplUids = {};
    const fields = TPL_FIELDS[diaryType];
    for (const f of fields) {
        const el = document.getElementById(f.id);
        if (!el || !el.value.trim()) { alert(`${f.label} 템플릿 UID를 입력하세요.`); return; }
        tplUids[f.id] = el.value.trim();
    }

    _paused = false;
    _saved = null;
    setButtons('running');
    loading.classList.add('show'); resultMessage.classList.remove('show');
    logArea.innerHTML = ''; logArea.style.display = 'block';
    const startTime = Date.now();

    try {
        appendLog(`일기장${diaryType} 책 생성 시작...`, 'info');
        appendLog(`API: ${getBaseUrl()}`, 'info');
        const createResult = await client.books.create({ title: bookTitle, bookSpecUid: 'SQUAREBOOK_HC', creationType: 'TEMPLATE' });
        const bookUid = createResult.bookUid || createResult.uid;
        appendLog(`책 생성 완료: ${bookUid}`, 'success');

        // 표지
        loadingText.textContent = '표지를 생성하는 중...';
        appendLog('표지 생성 중...', 'info');
        let coverPhoto = '';
        if (rawJsonData?.cover) {
            coverPhoto = rawJsonData.cover.coverPhoto || rawJsonData.cover.frontPhoto || '';
        }
        if (!coverPhoto) {
            for (let i = 0; i < dataItems.length; i++) { if (dataItems[i].photoUrls?.length > 0) { coverPhoto = dataItems[i].photoUrls[0]; break; } }
        }
        if (!coverPhoto) { alert('표지에 사용할 사진이 없습니다.'); loading.classList.remove('show'); setButtons('idle'); return; }
        let coverParams;
        if (diaryType === 'A') {
            coverParams = { coverPhoto, title: document.getElementById('coverTitle')?.value.trim() || bookTitle, dateRange: document.getElementById('coverDateRange')?.value.trim() || '' };
        } else {
            let backPhoto = rawJsonData?.cover?.backPhoto || '';
            if (!backPhoto) {
                for (let i = 0; i < dataItems.length; i++) { if (dataItems[i].photoUrls?.length > 1) { backPhoto = dataItems[i].photoUrls[1]; break; } }
            }
            coverParams = { frontPhoto: coverPhoto, backPhoto, dateRange: document.getElementById('coverDateRange')?.value.trim() || '', spineTitle: document.getElementById('coverSpineTitle')?.value.trim() || bookTitle };
        }
        const ccp = stripEmptyImages(coverParams);
        appendLog('표지 파라미터: ' + JSON.stringify(ccp), 'info');
        await client.covers.create(bookUid, tplUids.tplCover, ccp);
        appendLog('표지 생성 완료', 'success');

        // 내지 entries
        let entries = rawJsonData ? convertRawEntries(rawJsonData.entries, diaryType) : buildDiaryEntries(dataItems, diaryType);
        if (diaryType === 'B') {
            appendLog('사진 크기 확인 중...', 'info');
            entries = await attachPhotoSizes(entries);
        }

        // 페이지 수 예상 (130페이지 제한 체크)
        const MAX_PAGES = 130;
        let estPages = 4;
        for (const e of entries) {
            if (e.type === 'ganji') estPages += 1;
            else if (e.type === 'naeji_a') estPages += 1;
            else if (e.type === 'naeji_textonly') estPages += 1;
            else if (e.type === 'naeji_gallery') estPages += 1;
        }
        appendLog(`예상 페이지 수: ${estPages}페이지 (최대 ${MAX_PAGES})`, estPages > MAX_PAGES ? 'error' : 'info');
        if (estPages > MAX_PAGES) {
            const over = estPages - MAX_PAGES;
            alert(`예상 페이지(${estPages})가 최대 ${MAX_PAGES}페이지를 초과합니다.\n${over}페이지를 줄여주세요.`);
            loading.classList.remove('show');
            setButtons('idle');
            return;
        }

        // processEntries에 컨텍스트 전달
        const ctx = { bookUid, entries, tplUids, diaryType, coverPhoto, bookTitle, startTime,
                      startIndex: 0, successCount: 0, failCount: 0, lastResult: null };
        await processEntries(ctx);

    } catch (error) {
        const detail = error.details ? ` | ${JSON.stringify(error.details)}` : '';
        appendLog(`오류: ${error.message}${detail}`, 'error');
        loading.classList.remove('show');
        resultMessage.textContent = '✗ 책 생성 중 오류: ' + error.message;
        resultMessage.className = 'result-message error show';
        setButtons('idle');
    }
}

createBookBtn.addEventListener('click', createDiaryBook);
document.getElementById('pauseBtn').addEventListener('click', () => { _paused = true; });
document.getElementById('resumeBtn').addEventListener('click', resumeBook);
resetBtn.addEventListener('click', () => { if (confirm('모든 내용을 초기화하시겠습니까?')) resetUpload(); });

// 제작(최종화) 버튼
document.getElementById('finalizeBtn').addEventListener('click', async () => {
    const finalizeBtn = document.getElementById('finalizeBtn');
    const bookUid = finalizeBtn.dataset.bookUid;
    if (!bookUid) return;
    finalizeBtn.disabled = true;
    appendLog('최종화 중...', 'info');
    try {
        await client.books.finalize(bookUid);
        appendLog(`최종화 완료! bookUid: ${bookUid}`, 'success');
        resultMessage.innerHTML = resultMessage.innerHTML.replace('(최종화 전)', '(최종화 완료)');
        finalizeBtn.style.display = 'none';
    } catch (error) {
        appendLog(`최종화 오류: ${error.message}`, 'error');
        finalizeBtn.disabled = false;
    }
});

function resetUpload() {
    _paused = false;
    _saved = null;
    fileInput.value = '';
    fileInfo.classList.remove('show');
    dataPreview.classList.remove('show');
    bookOptions.classList.remove('show');
    loading.classList.remove('show');
    resultMessage.classList.remove('show');
    logArea.style.display = 'none';
    logArea.innerHTML = '';
    dataItems = [];
    rawJsonData = null;
    document.getElementById('bookTitle').value = '';
    createBookBtn.disabled = true;
    setButtons('idle');
    const finalizeBtn = document.getElementById('finalizeBtn');
    finalizeBtn.style.display = 'none';
    finalizeBtn.dataset.bookUid = '';
}
