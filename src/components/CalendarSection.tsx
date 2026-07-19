'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';

/** 로케일 해석이 끝난 학과 일정 한 건 */
export interface CalendarSectionItem {
  href: string;
  /** 날짜/기간 표기(예: "7/20~7/24", "26.09.15") — 이미 로케일 해석·폴백 완료 */
  dateLabel: string;
  title: string;
}

/**
 * 학과 일정 섹션 — 이화여대 'CALENDAR' 시안을 연세 톤(네이비, 각진 스타일)으로 이식.
 * 위치: 홈 '학과 목표' 바로 아래(사용자 지시).
 *
 * 구성(시안 그대로):
 *  - 헤더 행: 좌측 네이비 박스 제목(다른 홈 섹션과 통일) + 헤어라인 / 우측 'VIEW MORE ›'(행사 게시판으로 이동).
 *  - 카드 트랙: 가로 스크롤(스냅) — 각 카드 = 날짜 pill(시안의 빨강 대신 연세 네이비)
 *    → 제목(2줄 말줄임). 카드 사이 세로 구분선(border-l), 카드 전체가 게시물 Link.
 *  - 하단: 가로 헤어라인 + 우측 원형 이전/다음 화살표 버튼(양끝 도달 시 비활성).
 *
 * 데이터는 page.tsx(서버)가 행사 게시판 + 동문 행사를 합쳐 props 로 넘긴다. 자동재생 없음.
 * 캐러셀 로직은 NewsEventsSection 과 동일 패턴(스크롤 위치로 화살표 활성/비활성 계산).
 * reduced-motion: 별도 진입 애니메이션이 없어 정적으로 그대로 노출된다.
 */
export function CalendarSection({
  items,
  title,
  viewMoreLabel,
  viewMoreHref,
  prevLabel,
  nextLabel,
  emptyLabel,
}: {
  items: CalendarSectionItem[];
  title: string;
  viewMoreLabel: string;
  viewMoreHref: string;
  prevLabel: string;
  nextLabel: string;
  emptyLabel: string;
}) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  // 트랙 양끝 도달 여부 → 화살표 disabled 갱신.
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const hasItems = items.length > 0;

  const updateArrows = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const { scrollLeft, scrollWidth, clientWidth } = track;
    setCanPrev(scrollLeft > 1);
    // 부동소수 오차로 끝에서 1px 남는 경우가 있어 여유(1px)를 둔다.
    setCanNext(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // 카드 1장 폭만큼 좌/우로 부드럽게 스크롤(카드 사이 gap 없이 border 로 구분).
  const scrollByCard = useCallback((dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const firstCard = track.querySelector<HTMLElement>('[data-card]');
    const step = firstCard ? firstCard.offsetWidth : track.clientWidth;
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
  }, []);

  // 마운트·리사이즈 시 화살표 상태 초기화.
  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [updateArrows, hasItems]);

  // 위 학과 공지 섹션과의 사이 여백을 60%로 축소 — pt 를 section-lg 의 60%(clamp)로(사용자 지시).
  return (
    <section
      aria-labelledby="calendar-heading"
      className="full-bleed bg-surface pt-[clamp(2.7rem,6vh,4.8rem)] pb-section-lg"
    >
      <div className="mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">
        {/* 헤더 — 다른 홈 섹션(학과 목표·뉴스&행사)과 동일한 네이비 박스 제목 + 헤어라인 /
            우측 VIEW MORE(시안) */}
        <div className="flex items-center gap-6">
          <h2
            id="calendar-heading"
            className="inline-block bg-yonsei-navy px-5 py-2.5 text-lg font-bold text-white"
          >
            {title}
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-surface-border" />
          <Link
            href={viewMoreHref}
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-content transition-colors hover:text-yonsei-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
          >
            {viewMoreLabel}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              ›
            </span>
          </Link>
        </div>

        {hasItems ? (
          <>
            {/* 카드 트랙 — 가로 스크롤 + 스냅. 카드 사이 세로 구분선(border-l), 첫 카드는 제외.
                no-scrollbar 로 스크롤바 숨김(globals 유틸). items-stretch(flex 기본)로
                구분선이 카드 높이만큼 균일하게 뻗는다. */}
            <ul
              ref={trackRef}
              onScroll={updateArrows}
              className="no-scrollbar mt-10 flex snap-x snap-mandatory overflow-x-auto scroll-smooth lg:mt-12"
            >
              {items.map((item, i) => (
                <li
                  key={`${item.href}-${i}`}
                  data-card
                  className="w-[70%] shrink-0 snap-start border-l border-surface-border pl-6 pr-6 first:border-l-0 first:pl-0 sm:w-[42%] lg:w-1/4"
                >
                  <Link href={item.href} className="group block">
                    {/* 날짜 pill — 시안의 빨강 대신 연세 네이비. 기간 표기가 길어도 한 줄 유지. */}
                    <span className="inline-block whitespace-nowrap rounded-full bg-yonsei-navy px-4 py-1.5 text-sm font-bold tabular-nums text-white">
                      {item.dateLabel}
                    </span>
                    {/* 제목 — 2줄 말줄임, hover 시 블루 전환 */}
                    <p className="mt-6 line-clamp-2 text-lg font-bold leading-snug text-content transition-colors group-hover:text-yonsei-blue">
                      {item.title}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>

            {/* 하단 — 가로 헤어라인 + 우측 원형 화살표 2개(시안) */}
            <div className="mt-8 flex items-center gap-6">
              <span aria-hidden="true" className="h-px flex-1 bg-content/30" />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => scrollByCard(-1)}
                  disabled={!canPrev}
                  aria-label={prevLabel}
                  className="grid h-11 w-11 place-items-center rounded-full border border-content/40 text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
                >
                  <ArrowSmall dir="left" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollByCard(1)}
                  disabled={!canNext}
                  aria-label={nextLabel}
                  className="grid h-11 w-11 place-items-center rounded-full border border-content/40 text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
                >
                  <ArrowSmall dir="right" />
                </button>
              </div>
            </div>
          </>
        ) : (
          // 빈 상태 — 기존 빈 게시판 관례(eagle_empty 마스코트 + 안내 문구).
          <div className="mt-10 flex flex-col items-center justify-center gap-4 py-16 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/eagle_empty.png" alt="" aria-hidden="true" className="h-16 w-auto opacity-70" />
            <p className="text-sm font-medium text-content-faint">{emptyLabel}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** 원형 버튼 내부 화살표 — 시안의 가는 홑화살표(각진 라운드). */
function ArrowSmall({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      {dir === 'left' ? (
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
