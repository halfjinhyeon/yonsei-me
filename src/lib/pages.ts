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
