# 연세대학교 기계공학부 홈페이지

Next.js 14 (App Router) · TypeScript · Tailwind CSS · next-intl 기반의 다국어(한/영) 학과 홈페이지.
경진대회 요건(반응형, 접근성 WCAG AA, 콘텐츠·코드 분리, Vercel 배포)에 맞춰 구성.

## 실행

```bash
npm install
npm run dev        # http://localhost:3000  → /ko 로 리다이렉트
npm run build      # 프로덕션 빌드 (전 페이지 정적 생성)
npm start          # 빌드 결과 서빙
npm run typecheck  # 타입 체크
npm run lint       # ESLint
```

## 프로젝트 구조

```
content/                 # ← 비개발자가 편집하는 데이터 (코드와 분리)
  faculty.json           #   교수진
  research.json          #   연구실/연구분야
  news.json              #   공지·뉴스
messages/                # ← UI 문구 (다국어)
  ko.json / en.json
src/
  app/[locale]/          # 로케일별 라우트 (ko, en)
    layout.tsx           #   공통 레이아웃 (헤더/푸터/메타/skip-link)
    page.tsx             #   홈 (완성)
    about/               #   학부 소개 (완성)
    faculty/             #   교수진 (데이터 기반, 분야 필터)
    research/            #   연구 (데이터 기반)
    news/ , news/[slug]/ #   뉴스 목록 + 상세 (데이터 기반)
    academics/ admission/ alumni/  # 스텁 (구조만)
    contact/             #   연락처 + 지도 임베드
    [...rest]/           #   미매칭 경로 → 404
  components/            # 재사용 컴포넌트 (Header, Footer, Hero, Card, Section, Breadcrumb ...)
  i18n/                  # next-intl 설정 (routing / navigation / request)
  lib/                   # content 로더 + 유틸(cn, formatDate)
  middleware.ts          # 로케일 라우팅
tailwind.config.ts       # 디자인 토큰 (색상/타이포/스페이싱)
src/app/globals.css      # CSS 변수 토큰 + 다크모드 + 접근성 스타일
```

## 콘텐츠 추가/수정 (개발 지식 불필요)

- **교수 추가**: `content/faculty.json` 에 항목 추가. `field` 는 `energy|robotics|design|bio`.
- **뉴스 추가**: `content/news.json` 에 항목 추가. `slug` 가 상세 URL(`/news/<slug>`)이 됨. 날짜순 자동 정렬.
- **연구실 추가**: `content/research.json` 에 항목 추가.
- 모든 항목은 `{ "ko": "...", "en": "..." }` 형태로 한/영을 함께 적으면 언어 전환 시 자동 반영.
- 메뉴/버튼 등 UI 문구는 `messages/ko.json`, `messages/en.json` 에서 수정.

## 다국어

- 기본 한국어(`/ko`), 영문판(`/en`). 모든 경로에 로케일 프리픽스 유지 → SEO에 유리.
- 헤더의 언어 토글은 현재 경로를 유지한 채 언어만 전환.

## 접근성 · 성능

- 시맨틱 HTML, `aria-current`/`aria-*`, 키보드 네비게이션, `:focus-visible` 포커스 링, 색 대비 AA.
- 본문 바로가기(skip-link), `prefers-reduced-motion` 존중.
- 전 페이지 정적 생성(SSG) + 경량 번들 → Lighthouse 성능/SEO 최적화.

## 디자인 토큰

연세 네이비(`#00285E`)·블루(`#0057A8`)·골드(`#C8A96A`) 기반. `tailwind.config.ts` 의
`yonsei.*` 및 CSS 변수(`--brand`, `--surface`, `--content`)로 관리하며 다크모드(`.dark`) 대응.

## 배포 (Vercel)

이 폴더를 루트로 Import 하면 별도 설정 없이 빌드/배포됨.
```

## 남은 작업 (스텁 페이지 콘텐츠 채우기)

`academics`, `admission`, `alumni` 는 히어로/브레드크럼/레이아웃만 있는 스텁 상태.
`StubPage` 컴포넌트에 `children` 을 넘기면 실제 콘텐츠로 대체 가능.
