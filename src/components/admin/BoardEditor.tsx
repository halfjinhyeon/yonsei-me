'use client';

// 게시판 편집기 — 단일 게시판의 CRUD를 담당하는 자립 컴포넌트.
// 정적 사이트라 서버 DB가 없어 GitHub Contents API로 content/board.json·news.json을
// 직접 커밋한다("Git이 곧 DB"). 흐름: 목록 로드 → 편집 → 커밋.
//
// 콘텐츠/코드 분리 원칙은 "사이트 콘텐츠"(content/*.json)에 적용된다.
// 이 관리자 도구는 내부 운영용이라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
    setSaving(true);
    setSaveError(null);
    const newsPath = meta.newsFile ?? 'content/news.json';
    const path = meta.isNews ? newsPath : 'content/board.json';
    try {
      if (meta.isNews) {
        const file = await loadJson<NewsItem[]>(config, path);
        const entry = toNewsEntry(rec);
        const arr = file.data.slice();
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
        const entry = toBoardEntry(meta, rec);
        const list = (file.data[key] ?? []).slice() as { id: string }[];
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
            <ul className="divide-y divide-surface-border">
              {listItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
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
          )}
        </div>
      )}
    </div>
  );
}
