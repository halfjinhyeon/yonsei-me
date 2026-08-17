'use client';

// 단일 마크다운 파일 편집기 (장학금 안내 등). 편집/미리보기 토글을 제공하고
// 저장은 /api/admin/content(Supabase content_files + revalidateTag)로 한다 —
// 재배포 없이 수 초 내 사이트에 반영된다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useCallback, useEffect, useState } from 'react';
import { commitText, loadText, savedBanner, type RepoConfig } from '@/lib/admin/content-api';
import { hasTableBlock } from '@/lib/admin/markdown-blocks';
import type { MarkdownPageDef } from '@/lib/admin/resources';
import { Prose } from '@/components/Prose';
import { CommitBanner } from './CommitBanner';
import { MarkdownBlocksEditor } from './MarkdownBlocksEditor';

interface Props {
  config: RepoConfig;
  page: MarkdownPageDef;
  onDirtyChange?: (dirty: boolean) => void;
}

// 저장 직전 파일 끝 개행 보장 (프로젝트 컨벤션)
function withTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

export function MarkdownEditor({ config, page, onDirtyChange }: Props) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(''); // 로드 시점 원본 (dirty 비교용)
  const [sha, setSha] = useState('');
  const [tab, setTab] = useState<'blocks' | 'raw' | 'preview'>('raw');
  // blocks 탭 진입·로드 시마다 증가 — MarkdownBlocksEditor 를 리마운트해
  // 원문 탭에서 고친 내용이 재진입 시 확실히 반영되도록 한다.
  const [blocksEpoch, setBlocksEpoch] = useState(0);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; url: string } | null>(null);

  const dirty = text !== loaded;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const file = await loadText(config, page.file);
      setText(file.data);
      setLoaded(file.data);
      setSha(file.sha);
      // 표가 있는 문서는 표 편집 탭으로, 아니면 원문 탭으로 진입
      setTab(hasTableBlock(file.data) ? 'blocks' : 'raw');
      // 로드된 내용으로 blocks 편집기를 새로 마운트
      setBlocksEpoch((n) => n + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '파일을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [config, page.file]);

  // 마운트 / 페이지 전환 시 로드
  useEffect(() => {
    setSuccess(null);
    setSaveError(null);
    // 기본 탭은 load 완료 시 문서 내용(표 유무)에 따라 결정한다
    void load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      const next = withTrailingNewline(text);
      await commitText(config, page.file, next, sha, `content: ${page.label} 페이지 수정`);
      setSuccess(savedBanner(config));
      // 저장으로 버전이 올라갔으므로 새 버전/데이터 확보를 위해 재로드
      // (안 받으면 이어지는 저장이 버전 불일치로 409 가 된다)
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-card border border-surface-border bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-4">
        {/* 파일 경로는 적지 않는다 — CmsPanelHead 와 같은 이유(내부 구현 정보) */}
        <h2 className="text-lg font-bold text-content">{page.label}</h2>
        <p className="mt-1 text-sm text-content-soft">{page.description}</p>
      </div>

      {success && <CommitBanner message={success.message} url={success.url} />}

      {loadError && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {loadError}
        </p>
      )}
      {saveError && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {saveError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-content-soft">불러오는 중…</p>
      ) : (
        <>
          {/* 표 편집 / 원문 / 미리보기 세그먼트 토글 */}
          <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-surface-border">
            {(['blocks', 'raw', 'preview'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  // 표 편집 탭 진입 시 리마운트해 원문 탭 수정 내용을 반영
                  if (t === 'blocks') setBlocksEpoch((n) => n + 1);
                  setTab(t);
                }}
                aria-current={tab === t ? 'true' : undefined}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'bg-yonsei-navy text-white'
                    : 'bg-surface-soft text-content-soft hover:bg-surface hover:text-content'
                }`}
              >
                {t === 'blocks' ? '표 편집' : t === 'raw' ? '원문' : '미리보기'}
              </button>
            ))}
          </div>

          {tab === 'blocks' ? (
            <>
              <MarkdownBlocksEditor key={blocksEpoch} value={text} onChange={setText} />
              <p className="mt-3 text-xs text-content-faint">
                표 편집에서 저장하면 표 서식이 표준 형태로 정리됩니다. 화면 표시는 동일합니다.
              </p>
            </>
          ) : tab === 'raw' ? (
            <textarea
              aria-label={`${page.label} 마크다운`}
              rows={22}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 font-mono text-sm text-content outline-none focus:border-yonsei-blue"
            />
          ) : (
            <div className="rounded-card border border-surface-border p-5">
              <Prose markdown={text} />
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="btn-primary disabled:opacity-60"
            >
              {saving ? '저장 중…' : '저장 (커밋)'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
