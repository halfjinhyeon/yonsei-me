// 글쓰기 화면의 임시저장(초안) — 브라우저 localStorage 전용.
//
// 왜 서버가 아니라 localStorage 인가: 이 콘솔의 "저장"은 곧 게시다(사이트에 즉시
// 반영된다). 쓰다 만 글을 서버에 올려두면 "저장했는데 왜 안 보이나 / 저장 안 했는데
// 왜 보이나" 하는 두 갈래 혼란이 생긴다. 초안은 쓰던 사람의 브라우저에만 남기고,
// 실제 게시는 오직 '저장'한 번으로만 일어나게 한다.
//
// 그래서 이 파일은 어떤 네트워크 호출도 하지 않는다. 다른 기기·다른 브라우저에서는
// 초안이 보이지 않는다는 사실을 버튼 title 과 토스트 문구로 분명히 밝힌다.

import type { EditRecord } from './boards';

/** 초안 한 건 — 폼 상태 전체 + 저장 시각 */
export interface PostDraft {
  /** ISO 8601 저장 시각 (안내 문구의 "n분 전"에 쓴다) */
  savedAt: string;
  rec: EditRecord;
}

/**
 * 초안 키. 게시판별·글별로 분리해야 다른 글을 쓰다 만 초안이 엉뚱한 글에
 * 되살아나지 않는다. 새 글은 게시판당 한 칸('new')을 공유한다.
 */
export function postDraftKey(boardKey: string, postId: string | null | undefined): string {
  return `cms-draft:${boardKey}:${postId && postId.trim() !== '' ? postId : 'new'}`;
}

export function readPostDraft(key: string): PostDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PostDraft>;
    // 형식이 깨진 값(구버전·수동 편집)은 없는 것으로 친다 — 여기서 던지면
    // 폼 자체가 열리지 않는다.
    if (!parsed || typeof parsed !== 'object' || !parsed.rec) return null;
    return { savedAt: String(parsed.savedAt ?? ''), rec: parsed.rec as EditRecord };
  } catch {
    return null;
  }
}

export function writePostDraft(key: string, rec: EditRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const draft: PostDraft = { savedAt: new Date().toISOString(), rec };
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // 용량 초과·사생활 보호 모드 등. 초안은 부가 기능이라 실패해도 글쓰기를 막지 않는다.
  }
}

export function clearPostDraft(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 위와 같은 이유로 조용히 넘어간다 */
  }
}

/** 초안 저장 시각을 사람이 읽는 상대 시간으로 (안내 한 줄에 쓴다) */
export function draftAgeLabel(savedAt: string): string {
  const t = Date.parse(savedAt);
  if (!Number.isFinite(t)) return '';
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}
