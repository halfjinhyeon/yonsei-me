'use client';

// 교수진 머리말의 "실적 받아오기" 버튼 (디자인 1a · 1d).
//
// 평상시   : 저장 계열보다 낮은 위계의 외곽선 버튼 + 그 밑에 마지막 수집 시각
// 진행 중  : 버튼 자리가 잠긴 상태 표시(스피너 + N/33)로 바뀌고, 밑줄은 '진행 상황 보기'
//            링크가 된다 — 패널을 닫아도 진행이 계속된다는 것을 이 자리가 말한다.
// 완료 후  : '수집 결과 보기'로 패널을 다시 연다.
//
// 상태는 전부 useFacultyCrawl 한 곳에서 온다(머리말 진행 바·패널과 같은 값).

import type { FacultyCrawlState } from './useFacultyCrawl';

export function FacultyCrawlButton({ crawl, disabled }: { crawl: FacultyCrawlState; disabled?: boolean }) {
  const { running, finished, done, rows, lastCrawledAt, totalAdded, targets, loadError } = crawl;

  // 버튼 밑 한 줄은 "이 버튼이 지금 왜 이런 상태인지"를 말한다. 셋을 구분하지 않으면
  // 조회 실패도 '아직 수집한 적이 없습니다'로 보여, 담당자가 눌러도 되는 줄 알고 기다린다.
  const note: { text: string; error?: boolean } = loadError
    ? { text: `명단을 불러오지 못했습니다 — ${loadError}`, error: true }
    : targets === null
      ? { text: '명단 불러오는 중…' }
      : targets.length === 0
        ? { text: '수집 대상이 없습니다 — 교수 상세의 정보 URL을 채워 주세요', error: true }
        : finished
          ? { text: `방금 수집 · 신규 ${totalAdded}건` }
          : lastCrawledAt
            ? { text: `마지막 수집 ${lastCrawledAt}` }
            : { text: '아직 수집한 적이 없습니다' };

  return (
    <span className="flex flex-col items-end gap-[7px]">
      {running ? (
        // 진행 중에는 버튼이 아니라 '잠긴 상태 표시'다 — 중복 실행을 막는 자리이자 진행 표시.
        <span className="inline-flex cursor-not-allowed items-center gap-2 border border-surface-border bg-surface-soft px-4 py-2.5 text-[13px] font-semibold text-content-soft">
          <span
            aria-hidden="true"
            className="inline-block h-[11px] w-[11px] animate-spin rounded-full border-2 border-surface-border border-t-yonsei-blue"
          />
          받아오는 중{' '}
          <span className="font-bold tabular-nums text-yonsei-navy">
            {done}/{rows.length}
          </span>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => (finished ? crawl.setOpen(true) : crawl.setConfirming(true))}
          disabled={disabled || targets === null || targets.length === 0}
          className="cms-btn"
        >
          <span aria-hidden="true" className="text-[14px] leading-none">
            ↻
          </span>
          {finished ? '수집 결과 보기' : '교원정보시스템에서 실적 받아오기'}
        </button>
      )}

      {running ? (
        <button
          type="button"
          onClick={() => crawl.setOpen(true)}
          className="text-[11.5px] font-bold text-yonsei-blue underline underline-offset-2 hover:text-yonsei-navy"
        >
          진행 상황 보기
        </button>
      ) : (
        <p
          role={note.error ? 'alert' : undefined}
          className="max-w-[34ch] text-right text-[11.5px] leading-[1.5] tracking-[-0.01em]"
          style={note.error ? { color: '#b42318' } : undefined}
        >
          <span className={note.error ? undefined : 'text-content-soft'}>{note.text}</span>
        </p>
      )}
    </span>
  );
}
