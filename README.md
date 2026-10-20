# 구글 인사이트 (Google News Insight)

헬스조선의 **구글 성과**(검색 · Discover · 구글 뉴스)를 네이버 '뉴스 인사이트'와 같은 화면으로 보는 사이트예요.

- 사이트: https://euneun0503.github.io/google_news-insight/
- 네이버 버전: https://euneun0503.github.io/news-insight/

## 메뉴

| 메뉴 | 내용 | 데이터 |
|---|---|---|
| 구글통계 (G) | 클릭·노출·CTR·순위, 일별 추이(탭+표), 채널별 클릭 | Search Console |
| Discover | Discover 클릭·노출·CTR, 상위 기사, 국가별 | Search Console |
| 기사 목록 | 기사 제목·업로드 시간·기자·대표 검색어·클릭·노출 (엑셀 저장) | Search Console + 기사 페이지 크롤링 |
| 매체 비교 | 헬스조선·코메디닷컴·하이닥 발행 수, 같은 날짜 기준 차이 | 네이버 발행목록 + 하이닥 구글 뉴스 사이트맵 |
| 기자 통계 | 기자별 발행 수, 구글 클릭·노출, 대표 기사 | 네이버 발행목록 + Search Console |
| 검색어 랭킹 | 유입 검색어, 얻은/잃은 검색어 | Search Console |
| 키워드 트렌드 | 건강 키워드 관심도, 키워드 기회표 | Google Trends |
| 독자 성향 | 최근 30분 실시간, 연령·성별, 기기, 요일, 국가 | GA4 + Search Console |

모든 화면은 상단에서 기간(어제·7일·28일·이번 달·지난 달·90일, 직접 지정)을 바꿔 볼 수 있고, 지표 설명은 ⓘ에 있어요.

## 처음 한 번 설정하기

### 1. GitHub Pages 켜기
저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿔요.

### 2. 구글 서비스 계정 만들기
1. https://console.cloud.google.com 에서 프로젝트를 하나 만들어요(이미 있으면 그대로 사용).
2. **API 및 서비스 → 라이브러리**에서 아래 두 개를 '사용'으로 켜요.
   - Google Search Console API
   - Google Analytics Data API
3. **IAM 및 관리자 → 서비스 계정 → 서비스 계정 만들기**로 계정을 만들어요(역할은 비워 둬도 돼요).
4. 만든 계정 → **키 → 키 추가 → 새 키 만들기 → JSON**으로 키 파일을 내려받아요.
5. 서비스 계정 이메일(…@….iam.gserviceaccount.com)을 복사해 둬요.

### 3. 권한 주기
- **Search Console**: health.chosun.com, m.health.chosun.com 속성 각각 **설정 → 사용자 및 권한 → 사용자 추가**에 서비스 계정 이메일을 '제한됨' 권한으로 추가.
- **GA4**: **관리 → 속성 액세스 관리 → +**에 서비스 계정 이메일을 '뷰어'로 추가.
  - 연령·성별은 GA4 **관리 → 데이터 수집**에서 'Google 신호 데이터 수집'이 켜져 있어야 나와요.

### 4. 저장소 비밀값 등록
저장소 **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 |
|---|---|
| `GOOGLE_SA_JSON` | 내려받은 JSON 키 파일 내용 전체 |
| `GA4_PROPERTY_ID` | GA4 속성 ID 숫자 (관리 → 속성 설정) |

### 5. 첫 수집 실행
**Actions → 구글 데이터 수집 → Run workflow** (what: `all`, days: `90`)
→ 최근 90일 Search Console 데이터·기사 정보·GA4가 채워지고 사이트가 다시 배포돼요.
이후에는 **매시간**(실시간·하이닥) / **매일 오전 9시**(나머지) 자동으로 수집돼요.

## 데이터 파일

| 파일 | 내용 |
|---|---|
| `data/gsc/daily.json` | 날짜×검색 유형별 클릭·노출·순위 |
| `data/gsc/days/YYYY-MM-DD.json` | 하루 단위 기사·검색어·기기·국가 |
| `data/articles.json` | 기사 번호 → 제목·기자·업로드 시간 (기사 페이지 크롤링, 없으면 네이버 송고 기록) |
| `data/publish.json`, `data/reporters.json` | 매체별·기자별 발행 수 (네이버 뉴스 인사이트 저장소) |
| `data/hidoc.json` | 하이닥 구글 뉴스 사이트맵 누적 |
| `data/trends.json` | Google Trends 키워드 관심도 |
| `data/ga4/realtime.json`, `data/ga4/demo.json` | GA4 최근 30분, 연령·성별 |

> 경쟁 매체의 구글 노출 수는 구글이 공개하지 않아 발행 수(사이트맵)까지만 비교해요.
> 현재 들어 있는 초기 데이터: 일별 구글 성과(2026-07-20~10-18), 기사 101건 제목·기자, 네이버 발행·기자(~10-19), 하이닥 사이트맵 70건.
