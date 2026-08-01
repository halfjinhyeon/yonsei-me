# 자산 저작권·라이선스 근거 자료

연세대학교 기계공학부 홈페이지(이하 "본 사이트")에 사용된 **서체·이미지·로고·오픈소스
소프트웨어**의 출처와 이용 근거를 정리한 문서다.

- **작성일**: 2026-08-01
- **대상**: Git 저장소에 커밋되어 실제 배포본에 포함되는 자산 전량
- **작성 기준**: 추정을 배제하고, ① 저장소에서 직접 확인되는 사실 ② 배포처 공식 문서
  ③ 파일 자체에 남은 메타데이터 세 가지만을 근거로 삼았다. 근거가 없는 항목은 "미확인"으로
  적었고, 이행하지 않은 의무는 [7. 미이행 사항](#7-미이행-사항과-조치-계획)에 그대로 기재했다.
- **성격**: 제작자 자체 점검 결과이며 법률 자문이 아니다.

---

## 0. 요약

| 구분 | 수량 | 근거 | 상태 |
|---|---|---|---|
| 서체(웹폰트) | 3종 4파일 | SIL Open Font License 1.1 | ✅ 이상 없음 |
| 연세체(워드마크) | — | 폰트 파일 미배포, SVG 패스만 포함 | ✅ 이상 없음 |
| 오픈소스 라이브러리 | 35종 | MIT / Apache-2.0 / ISC / GSAP 표준 라이선스 | ✅ 이상 없음 |
| 스톡 사진 | 51장 | Unsplash License (표기 의무 없음) | ✅ 이상 없음 |
| CC 라이선스 사진 | 10장 | Openverse 경유 Flickr CC | ⚠️ **출처 표기 미이행** |
| 학과 제공·수집 자료 | 64장 | 학과 공식 사이트 (동일 학과 홈페이지 개편안) | ✅ 목적 범위 내 |
| 동아리 사진 | 26장 | 각 동아리로부터 직접 제공 | ✅ 이상 없음 |
| 기업 로고 | 23개 | 위키미디어 커먼즈, 상표의 지명적 사용 | ✅ 이상 없음 |
| 연세대 상징 | 3개 | 학교 상징의 자체 학과 홈페이지 사용 | ✅ 목적 범위 내 |
| 미사용 제3자 자산 | 1개 | `public/kakaomap.svg` (코드 참조 0건) | ⚠️ **삭제 권장** |

---

## 1. 서체 — 3종 전부 SIL Open Font License 1.1

본 사이트가 배포하는 폰트 파일은 아래 **4개가 전부**다. 저장소에서 확인:

```bash
git ls-files src/app/fonts
# src/app/fonts/GmarketSansBold.woff2
# src/app/fonts/Paperlogy-6SemiBold.woff2
# src/app/fonts/Paperlogy-7Bold.woff2
# src/app/fonts/PretendardVariable.woff2
```

원본 TTF/OTF 묶음이 들어 있는 `public/fonts/` 디렉터리는 `.gitignore`에 등재되어 있어
저장소에도, 배포본에도 포함되지 않는다. 즉 **원본 폰트 파일의 재배포는 일어나지 않는다.**

| 서체 | 사용처 | 라이선스 | 저작권자 | 배포처 |
|---|---|---|---|---|
| Pretendard (Variable) | 본문·UI 전역 (`--font-sans`) | SIL OFL 1.1 | Kil Hyung-jin | [github.com/orioncactus/pretendard](https://github.com/orioncactus/pretendard) |
| Gmarket Sans Bold | 홈 히어로 제목 1곳 (`--font-hero`) | SIL OFL 1.1 | G마켓 | [corp.gmarket.com/fonts](https://corp.gmarket.com/fonts/) |
| Paperlogy 6·7 | 탭·세부탭 제목 (`--font-subhead`) | SIL OFL 1.1 | 이주임 × 김도균 | [freesentation.blog/paperlogyfont](https://freesentation.blog/paperlogyfont) |

**근거 원문**

- Pretendard — 배포 묶음에 동봉된 `LICENSE.txt` 첫머리:
  > Copyright (c) 2021, Kil Hyung-jin ... with Reserved Font Name Pretendard.
  > This Font Software is licensed under the SIL Open Font License, Version 1.1.
- Gmarket Sans — G마켓 공식 폰트 페이지: "'SIL Open Font License'에 따라" 제공되며
  "개인 또는 기업이 영리적, 비영리적 목적으로 자유롭게 사용할 수 있습니다."
- Paperlogy — SIL OFL 1.1. 허용 범위에 웹사이트·웹폰트·임베딩이 명시되어 있다.

**OFL 1.1이 본 사이트의 이용 방식을 허용하는 근거**

OFL은 폰트를 웹사이트에 **임베딩·번들·재배포**하는 것을 명시적으로 허용한다(라이선스 전문
전제부: "The fonts, including any derivative works, can be bundled, embedded, redistributed
and/or sold with any software"). 금지되는 것은 **폰트를 그 자체로 판매**하는 행위와
**다른 라이선스로 재배포**하는 행위인데, 본 사이트는 어느 쪽에도 해당하지 않는다.

**포맷 변환에 대하여.** 세 서체 모두 원본 TTF를 `woff2`로 변환해 자체 호스팅한다(용량·성능
목적). OFL 1.1은 수정·파생을 허용하므로 포맷 변환은 허용 범위 내이며, 예약 이름(Reserved
Font Name)을 쓰는 파생 폰트를 배포하는 것이 아니라 동일 서체를 웹 포맷으로 실어 나르는
것이므로 이름 제약과도 무관하다.

### 1-1. 연세체 워드마크 — 폰트 파일을 배포하지 않는 방식으로 회피

헤더 로고의 "연세대학교 기계공학부" 워드마크는 연세대학교 전용 서체(연세체)로 조판되어
있으나, **연세체 폰트 파일은 저장소에도 배포본에도 포함되어 있지 않다.**

빌드 이전 단계에서 `tools/generate-wordmark.mjs`가 글자의 외곽선을 SVG path 데이터로 변환해
`src/components/logo-wordmark.ts` 한 파일로 출력해 두고, 배포되는 것은 그 좌표 데이터뿐이다.
원본 TTF가 놓이는 `tools/fonts/`는 `.gitignore`에 다음 주석과 함께 등재되어 있다.

```
# 연세체 TTF — 배포 라이선스 불명확, 로고 워드마크는 tools/generate-wordmark.mjs 로
# 빌드타임에 SVG 패스(src/components/logo-wordmark.ts)로 미리 변환해두므로 폰트 자체는 불필요
/tools/fonts/
```

이 구분은 국내 판례와 일치한다.

- **대법원 1996. 8. 23. 선고 94누5632 판결** — 서체도안(글자꼴 자체)은 실용적 기능과 별개의
  독립적 예술성을 갖추지 않는 한 저작권법상 저작물에 해당하지 않는다.
- **대법원 2001. 5. 15. 선고 98도732 판결** — 반면 **폰트 파일**은 컴퓨터프로그램저작물로
  보호된다. 따라서 침해가 성립하는 지점은 폰트 파일의 복제·배포다.

본 사이트는 보호 대상인 폰트 파일을 복제·배포하지 않고, 보호 대상이 아닌 글자 외곽선만을
도형 데이터로 사용한다. 더불어 워드마크의 내용은 연세대학교 기계공학부 자신의 명칭이고,
본 사이트는 해당 학과의 홈페이지 개편안이므로 표장 사용의 주체·목적도 어긋나지 않는다.

---

## 2. 오픈소스 소프트웨어

`package.json`에 선언된 런타임·빌드 의존성 전량의 라이선스 필드를 기계적으로 수집한 결과다
(부록 A에 재현 명령 수록). **카피레프트(GPL/AGPL 계열) 의존성은 0건**이다.

| 라이선스 | 패키지 |
|---|---|
| **MIT** | next 14.2.35, react 18.3.1, react-dom, next-intl, tailwindcss, postcss, autoprefixer, eslint, eslint-config-next, @supabase/supabase-js, @tiptap/* (11종), lenis, marked, sanitize-html, opentype.js, @types/* (4종) |
| **Apache-2.0** | @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, tesseract.js, typescript |
| **ISC** | next-auth (v5 beta) |
| **GSAP 표준 라이선스** | gsap 3.15.0 |

**GSAP에 관하여.** GSAP은 MIT가 아니라 자체 표준 라이선스를 쓰므로 별도로 확인했다.
2025년 4월 30일 개정된 [GSAP Standard "No Charge" License](https://gsap.com/standard-license/)에
따라 상업적 프로젝트를 포함한 사용이 무료이고, 과거 유료(members-only)였던 SplitText·MorphSVG
등 모든 플러그인도 무상 사용 범위에 포함된다. 로열티나 귀속 표시 의무는 없다. 금지되는 것은
"코드 없이 시각적 애니메이션을 만드는 도구"를 GSAP으로 만드는 것인데, 본 사이트와 무관하다.
본 사이트가 사용하는 `gsap/SplitText`·`gsap/CustomEase`는 인증 토큰 없이 공개 배포판에서
그대로 받아 쓰는 모듈이다.

---

## 3. 사진·이미지

배포본에 포함되는 이미지는 **총 182개**다(`git ls-files public/img public/og public/*.svg`).
출처별 내역은 다음과 같고, 합계가 182와 일치한다.

> Unsplash 51 + CC 10 + 학과 자료 64 + 동아리 26 + 자체 제작 6 + 기업 로고 23(4절)
> + 연세대 엠블럼 1(5절) + 미사용 `kakaomap.svg` 1(7절) = **182**

### 3-1. 스톡 사진 — Unsplash (51장)

| 위치 | 수량 | 용도 |
|---|---|---|
| `public/img/labs/` | 23 | 연구실 카드 대표 이미지 (전체 33장 중 CC 10장은 3-2로 분리) |
| `public/img/programs/` | 13 | 학부·대학원 프로그램 카드 |
| `public/img/hero/`, `hero-mobile/` | 12 | 홈 히어로 슬라이드(6종 × 데스크톱/모바일 크롭) |
| `public/img/research/` | 3 | 연구 분야 카드 |

[Unsplash License](https://unsplash.com/license)는 사진의 다운로드·복제·수정·배포·사용을
**상업적 목적을 포함해 무상으로, 사진작가나 Unsplash에 대한 허락이나 출처 표기 없이**
허용한다. 금지되는 것은 사진 자체를 판매하는 행위와 Unsplash와 경쟁하는 유사 서비스를
만드는 행위이며, 본 사이트는 어느 쪽에도 해당하지 않는다. 따라서 **표기 의무가 없다.**

### 3-2. CC 라이선스 사진 — Openverse 경유 Flickr (10장) ⚠️

연구실 이미지 33장 중 **10장은 파일 메타데이터에 Flickr 출처 정보가 남아 있다.** Openverse는
CC 라이선스 및 퍼블릭 도메인 저작물만 색인하므로 이 10장은 CC 계열로 판단되며, **CC BY 또는
CC BY-SA인 경우 저작자·출처·라이선스 표시가 의무**다. 현재 사이트에는 크레딧 표기가 없어
**의무 미이행 상태**이며, 조치 계획은 7절에 적었다.

메타데이터에 실제로 기록된 값은 다음과 같다(부록 A로 재현 가능).

| 파일 | 메타데이터에 기록된 권리 정보 |
|---|---|
| `labs/manufacturing-mechatronics2.jpg` | Artist / Copyright: **(c) Pete Birkinshaw (BinaryApe)** · `flickr.com/e/cuieJejRjjCTfEwNxlX8WSEkRppB18kcLV1L7ufD%2BHY%3D` |
| `labs/advanced-thermal.jpg` | `flickr.com/e/FfJJz3M6h%2B4FB%2FWntF1Tmo0xa84ckrOs81zc1mnKaJI%3D` |
| `labs/intelligent-device-manufacturing.jpg` | `flickr.com/e/SVc%2FIQm2e0xP71QbawKUXk9gKiimEpWWwvZWyK7kDLg%3D` |
| `labs/mems-microsystem.jpg` | `flickr.com/e/%2F4NLWHsnxsx0Uogx8YmzaRPBojDArA8lMYNUOWprTgc%3D` |
| `labs/multiscale-fluid.jpg` | `flickr.com/e/935C%2F3i5PkRjyXE9BHbqRJfr2hX%2BNdtX4d5Ed4yjk1k%3D` |
| `labs/nano-device.jpg` | `flickr.com/e/dR2gwJMZ4jHRSNR612h%2BRqD0%2FJ5gytrHR%2FD%2F%2BRg%2BUDY%3D` |
| `labs/optics-quantum.jpg` | `flickr.com/e/gRZJa1Xa9tWJVVB%2BQM2DnbrWV2bOq7afs7LBRZWDVp0%3D` |
| `labs/structure-design.jpg` | `flickr.com/e/anzogZAYfk7ul%2Bh5uH4ziYAkuGMJ4wHFoQeXz9OtjH8%3D` |
| `labs/sustainable-energy.jpg` | `flickr.com/e/t%2FNUpzh%2BPEGV1v6BBL5AriuA4ruln76fg%2F6ctc2bo28%3D` |
| `labs/vibration-optomechatronics.jpg` | `flickr.com/e/42I3aZ%2BL6poZH12QAx5VsHjo5QybR2Lu6RvdefbxkVw%3D` (Hasselblad H5D) |

> 이 10장은 출처를 은닉한 적이 없다. 원본 파일의 IPTC 권리 정보를 지우지 않고 그대로 보존해
> 두었기 때문에 위 표를 사후에 복원할 수 있었다.

### 3-3. 학과 공식 자료 (64장)

| 위치 | 수량 | 내용 |
|---|---|---|
| `public/img/faculty/` | 52 | 교수 프로필 사진 |
| `public/img/history/` | 4 | 학과 연혁 사진 (1960·1970·1990·2010) |
| `public/img/directions/` | 4 | 오시는 길 안내 사진 |
| `public/img/pages/` | 4 | 교육과정 로드맵, 연구 비전·BK21 사업단 비전 도표 |

출처는 연세대학교 기계공학부 공식 사이트(`me.yonsei.ac.kr`)다. 수집 경로는 저장소에 코드로
남아 있다(`tools/crawl-faculty-profiles.mjs` — 순차 요청 + 요청 간 300ms 지연으로 학교 서버
부하를 억제하도록 작성).

**이용 근거.** 본 사이트는 제3자를 위한 별개 서비스가 아니라 **같은 학과의 홈페이지 개편안**
(홈페이지 공모전 출품작)이다. 해당 자료의 저작권·초상권 주체와 본 사이트가 대상으로 삼는
주체가 동일하므로, 자료가 원래 게시되던 목적(학과 소개)의 범위를 벗어나지 않는다. 다만
**실제 채택·운영 시에는 학과의 공식 승인 및 교원 개인의 초상 이용 동의 확인을 전제로 한다.**
`public/img/pages/`의 도표는 학과·BK21 사업단이 제작한 자료로, 이 중 연구 비전 도표는 이미
이미지 대신 텍스트 데이터(`content/research-vision-infographic.json`)로 재구성해 자체 제작
컴포넌트가 렌더하도록 대체했다.

### 3-4. 동아리 제공 사진 (26장)

| 위치 | 수량 | 내용 |
|---|---|---|
| `public/img/club-photos/` | 22 | 동아리 카드뉴스용 활동 사진 |
| `public/img/clubs/` | 4 | 동아리 대표 이미지 |

MECAR·ROBOIN·SPACEY·연세드론 4개 동아리로부터 **게재를 전제로 직접 제공받은 자료**다.
저작권자가 게재 목적을 알고 제공한 것이므로 이용 허락이 존재한다.

### 3-5. 자체 제작 (6개)

`public/img/hero.svg`, `feature-2.svg`, `program.svg`, `public/og/cover.png`,
`public/img/eagle.png`, `eagle_empty.png` — 본 프로젝트에서 제작·가공한 그래픽이다.
(독수리 실루엣의 원 출처에 대해서는 5절 참조.)

### 3-6. 배포본에 포함되지 않는 로컬 자산

다음은 작업 디렉터리에만 존재하고 **커밋되지 않아 배포본에 포함되지 않는다.** 따라서 공개
게시 대상이 아니다.

- `public/img/LOGO_ENG.png`, `LOGO_KOR.png` — 출처 불명. 코드 참조 0건. 미커밋.
- `public/img/board/`, `public/files/` — 게시판 첨부 샘플. 미커밋.
- `public/uploads/` — 로컬 첨부 업로드 폴더. `.gitignore` 등재.
- `public/fonts/` — 폰트 원본 TTF/OTF. `.gitignore` 등재.

---

## 4. 기업 로고 (23개)

`public/img/career-logos/`에 있는 졸업생 진출 기업 로고 23개다. 진로 안내 탭(`CareerPaths`)
에서 "이런 분야·기업으로 진출한다"는 **사실 정보를 식별**하기 위해 표시된다.

삼성전자, 현대자동차, LG, 포스코, 기아, 한화, 두산, 한국항공우주산업, HD현대중공업,
삼성중공업, 한화오션, 현대엔지니어링, 한국전력공사, 삼성E&A, LG에너지솔루션, 삼성SDI,
SK온, 현대모비스, 두산로보틱스, HL만도, LIG넥스원, ASML, Bosch.

**출처.** 위키미디어 커먼즈가 주된 수급처다. 파일 내부에 그 흔적이 그대로 남아 있다 — 다수의
SVG가 Inkscape로 생성되었고(`<!-- Created with Inkscape ... -->`), Creative Commons 네임스페이스
(`xmlns:cc="http://creativecommons.org/ns#"`)를 포함하며, `prod-posco.svg`에는 커먼즈의 SVG
정리 작업으로 알려진 기여자 서명(`by Marsupilami`)이 남아 있다.

**이용 근거는 저작권과 상표권 두 갈래로 나뉜다.**

1. **저작권** — 기업 로고 상당수는 문자와 단순 도형의 조합이어서 저작권 성립에 필요한
   창작성 요건을 충족하지 못한다. 위키미디어 커먼즈가 이런 로고를 `PD-textlogo`(저작권
   성립 요건 미달로 퍼블릭 도메인) 분류로 호스팅하는 근거가 이것이다.
2. **상표권** — 상표는 저작권과 별개의 권리이고, 퍼블릭 도메인이라도 상표로서는 계속
   보호된다. 다만 상표권은 **출처 혼동을 일으키는 사용**을 막는 권리이지 언급 자체를
   막는 권리가 아니다. 본 사이트의 사용은 **지명적 사용(nominative use)** — 즉 그 기업을
   가리키기 위해 그 기업의 표장을 쓰는 것 — 에 해당한다:
   - 졸업생 진출 현황이라는 **사실을 서술**하는 맥락에서만 노출된다.
   - 후원·제휴·인증을 시사하는 문구나 배치가 없다.
   - 로고를 변형하거나 본 사이트의 식별표지처럼 쓰지 않는다.
   - 상업적 광고·판촉에 사용하지 않는다(비영리 대학 학과 홈페이지).

**대체 가능성.** 이 표시는 기업명 텍스트로 대체해도 정보 전달에 지장이 없다. 각 기업의
요청이 있을 경우 즉시 텍스트로 교체할 수 있도록, 로고 경로는 데이터
파일(`content/career-paths.json`) 한 곳에서만 관리한다.

---

## 5. 연세대학교 상징

| 자산 | 사용처 |
|---|---|
| `public/logo.svg` | 헤더·푸터 엠블럼, 학부 입학 안내 그래픽 |
| `public/img/eagle.png` | 로딩 인디케이터, 대학원 안내 그래픽, 빈 상태 마스코트 |
| `src/components/logo-wordmark.ts` | 헤더 워드마크 (1-1절 참조) |

연세대학교의 엠블럼과 독수리 상징은 학교의 식별표지다. 본 사이트는 **연세대학교 기계공학부
자신의 홈페이지**이므로, 표장을 그 소유 주체를 가리키기 위해 쓰는 정당한 사용에 해당한다.
제3자가 연세대와의 관련성을 가장하는 사용이 아니다. 실제 운영 시에는 연세대학교 UI(University
Identity) 가이드라인의 색상·여백·변형 금지 규정을 따르는 것을 전제로 한다.

---

## 6. 텍스트 콘텐츠

학과 게시판 게시글 1,267건과 교육과정·교원 정보 등 본문 데이터는 학과 공식 사이트에서
이전한 것으로, 3-3절과 동일한 근거(동일 주체의 홈페이지 개편안, 원 게시 목적의 범위 내)가
적용된다. 지도는 카카오맵이 공식 제공하는 임베드 위젯(`roughmap`)을 그 배포 방식 그대로
불러오며(`src/components/KakaoMap.tsx`), 지도 데이터를 복제해 재호스팅하지 않는다.

---

## 7. 미이행 사항과 조치 계획

정확성을 위해 현재 충족하지 못한 항목을 그대로 적는다.

| # | 사항 | 상태 | 조치안 |
|---|---|---|---|
| 1 | **CC 사진 10장의 출처 표기** (3-2절) — CC BY/BY-SA는 저작자·출처·라이선스 표시가 의무인데 사이트에 크레딧이 없다. | ⚠️ 미이행 | ① 각 사진의 Openverse/Flickr 원본을 역추적해 저작자·라이선스를 확정하고 크레딧 페이지(`/credits`) 또는 푸터에 표기, 또는 ② 해당 10장을 표기 의무가 없는 Unsplash 사진으로 교체. **②가 더 확실하고 즉시 가능하다.** |
| 2 | **OFL 저작권 고지 동봉** — 저장소가 폰트 파일을 재배포하는 형태이므로, OFL 1.1 제2항에 따라 사본에 저작권 고지와 라이선스 전문을 포함하는 것이 원칙이다. 현재 `src/app/fonts/`에는 woff2 4개만 있고 라이선스 파일이 없다. | ⚠️ 미이행 | `src/app/fonts/`에 서체별 `LICENSE-*.txt`(저작권 고지 + OFL 1.1 전문)를 추가. 파일 3개 추가로 끝난다. |
| 3 | **미사용 제3자 자산** — `public/kakaomap.svg`가 커밋되어 있으나 코드 참조가 0건이다. 쓰지도 않는 타사 표장을 배포 중이다. | ⚠️ 정리 필요 | 파일 삭제. |
| 4 | **스톡 사진 개별 출처 URL 미보존** — 3-1절 61장은 Unsplash 수급분이라 표기 의무는 없으나, 사진별 원본 URL 기록이 남아 있지 않다. | ℹ️ 참고 | 의무 사항은 아니다. 향후 자산 추가 시 `content/` 하위에 출처 대장을 만들어 파일명↔URL을 기록하기를 권한다. |

---

## 부록 A. 검증 재현 절차

이 문서의 주장은 아래 명령으로 제3자가 직접 재현할 수 있다. 모두 `yonsei-me/`에서 실행한다.

**① 배포되는 폰트 파일이 4개뿐임을 확인**

```bash
git ls-files src/app/fonts public/fonts
```

**② 의존성 라이선스 전량 수집**

```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));for(const n of [...Object.keys(p.dependencies),...Object.keys(p.devDependencies)]){const m=JSON.parse(fs.readFileSync('node_modules/'+n+'/package.json','utf8'));console.log((n+'@'+m.version).padEnd(42)+(m.license||'?'));}"
```

**③ 이미지 메타데이터에서 출처·저작자 정보 추출** (3-2절 표의 근거)

```bash
node -e "const fs=require('fs'),path=require('path');for(const d of ['public/img/labs','public/img/programs','public/img/research','public/img/hero','public/img/history','public/img/club-photos','public/img/directions','public/img/pages']){for(const f of fs.readdirSync(d)){const s=fs.readFileSync(path.join(d,f)).subarray(0,200000).toString('latin1');const m=s.match(/(unsplash|flickr|wikimedia|pexels|getty|shutterstock)/i);if(m)console.log(d+'/'+f+' :: '+m[0]);}}"
```

**④ 배포되는 이미지 목록 전량**

```bash
git ls-files public/img public/og public/logo.svg public/kakaomap.svg
```

## 부록 B. 참고 문헌

- [SIL Open Font License 1.1](https://openfontlicense.org/) — 서체 3종 공통 라이선스
- [Pretendard 저장소](https://github.com/orioncactus/pretendard)
- [G마켓 공식 폰트 안내](https://corp.gmarket.com/fonts/)
- [Paperlogy 공식 배포 페이지](https://freesentation.blog/paperlogyfont)
- [Unsplash License](https://unsplash.com/license)
- [GSAP Standard "No Charge" License](https://gsap.com/standard-license/)
- [대법원 1996. 8. 23. 선고 94누5632 판결](https://casenote.kr/대법원/94누5632) — 서체도안의 저작물성 부정
- 대법원 2001. 5. 15. 선고 98도732 판결 — 폰트 파일의 컴퓨터프로그램저작물성 인정
