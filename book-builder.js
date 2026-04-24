/**
 * 일기장 책 생성 로직 — entries 구성, 파라미터 빌더, API 호출
 */

// ── 이미지 크기 조회 ──
function getImageSize(url) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = url;
    });
}

async function attachPhotoSizes(entries) {
    const jobs = [];
    for (const e of entries) {
        if (e.type !== 'naeji_a') continue;
        if (e.photo1) jobs.push(getImageSize(e.photo1).then(s => { e.photo1_width = s.width; e.photo1_height = s.height; }));
        if (e.photo2) jobs.push(getImageSize(e.photo2).then(s => { e.photo2_width = s.width; e.photo2_height = s.height; }));
    }
    await Promise.all(jobs);
    return entries;
}

// ── 이미지 파라미터 빈 값 제거 ──
const IMAGE_PARAM_KEYS = new Set(['coverPhoto','photo','photo1','photo2','frontPhoto','backPhoto']);

function stripEmptyImages(obj) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        if (IMAGE_PARAM_KEYS.has(k) && (!v || v === '')) continue;
        result[k] = v;
    }
    return result;
}

// ── API 호출 (백엔드 /api 경유 — SDK는 서버에 있음) ──
async function sdkPostContent(client, bookUid, templateUid, parameters, breakBefore) {
    // 호출 시그니처는 이전(SDK 직접 호출) 그대로 유지. client 인자는 호환용 (사용 안 함).
    return client.contents.insert(bookUid, templateUid, stripEmptyImages(parameters), {
        breakBefore: breakBefore === 'none' ? '' : breakBefore,
    });
}

// ── 계절/월 헬퍼 ──
function getSeasonTitle(m) {
    if ([3,4,5].includes(m)) return '봄의 기록';
    if ([6,7,8].includes(m)) return '여름의 기록';
    if ([9,10,11].includes(m)) return '가을의 기록';
    return '겨울의 기록';
}

function getSeasonKey(m) {
    if ([3,4,5].includes(m)) return 'spring';
    if ([6,7,8].includes(m)) return 'summer';
    if ([9,10,11].includes(m)) return 'autumn';
    return 'winter';
}

// ── JSON 원본 entries → 내부 entries 변환 ──
function convertRawEntries(rawEntries, diaryType) {
    const entries = [];
    let curYear = new Date().getFullYear(), curMonth = 1;

    for (const raw of rawEntries) {
        if (raw.type === 'ganji') {
            curYear = raw.year || curYear;
            curMonth = raw.month || curMonth;
            entries.push({
                type: 'ganji', year: curYear, month: curMonth,
                chapterNum: raw.chapter || 0,
                seasonTitle: raw.season_title || getSeasonTitle(curMonth),
                monthTitle: `${curMonth}월의 기록`,
            });
            continue;
        }

        // raw.date가 "3.25" 형식이면 그대로 사용 (일기장B), raw.day_num이면 curMonth와 조합 (일기장A)
        let day, dateB;
        if (raw.date && raw.date.includes('.')) {
            const parts = raw.date.split('.');
            curMonth = parseInt(parts[0]) || curMonth;
            day = parseInt(parts[1]) || 0;
            dateB = raw.date;
        } else {
            day = parseInt((raw.day_num || raw.date || '').replace(/[^0-9]/g, '')) || 0;
            dateB = `${curMonth}.${String(day).padStart(2, '0')}`;
        }
        const mn = String(curMonth).padStart(2, '0');
        const dn = String(day).padStart(2, '0');
        const diaryText = raw.diary_text || '';
        const photos = [];
        if (raw.photo) photos.push(raw.photo);
        if (raw.photo1) photos.push(raw.photo1);
        if (raw.photo2) photos.push(raw.photo2);
        if (raw.photos) photos.push(...raw.photos);
        const breakBefore = raw.break_before || 'page';

        const title = raw.title || '';

        if (raw.type === 'naeji_a' || (diaryText && photos.length > 0)) {
            entries.push({ type: 'naeji_a', breakBefore, year: curYear, month: curMonth, day, monthNum: mn, dayNum: dn, dateB, diaryText, title, photo1: photos[0] || '', photo2: photos[1] || '' });
            if (photos.length > 2) entries.push({ type: 'naeji_gallery', breakBefore: 'none', monthNum: mn, dayNum: dn, dateB, photos: photos.slice(2) });
        } else if (raw.type === 'naeji_textonly' || (diaryText && photos.length === 0)) {
            entries.push({ type: 'naeji_textonly', breakBefore, year: curYear, month: curMonth, day, monthNum: mn, dayNum: dn, dateB, diaryText, title });
        } else if (raw.type === 'naeji_gallery' || (!diaryText && photos.length > 0)) {
            entries.push({ type: 'naeji_gallery', breakBefore, monthNum: mn, dayNum: dn, dateB, photos });
        }
    }
    return entries;
}

// ── entries 빌드 (레거시: dataItems에서 생성) ──
function buildDiaryEntries(items, diaryType) {
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const entries = [];
    let prevMonthKey = -1, prevSeasonKey = '', chapterNum = 0;

    sorted.forEach(item => {
        const year = parseInt(item.date.substring(0, 4));
        const month = parseInt(item.date.substring(5, 7));
        const day = parseInt(item.date.substring(8, 10));
        const diaryText = [item.textQ, item.textA].filter(t => t).join('\n\n');
        const photos = item.photoUrls || [];

        let needGanji = false;
        if (diaryType === 'A') {
            const mk = year * 100 + month;
            if (mk !== prevMonthKey) { needGanji = true; prevMonthKey = mk; }
        } else {
            const sk = getSeasonKey(month) + '_' + year;
            if (sk !== prevSeasonKey) { needGanji = true; prevSeasonKey = sk; }
        }

        if (needGanji) {
            chapterNum++;
            entries.push({ type: 'ganji', year, month, chapterNum, seasonTitle: getSeasonTitle(month), monthTitle: `${month}월의 기록` });
        }

        const mn = String(month).padStart(2, '0');
        const dn = String(day).padStart(2, '0');
        const dateB = `${month}.${dn}`;

        if (diaryText && photos.length > 0) {
            entries.push({ type: 'naeji_a', breakBefore: 'page', year, month, day, monthNum: mn, dayNum: dn, dateB, diaryText, photo1: photos[0], photo2: photos.length > 1 ? photos[1] : '' });
            if (photos.length > 2) entries.push({ type: 'naeji_gallery', breakBefore: 'none', monthNum: mn, dayNum: dn, dateB, photos: photos.slice(2) });
        } else if (diaryText && photos.length === 0) {
            entries.push({ type: 'naeji_textonly', breakBefore: 'page', year, month, day, monthNum: mn, dayNum: dn, dateB, diaryText });
        } else if (!diaryText && photos.length > 0) {
            entries.push({ type: 'naeji_gallery', breakBefore: 'page', monthNum: mn, dayNum: dn, dateB, photos });
        }
    });
    return entries;
}
