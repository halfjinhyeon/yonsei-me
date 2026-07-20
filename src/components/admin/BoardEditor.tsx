'use client';

// 게시판 편집기 — 단일 게시판의 CRUD 를 담당하는 자립 컴포넌트.
// 백엔드 전환 Phase 3: 저장처가 GitHub JSON 커밋 → Supabase(admin API)로 바뀌었다.
// 흐름: 목록 로드(GET) → 편집 → 저장(POST/PUT)/삭제(DELETE)/일괄(POST bulk).
// 쓰기 성공 시 서버가 revalidateTag('posts') 를 호출해 사이트가 재배포 없이 갱신된다.
//
// 이 관리자 도구는 내부 운영용이라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARDS,
  getBoard,
  suggestId,
  today,
  emptyAttachment,
  type BoardKey,
  type EditRecord,
} from '@/lib/admin/boards';
import type { RepoConfig } from '@/lib/admin/github';
import { uploadAttachment } from '@/lib/admin/storage';
import { CommitBanner } from './CommitBanner';
import { PostForm } from './PostForm';

/** admin API 가 돌려주는 레코드 — EditRecord + DB 식별자/slug */
type ApiRecord = EditRecord & { board: string; slug: string | null };

/** 게시판별 목록 항목(공용 표시용) */
interface ListItem {
  /** DB id (일괄 작업·수정·삭제 키) */
  id: string;
  date: string;
  titleKo: string;
  /** 보조 표기 — 뉴스형은 slug, 게시판형은 DB 번호 */
  subId: string;
}

interface Props {
  /** 저장소 설정 — 첨부 업로드의 dev 폴백 판별에만 쓰인다(글 저장은 admin API) */
  config: RepoConfig;
  /** 편집할 게시판 키 */
  boardKey: BoardKey;
  /** 편집 폼이 열려 있는 동안 true — 셸의 이동 가드용 */
  onDirtyChange?: (dirty: boolean) => void;
}

function blankRecord(key: BoardKey, suggestedId: string): EditRecord {
  const meta = getBoard(key);
  return {
    id: suggestedId,
    date: today(),
    titleKo: '',
    titleEn: '',
    bodyKo: '',
    bodyEn: '',
    ...(meta.hasHost ? { hostKo: '', hostEn: '' } : {}),
    ...(meta.hasDateLabel ? { dateLabelKo: '', dateLabelEn: '' } : {}),
    ...(meta.hasDateRange ? { endDate: '' } : {}),
    ...(meta.hasLink ? { linkUrl: '' } : {}),
    ...(meta.hasEventFlag ? { isEvent: false } : {}),
    ...(meta.isNews ? { category: 'notice' as const, excerptKo: '', excerptEn: '', image: '' } : {}),
    attachments: [emptyAttachment()],
  };
}

/** admin API 호출 공통기 — 실패 시 서버 error 메시지를 던진다 */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `요청 실패 (HTTP ${res.status})`);
  return data as T;
}

