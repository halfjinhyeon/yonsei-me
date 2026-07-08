'use client';

// 번역 채우기 버튼 — 원문(source)을 번역해 대상 칸에 채운다(onTranslated).
// 결과는 그대로 수정 가능한 초안이다(학교 공지문이라 사람이 검토·수정 전제).
// 게시판 폼(PostForm)과 스키마 폼(RecordForm)의 English 칸 옆에서 공유한다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useState } from 'react';
import { translate } from '@/lib/admin/translate';

interface Props {
  /** 번역할 원문 (예: 한국어 값) */
  source: string;
  /** 번역 방향 (기본 EN = 한→영) */
  target?: 'EN' | 'KO';
  /** 번역 결과를 대상 칸에 채운다 */
  onTranslated: (text: string) => void;
  disabled?: boolean;
}

export function TranslateButton({ source, target = 'EN', onTranslated, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = target === 'KO' ? '영→한 번역' : '한→영 번역';

  async function run() {
    setError(null);
    const text = source.trim();
    if (!text) {
      setError(target === 'KO' ? '먼저 English를 입력하세요.' : '먼저 한국어를 입력하세요.');
      return;
    }
    setBusy(true);
    try {
      onTranslated(await translate(text, target));
    } catch (err) {
      setError(err instanceof Error ? err.message : '번역에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={disabled || busy}
        className="rounded-md border border-surface-border px-2 py-0.5 text-xs font-semibold text-yonsei-blue transition-colors hover:border-yonsei-blue disabled:opacity-50"
      >
        {busy ? '번역 중…' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
