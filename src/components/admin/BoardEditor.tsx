'use client';

// 게시판 편집기 — 단일 게시판의 CRUD를 담당하는 자립 컴포넌트.
// 정적 사이트라 서버 DB가 없어 GitHub Contents API로 content/board.json·news.json을
// 직접 커밋한다("Git이 곧 DB"). 흐름: 목록 로드 → 편집 → 커밋.
//
// 콘텐츠/코드 분리 원칙은 "사이트 콘텐츠"(content/*.json)에 적용된다.
// 이 관리자 도구는 내부 운영용이라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARDS,
  convertRecordForBoard,
  emptyAttachment,
  getBoard,
  suggestId,
  toBoardEntry,
  toEditRecord,
  toNewsEntry,
  today,
  type BoardFile,
  type BoardKey,
  type EditRecord,
} from '@/lib/admin/boards';
import {
  commitJson,
  loadJson,
  savedBanner,
  type RepoConfig,
} from '@/lib/admin/github';
import { uploadAttachment } from '@/lib/admin/storage';
import type { NewsItem } from '@/lib/content';
import { CommitBanner } from './CommitBanner';
import { PostForm } from './PostForm';

/** 게시판별 목록 항목(공용 표시용) */
interface ListItem {
  id: string;
  date: string;
  titleKo: string;
}

interface SuccessBanner {
  message: string;
  url: string;
}

interface Props {
  /** GitHub 저장소 설정 (세션 토큰 포함) */
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
    ...(meta.hasEventFlag ? { isEvent: false } : {}),
    ...(meta.isNews ? { category: 'notice' as const, excerptKo: '', excerptEn: '', image: '' } : {}),
    attachments: [emptyAttachment()],
  };
}

