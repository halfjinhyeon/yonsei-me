'use client';

// 교수 학술활동 수집 진행 패널 (디자인 1b · 1c · 1e · 1f).
//
// 화면의 중심은 버튼이 아니라 **교수별로 한 줄씩 쌓이는 로그**다(사용자 지시):
//
//     조형희 교수   논문 3 · 연구과제 1        4건 추가
//     김대은 교수   변경 없음                  추가 0건
//     이용재 교수   받아오지 못함              다시 시도
//
// 진행률 숫자만으로는 무엇이 갱신됐는지 알 수 없어서, 한 명이 끝날 때마다 그 결과가 즉시
// 목록에 붙는다. 완료 화면은 이 목록을 갈아치우지 않고 머리에 총계 줄만 얹는다 — 진행 중과
// 완료가 같은 구조라 시선이 옮겨 다닐 일이 없다.
//
// 아직 처리 안 된 교수는 회색 자리로 미리 깔지 않는다(디자인 1g/1h 비교의 1h 안):
// 끝난 줄만 쌓이고 맨 아래 한 줄이 지금 처리 중인 교수를, 그 밑 한 문장이 남은 인원을 말한다.
//
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { CmsModal } from './CmsModal';
import {
  SECONDS_PER_PERSON,
  SECTION_LABEL,
  SECTION_ORDER,
  addedSummary,
  elapsedLabel,
  type FacultyCrawlState,
  type LogRow,
} from './useFacultyCrawl';

const DANGER = '#b42318';
/** 실패 줄 배경 — 붉은 기가 아주 옅게만 도는 면(디자인 값) */
const DANGER_SOFT = '#FDF6F5';

