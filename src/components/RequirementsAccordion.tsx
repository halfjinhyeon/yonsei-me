'use client';

import { useMemo, useState } from 'react';
import { Prose } from './Prose';
import { cn } from '@/lib/utils';
import type { AccordionItem } from './Accordion';

/** 라벨의 학번 숫자들 중 최댓값(대표 연도) — "03~05 학번"→5, "25 학번"→25, 없으면 null */
function cohortYear(label: string): number | null {
  const nums = label.match(/\d{2}/g);
  if (!nums) return null;
  return Math.max(...nums.map(Number));
}

/** 개별 노출할 최신 학번 행 수 — 나머지는 '이전 학번 보기' 그룹으로 접는다 */
const RECENT_COUNT = 4;

/** 아코디언 행 공통 헤더(기존 Accordion 과 동일 문법) */
function RowButton({
  label,
  open,
  onClick,
  small,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center justify-between gap-4 text-left', small ? 'py-4' : 'py-5')}
      aria-expanded={open}
    >
      <span
        className={cn(
          'font-semibold transition-colors',
          small ? 'text-base sm:text-lg' : 'text-lg sm:text-xl',
          open ? 'text-yonsei-navy' : 'text-yonsei-blue',
        )}
      >
        {label}
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className={cn('h-5 w-5 shrink-0 text-yonsei-blue transition-transform duration-300', open && 'rotate-180')}
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** 펼침 영역 공통(grid-rows 트랜지션 — 기존 Accordion 과 동일) */
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-all duration-300 ease-out-expo',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * 학번별 졸업요건 아코디언 — B안 재구성(사용자 결정).
 *
 * 14개 행이 위계 없이 나열되던 문제를: [공통 개요] → [최신 4개 학번(내림차순)] →
 * ['이전 학번 보기' 그룹 1행: 펼치면 옛 학번들이 중첩 아코디언(들여쓰기·얇은 보더)]
 * 3층 구조로 줄인다(14행 → 6행). 데이터(undergraduate-requirements.json)는 손대지
 * 않고 표현 계층에서만 정렬·그룹핑한다.
 * 열림 정책은 기존과 동일하게 층위별 1개(최상위 1 + 그룹 내부 1).
 */
export function RequirementsAccordion({
  items,
  earlierLabel,
}: {
  items: AccordionItem[];
  /** '이전 학번 보기 (03~21 학번)' — 서버(page)에서 로케일 해석해 전달 */
  earlierLabel: string;
}) {
  // 분류: intro(연도 없음) / 학번 행(연도 내림차순 정렬)
  const { intro, recent, earlier } = useMemo(() => {
    const intro = items.filter((it) => cohortYear(it.label) === null);
    const cohorts = items
      .filter((it) => cohortYear(it.label) !== null)
      .sort((a, b) => cohortYear(b.label)! - cohortYear(a.label)!);
    return {
      intro,
      recent: cohorts.slice(0, RECENT_COUNT),
      earlier: cohorts.slice(RECENT_COUNT),
    };
  }, [items]);

  // 최상위 행(개요 + 최신 학번 + 그룹) 중 하나만 열림. 그룹 내부도 하나만.
  const [openTop, setOpenTop] = useState<string | null>(null);
  const [openEarlier, setOpenEarlier] = useState<string | null>(null);

  const topRows = [...intro, ...recent];
  const groupKey = '__earlier__';

  return (
    <div>
      {topRows.map((item) => {
        const open = openTop === item.label;
        return (
          <div key={item.label} className="border-b-2 border-content">
            <RowButton label={item.label} open={open} onClick={() => setOpenTop(open ? null : item.label)} />
            <Collapse open={open}>
              <div className="pb-8">
                <Prose markdown={item.markdown} />
              </div>
            </Collapse>
          </div>
        );
      })}

      {/* 이전 학번 그룹 — 한 행으로 접어 시각적 나열을 줄인다 */}
      {earlier.length > 0 && (
        <div className="border-b-2 border-content">
          <RowButton
            label={earlierLabel}
            open={openTop === groupKey}
            onClick={() => setOpenTop(openTop === groupKey ? null : groupKey)}
          />
          <Collapse open={openTop === groupKey}>
            {/* 내부 중첩 아코디언 — 들여쓰기 + 얇은 헤어라인으로 하위 위계 표현 */}
            <div className="mb-8 border-l-2 border-surface-border pl-5">
              {earlier.map((item) => {
                const open = openEarlier === item.label;
                return (
                  <div key={item.label} className="border-b border-surface-border last:border-b-0">
                    <RowButton
                      small
                      label={item.label}
                      open={open}
                      onClick={() => setOpenEarlier(open ? null : item.label)}
                    />
                    <Collapse open={open}>
                      <div className="pb-6">
                        <Prose markdown={item.markdown} />
                      </div>
                    </Collapse>
                  </div>
                );
              })}
            </div>
          </Collapse>
        </div>
      )}
    </div>
  );
}
