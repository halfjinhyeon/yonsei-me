// 동아리 카드뉴스 ↔ 카드/링크 구조 변환 — 관리자 콘솔 "카드 편집" 모드용.
//
// content/pages/club-<slug>.md 를 카드(패널) 배열 + SNS 링크로 파싱하고 다시
// 마크다운으로 직렬화한다. 파싱 규칙은 사이트 렌더러(pages.ts parseClubContent)와
// 정확히 일치시켜, 편집 전후 사이트 렌더 결과가 동일하도록 한다(왕복 무손실).
//
// 중요 사실: 동아리 md 의 `#### 제목`·`<img>` 는 사이트에서 쓰이지 않는다
// (제목은 clubs.json name, 사진은 clubs.json images 사용, 파서가 둘 다 제거).
// 따라서 편집기는 카드 본문과 링크만 다루고, 제목 줄만 보존한다(이미지 태그는 정리).
//
// roboin 예외(헤더 없는 인트로를 절반으로 쪼개 2패널화)는 "표시" 규칙이라 여기서는
// 적용하지 않는다. 인트로 카드 1개로 두면, 사이트 렌더러가 표시 시점에 다시 쪼갠다.
// (한국어 UI 문자열은 내부 운영 도구라 모듈에 직접 둔다.)

/** 카드(패널) — heading 이 빈 문자열이면 인트로 카드(라벨 없는 첫 패널) */
export interface ClubCard {
  heading: string;
  body: string;
}

/** SNS/외부 링크 한 줄 */
export interface ClubEditLink {
  label: string;
  value: string;
}

export interface ClubDoc {
  /** `#### <제목>` 줄 (사이트 미사용이나 원문 인식성 위해 보존) */
  title: string;
  cards: ClubCard[];
  links: ClubEditLink[];
}

/** 파서가 링크로 인식하는 라벨 (pages.ts isLinkLine 과 동일해야 링크로 분리된다) */
export const CLUB_LINK_LABELS = [
  'Instagram',
  'YouTube',
  'Facebook',
  'Naver Cafe',
  'Notion',
  'X',
  'Twitter',
  'Website',
  '홈페이지',
] as const;

const LINK_RE =
  /^-\s*(Instagram|YouTube|Facebook|Naver Cafe|Notion|X|Twitter|Website|홈페이지)\s*:/i;
const HEADER_RE = /^\*\*\[(.+?)\]\*\*\s*$/;

function isLinkLine(line: string): boolean {
  return LINK_RE.test(line.trim());
}

function parseLinkLine(line: string): ClubEditLink {
  const body = line.trim().replace(/^-\s*/, '');
  const idx = body.indexOf(':');
  return { label: body.slice(0, idx).trim(), value: body.slice(idx + 1).trim() };
}

/** 동아리 마크다운 원문을 편집용 구조로 파싱 (pages.ts parseClubContent 규칙과 동일, roboin 분할 제외) */
export function parseClubDoc(raw: string): ClubDoc {
  const titleMatch = raw.match(/^####\s+(.*)$/m);
  const title = titleMatch ? titleMatch[1].trim() : '';

  const cleaned = raw
    .replace(/^####\s.*$/m, '')
    .replace(/<img[^>]*>/gi, '')
    .trim();
  const lines = cleaned.split('\n');

  // 말미 SNS 링크 분리 (뒤에서부터 연속된 링크/빈 줄) — pages.ts 와 동일
  const links: ClubEditLink[] = [];
  let end = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() === '') {
      end = i;
      continue;
    }
    if (isLinkLine(line)) {
      links.unshift(parseLinkLine(line));
      end = i;
    } else {
      break;
    }
  }
  const bodyLines = lines.slice(0, end);

  // **[...]** 헤더 기준 카드 분할 (헤더 앞 본문 = 인트로 카드, heading '')
  const cards: ClubCard[] = [];
  let heading = '';
  let buffer: string[] = [];
  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body || heading) cards.push({ heading, body });
    buffer = [];
  };
  for (const line of bodyLines) {
    const m = line.match(HEADER_RE);
    if (m) {
      flush();
      heading = m[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  return { title, cards, links };
}

/** 편집 구조를 마크다운으로 직렬화 (사이트 렌더 결과가 원문과 동일하도록) */
export function serializeClubDoc(doc: ClubDoc): string {
  const parts: string[] = [];
  if (doc.title.trim()) parts.push(`#### ${doc.title.trim()}`);

  for (const card of doc.cards) {
    const heading = card.heading.trim();
    const body = card.body.trim();
    if (heading) {
      parts.push(body ? `**[${heading}]**\n\n${body}` : `**[${heading}]**`);
    } else if (body) {
      parts.push(body);
    }
  }

  const linkLines = doc.links
    .filter((l) => l.label.trim() && l.value.trim())
    .map((l) => `- ${l.label.trim()}: ${l.value.trim()}`);
  if (linkLines.length > 0) parts.push(linkLines.join('\n'));

  return `${parts.join('\n\n')}\n`;
}

/** 문서에 카드가 하나라도 있는지 (카드 편집 기본 진입 판단용) */
export function hasClubCards(raw: string): boolean {
  return parseClubDoc(raw).cards.length > 0;
}

/** 새 카드 기본형 */
export function emptyClubCard(): ClubCard {
  return { heading: '새 카드', body: '' };
}
