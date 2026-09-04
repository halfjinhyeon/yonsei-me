/**
 * 게시글 본문 → `<meta name="description">` 용 평문 요약.
 *
 * 왜 필요한가
 *   게시판 상세(news/post/[id], alumni/post/[id])는 excerpt 필드가 없어 description 이
 *   비어 있었고, 그러면 레이아웃의 사이트 기본 설명이 수천 개 문서에 똑같이 붙는다.
 *   GSC 에서 이는 강한 중복 신호다 — 글마다 다른 설명을 만들어 준다.
 *
 * 왜 여기에 있나
 *   두 라우트가 같은 로직을 쓰므로 한 곳에 둔다. `lib/seo.ts` 는 수정 금지 파일이라
 *   별도 모듈로 뗐다.
 *
 * ⚠️ 본문 형식은 소스에 따라 다르다(lib/posts.ts 주석): db=정화된 HTML, git=마크다운.
 *    그래서 태그 제거와 마크다운 기호 제거를 둘 다 통과시킨다.
 */

/** description 기본 길이 — 검색결과 스니펫이 대략 이 언저리에서 잘린다 */
const DEFAULT_MAX = 150;

/** 최소한의 엔티티 복원. `&amp;` 는 **맨 마지막**이어야 `&amp;lt;` 가 `<` 로 무너지지 않는다. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * HTML/마크다운 본문에서 평문 요약을 만든다.
 * @param raw  본문 원문 (HTML 또는 마크다운)
 * @param maxLength 최대 길이(문자 수). 넘으면 말줄임표를 붙인다.
 */
export function htmlToDescription(raw: string | undefined | null, maxLength = DEFAULT_MAX): string {
  if (!raw) return '';
  const plain = decodeEntities(
    raw
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '') // 스크립트·스타일 통째로 제거
      .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|td|th)>|<br\s*\/?>/gi, ' ') // 블록 경계 → 공백
      .replace(/<[^>]+>/g, ''), // 나머지 태그 제거
  )
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // ![alt](src) 이미지 삭제
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [텍스트](url) → 텍스트
    .replace(/^\s*(?:[#>]+|[*-]\s|\d+\.\s)\s*/gm, '') // 줄머리 마크다운 기호 제거
    // 강조 기호 제거. 물결표는 **짝(~~ 취소선)일 때만** 지운다 — 한국어 본문의 범위 표기
    // ("1~4학년", "MEU3006 ~ 3009")에서 낱개 ~ 를 지우면 "14학년" 같은 오독이 생긴다(실측).
    .replace(/~~/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ') // 개행·연속 공백 접기
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}
