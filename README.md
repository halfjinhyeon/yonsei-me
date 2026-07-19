# 연세대학교 기계공학부 홈페이지

기계공학부 공식 홈페이지입니다. 학부·대학원 소개부터 교수진, 연구, 공지·행사, 동문까지
한 곳에서 보여 주도록 만들었고, 한국어와 영어를 함께 지원합니다. 화면 크기에 맞춰
자동으로 배치가 바뀌고(모바일·태블릿·데스크톱), 시각장애인용 화면 낭독기에서도
읽히도록 접근성 기준(WCAG AA)을 지켜 만들었습니다.

> **이 문서를 읽는 분께**
> 대부분의 교수·조교 선생님은 아래 **[콘텐츠 바꾸기](#콘텐츠-바꾸기)** 한 챕터만 보시면 됩니다.
> 프로그램을 직접 돌리거나 서버를 관리하실 일은 없고, 그 부분은 문서 뒤쪽
> [개발자·운영자용](#개발자운영자용) 으로 따로 모아 두었습니다.

---

## 사이트 구성 한눈에 보기

| 메뉴 | 담고 있는 것 |
| --- | --- |
| **학부 소개** | 학부 개요·연혁, 교수진, 직원, 오시는 길, 입학 안내 |
| **학부(학사)** | 교육 목표, 졸업 요건, **졸업요건 자동 진단기**, 교과목 편람, 교과과정 로드맵, 동아리, 장학 |
| **대학원** | 졸업 요건(단계별 안내), 교과목, 연구실 소개 |
| **연구** | 연구 비전, 연구 역량, 연구실 목록, 학부 인턴 모집, 사회공헌 |
| **소식** | 공지사항, 뉴스, 학위논문, 학술자료, 취업 정보 (게시판) |
| **동문** | 동문 소식·행사 |
| **연락처** | 주소·전화·지도 |

홈 화면은 위에서부터 **대형 히어로 → 학과 목표 → 뉴스 & 행사 → 우리의 연구실 →
인스타그램 → 푸터** 순으로 이어집니다.

---

## 콘텐츠 바꾸기

내용을 고치는 방법은 크게 **두 가지**입니다. 무엇을 바꾸느냐에 따라 길이 갈립니다.

### 방법 A — 게시글은 "관리자 콘솔"에서 바로 (권장)

**공지사항·뉴스·세미나·행사·취업 정보·학위논문** 같은 **게시글**은 코드를 만질 필요가 전혀
없습니다. 사이트 주소 뒤에 `/contentmanagement` 를 붙여 접속하면 관리자 콘솔이 열립니다.

- 예: `https://(사이트주소)/ko/contentmanagement`
- **GitHub 계정으로 로그인**합니다. (처음이시면 운영 담당자에게 GitHub 아이디를 알려
  주세요. 접근 권한을 열어 드립니다.)
- 로그인하면 게시판을 골라 글을 **새로 쓰거나 고치고 지울 수 있습니다.**
  - 한국어로 쓰고 **"번역 채우기"** 버튼을 누르면 영문이 자동으로 채워집니다(초안이므로
    한번 검토해 주세요).
  - 첨부파일·이미지도 올릴 수 있습니다.
- 저장하면 보통 몇 분 안에 사이트에 반영됩니다. (재배포를 기다릴 필요가 거의 없습니다.)

> 게시판 관리가 필요 없는 대부분의 공지·행사 업무는 **이 방법 하나로 끝납니다.**

### 방법 B — 나머지 내용은 "콘텐츠 파일" 수정

교수진 정보, 연구실 소개, 교과목, 홈 화면 문구처럼 게시글이 아닌 내용은 `content/`
폴더 안의 파일에 담겨 있습니다. 파일 편집이 익숙하지 않으시면, 아래 표에서 **어떤 파일인지만
확인해 운영 담당자에게 요청**하셔도 됩니다.

| 바꾸고 싶은 것 | 여기를 고치세요 |
| --- | --- |
| 교수 정보(전공·연구실·연락처·사진) | `content/faculty-directory.json` — 사진은 `public/img/faculty/<이름>.jpg` |
| 연구실 소개 | `content/labs-directory.json` |
| 연구 분야 소개 | `content/research-gallery.json` |
| 학부 교과목 편람 | `content/courses-undergraduate.json` |
| 대학원 교과목 | `content/courses-graduate.json` |
| 졸업요건(자동 진단기 기준) | `content/undergraduate-requirements.json`, `content/checker-requirements.json` |
| 동아리 | `content/clubs.json` — 상세 본문은 `content/pages/club-*.md` |
| 홈 히어로 슬라이드(사진·분야명) | `content/hero-slides.json` |
| 푸터의 "관련 사이트" 목록 | `content/related-sites.json` |
| 인스타그램 계정 | `content/instagram.json` |
| 학부 소개·연혁 등 긴 글 | `content/pages/*.md` (문서 형식) |
| 메뉴·버튼 등 화면 문구 | `messages/ko.json`, `messages/en.json` |

#### 한국어·영어 함께 쓰기

거의 모든 항목은 한국어와 영어를 **쌍으로** 적습니다. 예를 들어 관련 사이트 한 줄은
이렇게 생겼습니다.

```json
{ "label": { "ko": "연세대학교", "en": "Yonsei University" }, "href": "https://www.yonsei.ac.kr" }
```

`"ko"` 에는 한국어를, `"en"` 에는 영어를 넣으면 방문자가 언어를 바꿀 때 알아서 반영됩니다.
**새 항목을 넣을 땐 기존 항목을 그대로 복사해 값만 바꾸는 것**이 가장 안전합니다(따옴표·쉼표
같은 기호를 실수로 지우면 화면이 깨질 수 있어요).

#### 언제 사이트에 반영되나요?

- **관리자 콘솔(방법 A)** 로 올린 게시글 → 저장 후 대체로 몇 분 내 자동 반영.
- **콘텐츠 파일(방법 B)** 수정 → 저장소에 반영(커밋·푸시)되면 Vercel이 자동으로 다시
  배포합니다. 보통 1~2분 뒤 사이트에 나타납니다. (이 과정은 운영 담당자가 도와드립니다.)

---

## 개발자·운영자용

아래부터는 사이트를 직접 실행하거나 배포·설정하는 분을 위한 내용입니다.

### 로컬에서 실행

```bash
npm install
npm run dev        # http://localhost:3000  → /ko 로 이동
npm run build      # 프로덕션 빌드(전 페이지 정적 생성)
npm start          # 빌드 결과 서빙
npm run typecheck  # 타입 검사(tsc --noEmit)
npm run lint       # ESLint
```

별도의 테스트 러너는 없습니다. 변경 후에는 `npm run typecheck` 와 `npm run build` 로
확인하는 것을 권장합니다. (dev와 build는 출력 폴더가 분리돼 있어 동시에 돌려도 서로
간섭하지 않습니다.)

### 기술 스택

- **Next.js 14 (App Router)** · **TypeScript** · **Tailwind CSS**
- **next-intl** — 한국어(`/ko`, 기본)·영어(`/en`) 라우팅. 모든 경로에 언어 접두사 유지(SEO).
- **Auth.js(GitHub OAuth)** — 관리자 콘솔 로그인
- **Supabase(Postgres)** + **Cloudflare R2** — 게시판 글·첨부 저장(Phase 2 백엔드)
- **DeepL** — 관리자 콘솔의 자동 번역(선택)
- 배포: **Vercel**

### 폴더 구조

```
content/            # ← 콘텐츠(코드 아님). 위 "방법 B" 표의 파일들
  pages/*.md        #   긴 본문(마크다운)
messages/           # 화면 UI 문구(ko.json / en.json)
src/
  app/[locale]/     # 언어별 라우트(ko, en)
    page.tsx        #   홈
    about/ undergraduate/ graduate/ research/
    faculty/ faculty-recruitment/ news/ alumni/ contact/ sitemap/
    contentmanagement/   # 관리자 콘솔(로그인 필요, 검색 색인 제외)
  app/api/          # admin(게시판 쓰기)·auth(로그인)·translate·upload 엔드포인트
  components/       # 재사용 컴포넌트(Header, Footer, Hero, …)
  lib/              # 콘텐츠 로더(content.ts / faculty.ts / pages.ts / posts.ts …)
  i18n/             # next-intl 설정
  middleware.ts     # 언어 라우팅 + 관리자 경로 보호
tailwind.config.ts  # 디자인 토큰(색상/타이포)
src/app/globals.css # CSS 변수 토큰 + 다크모드 + 접근성 스타일
tools/              # 개발용 원본 자료(스크랩·CSV 등). 자세한 건 tools/README.md
```

### 게시판 데이터 소스 (DB ↔ JSON)

게시판(공지·뉴스·행사 등)의 읽기는 `src/lib/posts.ts` 로 일원화돼 있고, 소스가 둘입니다.

- `SUPABASE_URL` 이 설정돼 있으면 **Supabase DB**를 읽습니다. 관리자 콘솔이 글을 저장하면
  캐시가 갱신되어 재배포 없이 반영됩니다.
- 설정이 없거나 `BOARDS_SOURCE=git` 이면 **`content/*.json` 파일**(오프라인·롤백용)을 읽습니다.

### 환경변수 · 배포

필요한 환경변수(로그인·번역·DB·첨부 스토리지)는 **`.env.example`** 에 키와 발급 방법이
정리돼 있습니다. 로컬은 `.env.local`, 배포는 Vercel 프로젝트 환경변수에 넣습니다.

- Vercel에 이 `yonsei-me/` 폴더를 프로젝트 루트로 연결하고 환경변수를 채우면 빌드·배포됩니다.
- 기본 브랜치에 반영된 콘텐츠 파일 변경은 자동 재배포됩니다.

### 접근성 · 다국어 · SEO

- 시맨틱 HTML, `aria-*`·`aria-current`, 키보드 내비게이션, `:focus-visible` 포커스 링,
  본문 바로가기(skip-link), `prefers-reduced-motion` 존중, 색 대비 AA.
- 전 페이지 정적 생성(SSG)으로 빠른 로딩. 구조화 데이터(JSON-LD)·메타 설명·`sitemap.xml`·
  사람용 `/sitemap` 페이지 제공.

### 디자인 토큰

연세 네이비(`#00285E`)·블루(`#0057A8`) 기반. `tailwind.config.ts` 의 `yonsei.*` 와
CSS 변수(`--brand`, `--surface`, `--content`)로 관리하며 다크모드(`.dark`)에 대응합니다.
새 색을 하드코딩하기보다 기존 토큰을 쓰는 것을 권장합니다.

---

궁금한 점이나 사이트에 반영이 필요한 내용은 운영 담당자에게 편하게 요청해 주세요.
