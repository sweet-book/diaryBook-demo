# diaryBook - 일기장 책 생성

일기장 A / B 타입의 책을 생성하는 웹앱입니다.
JSON 데이터를 업로드하여 일기장 포토북을 만들 수 있습니다.

![screenshot](screenshot.png)

## 일기장 A vs B

| 항목 | 일기장A | 일기장B |
|------|---------|---------|
| 간지 | 월별 구분 (1월, 2월...) | 계절별 구분 (봄, 여름...) |
| 날짜 | `day_num` (일수만) | `date` (M.DD 형식) |
| 표지 | `coverPhoto` + `title` + `dateRange` | `frontPhoto` + `backPhoto` + `spineTitle` |

## 구조

```
├── index.html              # 메인 앱
├── app.js                  # 앱 로직 (UI, 책 생성 플로우)
├── book-builder.js         # entries 변환, API 호출
├── diary-config.js         # 템플릿 매핑, 필드 정의
├── style.css               # 스타일
├── sweetbook-sdk-core.js   # Sweetbook API SDK (core)
├── sweetbook-sdk-user.js   # Sweetbook API SDK (user)
├── config.example.js       # 설정 템플릿
├── config.js               # 실제 설정 (git 제외)
├── server.js               # 로컬 서버
├── 일기장A/
│   ├── templates/          # A 템플릿 CSV
│   └── samples/            # A 샘플 JSON 데이터
└── 일기장B/
    ├── templates/          # B 템플릿 CSV
    └── samples/            # B 샘플 JSON 데이터
```

## 설정

1. `config.example.js`를 `config.js`로 복사합니다:

```bash
cp config.example.js config.js
```

2. `config.js`에 환경별 API 키를 설정합니다:

```js
const APP_CONFIG = {
    environments: {
        live: { label: '운영', url: 'https://api.sweetbook.com/v1', apiKey: '운영 API Key' },
        sandbox: { label: '샌드박스', url: 'https://api-sandbox.sweetbook.com/v1', apiKey: '샌드박스 API Key' },
    },
    defaultEnv: 'sandbox',
    useCookie: false,
};
```

## 실행

```bash
node server.js
```

접속: http://localhost:8080

## 환경 (샌드박스 / 운영)

앱에서 **환경**을 선택할 수 있습니다:

- **샌드박스** (기본값): 테스트 환경. 생성된 책은 sandbox에만 존재하며, 운영 데이터에 영향 없음.
- **운영**: 실제 운영 환경. 운영 API Key가 필요합니다.

> **운영 환경에서는 실제 운영 데이터에 영향을 줍니다.**

## 사용법

1. 브라우저에서 http://localhost:8080 접속
2. 일기장 타입 선택 (A / B)
3. 샘플 JSON 파일 업로드:
   - `일기장A/samples/일기장A_이안.json` — 일기장A 샘플 (6개월, 54 entries)
   - `일기장B/samples/일기장B_이안.json` — 일기장B 샘플 (1년 4개월, 50 entries)
4. 표지/발행면 정보가 자동 입력됨 → 필요시 수정
5. **일기장 책 생성하기** 클릭

### JSON 데이터 형식

```json
{
  "title": "이안이의 하루 기록",
  "cover": {
    "coverPhoto": "https://...",
    "title": "이안이의 하루 기록",
    "dateRange": "24.01 - 24.06"
  },
  "publish": {
    "title": "이안이의 하루 기록",
    "publishDate": "2026년 3월 6일",
    "author": "김수진",
    "hashtags": "#포토북은 #역시 #스위트북"
  },
  "entries": [
    { "type": "ganji", "year": 2024, "month": 1, "chapter": 1 },
    { "type": "naeji_a", "day_num": "03", "diary_text": "새해 첫 산책...", "photo": "https://..." },
    { "type": "naeji_textonly", "day_num": "10", "diary_text": "비가 와서..." },
    { "type": "naeji_gallery", "day_num": "17", "photos": ["https://...", "https://..."] }
  ]
}
```

**entry 타입:**
| type | 설명 | 필수 필드 |
|------|------|-----------|
| `ganji` | 월/계절 구분 페이지 | `year`, `month`, `chapter` |
| `naeji_a` | 사진 + 글 | `day_num`, `diary_text`, `photo` |
| `naeji_textonly` | 글만 | `day_num`, `diary_text` |
| `naeji_gallery` | 사진 여러 장 | `day_num`, `photos` |

## 샘플 데이터

| 타입 | 샘플 | 설명 |
|------|------|------|
| 일기장A | [일기장A_이안.json](일기장A/samples/일기장A_이안.json) | 6개월 54 entries, 실제 시안용 |
| 일기장B | [일기장B_이안.json](일기장B/samples/일기장B_이안.json) | 1년 4개월 50 entries, 계절 간지 시안 |

## 커스터마이징

이 데모를 자신의 서비스에 맞게 수정하려면:

| 파일 | 수정 내용 |
|------|----------|
| `diary-config.js` | 템플릿 UID 변경, 필드 정의 추가/수정 |
| `book-builder.js` | entries 변환 로직 수정 (자신의 데이터 형식에 맞게) |
| `app.js` | UI 흐름 변경, 폼 필드 추가/제거 |
| `config.js` | API 키, 서버 URL 설정 |

### 자신의 데이터 형식 적용

1. `book-builder.js`의 `convertRawEntries()` 함수에서 JSON 데이터를 entries 배열로 변환하는 로직을 수정합니다.
2. `diary-config.js`에서 자신의 템플릿 UID를 등록합니다.
3. 필요시 `app.js`의 `handleFile()`에서 JSON 파싱/검증 로직을 수정합니다.

## 주의사항

> ⚠️ **프로덕션 주의**: `server.js`의 CORS 설정은 `Access-Control-Allow-Origin: *`로 모든 origin을 허용합니다.
> 이는 로컬 개발용이며, 프로덕션 환경에서는 반드시 허용할 origin을 제한하세요.
