'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** 로케일 해석이 끝난 학과 일정 한 건 */
export interface CalendarSectionItem {
  href: string;
  /** 날짜/기간 표기(예: "7/20~7/24", "26.09.15") — 이미 로케일 해석·폴백 완료 */
  dateLabel: string;
  title: string;
}

/**
 * 학과 일정 — 이화여대 'CALENDAR' 시안을 연세 톤(네이비, 각진 스타일)으로 이식한 카드 캐러셀.
 *
 * bare=true 면 자체 section 없이 [소제목 행 + 카드 트랙]만 반환한다 — 상위 '공지&일정'
 * 통합 섹션(NoticeSection)에 임베드하기 위함(사용자 지시로 두 섹션 통합). 소제목 행은
 * [네이비 사각 마커 + 제목 ─ 헤어라인 ─ ‹ › 화살표]로, NoticeSection 의 '공지사항' 소제목과
 * 같은 장치를 써 두 반쪽을 형제로 묶고 구분선·캐러셀 컨트롤 역할을 겸한다(별도 하단 행 없음).
 * standalone(bare=false)이면 네이비 박스 제목 헤더 + VIEW MORE + 하단 화살표 행의 풀블리드 섹션.
 *
 * 구성(시안 그대로):
 *  - 헤더 행(standalone 만): 좌측 네이비 박스 제목 + 헤어라인 / 우측 'VIEW MORE ›'(행사 게시판).
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
  bare = false,
}: {
  items: CalendarSectionItem[];
  title: string;
  viewMoreLabel: string;
  viewMoreHref: string;
  prevLabel: string;
  nextLabel: string;
  emptyLabel: string;
  /** true 면 자체 section/헤더 없이 본문만 반환(상위 '공지&일정' 섹션 임베드용) */
  bare?: boolean;
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

  // 원형 화살표 버튼 공통 클래스 — bare(소형)·standalone(대형) 크기만 다르다.
  const arrowBtnClass =
    'grid place-items-center rounded-full border border-content/40 text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue';

  // 캐러셀 화살표 한 쌍 — bare(소제목 행 우측, h-9)·standalone(하단 행, h-11) 공용.
  const arrows = (size: 'sm' | 'lg') => (
    <div className={cn('flex shrink-0 items-center', size === 'sm' ? 'gap-2.5' : 'gap-3')}>
      <button
        type="button"
        onClick={() => scrollByCard(-1)}
        disabled={!canPrev}
        aria-label={prevLabel}
        className={cn(arrowBtnClass, size === 'sm' ? 'h-9 w-9' : 'h-11 w-11')}
      >
        <ArrowSmall dir="left" />
      </button>
      <button
        type="button"
        onClick={() => scrollByCard(1)}
        disabled={!canNext}
        aria-label={nextLabel}
        className={cn(arrowBtnClass, size === 'sm' ? 'h-9 w-9' : 'h-11 w-11')}
      >
        <ArrowSmall dir="right" />
      </button>
    </div>
  );

  // 본문(트랙 + 화살표 / 빈 상태) — bare·standalone 공통. standalone 은 위에 헤더가 붙는다.
  const body = (
    <>
      {/* 헤더(standalone 만) — 네이비 박스 제목 + 헤어라인 / 우측 VIEW MORE(시안). */}
      {!bare && (
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
      )}

      {/* 소제목 행(bare 만) — [네이비 사각 마커 + 제목 ─ 헤어라인 ─ ‹ › 화살표].
          NoticeSection '공지사항' 소제목과 같은 마커 장치로 두 반쪽을 형제로 묶는다.
          헤어라인이 공지 리스트와의 구분선을, 우측 화살표가 캐러셀 컨트롤을 겸한다. */}
      {bare && (
        <div className="flex items-center gap-5">
          <h3 className="flex shrink-0 items-center gap-2.5 text-base font-bold text-content">
            <span aria-hidden="true" className="h-2 w-2 bg-yonsei-navy" />
            {title}
          </h3>
          <span aria-hidden="true" className="h-px flex-1 bg-surface-border" />
          {hasItems && arrows('sm')}
        </div>
      )}

      {hasItems ? (
        <>
          {/* 카드 트랙 — 가로 스크롤 + 스냅. 카드 사이 세로 구분선(border-l), 첫 카드는 제외.
              no-scrollbar 로 스크롤바 숨김(globals 유틸). items-stretch(flex 기본)로
              구분선이 카드 높이만큼 균일하게 뻗는다.
              ⚠️ overflow-x-auto 는 CSS 규칙상 overflow-y 도 auto(세로 클리핑)로 만든다.
              hover 시 카드가 위로 떠오를 때 트랙 상단에 잘려 '흰색 마스킹'이 생기므로,
              pt-2 로 클립 안쪽에 리프트 여유공간을 둔다(패딩 영역은 클립되지 않음).
              mt 를 그만큼 줄여 구분선 아래 시각적 간격은 이전과 동일(mt-8+pt-2=40px 등). */}
          <ul
            ref={trackRef}
            onScroll={updateArrows}
            className={cn(
              'no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth pt-3',
              // bare 는 소제목 행 바로 아래라 여백을 좁게, standalone 은 기존 리듬 유지
              bare ? 'mt-4 lg:mt-5' : 'mt-7 lg:mt-9',
            )}
          >
            {items.map((item, i) => (
              <li
                key={`${item.href}-${i}`}
                data-card
                className="w-[70%] shrink-0 snap-start border-l border-surface-border pl-6 pr-6 first:border-l-0 first:pl-0 sm:w-[42%] lg:w-1/4"
              >
                {/* hover: 카드 내용이 약간 위로 떠오르며 색이 바뀐다(이화여대 CALENDAR 이식).
                    트랙의 pt-2 여유공간 덕에 떠오를 때 위쪽이 잘리지 않는다(흰색 마스킹 해결). */}
                <Link
                  href={item.href}
                  className="group block transition duration-300 ease-out hover:-translate-y-1.5"
                >
                  {/* 날짜 pill — 네이비 → hover 시 블루로 색 변화. 기간 표기가 길어도 한 줄 유지. */}
                  <span className="inline-block whitespace-nowrap rounded-full bg-yonsei-navy px-4 py-1.5 text-sm font-bold tabular-nums text-white transition-colors duration-300 group-hover:bg-yonsei-blue">
                    {item.dateLabel}
                  </span>
                  {/* 제목 — 2줄 말줄임, hover 시 블루 전환 */}
                  <p className="mt-6 line-clamp-2 text-lg font-bold leading-snug text-content transition-colors duration-300 group-hover:text-yonsei-blue">
                    {item.title}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {/* 하단 행(standalone 만) — 가로 헤어라인 + 우측 원형 화살표(시안).
              bare 모드는 화살표가 소제목 행으로 올라가 이 행을 렌더하지 않는다. */}
          {!bare && (
            <div className="mt-8 flex items-center gap-6">
              <span aria-hidden="true" className="h-px flex-1 bg-content/30" />
              {arrows('lg')}
            </div>
          )}
        </>
      ) : (
        // 빈 상태 — 기존 빈 게시판 관례(eagle_empty 마스코트 + 안내 문구).
        <div className="mt-10 flex flex-col items-center justify-center gap-4 py-16 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/eagle_empty.png" alt="" aria-hidden="true" className="h-16 w-auto opacity-70" />
          <p className="text-sm font-medium text-content-faint">{emptyLabel}</p>
        </div>
      )}
    </>
  );

  // bare: 상위 '공지&일정' 섹션에 구분선 아래로 임베드 — 자체 section/컨테이너 없이 본문만.
  if (bare) return body;

  return (
    <section aria-labelledby="calendar-heading" className="full-bleed bg-surface py-section-lg">
      <div className="mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">{body}</div>
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
