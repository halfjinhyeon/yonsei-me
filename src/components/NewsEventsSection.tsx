'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from '@/i18n/navigation';
import { FlowLines } from './FlowLines';

// ScrollTrigger 는 무료 public gsap 패키지에 포함(Club 멤버십 불필요).
gsap.registerPlugin(ScrollTrigger);

// SSR 안전 layout effect — 클라이언트에선 페인트 전에 from-state 를 잡아 깜빡임을
// 막고, 서버 렌더 시 useLayoutEffect 경고를 피한다(LabsSection 동일 패턴).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// 카드 사이 gap(=gap-8, 32px). 화살표 스크롤 스텝(카드 1장 폭 + gap) 계산에 쓴다.
const CARD_GAP = 32;

export interface NewsEventItem {
  date: string; // 'YYYY-MM-DD'
  title: string;
  image?: string;
  href: string;
  kind: 'news' | 'event';
}

/**
 * 뉴스 & 행사 단독 섹션 — 홍익대 조형대학 '뉴스&이벤트' 시안을 연세 톤(네이비/블루,
 * 각진 스타일)으로 옮긴 리디자인. 위→아래:
 *  - 헤더 행: 좌측 네이비 라벨 박스(제목) / 우측 ← → 화살표 버튼 2개.
 *  - 카드 트랙: 가로 스크롤(스크롤-스냅) 4열. 각 카드는 대형 날짜 → 구분선 →
 *    분류 라벨(뉴스/행사) → 제목 → 각진 이미지 프레임 순. 카드 전체가 게시물 Link.
 *  - 하단 우측: '자세히보기 →' → /news.
 *
 * 데이터는 page.tsx(서버 컴포넌트)가 news + board.events 를 합쳐 props 로 넘긴다.
 * 자동재생 없음 — 시안대로 화살표/스와이프 수동 조작만.
 *
 * 진입 애니메이션(ScrollTrigger 1회, 다른 홈 섹션과 동일): 헤더 y:24 스태거 상승 +
 * 카드 stagger 0.06. reduced-motion 시 gsap.set 을 걸지 않아 정적으로 노출된다.
 */
