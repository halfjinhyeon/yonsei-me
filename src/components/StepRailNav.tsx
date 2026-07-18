'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface StepRailItem {
  id: string;
  num: string;
  title: string;
}

/**
 * STEP 스크롤 목차 — 데스크톱은 좌측 sticky 세로 목록(본문과 세로 구분선), 모바일은
 * 상단 sticky 가로 칩 행. IntersectionObserver 스크롤스파이로 화면 위치에 따라
 * 활성 항목이 따라오고, 항목 클릭 시 해당 STEP 으로 부드럽게 스크롤한다.
 *
 * 항목은 <a href="#..."> 가 아니라 <button> + scrollIntoView 다 — TabbedContent 가
 * 문서 레벨 클릭 리스너로 같은 경로의 해시 앵커를 탭 전환(#requirements 등)에 쓰므로,
 * 앵커를 쓰면 그 리스너·주소창 해시와 얽힌다. 스크롤 오프셋은 섹션의 scroll-mt 가
 * 처리한다.
 *
 * 반환은 형제 2개(데스크톱 aside + 모바일 칩 행): 부모(GraduateRequirementSteps)가
 * lg 에서 grid 인데 display:none 요소는 grid 아이템이 되지 않으므로 — lg 에선
 * aside(1열)와 본문(2열)만, 모바일에선 칩 행과 본문만 흐름에 남아 열 배치가
 * 어긋나지 않는다.
 */
export function StepRailNav({
  items,
  ariaLabel = '졸업요건 단계',
}: {
  items: StepRailItem[];
  ariaLabel?: string;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  // 스크롤스파이 — 교차 중인 섹션 id 집합을 유지하고 문서 순서상 첫 항목을 활성으로.
  // rootMargin 은 뷰포트 상단 30%~하단 45% 사이 띠를 판정 구간으로 쓴다.
  useEffect(() => {
    const els = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = items.find((it) => visible.has(it.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: '-30% 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActiveId(id);
  };

  return (
    <>
      {/* 데스크톱 — 좌측 sticky 목차. top-36 = sticky 스택(헤더 5rem + 남색 탭 바 3rem)
          아래 1rem 여유. aside 의 border-r 가 시안의 세로 구분선(열 전체 높이). */}
      <aside className="hidden lg:block lg:border-r lg:border-surface-border lg:pr-8">
        <nav aria-label={ariaLabel} className="sticky top-36 py-10">
          <ul>
            {items.map((it) => {
              const active = it.id === activeId;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => goTo(it.id)}
                    aria-current={active ? 'true' : undefined}
                    className="group flex w-full items-baseline gap-5 py-2.5 text-left"
                  >
                    <span
                      className={cn(
                        'w-6 shrink-0 text-xs font-semibold tabular-nums',
                        active ? 'text-yonsei-blue' : 'text-content-faint',
                      )}
                    >
                      {it.num}
                    </span>
                    <span
                      className={cn(
                        'text-[15px] transition-colors',
                        active
                          ? 'font-bold text-yonsei-navy'
                          : 'font-medium text-content-soft group-hover:text-yonsei-blue',
                      )}
                    >
                      {it.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* 모바일 — 상단 sticky 칩 행. top-28(=7rem)은 헤더 4rem + 남색 탭 바 3rem 바로
          아래, z-20 은 탭 바(z-30)보다 아래 층이다. */}
      <div className="sticky top-28 z-20 border-b border-surface-border bg-surface/95 backdrop-blur lg:hidden">
        <nav aria-label={ariaLabel} className="flex gap-1 overflow-x-auto">
          {items.map((it) => {
            const active = it.id === activeId;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => goTo(it.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
                  active
                    ? 'border-yonsei-navy font-bold text-yonsei-navy'
                    : 'border-transparent text-content-soft',
                )}
              >
                {it.num} {it.title}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
