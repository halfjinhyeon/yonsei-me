'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from '@/i18n/navigation';

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
      // 자유 스크롤 홈 섹션 — 자연 높이 + 통일된 상하 리듬(py-section-lg).
      className="full-bleed flex flex-col bg-surface py-section-lg"
    >
      <div className="mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">
        {/* 헤더 행 — 좌: 네이비 라벨 박스(각지게) / 우: ← → 화살표 버튼 2개 */}
        <div className="flex items-center justify-between gap-4">
          <h2
            id="news-events-heading"
            data-reveal
            className="inline-block bg-yonsei-navy px-5 py-2.5 text-lg font-bold text-white"
          >
            {t('newsEvents.title')}
          </h2>

          {/* 카드가 있을 때만 화살표 노출(빈 상태에선 조작 대상이 없음) */}
          {hasItems && (
            <div data-reveal className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollByCard(-1)}
                disabled={!canPrev}
                aria-label={t('newsEvents.prev')}
                className="grid h-10 w-10 place-items-center text-content transition-colors hover:text-yonsei-blue disabled:cursor-not-allowed disabled:text-content-faint disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
              >
                <ArrowIcon dir="left" />
              </button>
              <button
                type="button"
                onClick={() => scrollByCard(1)}
                disabled={!canNext}
                aria-label={t('newsEvents.next')}
                className="grid h-10 w-10 place-items-center text-content transition-colors hover:text-yonsei-blue disabled:cursor-not-allowed disabled:text-content-faint disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
              >
                <ArrowIcon dir="right" />
              </button>
            </div>
          )}
        </div>

        {hasItems ? (
          <>
            {/* 카드 트랙 — 가로 스크롤 + 스냅. no-scrollbar 로 스크롤바 숨김(globals 유틸). */}
            <ul
              ref={trackRef}
              onScroll={updateArrows}
              className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-8 overflow-x-auto scroll-smooth"
            >
              {items.map((item, i) => (
                <li
                  key={`${item.href}-${i}`}
                  data-card
                  className="snap-start w-[78%] shrink-0 sm:w-[46%] lg:w-[calc(25%-24px)]"
                >
                  <NewsEventCard item={item} />
                </li>
              ))}
            </ul>

            {/* 하단 우측 — 자세히보기 → /news */}
            <div data-reveal className="mt-8 flex justify-end">
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
 * 대형 날짜(월 연회색 + 일 진하게) → 가는 구분선 → 분류 라벨(블루) → 제목(1줄 말줄임)
 * → 각진 이미지 프레임(없으면 단색 플레이스홀더 + eagle_empty). hover 시 제목만 블루로.
 */
function NewsEventCard({ item }: { item: NewsEventItem }) {
  const t = useTranslations('home');
  // 'YYYY-MM-DD' 에서 월/일 추출(시안의 대형 날짜 표기).
  const month = item.date.slice(5, 7);
  const day = item.date.slice(8, 10);
  const kindLabel = item.kind === 'news' ? t('newsEvents.kindNews') : t('newsEvents.kindEvent');

  return (
    <Link href={item.href} className="group block">
      {/* 대형 날짜 — 월(연회색) + 일(진하게) 나란히 */}
      <div className="flex items-end gap-2 text-[2.2rem] font-bold leading-none tabular-nums">
        <span className="text-content-faint">{month}</span>
        <span className="text-content">{day}</span>
      </div>

      {/* 가는 수평 구분선 */}
      <div className="mt-3 border-b border-surface-border" />

      {/* 분류 라벨 — 시안의 주황 대신 연세 블루 */}
      <p className="mt-6 text-sm font-bold text-yonsei-blue">{kindLabel}</p>

      {/* 제목 — 한 줄 말줄임, hover 시 블루 전환 */}
      <p className="mt-2 truncate text-lg font-medium text-content transition-colors group-hover:text-yonsei-blue">
        {item.title}
      </p>

      {/* 이미지 — 각진 aspect-[4/3] 프레임. 없으면 단색 블록 + eagle_empty 중앙 배치. */}
      <div className="relative mt-6 aspect-[4/3] w-full overflow-hidden bg-surface-soft">
        {item.image ? (
          <Image
            src={item.image}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 46vw, 78vw"
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

/** 헤더 우측 화살표 아이콘 — 테두리 없는 큰 화살표(SVG). */
function ArrowIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir === 'left' ? (
        <path d="M19 12H5M11 6l-6 6 6 6" />
      ) : (
        <path d="M5 12h14M13 6l6 6-6 6" />
      )}
    </svg>
  );
}
