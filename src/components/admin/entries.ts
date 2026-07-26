// 사이드바·대시보드가 공유하는 메뉴 항목(MenuEntry) 표시 규칙.
//
// 셸(AdminConsole)과 대시보드(AdminDashboard)가 같은 라벨·배지·설명을 써야 하는데
// 셸이 대시보드를 렌더하므로 한쪽에 두면 import 순환이 생긴다. 그래서 양쪽이
// 함께 의존하는 이 얇은 모듈로 뽑았다.
//
// 값의 출처는 언제나 resources.ts / boards.ts 다 — 여기서 라벨·설명을 새로
// 하드코딩하지 않는다(콘텐츠/코드 분리와 같은 이유: 정의는 한 곳에만).

import { getBoard } from '@/lib/admin/boards';
import { getMarkdownPage, MENU_GROUPS, RESOURCES, type MenuEntry } from '@/lib/admin/resources';

/** 메뉴 항목의 표시 라벨 */
export function entryLabel(entry: MenuEntry): string {
  switch (entry.type) {
    case 'board':
      return getBoard(entry.boardKey).label;
    case 'collection':
      return RESOURCES[entry.resourceKey].label;
    case 'markdown':
      return getMarkdownPage(entry.pageKey).label;
    case 'placeholder':
      return entry.label;
  }
}

/** 항목 설명 (검색 대상 · 목록 캡션 원본) */
export function entryDescription(entry: MenuEntry): string {
  switch (entry.type) {
    case 'board':
      return '게시글을 작성·수정·삭제하고 첨부파일을 관리합니다.';
    case 'collection':
      return RESOURCES[entry.resourceKey].description;
    case 'markdown':
      return getMarkdownPage(entry.pageKey).description;
    case 'placeholder':
      return entry.note;
  }
}

/**
 * "어디에 노출되는지" 한 줄 캡션.
 * 설명문의 첫 문장(…에 반영됩니다)이 곧 노출 위치라 그것만 잘라 쓴다.
 * 새 문구를 만들지 않고 resources.ts / boards.ts 의 설명에서 파생시킨다.
 *
 * 게시판은 빈 문자열을 돌려준다 — boards.ts 에 노출 위치가 없어 설명이
 * 전 게시판 공통 문장 하나뿐이라, 목록 13줄에 같은 문장이 반복되면
 * 정보가 아니라 잡음이 된다. 어느 그룹인지는 열 제목이 이미 말해 준다.
 */
export function entryWhere(entry: MenuEntry): string {
  if (entry.type === 'board') return '';
  const desc = entryDescription(entry);
  // 한국어 종결('다. ')을 문장 경계로 본다. 정규식 lookbehind 는 구형 사파리에서
  // 파싱 단계부터 터지므로 쓰지 않는다(모듈 평가 실패 = 콘솔 전체 백지).
  const end = desc.indexOf('다. ');
  const first = (end >= 0 ? desc.slice(0, end + 1) : desc).replace(/\.$/, '').trim();
  return first.length > 28 ? `${first.slice(0, 27)}…` : first;
}

/** 고유 식별 문자열 — 사이드바 key·에디터 리마운트 key·최근 편집 저장에 사용 */
export function entryId(entry: MenuEntry): string {
  switch (entry.type) {
    case 'board':
      return `board:${entry.boardKey}`;
    case 'collection':
      return `collection:${entry.resourceKey}`;
    case 'markdown':
      return `markdown:${entry.pageKey}`;
    case 'placeholder':
      return `placeholder:${entry.label}`;
  }
}

/** 편집 가능한 항목인지 (placeholder는 비활성) */
export function isEditable(entry: MenuEntry): boolean {
  return entry.type !== 'placeholder';
}

/**
 * 유형 배지 — 무엇을 편집하게 될지 한눈에.
 * 문서(markdown)는 원래 금색이었으나 이 프로젝트에서 금색이 금지되어
 * sky(#2E86D6) 계열로 옮겼다. 텍스트는 AA 대비를 위해 한 단계 어둡게 둔다.
 */
export function entryKind(entry: MenuEntry): { label: string; cls: string } | null {
  switch (entry.type) {
    case 'board':
      return { label: '게시판', cls: 'bg-yonsei-blue/10 text-yonsei-blue' };
    case 'collection':
      return { label: '데이터', cls: 'bg-yonsei-navy/10 text-yonsei-navy' };
    case 'markdown':
      return { label: '문서', cls: 'bg-[#2E86D6]/15 text-[#1b5e9e]' };
    case 'placeholder':
      return { label: '준비 중', cls: 'bg-surface-soft text-content-faint' };
  }
}

/** 전체 항목 평면 목록 (id → entry 역조회용) */
export const ALL_ENTRIES: MenuEntry[] = MENU_GROUPS.flatMap((g) => g.entries);

export function findEntry(id: string): MenuEntry | undefined {
  return ALL_ENTRIES.find((e) => entryId(e) === id);
}

/** 항목이 속한 그룹 라벨 (검색 자동완성 우측 표기) */
export function entryGroupLabel(entry: MenuEntry): string {
  const id = entryId(entry);
  return MENU_GROUPS.find((g) => g.entries.some((e) => entryId(e) === id))?.label ?? '';
}

// ---- 최근 편집 (localStorage) ----

const RECENT_KEY = 'cms-recent-entries';

export function readRecents(): MenuEntry[] {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    return ids.map(findEntry).filter((e): e is MenuEntry => !!e && isEditable(e));
  } catch {
    return [];
  }
}

export function pushRecent(id: string) {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    const next = [id, ...ids.filter((x) => x !== id)].slice(0, 4);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* localStorage 불가 환경은 조용히 무시 */
  }
}
