// 게시판 본문 정화 정책 — 단일 출처.
//
// posts-server.ts 에서 떼어낸 이유: 앱 의존성(next-auth·supabase·@/lib/*)이 하나도
// 없어야 정책만 따로 노드 스크립트로 돌려 "무엇이 통과하고 무엇이 떨어지는지"를
// 검증할 수 있다. import 는 sanitize-html 하나뿐 — 이 조건을 깨지 말 것.
// (마크다운 렌더 등 서버 로직은 posts-server.ts 에 그대로 남는다.)
//
// 2026-08: 구형 디자인 공지(아래아한글·워드로 꾸며 붙여넣은 색 배경 제목 바·번호 칩
// 표)를 살리려고 배경·테두리·여백·세로 정렬을 열었다. 태그를 더 여는 게 아니라
// **값 패턴이 경계**다 — 아래 패턴 어느 것도 url(·expression(·세미콜론·역슬래시를
// 통과시키지 않으므로 스크립트 주입 경로는 그대로 닫혀 있다.

import sanitizeHtml from 'sanitize-html';

// ── 값 패턴 ────────────────────────────────────────────────────────────
// 구 사이트에 흔한 "아래아한글·워드에서 디자인해 붙여넣은 공지"(색 배경 제목 바,
// 번호 칩 표)를 살리려면 배경·테두리·여백까지 열어야 한다. 태그를 더 여는 대신
// **값 패턴이 보안 경계**다 — 아래 어떤 패턴도 url(·expression(·세미콜론·역슬래시를
// 통과시키지 않는다. sanitize-html 이 style 을 선언 단위로 파싱하므로(postcss)
// 속성별 정규식만 조여 두면 선언 사이로 새는 경로가 없다.

/** 순수 색상값만 — 이름색·rgba·함수 표기는 통과하지 않는다 */
const COLOR: RegExp[] = [
  /^#[0-9a-fA-F]{3,8}$/,
  /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
];

/** 테두리 축약형 — 굵기·선 스타일·색 토큰이 **임의 순서로** 1~3개.
 *  HWP 는 CSS 표준 순서가 아니라 `solid #203a7b 0.28pt` 로 낸다(실측). */
