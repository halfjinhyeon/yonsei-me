// 글쓰기 화면의 임시저장(초안).
//
// 원칙은 그대로다: 이 콘솔의 "저장"은 곧 게시다. 초안은 **게시물이 아니다** —
// posts 테이블에는 손도 대지 않고, 쓰다 만 글은 별도 보관소에만 남는다. 그래서
// "저장했는데 왜 안 보이나 / 저장 안 했는데 왜 보이나" 하는 혼란이 생기지 않는다.
//
// 보관소는 둘이고 역할이 다르다:
//  - 로컬(localStorage) : 오프라인·네트워크 실패에도 남는 이 기기의 마지막 사본.
//  - 서버(/api/admin/drafts) : 기기 간 이어쓰기. 집에서 쓰던 글을 연구실에서 잇는다.
// 폼은 열 때 둘 다 읽어 **더 최신인 쪽**을 제안하고(출처를 문구로 밝힌다), 게시에
// 성공하면 둘 다 지운다. 서버 저장이 실패해도 로컬은 남으므로 글이 사라지지 않는다.

import type { EditRecord } from './boards';

/**
 * 글쓰기 폼이 실제로 다루는 레코드 = EditRecord + 공개 시각.
 *
 * EditRecord(boards.ts)는 게시판 스키마 파일이라 건드리지 않고, 예약 게시가 더한
 * 한 칸만 여기서 넓힌다. 이 자리에 둔 이유는 초안이 폼 상태 **전체**를 담기 때문이다 —
 * 초안이 아는 모양과 폼이 아는 모양은 언제나 같아야 한다.
 * (`time` 은 HH:MM(KST). 빈 문자열 = 시각 지정 없음 = 그 날 자정 공개.)
 */
export type PostEditRecord = EditRecord & { time?: string };

/** 초안 한 건 — 폼 상태 전체 + 저장 시각 */
export interface PostDraft {
  /** ISO 8601 저장 시각 (안내 문구의 "n분 전"에 쓴다) */
  savedAt: string;
  rec: PostEditRecord;
}

/** 초안의 출처 — 복원 배너가 "이 기기" / "서버" 중 어느 쪽인지 밝히는 데 쓴다 */
export type DraftOrigin = 'local' | 'server';

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
    return { savedAt: String(parsed.savedAt ?? ''), rec: parsed.rec as PostEditRecord };
  } catch {
    return null;
  }
}

export function writePostDraft(key: string, rec: PostEditRecord): void {
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

// ── 서버 초안 (기기 간 이어쓰기) ────────────────────────────────────────
//
// 저장처는 /api/admin/drafts 라우트 한 곳이고, 여기 있는 것은 그 얇은 클라이언트다.
// 세 함수 모두 **실패를 던지지 않는다** — 초안은 부가 기능이라, 네트워크가 끊겼다고
// 글쓰기 화면이 오류로 덮이거나 자동저장 루프가 멈추면 안 된다. 로컬 사본이 남으므로
// 서버가 조용히 실패해도 잃는 것은 "다른 기기에서 잇기"뿐이다.

/**
 * 서버 초안 키 — 라우트가 `drafts/<login>/<key>.json` 경로로 조립한다.
 * 라우트의 허용 문자([A-Za-z0-9/_-])에 맞춰 여기서 미리 눕혀 보낸다.
 * 로컬 키(`cms-draft:board:id`)와 구분자가 다른 이유는 그 ':' 가 경로에 못 들어가서다.
 */
export function serverDraftKey(boardKey: string, postId: string | null | undefined): string {
  const id = postId && postId.trim() !== '' ? postId.trim() : 'new';
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${safe(boardKey)}/${safe(id)}`;
}

/** 서버에 보관된 초안 1건. 없거나(404) 읽지 못하면 null */
export async function readServerDraft(key: string): Promise<PostDraft | null> {
  try {
    const res = await fetch(`/api/admin/drafts?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<PostDraft> | null;
    if (!data || typeof data !== 'object' || !data.rec) return null;
    return { savedAt: String(data.savedAt ?? ''), rec: data.rec as PostEditRecord };
  } catch {
    return null;
  }
}

/** 서버에 초안 저장(덮어쓰기). 성공 여부를 boolean 으로만 알린다 — 상태 표시용 */
export async function writeServerDraft(key: string, rec: PostEditRecord): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/drafts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, rec }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 서버 초안 삭제 — 게시에 성공했을 때(초안의 수명이 끝났을 때)만 부른다 */
export async function clearServerDraft(key: string): Promise<void> {
  try {
    await fetch(`/api/admin/drafts?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {
    /* 남은 초안은 다음 게시 때 덮이거나 사용자가 '버리기'로 지운다 */
  }
}

/** 두 초안 중 더 최신인 것 — 한쪽이 없으면 있는 쪽. 둘 다 없으면 null.
 *  저장 시각을 못 읽는 초안(구버전)은 0 으로 쳐서 항상 뒤로 밀린다. */
export function newerDraft(
  local: PostDraft | null,
  server: PostDraft | null,
): { draft: PostDraft; origin: DraftOrigin } | null {
  const at = (d: PostDraft | null) => {
    const t = d ? Date.parse(d.savedAt) : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  if (!local && !server) return null;
  if (!server) return { draft: local as PostDraft, origin: 'local' };
  if (!local) return { draft: server, origin: 'server' };
  return at(server) > at(local)
    ? { draft: server, origin: 'server' }
    : { draft: local, origin: 'local' };
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
