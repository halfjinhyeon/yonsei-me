// CMS 가 편집하는 콘텐츠 파일 경로 목록 — 저장소(Git)와 DB(content_files) 양쪽에서
// "관리 대상"을 판정하는 단일 소스. 의존성 없는 순수 상수 모듈이라 클라이언트
// 컴포넌트·서버 런타임·노드 스크립트가 모두 같은 목록을 본다.
//
// 새 리소스를 콘솔에 추가할 때는 여기에 경로를 먼저 더한 뒤 resources.ts 가 이 상수를
// 참조하게 한다(쓰기 API 의 경로 allowlist 가 이 목록이 될 예정 — Stage C).

/** 리소스 키(resources.ts 의 ResourceKey) → 저장소 루트 기준 JSON 경로.
 *  ResourceKey 를 import 하지 않는다 — resources.ts 가 이 모듈을 참조하므로 순환이 된다. */
export const MANAGED_FILES = {
  history: 'content/history.json',
  facultyDirectory: 'content/faculty-directory.json',
  staff: 'content/staff.json',
  heroSlides: 'content/hero-slides.json',
  coursesUndergraduate: 'content/courses-undergraduate.json',
  courseDescriptions: 'content/course-descriptions.json',
  coursesGraduate: 'content/courses-graduate.json',
  clubs: 'content/clubs.json',
  labs: 'content/labs-directory.json',
  labSummaries: 'content/lab-summaries.json',
  facultySummaries: 'content/faculty-summaries.json',
} as const;

/** 단일 마크다운 페이지 — 학부 > 장학금 본문 */
export const SCHOLARSHIP_MD = 'content/pages/undergraduate-scholarship.md';

/** 동아리 소개 카드뉴스 본문 — clubs.json 의 slug 마다 한 파일(content/pages/club-<slug>.md).
 *  slug 는 소문자·숫자·하이픈만 허용(resources.ts 의 slug 필드 안내와 동일 규약). */
const CLUB_MD_RE = /^content\/pages\/club-[a-z0-9-]+\.md$/;

export function isClubMarkdownPath(path: string): boolean {
  return CLUB_MD_RE.test(path);
}

/** CMS 가 쓸 수 있는 경로인지 — JSON 10종 + 장학금 + 동아리 본문 전부의 합집합 */
export function isManagedPath(path: string): boolean {
  return (
    (Object.values(MANAGED_FILES) as readonly string[]).includes(path) ||
    path === SCHOLARSHIP_MD ||
    isClubMarkdownPath(path)
  );
}