const BORDER: RegExp[] = [
  /^(?=.{1,64}$)(?:(?:solid|dashed|dotted|double|none|hidden|[\d.]{1,6}(?:px|pt)|#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))\s*){1,3}$/,
];

/** 여백 축약형 — 1~4값. pt 는 HWP 원문의 종이 좌표계라 값이 크게 나올 수 있다 */
const PADDING: RegExp[] = [
  /^(?:[\d.]{1,6}(?:px|pt|em|%)|0)(?:\s+(?:[\d.]{1,6}(?:px|pt|em|%)|0)){0,3}$/,
];

/** 길이 한 값 — 셀 폭·높이 */
const LENGTH: RegExp[] = [/^[\d.]{1,6}(px|pt|%)$/];

/** 셀(th/td)에 허용하는 디자인 스타일 — 값은 전부 위 패턴으로 조인다 */
const CELL_STYLES: Record<string, RegExp[]> = {
  border: BORDER,
  'border-top': BORDER,
  'border-right': BORDER,
  'border-bottom': BORDER,
  'border-left': BORDER,
  padding: PADDING,
  'vertical-align': [/^(top|middle|bottom)$/],
  width: LENGTH,
  height: LENGTH,
};

/** 문단·제목에 허용하는 디자인 스타일 — 색 배경 제목 바가 이 둘로 이뤄진다 */
const BLOCK_STYLES: Record<string, RegExp[]> = { background: COLOR, padding: PADDING };

/** 정화 정책 — marked 산출물 + 에디터(Tiptap)가 만들 만한 안전한 리치 텍스트만 허용.
 *  script/style/이벤트 핸들러는 여기서 전부 떨어진다. iframe 은 유튜브 임베드
 *  하나 때문에 열되 호스트를 유튜브로 못 박아(allowedIframeHostnames) 임의 사이트
 *  삽입을 막는다 — 허용 밖 호스트는 src 가 통째로 제거돼 빈 프레임만 남는다. */
export const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5',
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sup', 'sub',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col', 'span',
    // 유튜브 임베드 — Tiptap Youtube 확장이 div[data-youtube-video] > iframe 로 낸다
    'iframe', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    // style 은 아래 allowedStyles 의 img.width(백분율)만 통과 — 픽셀·자유 CSS 는 떨어진다
    img: ['src', 'alt', 'title', 'width', 'height', 'style', 'data-align'],
    // 행 높이 드래그 결과(px) — tr 의 height 는 브라우저가 "최소 높이"로 다룬다
    tr: ['style'],
    // data-colwidth: 열 드래그 결과(px) — 재편집 시 Tiptap 이 여기서 폭을 되읽는다.
    // valign: HWP/워드 산출물의 세로 정렬(열거값이라 style 없이도 안전하다)
    th: ['colspan', 'rowspan', 'align', 'valign', 'style', 'data-colwidth'],
    td: ['colspan', 'rowspan', 'align', 'valign', 'style', 'data-colwidth'],
    // 표 테두리는 style 이 아니라 data 속성 "열거형"이다 — 값 집합이 CSS 한 곳
    // (globals.css)에 갇혀 있어 정화 화이트리스트를 넓히지 않고도 안전하다.
    // style 은 아래 table 패턴(width/min-width px + border-collapse)만 — 앞의 둘은
    // 열 드래그 직렬화용, border-collapse 는 붙여넣은 구형 표의 무해한 잔재다.
    table: ['data-border', 'data-border-color', 'data-cellpad', 'style'],
    // colgroup/col: 게시 화면이 열 폭을 재현하는 통로 (col 은 width px 만)
    col: ['style'],
    // 형광펜(Highlight) — 배경색 인라인 + 무손실 왕복용 data-color
    mark: ['style', 'data-color'],
    // Tiptap 글자색(span style="color:…") + 정렬(p/h* style="text-align:…") 허용
    span: ['style'],
    p: ['style'],
    h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'], h5: ['style'],
    div: ['data-youtube-video'],
    iframe: ['src', 'width', 'height', 'allowfullscreen', 'allow', 'frameborder', 'start'],
  },
  // style 은 아래 속성·값 패턴만 통과 — 그 외 스타일은 제거된다.
  // (태그별 규칙은 '*' 와 합쳐진다 — img 는 '*' 것에 width 가 더해진 집합)
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/],
      'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/],
      // background 는 축약형이지만 **순수 색상값만** 통과한다 — HWP 는 셀 배경을
      // background-color 가 아니라 이 축약형으로 낸다(실측 `background:#466991;`).
      background: COLOR,
      'text-align': [/^(left|right|center|justify)$/],
    },
    // 이미지 폭은 백분율만 — px 를 허용하면 모바일에서 본문을 뚫고 나간다
    img: { width: [/^\d{1,3}%$/] },
    // 에디터의 글꼴·크기·줄 간격(Tiptap textStyle) — 전부 span 인라인 style 로 나온다.
    // 글꼴·크기 범위는 구형 CMS(Froala) 파리티(2026-08-18 결정): 이름 폰트 12종을
    // 열어야 해서 자유 문자열이지만, 문자클래스를 조여 CSS 주입(세미콜론·괄호·
    // 역슬래시·url() 등)이 불가능하게 한다 — 값은 폰트명·따옴표·쉼표·공백만.
    span: {
      // pt 는 HWP 원문 파리티(구형 공지가 글자 크기를 pt 로 낸다) — px 는 구형 목록 범위
      'font-size': [/^([1-4][0-9]|50)px$/, /^[\d.]{1,5}pt$/],
      'font-family': [/^[A-Za-z0-9가-힣'" ,._-]{1,80}$/],
      'line-height': [/^(1(\.\d)?|2(\.0)?|2)$/],
    },
    // 셀 디자인(배경은 '*' 의 background/background-color 가 받는다)
    th: CELL_STYLES,
    td: CELL_STYLES,
    // 색 배경 제목 바 — 문단·제목 자체에 배경과 여백이 걸린 꼴
    p: BLOCK_STYLES,
    h1: BLOCK_STYLES, h2: BLOCK_STYLES, h3: BLOCK_STYLES, h4: BLOCK_STYLES, h5: BLOCK_STYLES,
    // 열 드래그 직렬화 — px 폭만. 표가 본문보다 넓어지는 건 게시 화면의
    // overflow-x-auto(가로 스크롤)가 받아낸다(모바일 트레이드오프 합의됨).
    col: { width: [/^\d+px$/], 'min-width': [/^\d+px$/] },
    // table-layout 은 열지 않는다 — fixed 가 우리 자동 레이아웃 결정과 충돌한다.
    table: { width: [/^\d+px$/], 'min-width': [/^\d+px$/], 'border-collapse': [/^(collapse|separate)$/] },
    // 행 드래그 직렬화 — px 높이만(최소 높이 시맨틱이라 내용이 길면 알아서 더 늘어난다)
    tr: { height: [/^\d+px$/] },
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  // 임베드 허용 호스트 — 유튜브(+쿠키 없는 도메인)뿐
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com'],
  // 외부 링크는 새 탭 + noopener 로 강제(에디터 산출물 신뢰하지 않음)
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: /^https?:\/\//.test(attribs.href ?? '')
        ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
        : attribs,
    }),
  },
};

/** HTML 입력을 정화만 (빈 입력은 빈 문자열) — 에디터 산출물 저장 경로 */
export function sanitizeEditorHtml(html: string | null | undefined): string {
  const h = (html ?? '').trim();
  if (!h) return '';
  return sanitizeHtml(h, SANITIZE_OPTS);
}
