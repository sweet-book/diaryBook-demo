/**
 * 일기장 A/B 타입별 설정 — 템플릿 UID, 필드 정의, 그래픽 키맵 등
 */

const PROJECT_CONFIG = {
    typeRadioName: 'diaryType',
    typeLabel: '일기장',
    typeLabels: { ganji: '간지', naeji_a: '사진+글', naeji_textonly: '글만', naeji_gallery: '갤러리', blank: '빈내지' },
    derivedParams: new Set(['chapterNum', 'seasonTitle', 'monthTitle', 'dateB', 'breakBefore']),
    onInit: null,
};

// ── 템플릿 UID (templates.json에서 로드) ──
const TEMPLATE_UIDS = { A: {}, B: {} };

// templateName → 코드키 매핑
const TPL_NAME_MAP = {
    A: { '일기장A_표지':'cover', '일기장A_간지':'ganji', '일기장A_내지a':'naejiA', '일기장A_내지b':'naejiB', '일기장A_내지_gallery':'gallery', '공용_빈내지':'blank', '일기장A_발행면':'publish' },
    B: { '일기장B_표지':'cover', '일기장B_간지':'ganji', '일기장B_내지a_cover':'naejiA_cover', '일기장B_내지a_contain':'naejiA_contain', '일기장B_내지b':'naejiB', '일기장B_내지_gallery':'gallery', '공용_빈내지':'blank', '일기장B_발행면':'publish' },
};

function parseTemplatesJson(items, nameMap) {
    const result = {};
    for (const item of items) {
        const key = nameMap[item.templateName];
        if (key) result[key] = item.templateUid;
    }
    return result;
}

async function loadTemplateUids() {
    try {
        const [respA, respB] = await Promise.all([
            fetch('일기장A/templates/templates.json'), fetch('일기장B/templates/templates.json'),
        ]);
        if (respA.ok) Object.assign(TEMPLATE_UIDS.A, parseTemplatesJson(await respA.json(), TPL_NAME_MAP.A));
        if (respB.ok) Object.assign(TEMPLATE_UIDS.B, parseTemplatesJson(await respB.json(), TPL_NAME_MAP.B));
    } catch (err) { console.warn('templates.json 로드 실패:', err); }
}

// ── 템플릿 필드 정의 ──
const TPL_FIELDS = {
    A: [{id:'tplCover',label:'표지'},{id:'tplGanji',label:'간지'},{id:'tplNaejiA',label:'내지a (사진+글)'},{id:'tplNaejiB',label:'내지b (글만)'},{id:'tplGallery',label:'내지 갤러리'},{id:'tplBlank',label:'빈내지'},{id:'tplPublish',label:'발행면'}],
    B: [{id:'tplCover',label:'표지'},{id:'tplGanji',label:'간지'},{id:'tplNaejiA_cover',label:'내지a cover (세로사진)'},{id:'tplNaejiA_contain',label:'내지a contain (가로사진)'},{id:'tplNaejiB',label:'내지b (글만)'},{id:'tplGallery',label:'내지 갤러리'},{id:'tplBlank',label:'빈내지'},{id:'tplPublish',label:'발행면'}],
};

// ── 표지 필드 정의 ──
const COVER_FIELDS = {
    A: [{id:'coverTitle',label:'표지 제목 *',placeholder:'나의 하루 기록'},{id:'coverDateRange',label:'기간 *',placeholder:'26.01 - 27.03'}],
    B: [{id:'coverDateRange',label:'기간 *',placeholder:'2026.01.01 - 2027.05.30',defaultValue:'2026.01.01 - \n2027.05.30'},{id:'coverSpineTitle',label:'책등 제목 *',placeholder:'2026 Diary Book'}],
};

// ── 그래픽 리소스 ──
// 일기장A/B 모두 고정 그래픽은 템플릿에 하드코딩됨 — 런타임 그래픽 없음
