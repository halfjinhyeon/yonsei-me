'use client';

// 게시판 관리자 콘솔 (단일 페이지 앱).
// 정적 사이트라 서버 DB가 없어 GitHub Contents API로 content/*.json을 직접
// 커밋한다("Git이 곧 DB"). 흐름: 연결 → 게시판 목록 → 편집 → 커밋.
//
// 콘텐츠/코드 분리 원칙은 "사이트 콘텐츠"(content/*.json)에 적용된다.
// 이 관리자 도구는 내부 운영용이라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BOARDS,
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
  commitUrl,
  loadJson,
  type RepoConfig,
} from '@/lib/admin/github';
import type { NewsItem } from '@/lib/content';
import { ConnectForm } from './ConnectForm';
import { PostForm } from './PostForm';

const STORAGE_KEY = 'ym-admin';

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

function emptyConfig(): RepoConfig {
  return { token: '', owner: 'halfjinhyeon', repo: 'yonsei-me', branch: 'main' };
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
    ...(meta.isNews ? { category: 'notice' as const, excerptKo: '', excerptEn: '', image: '' } : {}),
    attachments: [emptyAttachment()],
  };
}

export function AdminConsole() {
  const [config, setConfig] = useState<RepoConfig | null>(null);
  const [storedInitial, setStoredInitial] = useState<RepoConfig>(emptyConfig());

  const [boardKey, setBoardKey] = useState<BoardKey>('noticesUndergrad');
  const [rawEntries, setRawEntries] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // 편집 상태: null이면 목록, 아니면 폼
  const [editing, setEditing] = useState<{ record: EditRecord; isEdit: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessBanner | null>(null);

  const meta = useMemo(() => getBoard(boardKey), [boardKey]);

  // 최초: sessionStorage에서 설정 복원
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RepoConfig;
        setStoredInitial(parsed);
        if (parsed.token) setConfig(parsed);
      }
    } catch {
      /* 손상된 저장값 무시 */
    }
  }, []);

  const handleConnected = useCallback((cfg: RepoConfig) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {
      /* 저장 실패해도 세션 내 사용은 가능 */
    }
    setConfig(cfg);
  }, []);

  const handleDisconnect = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 무시 */
    }
    setConfig(null);
    setEditing(null);
    setRawEntries([]);
    setSuccess(null);
  }, []);

  // 선택된 게시판의 데이터 로드 (GitHub 최신 브랜치 내용)
  const loadEntries = useCallback(
    async (cfg: RepoConfig, key: BoardKey) => {
      const m = getBoard(key);
      setLoading(true);
      setListError(null);
      try {
        if (m.isNews) {
          const file = await loadJson<NewsItem[]>(cfg, 'content/news.json');
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

  // 연결 후 또는 게시판 전환 시 로드
  useEffect(() => {
    if (config && !editing) {
      void loadEntries(config, boardKey);
    }
    // editing 중에는 재로드하지 않는다 (전환 경고는 아래 switchBoard에서 처리)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, boardKey]);

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

  function switchBoard(key: BoardKey) {
    if (key === boardKey) return;
    if (editing && !window.confirm('편집 중인 내용이 저장되지 않았습니다. 게시판을 전환할까요?')) {
      return;
    }
    setEditing(null);
    setSuccess(null);
    setSaveError(null);
    setBoardKey(key);
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
    setSaving(true);
    setSaveError(null);
    const path = meta.isNews ? 'content/news.json' : 'content/board.json';
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
    const path = meta.isNews ? 'content/news.json' : 'content/board.json';
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
    if (!config) return;
    setEditing(null);
    setSuccess({
      message: 'Vercel이 1~2분 내 자동 재배포합니다.',
      url: commitUrl(config, sha),
    });
    void loadEntries(config, boardKey);
  }

  if (!config) {
    return <ConnectForm initial={storedInitial} onConnected={handleConnected} />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content">게시판 관리자 콘솔</h1>
          <p className="text-xs text-content-faint">
            {config.owner}/{config.repo} · {config.branch}
          </p>
        </div>
        <button type="button" onClick={handleDisconnect} className="btn-secondary px-4 py-2 text-xs">
          연결 해제
        </button>
      </header>

      {success && (
        <div role="status" className="mb-6 rounded-card border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
          커밋되었습니다. {success.message}{' '}
          <a href={success.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            커밋 보기 ↗
          </a>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* 게시판 선택 */}
        <nav aria-label="게시판 선택" className="flex flex-row flex-wrap gap-2 lg:flex-col">
          {BOARDS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => switchBoard(b.key)}
              aria-current={b.key === boardKey ? 'true' : undefined}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                b.key === boardKey
                  ? 'bg-yonsei-navy text-white'
                  : 'bg-surface-soft text-content-soft hover:bg-surface hover:text-content'
              }`}
            >
              {b.label}
            </button>
          ))}
        </nav>

        {/* 목록 또는 편집 폼 */}
        <div className="min-w-0">
          {editing ? (
            <div className="rounded-card border border-surface-border bg-surface p-5 shadow-card sm:p-6">
              <h2 className="mb-4 text-lg font-bold text-content">
                {meta.label} · {editing.isEdit ? '수정' : '새 글'}
              </h2>
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
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-content">{meta.label}</h2>
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
      </div>
    </div>
  );
}