export function NewsEventsSection({ items }: { items: NewsEventItem[] }) {
  const t = useTranslations('home');
  const tStub = useTranslations('stub');
  const rootRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLUListElement | null>(null);
  // 트랙 양끝 도달 여부 → 화살표 disabled 갱신에 사용.
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const hasItems = items.length > 0;

  // 스크롤 위치로 화살표 활성/비활성 계산. 초기·리사이즈·스크롤마다 호출한다.
  const updateArrows = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const { scrollLeft, scrollWidth, clientWidth } = track;
    setCanPrev(scrollLeft > 1);
    // 부동소수 오차로 끝에서 1px 남는 경우가 있어 여유(1px)를 둔다.
    setCanNext(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // 카드 1장 폭 + gap 만큼 좌/우로 부드럽게 스크롤. 카드가 없거나 트랙이 없으면 무시.
  const scrollByCard = useCallback((dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const firstCard = track.querySelector<HTMLElement>('[data-card]');
    const step = firstCard ? firstCard.offsetWidth + CARD_GAP : track.clientWidth;
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
  }, []);

  // 마운트·리사이즈 시 화살표 상태 초기화(카드 유무와 무관하게 안전).
  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [updateArrows, hasItems]);

  // 헤더·카드 진입 리빌 — LabsSection 과 동일한 set+to 플래시 방지 패턴.
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // 모션 최소화 선호 → gsap.set 을 걸지 않아 콘텐츠가 정적으로 그대로 보이게 둔다.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      const heads = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
      const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-card]'));

      if (heads.length) gsap.set(heads, { y: 24, autoAlpha: 0 });
      if (cards.length) gsap.set(cards, { y: 24, autoAlpha: 0 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: 'top 75%', once: true },
      });
      if (heads.length) {
        tl.to(heads, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out' }, 0);
      }
      if (cards.length) {
        tl.to(cards, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.06, ease: 'power3.out' }, 0.15);
      }
    }, root);

    // context.revert() 가 트윈 kill + 인라인 스타일 원복 + ScrollTrigger 정리를 함께 처리.
    return () => ctx.revert();
  }, [hasItems]);

  return (
    <section
      ref={rootRef}
      aria-labelledby="news-events-heading"
      // 자유 스크롤 홈 섹션 — 자연 높이 + 통일된 상하 리듬(모바일 py-12, sm+ py-section-lg).
      className="full-bleed relative flex flex-col bg-surface py-12 sm:py-section-lg"
    >
      {/* 배경 유선 장식(Cornell CHE) — 상단 패딩·헤더 행의 '기존' 여백에만 겹치는 0-높이
          absolute 레이어(자체 높이를 가지는 스트립 금지 — 사용자 지시). 카드 텍스트에
          닿기 전에 아래로 마스크 소멸. 콘텐츠 컨테이너가 relative 라 항상 텍스트 뒤. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 hidden h-56 overflow-hidden sm:block lg:h-64"
      >
        <FlowLines
          variant="sweep"
          gid="flow-news"
          viewBox="0 150 1512 380"
          className="absolute inset-0 h-full w-full -scale-x-100 opacity-10 [-webkit-mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)] [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]"
        />
      </div>
      <div className="relative mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">
        {/* 헤더 행 — 좌: 네이비 라벨 박스(각지게) / 사이: 헤어라인(학과 목표 섹션과
            동일한 선 문법) / 우: ← → 화살표 버튼 2개 */}
        <div className="flex items-center gap-6">
          <h2
            id="news-events-heading"
            data-reveal
            className="inline-block bg-yonsei-navy px-4 py-2 text-base font-bold text-white sm:px-5 sm:py-2.5 sm:text-lg"
          >
            {t('newsEvents.title')}
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-surface-border" />

          {/* 카드가 있을 때만 화살표 노출(빈 상태에선 조작 대상이 없음) */}
          {hasItems && (
            <div data-reveal className="flex items-center gap-2.5">
              <CircleArrowButton
                dir="left"
                onClick={() => scrollByCard(-1)}
                disabled={!canPrev}
                label={t('newsEvents.prev')}
              />
              <CircleArrowButton
                dir="right"
                onClick={() => scrollByCard(1)}
                disabled={!canNext}
                label={t('newsEvents.next')}
              />
            </div>
          )}
        </div>

        {hasItems ? (
          <>
            {/* 카드 트랙 — 가로 스크롤 + 스냅. no-scrollbar 로 스크롤바 숨김(globals 유틸). */}
            <ul
              ref={trackRef}
              onScroll={updateArrows}
              className="no-scrollbar mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth sm:mt-[35px] sm:gap-8"
            >
              {items.map((item, i) => (
                <li
                  key={`${item.href}-${i}`}
                  data-card
                  // 모바일 카드 2장 보이게(48%) — 캐러셀 어포던스 확보(데스크톱 모드의 밀도 재현)
                  className="snap-start w-[48%] shrink-0 sm:w-[46%] lg:w-[calc(25%-24px)]"
                >
                  <NewsEventCard item={item} />
                </li>
              ))}
            </ul>

            {/* 하단 우측 — 자세히보기 → /news */}
            <div data-reveal className="mt-6 flex justify-end sm:mt-8">
              <Link
                href="/news"
                className="group inline-flex items-center gap-2 text-sm font-bold text-content transition-colors hover:text-yonsei-blue"
              >
                {t('newsEvents.more')}
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
          </>
        ) : (
          // 빈 상태 — 기존 빈 게시판 관례(eagle_empty 마스코트 + stub.empty 문구).
          <div data-reveal className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/eagle_empty.png" alt="" aria-hidden="true" className="h-20 w-auto opacity-70" />
            <p className="text-sm font-medium text-content-faint">{tStub('empty')}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * 카드 한 장 — 카드 전체가 게시물로 가는 Link. 위→아래:
 * 날짜(YYYY. MM. DD 한 줄) → 가는 구분선 → 분류 라벨(블루) → 제목(1줄 말줄임)
 * → 각진 이미지 프레임(없으면 단색 플레이스홀더 + eagle_empty). hover 시 제목만 블루로.
 */
function NewsEventCard({ item }: { item: NewsEventItem }) {
  const t = useTranslations('home');
  // 'YYYY-MM-DD' → 'YYYY. MM. DD' 한 줄 포맷(사용자 결정 — 같은 크기 숫자 두 개가
  // 나란히 있던 대형 표기(07 07)는 중복처럼 읽혀 폐기).
  const [year, month, day] = item.date.split('-');
  const kindLabel = item.kind === 'news' ? t('newsEvents.kindNews') : t('newsEvents.kindEvent');

  return (
    <Link href={item.href} className="group block">
      {/* 날짜 — 한 줄 포맷, 명료한 중간 크기(모바일은 카드 2장 밀도에 맞춰 축소) */}
      <p className="text-sm font-semibold leading-none tabular-nums text-content sm:text-lg">
        {year}. {month}. {day}
      </p>

      {/* 가는 수평 구분선 */}
      <div className="mt-3 border-b border-surface-border sm:mt-[7px]" />

      {/* 분류 라벨 — 시안의 주황 대신 연세 블루 */}
      <p className="mt-3 text-xs font-bold text-yonsei-blue sm:mt-[19px] sm:text-sm">{kindLabel}</p>

      {/* 제목 — 한 줄 말줄임, hover 시 블루 전환 */}
      <p className="mt-1.5 truncate text-sm font-medium text-content transition-colors group-hover:text-yonsei-blue sm:mt-2 sm:text-lg">
        {item.title}
      </p>

      {/* 이미지 — 각진 aspect-[4/3] 프레임. 없으면 단색 블록 + eagle_empty 중앙 배치. */}
      <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden bg-surface-soft sm:mt-6">
        {item.image ? (
          <Image
            src={item.image}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 46vw, 48vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/eagle_empty.png" alt="" aria-hidden="true" className="h-14 w-auto opacity-60" />
          </div>
        )}
      </div>
    </Link>
  );
}

/** 캐러셀 이동 버튼 — 원형 보더 + 셰브런. 학과 일정 위젯(HomeCalendarPanel)의
 *  버튼 문법을 그대로 승격한 공용판(뉴스&행사·연구실·진로 분야). 이전의 긴 화살표
 *  아이콘(ArrowIcon)은 이 버튼으로 대체되어 삭제했다. */
export function CircleArrowButton({
  dir,
  onClick,
  disabled,
  label,
}: {
  dir: 'left' | 'right';
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-[35px] w-[35px] place-items-center rounded-full border border-content/40 text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
    >
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
    </button>
  );
}
