// 게시판 본문 정화 정책 — 단일 출처.
//
// posts-server.ts 에서 떼어낸 이유: 앱 의존성(next-auth·supabase·@/lib/*)이 하나도
// 없어야 정책만 따로 노드 스크립트로 돌려 "무엇이 통과하고 무엇이 떨어지는지"를
// 검증할 수 있다. import 는 sanitize-html 하나뿐 — 이 조건을 깨지 말 것.
// (마크다운 렌더 등 서버 로직은 posts-server.ts 에 그대로 남는다.)

import sanitizeHtml from 'sanitize-html';

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
    // data-colwidth: 열 드래그 결과(px) — 재편집 시 Tiptap 이 여기서 폭을 되읽는다
    th: ['colspan', 'rowspan', 'align', 'style', 'data-colwidth'],
    td: ['colspan', 'rowspan', 'align', 'style', 'data-colwidth'],
    // 표 테두리는 style 이 아니라 data 속성 "열거형"이다 — 값 집합이 CSS 한 곳
    // (globals.css)에 갇혀 있어 정화 화이트리스트를 넓히지 않고도 안전하다.
    // style 은 아래 table 패턴(width/min-width px)만 — 열 드래그 직렬화용.
    table: ['data-border', 'data-border-color', 'style'],
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
      'text-align': [/^(left|right|center|justify)$/],
    },
    // 이미지 폭은 백분율만 — px 를 허용하면 모바일에서 본문을 뚫고 나간다
    img: { width: [/^\d{1,3}%$/] },
    // 에디터의 글꼴·크기·줄 간격(Tiptap textStyle) — 전부 span 인라인 style 로 나온다.
    // 글꼴은 제네릭 패밀리만 허용한다(로컬 폰트명 불허 — 시스템마다 있고 없어 렌더가 갈리고,
    // 자유 문자열을 열면 CSS 주입 표면이 된다).
    span: {
      'font-size': [/^(1[0-9]|2[0-9]|3[0-2])px$/], // 10~32px
      'font-family': [/^(serif|monospace)$/],
      'line-height': [/^(1(\.\d)?|2(\.0)?|2)$/],
    },
    // 열 드래그 직렬화 — px 폭만. 표가 본문보다 넓어지는 건 게시 화면의
    // overflow-x-auto(가로 스크롤)가 받아낸다(모바일 트레이드오프 합의됨).
    col: { width: [/^\d+px$/], 'min-width': [/^\d+px$/] },
    table: { width: [/^\d+px$/], 'min-width': [/^\d+px$/] },
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