export function BoardEditor({ config, boardKey, onDirtyChange }: Props) {
  const meta = useMemo(() => getBoard(boardKey), [boardKey]);

  const [rawEntries, setRawEntries] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // 다중선택 상태: 선택된 항목의 id(뉴스는 slug) 집합. 게시판 리로드·액션 성공 시 초기화한다.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 선택 이동 대상 게시판 키('' = 미선택)
  const [moveTarget, setMoveTarget] = useState<BoardKey | ''>('');
  // 전체선택 체크박스의 indeterminate(부분 선택)는 DOM 프로퍼티라 ref로만 설정 가능하다.
  const selectAllRef = useRef<HTMLInputElement>(null);

  // 편집 상태: null이면 목록, 아니면 폼
  const [editing, setEditing] = useState<{ record: EditRecord; isEdit: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessBanner | null>(null);

  // 편집 폼이 열려 있으면 dirty — 셸이 다른 항목으로 이동할 때 확인창을 띄운다.
  useEffect(() => {
    onDirtyChange?.(editing !== null);
  }, [editing, onDirtyChange]);

  // 선택된 게시판의 데이터 로드 (GitHub 최신 브랜치 내용)
  const loadEntries = useCallback(
    async (cfg: RepoConfig, key: BoardKey) => {
      const m = getBoard(key);
      setLoading(true);
      setListError(null);
      // 리로드하면 목록이 바뀌므로 선택·이동 대상을 초기화한다(액션 성공 후에도 이 경로를 탄다).
      setSelected(new Set());
      setMoveTarget('');
      try {
        if (m.isNews) {
          const file = await loadJson<NewsItem[]>(cfg, m.newsFile ?? 'content/news.json');
          setRawEntries(file.data);
        } else {
          const file = await loadJson<BoardFile>(cfg, 'content/board.json');
          setRawEntries(file.data[key as keyof BoardFile] ?? []);
        }
      } catch (err) {
        setRawEntries([]);
        setListError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // 마운트 시 로드 (셸이 boardKey 변경 시 key prop으로 리마운트한다)
  useEffect(() => {
    void loadEntries(config, boardKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listItems: ListItem[] = useMemo(() => {
    const items = rawEntries.map((raw) => {
      const r = raw as Record<string, unknown>;
      const title = (r.title as { ko?: string }) ?? {};
      return {
        id: String(r.id ?? r.slug ?? ''),
        date: String(r.date ?? ''),
        titleKo: title.ko ?? '(제목 없음)',
      };
    });
    return items.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [rawEntries]);

  const existingIds = useMemo(
    () => rawEntries.map((r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).slug ?? '')),
    [rawEntries],
  );

  const allSelected = listItems.length > 0 && selected.size === listItems.length;

  // 부분 선택일 때만 전체선택 체크박스를 indeterminate로. (checked만으로는 표현 불가)
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
    setSelected((prev) => (prev.size === listItems.length ? new Set() : new Set(listItems.map((i) => i.id))));
  }

  // 선택 목록을 확인창용 문자열로: 제목 최대 5개 + 초과분은 "외 N건"
  function selectionSummary(ids: string[]): string {
    const titles = ids.map((id) => listItems.find((i) => i.id === id)?.titleKo ?? id);
    const shown = titles.slice(0, 5).join('\n');
    const extra = titles.length > 5 ? `\n외 ${titles.length - 5}건` : '';
    return `${shown}${extra}`;
  }

  // 선택 삭제: 뉴스형이면 slug, 게시판이면 id를 일괄 filter 후 커밋 1번.
  async function handleBulkDelete() {
    if (!config || selected.size === 0) return;
    const ids = Array.from(selected);
    if (!window.confirm(`${ids.length}건을 삭제할까요?\n\n${selectionSummary(ids)}`)) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    const idSet = new Set(ids);
    const path = meta.isNews ? (meta.newsFile ?? 'content/news.json') : 'content/board.json';
    try {
      if (meta.isNews) {
        const file = await loadJson<NewsItem[]>(config, path);
        const arr = file.data.filter((n) => !idSet.has(n.slug));
        const result = await commitJson(config, path, arr, file.sha, `content: ${meta.label} ${ids.length}건 삭제`);
        finishSave(result.sha);
      } else {
        const file = await loadJson<BoardFile>(config, path);
        const key = boardKey as keyof BoardFile;
        const list = ((file.data[key] ?? []) as { id: string }[]).filter((n) => !idSet.has(n.id));
        const next = { ...file.data, [key]: list } as BoardFile;
        const result = await commitJson(config, path, next, file.sha, `content: ${meta.label} ${ids.length}건 삭제`);
        finishSave(result.sha);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제에 실패했습니다.';
      setSaveError(msg);
      if (msg.includes('409') || msg.includes('422')) {
        void loadEntries(config, boardKey);
      }
    } finally {
      setSaving(false);
    }
  }

  // 선택 이동: 원본 레코드를 대상 게시판 형태로 변환하고 id를 대상 규칙으로 새로 부여한다.
  async function handleBulkMove() {
    if (!config || selected.size === 0 || moveTarget === '') return;
    const target = getBoard(moveTarget);
    const ids = Array.from(selected);
    const idSet = new Set(ids);
    if (
      !window.confirm(
        `${ids.length}건을 '${target.label}'(으)로 이동할까요?\n\n대상 게시판에 없는 항목(주최·분류·요약 등)은 이동 시 제외되고, 글번호는 대상 게시판 규칙으로 새로 부여됩니다.`,
      )
    )
      return;

    setSaving(true);
    setSaveError(null);
    setSuccess(null);

    const sourcePath = meta.isNews ? (meta.newsFile ?? 'content/news.json') : 'content/board.json';
    const targetPath = target.isNews ? (target.newsFile ?? 'content/news.json') : 'content/board.json';
    // 이동할 원본 레코드(현재 목록에 담긴 원본 그대로, 순서 유지)
    const movingRaw = rawEntries.filter((raw) =>
      idSet.has(String((raw as Record<string, unknown>).id ?? (raw as Record<string, unknown>).slug ?? '')),
    );

    // 변환 + 대상 규칙 id 재부여. targetIds에 부여한 id를 push해 연속 이동 시 중복을 막는다.
    const buildBoardEntries = (existing: string[]) =>
      movingRaw.map((raw) => {
        const rec = convertRecordForBoard(meta, target, raw);
        rec.id = suggestId(target, existing);
        existing.push(rec.id);
        return toBoardEntry(target, rec) as { id: string };
      });
    const buildNewsEntries = (existing: string[]) =>
      movingRaw.map((raw) => {
        const rec = convertRecordForBoard(meta, target, raw);
        rec.id = suggestId(target, existing);
        existing.push(rec.id);
        return toNewsEntry(rec);
      });

    const moveMsg = `content: ${meta.label} → ${target.label} ${ids.length}건 이동`;

    try {
      if (sourcePath === targetPath) {
        // 같은 board.json: 한 번 로드해 원본 키에서 제거 + 대상 키에 추가 후 커밋 1번.
        const file = await loadJson<BoardFile>(config, sourcePath);
        const sourceKey = boardKey as keyof BoardFile;
        const targetKey = target.key as keyof BoardFile;
        const sourceList = ((file.data[sourceKey] ?? []) as { id: string }[]).filter((n) => !idSet.has(n.id));
        const targetList = ((file.data[targetKey] ?? []) as { id: string }[]).slice();
        const converted = buildBoardEntries(targetList.map((n) => n.id));
        const next = {
          ...file.data,
          [sourceKey]: sourceList,
          [targetKey]: [...converted, ...targetList],
        } as BoardFile;
        const result = await commitJson(config, sourcePath, next, file.sha, moveMsg);
        finishSave(result.sha);
      } else {
        // 다른 파일: ① 대상에 추가 커밋 → ② 원본에서 제거 커밋. ②가 실패하면 중복이 남지만
        // 데이터 유실보다 낫다는 방향으로, 안내 후 새로고침한다.
        let lastSha: string;
        if (target.isNews) {
          const tfile = await loadJson<NewsItem[]>(config, targetPath);
          const converted = buildNewsEntries(tfile.data.map((n) => n.slug));
          const nextArr = [...converted, ...tfile.data];
          const r1 = await commitJson(config, targetPath, nextArr, tfile.sha, moveMsg);
          lastSha = r1.sha;
        } else {
          const tfile = await loadJson<BoardFile>(config, targetPath);
          const targetKey = target.key as keyof BoardFile;
          const targetList = ((tfile.data[targetKey] ?? []) as { id: string }[]).slice();
          const converted = buildBoardEntries(targetList.map((n) => n.id));
          const next = { ...tfile.data, [targetKey]: [...converted, ...targetList] } as BoardFile;
          const r1 = await commitJson(config, targetPath, next, tfile.sha, moveMsg);
          lastSha = r1.sha;
        }

        try {
          if (meta.isNews) {
            const sfile = await loadJson<NewsItem[]>(config, sourcePath);
            const arr = sfile.data.filter((n) => !idSet.has(n.slug));
            const r2 = await commitJson(
              config,
              sourcePath,
              arr,
              sfile.sha,
              `content: ${meta.label} → ${target.label} 이동 — 원본 ${ids.length}건 삭제`,
            );
            lastSha = r2.sha;
          } else {
            const sfile = await loadJson<BoardFile>(config, sourcePath);
            const sourceKey = boardKey as keyof BoardFile;
            const sourceList = ((sfile.data[sourceKey] ?? []) as { id: string }[]).filter((n) => !idSet.has(n.id));
            const next = { ...sfile.data, [sourceKey]: sourceList } as BoardFile;
            const r2 = await commitJson(
              config,
              sourcePath,
              next,
              sfile.sha,
              `content: ${meta.label} → ${target.label} 이동 — 원본 ${ids.length}건 삭제`,
            );
            lastSha = r2.sha;
          }
        } catch {
          // ①은 성공했으나 ② 실패 — 중복이 남았음을 알리고 리로드.
          setSaveError(
            '이동한 글이 대상 게시판에 추가되었지만 원본 삭제에 실패했습니다. 목록을 새로고침한 뒤 원본에서 남은 글을 직접 삭제해 주세요.',
          );
          void loadEntries(config, boardKey);
          return;
        }
        finishSave(lastSha);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '이동에 실패했습니다.';
      setSaveError(msg);
      if (msg.includes('409') || msg.includes('422')) {
        void loadEntries(config, boardKey);
      }
    } finally {
      setSaving(false);
    }
  }

  function startNew() {
    setSuccess(null);
    setSaveError(null);
    setEditing({ record: blankRecord(boardKey, suggestId(meta, existingIds)), isEdit: false });
  }

  function startEdit(id: string) {
    const raw = rawEntries.find(
      (r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).slug ?? '') === id,
    );
    if (!raw) return;
    setSuccess(null);
    setSaveError(null);
    setEditing({ record: toEditRecord(meta, raw), isEdit: true });
  }

  // 저장(추가/수정): 최신 sha 확보 → 배열 수정 → 커밋
  async function handleSave(rec: EditRecord) {
    if (!config) return;
    // 새 글이면 저장 시점(최신 목록)에 고유번호/slug 를 자동 재부여해 충돌 방지
    const isNew = !editing?.isEdit;
    setSaving(true);
    setSaveError(null);
    const newsPath = meta.newsFile ?? 'content/news.json';
    const path = meta.isNews ? newsPath : 'content/board.json';
    try {
      if (meta.isNews) {
        const file = await loadJson<NewsItem[]>(config, path);
        const arr = file.data.slice();
        const entry = toNewsEntry(rec);
        if (isNew) entry.slug = suggestId(meta, arr.map((n) => n.slug));
        const idx = arr.findIndex((n) => n.slug === entry.slug);
        if (idx >= 0) arr[idx] = entry;
        else arr.unshift(entry);
        const result = await commitJson(
          config,
          path,
          arr,
          file.sha,
          `content: 뉴스 ${idx >= 0 ? '수정' : '추가'} — ${entry.title.ko}`,
        );
        finishSave(result.sha);
      } else {
        const file = await loadJson<BoardFile>(config, path);
        const key = boardKey as keyof BoardFile;
        const list = (file.data[key] ?? []).slice() as { id: string }[];
        const entry = toBoardEntry(meta, rec);
        if (isNew) (entry as { id: string }).id = suggestId(meta, list.map((n) => n.id));
        const idx = list.findIndex((n) => n.id === entry.id);
        if (idx >= 0) list[idx] = entry as typeof list[number];
        else list.unshift(entry as typeof list[number]);
        const next = { ...file.data, [key]: list } as BoardFile;
        const result = await commitJson(
          config,
          path,
          next,
          file.sha,
          `content: ${meta.label} ${idx >= 0 ? '수정' : '추가'} — ${entry.title.ko}`,
        );
        finishSave(result.sha);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장에 실패했습니다.';
      setSaveError(msg);
      // 충돌이면 목록 리로드
      if (msg.includes('409') || msg.includes('422')) {
        void loadEntries(config, boardKey);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!config) return;
    const item = listItems.find((i) => i.id === id);
    if (!window.confirm(`정말 삭제할까요?\n\n${item?.titleKo ?? id}`)) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    const path = meta.isNews ? (meta.newsFile ?? 'content/news.json') : 'content/board.json';
    try {
      if (meta.isNews) {
        const file = await loadJson<NewsItem[]>(config, path);
        const arr = file.data.filter((n) => n.slug !== id);
        const result = await commitJson(config, path, arr, file.sha, `content: 뉴스 삭제 — ${id}`);
        finishSave(result.sha);
      } else {
        const file = await loadJson<BoardFile>(config, path);
        const key = boardKey as keyof BoardFile;
        const list = ((file.data[key] ?? []) as { id: string }[]).filter((n) => n.id !== id);
        const next = { ...file.data, [key]: list } as BoardFile;
        const result = await commitJson(config, path, next, file.sha, `content: ${meta.label} 삭제 — ${id}`);
        finishSave(result.sha);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제에 실패했습니다.';
      setSaveError(msg);
      if (msg.includes('409') || msg.includes('422')) {
        void loadEntries(config, boardKey);
      }
    } finally {
      setSaving(false);
    }
  }

  function finishSave(sha: string) {
    setEditing(null);
    setSuccess(savedBanner(config, sha));
    void loadEntries(config, boardKey);
  }

  const filePath = meta.isNews ? (meta.newsFile ?? 'content/news.json') : 'content/board.json';

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-content">{meta.label}</h2>
        <p className="text-xs text-content-faint">{filePath}</p>
      </div>

      {success && (
        <CommitBanner message={success.message} url={success.url} />
      )}

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
                        {item.date} · {item.id}
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