export function BoardEditor({ config, boardKey, onDirtyChange }: Props) {
  const meta = useMemo(() => getBoard(boardKey), [boardKey]);

  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // 다중선택 상태: 선택된 DB id 집합. 리로드·액션 성공 시 초기화한다.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<BoardKey | ''>('');
  const selectAllRef = useRef<HTMLInputElement>(null);

  // 편집 상태: null 이면 목록, 아니면 폼. dbId 는 수정(PUT) 대상 식별자.
  const [editing, setEditing] = useState<{
    record: EditRecord;
    isEdit: boolean;
    dbId?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 편집 폼이 열려 있으면 dirty — 셸이 다른 항목으로 이동할 때 확인창을 띄운다.
  useEffect(() => {
    onDirtyChange?.(editing !== null);
  }, [editing, onDirtyChange]);

  const loadEntries = useCallback(async (key: BoardKey) => {
    setLoading(true);
    setListError(null);
    setSelected(new Set());
    setMoveTarget('');
    try {
      const { items } = await api<{ items: ApiRecord[] }>(`/api/admin/posts?board=${key}`);
      setRecords(items);
    } catch (err) {
      setRecords([]);
      setListError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 마운트 시 로드 (셸이 boardKey 변경 시 key prop 으로 리마운트한다)
  useEffect(() => {
    void loadEntries(boardKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listItems: ListItem[] = useMemo(
    () =>
      records.map((r) => ({
        id: r.id,
        date: r.date,
        titleKo: r.titleKo || '(제목 없음)',
        subId: meta.isNews ? (r.slug ?? r.id) : r.id,
      })),
    [records, meta.isNews],
  );

  // 새 글 id 제안 — 뉴스형은 slug 컨벤션(날짜 기반). 게시판형은 DB 가 자동 부여.
  const existingIds = useMemo(
    () => records.map((r) => (meta.isNews ? (r.slug ?? '') : r.id)),
    [records, meta.isNews],
  );

  const allSelected = listItems.length > 0 && selected.size === listItems.length;
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && selected.size < listItems.length;
    }
  }, [selected, listItems.length]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === listItems.length ? new Set() : new Set(listItems.map((i) => i.id)),
    );
  }
  function selectionSummary(ids: string[]): string {
    const titles = ids.map((id) => listItems.find((i) => i.id === id)?.titleKo ?? id);
    const shown = titles.slice(0, 5).join('\n');
    return titles.length > 5 ? `${shown}\n외 ${titles.length - 5}건` : shown;
  }

  function startNew() {
    setSuccess(null);
    setSaveError(null);
    setEditing({
      record: blankRecord(boardKey, meta.isNews ? suggestId(meta, existingIds) : '(자동 부여)'),
      isEdit: false,
    });
  }

  function startEdit(dbId: string) {
    const r = records.find((x) => x.id === dbId);
    if (!r) return;
    setSuccess(null);
    setSaveError(null);
    // 뉴스형은 폼의 '번호' 칸에 slug 를 노출(URL 이 되는 값), 게시판형은 DB 번호(참고용)
    setEditing({
      record: { ...r, id: meta.isNews ? (r.slug ?? r.id) : r.id },
      isEdit: true,
      dbId,
    });
  }

  /** 편집 레코드 → admin API 페이로드 */
  function toPayload(rec: EditRecord) {
    return {
      board: boardKey,
      slug: meta.isNews ? rec.id.trim() : undefined,
      date: rec.date,
      titleKo: rec.titleKo,
      titleEn: rec.titleEn,
      bodyKo: rec.bodyKo,
      bodyEn: rec.bodyEn,
      excerptKo: rec.excerptKo,
      excerptEn: rec.excerptEn,
      category: rec.category,
      hostKo: rec.hostKo,
      hostEn: rec.hostEn,
      // 기간 라벨은 서버가 시작/종료일로 자동 생성 — 수동 라벨은 더 이상 보내지 않는다
      endDate: rec.endDate || undefined,
      linkUrl: rec.linkUrl || undefined,
      isEvent: rec.isEvent,
      image: rec.image,
      attachments: rec.attachments.filter((a) => a.href.trim() !== '' || a.labelKo.trim() !== ''),
    };
  }

  async function handleSave(rec: EditRecord) {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing?.isEdit && editing.dbId) {
        await api(`/api/admin/posts/${editing.dbId}`, {
          method: 'PUT',
          body: JSON.stringify(toPayload(rec)),
        });
        finishSave('수정되었습니다');
      } else {
        await api('/api/admin/posts', { method: 'POST', body: JSON.stringify(toPayload(rec)) });
        finishSave('등록되었습니다');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(dbId: string) {
    const item = listItems.find((i) => i.id === dbId);
    if (!window.confirm(`정말 삭제할까요?\n\n${item?.titleKo ?? dbId}`)) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      await api(`/api/admin/posts/${dbId}`, { method: 'DELETE' });
      finishSave('삭제되었습니다');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    if (!window.confirm(`${ids.length}건을 삭제할까요?\n\n${selectionSummary(ids)}`)) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      await api('/api/admin/posts/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', ids }),
      });
      finishSave(`${ids.length}건 삭제되었습니다`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkMove() {
    if (selected.size === 0 || moveTarget === '') return;
    const target = getBoard(moveTarget);
    const ids = Array.from(selected);
    if (
      !window.confirm(
        `${ids.length}건을 '${target.label}'(으)로 이동할까요?\n\n대상 게시판에 없는 항목(주최·분류 등)은 그 게시판에서 표시되지 않습니다.`,
      )
    )
      return;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      await api('/api/admin/posts/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'move', ids, targetBoard: moveTarget }),
      });
      finishSave(`${ids.length}건을 '${target.label}'(으)로 이동했습니다`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '이동에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  function finishSave(message: string) {
    setEditing(null);
    setSuccess(`${message} — 사이트에 수 초 내 반영됩니다.`);
    void loadEntries(boardKey);
  }

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-content">{meta.label}</h2>
        <p className="text-xs text-content-faint">Supabase · posts ({boardKey})</p>
      </div>

      {success && <CommitBanner message={success} url="" />}

      {editing ? (
        <div className="rounded-card border border-surface-border bg-surface p-5 shadow-card sm:p-6">
          <h3 className="mb-4 text-base font-bold text-content">
            {editing.isEdit ? '수정' : '새 글'}
          </h3>
          {saveError && (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {saveError}
            </p>
          )}
          <PostForm
            meta={meta}
            initial={editing.record}
            isEdit={editing.isEdit}
            busy={saving}
            onCancel={() => setEditing(null)}
            onSubmit={handleSave}
            onUploadFile={(file, onProgress, signal) =>
              uploadAttachment(config, boardKey, file, onProgress, signal).then((r) => r.url)
            }
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface p-5 shadow-card sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3 border-b-2 border-yonsei-navy pb-2">
            <h3 className="text-lg font-bold text-content">게시글</h3>
            <button type="button" onClick={startNew} disabled={loading} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
              새 글 작성
            </button>
          </div>

          {loading && <p className="text-sm text-content-soft">불러오는 중…</p>}
          {listError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {listError}
            </p>
          )}
          {saveError && !loading && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {saveError}
            </p>
          )}

          {!loading && !listError && listItems.length === 0 && (
            <p className="text-sm text-content-faint">글이 없습니다.</p>
          )}

          {!loading && listItems.length > 0 && (
            <>
              {/* 전체선택 헤더 — 부분 선택은 indeterminate(ref)로 표시 */}
              <div className="flex items-center gap-3 border-b border-surface-border pb-2">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={saving || loading}
                  aria-label="전체 선택"
                  className="h-4 w-4 accent-yonsei-navy"
                />
                <span className="text-xs text-content-faint">
                  {selected.size > 0 ? `${selected.size}개 선택` : `전체 ${listItems.length}건`}
                </span>
              </div>

              {/* 선택 액션 바 — 1개 이상 선택 시 노출(선택 삭제 + 게시판 이동) */}
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-surface-border bg-surface-soft px-3 py-2">
                  <span className="text-xs font-medium text-content">{selected.size}개 선택</span>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={saving}
                    className="btn-secondary px-3 py-1.5 text-xs text-red-600 hover:border-red-400 hover:text-red-600 disabled:opacity-60"
                  >
                    선택 삭제
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <select
                      value={moveTarget}
                      onChange={(e) => setMoveTarget(e.target.value as BoardKey | '')}
                      disabled={saving}
                      aria-label="이동할 게시판"
                      className="border border-surface-border bg-surface px-2 py-1.5 text-xs text-content disabled:opacity-60"
                    >
                      <option value="">이동할 게시판…</option>
                      {BOARDS.filter((b) => b.key !== boardKey).map((b) => (
                        <option key={b.key} value={b.key}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleBulkMove}
                      disabled={saving || moveTarget === ''}
                      className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-60"
                    >
                      이동
                    </button>
                  </div>
                </div>
              )}

              <ul className="divide-y divide-surface-border">
                {listItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      disabled={saving || loading}
                      aria-label={`${item.titleKo} 선택`}
                      className="h-4 w-4 shrink-0 accent-yonsei-navy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-content">{item.titleKo}</p>
                      <p className="text-xs text-content-faint">
                        {item.date} · {item.subId}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => startEdit(item.id)} disabled={saving} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-60">
                        수정
                      </button>
                      <button type="button" onClick={() => handleDelete(item.id)} disabled={saving} className="btn-secondary px-3 py-1.5 text-xs text-red-600 hover:border-red-400 hover:text-red-600 disabled:opacity-60">
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