/** 줄 격자 — 표식 · 이름 · 요약 · 건수 · 펼침 화살표 */
const ROW_GRID = 'grid grid-cols-[14px_104px_1fr_auto_16px] items-baseline gap-3 px-[22px] py-3 pl-5';

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 신규가 있는 줄 — 누르면 실제로 들어온 항목이 펼쳐진다 */
function AddedRow({ row, open, onToggle }: { row: LogRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(ROW_GRID, 'w-full border-0 border-l-2 border-yonsei-navy bg-surface text-left hover:bg-surface-soft')}
      >
        <span aria-hidden="true" className="text-xs font-extrabold text-yonsei-blue">
          +
        </span>
        <span className="text-[13.5px] font-bold text-content">
          {row.name} <span className="font-medium text-content-soft">교수</span>
        </span>
        <span className="text-[13px] text-content">{addedSummary(row)}</span>
        <span className="whitespace-nowrap text-[12.5px] font-bold tabular-nums text-yonsei-blue">
          {row.added}건 추가
        </span>
        <span aria-hidden="true" className="text-[10px] text-content-soft">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <ul className="border-l-2 border-yonsei-navy bg-surface-soft py-1 pb-4 pl-[150px] pr-[22px]">
          {row.addedItems.map((item, i) => (
            <li key={`${row.name}-${i}`} className="border-t border-surface-border py-[7px]">
              <p className="text-[11px] font-bold tracking-[0.02em] text-yonsei-blue">{item.cat}</p>
              <p className="mt-[3px] text-[12.5px] leading-[1.55] text-content">{item.title}</p>
              {item.meta && <p className="mt-[3px] text-[11.5px] text-content-soft">{item.meta}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function FacultyCrawlDrawer({ crawl }: { crawl: FacultyCrawlState }) {
  const {
    rows,
    running,
    finished,
    done,
    totalAdded,
    addedByKey,
    okCount,
    failedCount,
    failedNames,
    currentName,
    targets,
    finishedAt,
    elapsedMs,
    open,
    confirming,
  } = crawl;

  const [expanded, setExpanded] = useState<string | null>(null);
  const [hideSame, setHideSame] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  // 새 줄을 시야에 붙잡아 둔다(자동 스크롤) — 진행 중에만.
  useEffect(() => {
    if (!running) return;
    logRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [rows, running]);

  const targetCount = targets?.length ?? 0;
  const estimateMin = Math.max(1, Math.round((targetCount * SECONDS_PER_PERSON) / 60));
  const doneRows = rows.filter((r) => r.state === 'added' || r.state === 'same' || r.state === 'failed');
  const remaining = rows.length - done - (currentName ? 1 : 0);

  return (
    <>
      {open && rows.length > 0 && (
        <>
          {/* 뒤 화면을 덮는 면 — 패널이 지금 무엇을 가리고 있는지 보이게 얇게만 */}
          <div
            className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.24)]"
            onClick={() => crawl.setOpen(false)}
            aria-hidden="true"
          />
          <aside
            aria-label="실적 수집 진행"
            className="fixed inset-y-0 right-0 z-50 flex w-[min(560px,100vw)] flex-col border-l border-surface-border bg-surface"
          >
            <div className="px-6 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-[16px] font-bold text-content">
                    {running
                      ? '최신 실적 받아오는 중'
                      : failedCount > 0
                        ? `${okCount}명은 받아왔고, ${failedCount}명은 받아오지 못했습니다`
                        : '최신 실적 받아오기를 마쳤습니다'}
                  </h4>
                  <p className="mt-[6px] text-xs text-content-soft">
                    {running
                      ? '교원정보시스템 · 기존 기록은 지워지지 않습니다'
                      : finishedAt
                        ? `${stamp(finishedAt)} · ${elapsedLabel(elapsedMs)} 소요 · 기존 기록은 그대로 있습니다`
                        : '기존 기록은 그대로 있습니다'}
                  </p>
                </div>
                <button type="button" onClick={() => crawl.setOpen(false)} className="cms-btn cms-btn-sm shrink-0">
                  닫기
                </button>
              </div>

              {running && (
                <>
                  <div className="mt-[18px] flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-bold tabular-nums text-yonsei-navy">
                      {rows.length}명 중 {done}명
                    </p>
                    <p className="text-xs text-content-soft">
                      {currentName ? `${currentName} 교수 받아오는 중…` : '마무리 중…'}
                    </p>
                  </div>
                  <div className="mt-[9px] h-0.5 overflow-hidden bg-surface-border">
                    <div
                      className="h-0.5 bg-yonsei-navy transition-[width] duration-500 ease-out-expo"
                      style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-3">
                    <span className="text-[11.5px] text-content-soft">수집 중에는 이 버튼이 잠깁니다</span>
                    <button type="button" onClick={crawl.stop} className="cms-btn cms-btn-sm">
                      중단
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* 완료 — 총계 한 줄과 분류별 합계. 목록은 아래에 그대로 남는다 */}
            {finished && (
              <div className="mt-4 border-b border-t border-surface-border bg-surface-soft px-6 py-3.5">
                <p className="text-sm font-bold tabular-nums text-yonsei-navy">
                  신규 실적 {totalAdded}건 추가 · {okCount}명 완료
                  {failedCount > 0 ? ` · ${failedCount}명 실패` : ''}
                </p>
                {totalAdded > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-baseline gap-3.5 border-t border-surface-border pt-2.5 text-xs tabular-nums text-content">
                    {SECTION_ORDER.filter((k) => (addedByKey[k] ?? 0) > 0).map((k) => (
                      <span key={k}>
                        {SECTION_LABEL[k]} <strong className="font-bold text-yonsei-navy">{addedByKey[k]}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 부분 실패 — 성공을 먼저 말한 뒤, 실패한 이름과 한 번에 다시 시도 */}
            {finished && failedCount > 0 && (
              <div
                className="flex items-center justify-between gap-3 border-b border-l-2 border-surface-border px-6 py-3"
                style={{ borderLeftColor: DANGER }}
              >
                <p className="text-[12.5px] text-content">
                  <strong className="font-bold">{failedNames.join(' · ')}</strong> 교수는 받아오지
                  못했습니다.
                </p>
                <button type="button" onClick={crawl.retryFailed} className="cms-btn cms-btn-sm shrink-0">
                  실패한 {failedCount}명 모두 다시 시도
                </button>
              </div>
            )}

            {finished && (
              <div className="flex items-center justify-between gap-3 border-b border-surface-border px-6 py-2.5">
                <button
                  type="button"
                  onClick={() => setHideSame((v) => !v)}
                  aria-pressed={hideSame}
                  className="cms-btn cms-btn-sm"
                >
                  {hideSame ? '변경 없는 교수 보기' : '변경 없는 교수 접기'}
                </button>
                <span className="text-[11.5px] tabular-nums text-content-soft">
                  {rows.length}명 중 {okCount}명 완료
                </span>
              </div>
            )}

            <div
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              className={cn('flex-1 overflow-y-auto', running && 'mt-3.5 border-t border-surface-border')}
            >
              {doneRows.map((row) => {
                if (finished && row.state === 'same' && hideSame) return null;
                return (
                  <div key={row.name} data-state={row.state} className="border-b border-surface-border">
                    {row.state === 'added' && (
                      <AddedRow
                        row={row}
                        open={expanded === row.name}
                        onToggle={() => setExpanded(expanded === row.name ? null : row.name)}
                      />
                    )}
                    {row.state === 'same' && (
                      <div className={cn(ROW_GRID, 'border-l-2 border-transparent')}>
                        <span aria-hidden="true" className="text-xs font-extrabold text-[#A8B0BA]">
                          ·
                        </span>
                        <span className="text-[13.5px] font-semibold text-content-soft">
                          {row.name} <span className="font-medium">교수</span>
                        </span>
                        <span className="text-[13px] text-content-soft">변경 없음</span>
                        <span className="whitespace-nowrap text-[12.5px] text-[#A8B0BA]">추가 0건</span>
                        <span />
                      </div>
                    )}
                    {row.state === 'failed' && (
                      <div
                        className={cn(ROW_GRID, 'border-l-2')}
                        style={{ borderLeftColor: DANGER, background: DANGER_SOFT }}
                      >
                        <span aria-hidden="true" className="text-xs font-extrabold" style={{ color: DANGER }}>
                          !
                        </span>
                        <span className="text-[13.5px] font-bold text-content">
                          {row.name} <span className="font-medium text-content-soft">교수</span>
                        </span>
                        <span className="text-[13px]" style={{ color: DANGER }}>
                          받아오지 못함{' '}
                          {row.error && <span className="text-content-soft">· {row.error}</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => crawl.retryOne(row.name)}
                          disabled={running}
                          className="whitespace-nowrap border bg-surface px-2.5 py-[5px] text-xs font-bold disabled:opacity-40"
                          style={{ borderColor: DANGER, color: DANGER }}
                        >
                          이 교수만 다시 시도
                        </button>
                        <span />
                      </div>
                    )}

                    {/* 일부 분류만 실패 — 그 분류는 기존 값을 그대로 뒀다는 뜻 */}
                    {row.missing.length > 0 && row.state !== 'failed' && (
                      <p className="border-t border-surface-border px-[22px] pb-2 pl-[150px] text-[11.5px] text-content-soft">
                        {row.missing.map((k) => SECTION_LABEL[k] ?? k).join('·')} 은(는) 받아오지 못해
                        기존 값을 그대로 두었습니다.
                      </p>
                    )}
                  </div>
                );
              })}

              {running && currentName && (
                <div
                  data-current="true"
                  className="grid grid-cols-[14px_104px_1fr] items-center gap-3 border-b border-l-2 border-surface-border border-l-surface-border bg-surface-soft px-[22px] py-3 pl-5"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-[11px] w-[11px] animate-spin rounded-full border-2 border-surface-border border-t-yonsei-blue"
                  />
                  <span className="text-[13px] font-bold text-content">
                    {currentName} <span className="font-medium text-content-soft">교수</span>
                  </span>
                  <span className="text-[13px] text-content-soft">받아오는 중…</span>
                </div>
              )}
              {running && remaining > 0 && (
                <p className="px-[22px] pb-[22px] pt-3.5 text-xs text-[#A8B0BA]">
                  남은 {remaining}명은 차례가 오면 이 목록에 한 줄씩 추가됩니다.
                </p>
              )}
            </div>

            {finished && (
              <div className="flex items-center justify-between gap-3 border-t border-surface-border px-6 py-3">
                <p className="text-xs text-content-soft">받아온 실적은 기존 기록 뒤에 덧붙습니다.</p>
                <button type="button" onClick={() => crawl.setConfirming(true)} className="cms-btn cms-btn-sm">
                  다시 불러오기
                </button>
              </div>
            )}
          </aside>
        </>
      )}

      {confirming && (
        <CmsModal
          title="교원정보시스템에서 최신 실적을 받아옵니다"
          body={
            <div className="text-[13px] leading-[1.8] text-content">
              <div className="grid grid-cols-[82px_1fr] gap-x-3.5 gap-y-1.5 border-b border-surface-border pb-3.5">
                <span className="text-content-soft">대상</span>
                <span className="font-semibold">교수 {targetCount}명 전체</span>
                <span className="text-content-soft">예상 시간</span>
                <span className="font-semibold">
                  {estimateMin}분 내외{' '}
                  <span className="font-normal text-content-soft">(한 명당 3~5초씩 차례로)</span>
                </span>
              </div>
              <p className="mt-3.5">
                받아온 실적은 <strong className="font-bold">기존 기록에 덧붙이기만 합니다.</strong> 이미
                등록된 실적과 직접 고친 내용은 지워지거나 덮어쓰이지 않습니다.
              </p>
              <p className="mt-2.5 text-[12.5px] text-content-soft">
                한 명씩 끝날 때마다 결과가 목록에 쌓입니다. 진행 중에는 이 창을 닫지 마세요.
              </p>
            </div>
          }
          confirmLabel="수집 시작"
          onConfirm={crawl.startAll}
          onCancel={() => crawl.setConfirming(false)}
        />
      )}
    </>
  );
}
