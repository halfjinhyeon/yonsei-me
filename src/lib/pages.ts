import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * content/pages/<slug>.md 를 읽어 원본 마크다운 문자열을 반환한다.
 * 현행 홈페이지에서 임포트한 본문을 담는 용도. (서버 전용, 빌드 시 정적 인라인)
 */
export function getPageMarkdown(slug: string): string | null {
  try {
    const path = join(process.cwd(), 'content', 'pages', `${slug}.md`);
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export interface ClubPanel {
  /** 팀명 등 패널 라벨 (없으면 null — 인트로 패널) */
  label: string | null;
  /** 패널 본문 마크다운 */
  markdown: string;
}

export interface ClubLink {
  /** 라벨 (Instagram, YouTube 등) */
  label: string;
  /** 원본 값 (URL 또는 @handle) */
  value: string;
  /** 클릭 가능한 절대 URL (없으면 null) */
  href: string | null;
}

export interface ClubContent {
  panels: ClubPanel[];
  links: ClubLink[];
}

/** `- Instagram: ...` 형태의 SNS 링크 줄인지 판별 */
function isLinkLine(line: string): boolean {
  return /^-\s*(Instagram|YouTube|Facebook|Naver Cafe|Notion|X|Twitter|Website|홈페이지)\s*:/i.test(
    line.trim(),
  );
}

/** SNS 링크 줄을 { label, value, href }로 파싱 */
function parseLinkLine(line: string): ClubLink {
  const body = line.trim().replace(/^-\s*/, '');
  const idx = body.indexOf(':');
  const label = body.slice(0, idx).trim();
  const value = body.slice(idx + 1).trim();
  let href: string | null = null;
  if (value.startsWith('@')) {
    href = `https://instagram.com/${value.slice(1)}`;
  } else if (/^https?:\/\//i.test(value)) {
    href = value;
  } else if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(value)) {
    href = `https://${value}`;
  }
  return { label, value, href };
}

/**
 * content/pages/club-<slug>.md 를 카드뉴스 패널 시퀀스로 파싱한다.
 * - 맨 앞 `#### 제목` 줄과 `<img>` 태그는 제거 (제목은 Hero, 이미지는 레이아웃 담당)
 * - `**[팀명]**` 볼드 헤더 기준으로 패널 분할, 그 앞 본문은 인트로 패널
 * - 말미의 SNS 링크 줄들은 links 로 분리
 * - roboin 예외: `**[...]**` 헤더가 없으면 인트로를 의미 단위 절반으로 나눠 2패널화
 */
export function parseClubMarkdown(slug: string): ClubContent {
  const raw = getPageMarkdown(`club-${slug}`);
  if (!raw) return { panels: [], links: [] };

  // #### 제목 줄과 <img ...> 태그 제거
  const cleaned = raw
    .replace(/^####\s.*$/m, '')
    .replace(/<img[^>]*>/gi, '')
    .trim();

  const lines = cleaned.split('\n');

  // 말미 SNS 링크 줄 분리 (뒤에서부터 연속된 링크/빈 줄)
  const links: ClubLink[] = [];
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

  // **[...]** 헤더 기준으로 패널 분할
  const headerRe = /^\*\*\[(.+?)\]\*\*\s*$/;
  const panels: ClubPanel[] = [];
  let currentLabel: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const md = buffer.join('\n').trim();
    if (md || currentLabel) panels.push({ label: currentLabel, markdown: md });
    buffer = [];
  };

  for (const line of bodyLines) {
    const m = line.match(headerRe);
    if (m) {
      flush();
      currentLabel = m[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  // roboin 예외: 헤더가 없어 패널이 1개뿐이면 불릿 리스트를 절반으로 분할
  if (panels.length === 1 && panels[0].label === null) {
    const items = panels[0].markdown.split('\n').filter((l) => l.trim() !== '');
    if (items.length >= 4) {
      const mid = Math.ceil(items.length / 2);
      return {
        panels: [
          { label: null, markdown: items.slice(0, mid).join('\n') },
          { label: null, markdown: items.slice(mid).join('\n') },
        ],
        links,
      };
    }
  }

  return { panels, links };
}

export interface AccordionSection {
  label: string;
  markdown: string;
}

/** content/undergraduate-requirements.json — 학번별 졸업요건 아코디언 섹션 목록 */
export function getUndergraduateRequirementSections(): AccordionSection[] {
  try {
    const path = join(process.cwd(), 'content', 'undergraduate-requirements.json');
    return JSON.parse(readFileSync(path, 'utf-8')) as AccordionSection[];
  } catch {
    return [];
  }
}
