'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from '@/i18n/navigation';
import { sectionTabHref } from '@/lib/board-links';
import { FlowLines } from '@/components/FlowLines';
import { LabCarousel, type LabCarouselHandle } from '@/components/LabCarousel';
import { CircleArrowButton } from '@/components/NewsEventsSection';
import type { LabDirectoryEntry } from '@/lib/faculty';
import type { Locale } from '@/i18n/routing';

// ScrollTrigger 는 무료 public gsap 패키지에 포함(Club 멤버십 불필요).
gsap.registerPlugin(ScrollTrigger);

// SSR 안전 layout effect — 클라이언트에선 페인트 전에 from-state 를 잡아 깜빡임을
// 막고, 서버 렌더 시 useLayoutEffect 경고를 피한다.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 연구실 쇼케이스 — 홍익대 조형대학 사이트 레퍼런스를 연세 톤으로 옮긴 리디자인.
 * 흰 배경 위 네이비 미니멀 구성으로, 위→아래 2블록:
 *  1) 컴팩트 헤더: 아이브로우 + 제목 + 한 줄 요약 + CTA(좌), 네이비 독수리 실루엣(우 포인트)
 *  2) 기존 LabCarousel(무변경): 연구실 카드 가로 캐러셀.
 *  (구 대형 영문 마퀴 "ENGINEERING IN MOTION" 은 삭제 — 사용자 지시. 자리에 새 섹션
 *   추가 예정, 별도 지시 대기.)
 *
 * page.tsx(서버 컴포넌트)가 넘기던 labs/locale 을 그대로 받아 캐러셀에 전달한다.
 * LabCarousel 은 수정 금지 대상이라 여기서 감싸기만 한다.
 *
 * 진입 애니메이션(ScrollTrigger 1회): 섹션이 뷰포트 75% 에 닿으면 헤더 텍스트가
 * 아래에서 스태거로 솟아오르고([data-reveal]), 독수리 워터마크가 은은히 페이드인한다.
 * reduced-motion 시 전부 정지.
 */
export function LabsSection({ labs, locale }: { labs: LabDirectoryEntry[]; locale: Locale }) {
  const t = useTranslations('home');
  const rootRef = useRef<HTMLElement | null>(null);
  // 헤더 화살표 → 캐러셀 넘기기(카드 1장 피치)
  const carouselRef = useRef<LabCarouselHandle | null>(null);

  // 헤더 진입 리빌 — 텍스트 스태거 + 독수리 페이드인(각진 사진 리빌 로직은 제거).
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // 모션 최소화 선호 → gsap.set 을 걸지 않아 콘텐츠가 정적으로 그대로 보이게 둔다.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      // 선택자 스코프 혼동을 피하려 실제 노드 배열을 넘긴다(gsap.utils.toArray 는 미스코프).
      const texts = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
      const eagle = root.querySelector<HTMLElement>('[data-reveal-eagle]');

      // set + to: 트리거 전에 완성 상태가 잠깐 보였다 사라지는 플래시 방지.
      if (texts.length) gsap.set(texts, { y: 24, autoAlpha: 0 });
      // 워터마크의 옅음은 배경색 알파(bg-*/10)로 만들었으므로 autoAlpha 는 요소 자체의
      // 등장(0→1)만 담당한다. opacity 유틸을 안 쓰는 이유가 이 충돌 회피다.
      if (eagle) gsap.set(eagle, { autoAlpha: 0 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: 'top 75%', once: true },
      });
      if (eagle) tl.to(eagle, { autoAlpha: 1, duration: 0.9, ease: 'power2.out' }, 0);
      if (texts.length) {
        tl.to(texts, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out' }, 0.1);
      }
    }, root);

    // context.revert() 가 트윈 kill + 인라인 스타일 원복 + ScrollTrigger 정리를 함께 처리
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      aria-labelledby="labs-heading"
      // 자유 스크롤 홈 섹션 — 자연 높이 + 통일된 상하 리듬(모바일 py-12, sm+ py-section-lg).
      // full-bleed 는 마퀴/캐러셀이 뷰포트 폭을 쓰기 위해 유지하되, 헤더·CTA 는 내부 max-w 컨테이너 정렬.
      className="full-bleed relative flex flex-col bg-surface py-12 sm:py-section-lg"
    >
      {/* 배경 유선 장식(Cornell CHE, 소용돌이) — 하단 패딩·CTA 행의 '기존' 여백 좌측 모서리를
          채우는 0-높이 absolute 레이어(신규 여백 금지 — 사용자 지시). 위·오른쪽으로 마스크
          소멸. 섹션 overflow 는 캐러셀 보호를 위해 건드리지 않고 래퍼에서만 클립. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block">
        <FlowLines
          variant="swirl"
          gid="flow-labs"
          viewBox="-180 230 900 520"
          preserve="xMinYMax slice"
          className="absolute left-0 bottom-[-40px] h-[430px] w-[54%] max-w-[660px] opacity-30 [-webkit-mask-image:linear-gradient(to_right,black_45%,transparent_88%)] [mask-image:linear-gradient(to_right,black_45%,transparent_88%)] lg:h-[470px]"
        />
      </div>
      {/* 1) 컴팩트 헤더 — 컨테이너 정렬. relative 는 우측 독수리 워터마크의 기준점. */}
      <div className="relative mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">
        <div className="relative">
          {/* 우측 포인트: 대형 네이비 독수리 워터마크(장식). 옅음은 배경 알파로,
              등장은 [data-reveal-eagle] 페이드인으로. 좁은 화면에선 숨겨 여백을 아낀다.
              다크모드에선 네이비가 배경에 묻혀 안 보이므로 밝은 블루로 대체.
              top 오프셋: 헤더보다 뒤에 그려지는 캐러셀(relative)이 하단을 가리지 않도록
              섹션 상단 여백 쪽으로 끌어올린 값(실측 — sm 오버랩 28px, lg 68px 해소). */}
          <span
            data-reveal-eagle
            aria-hidden="true"
            className="eagle-mask pointer-events-none absolute -top-16 right-0 hidden h-44 w-44 bg-yonsei-navy/10 dark:bg-yonsei-blue/15 sm:block lg:-top-24 lg:h-56 lg:w-56"
          />

          {/* 제목 — 뉴스&행사 섹션과 동일한 네이비 라벨 박스(각지게) + 오른쪽으로 뻗는
              헤어라인 + 우측 캐러셀 화살표(뉴스&행사와 동일 문법). */}
          <div className="flex items-center gap-6">
            <h2
              id="labs-heading"
              data-reveal
              className="inline-block bg-yonsei-navy px-4 py-2 text-base font-bold text-white sm:px-5 sm:py-2.5 sm:text-lg"
            >
              {t('people.intro.label')}
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-surface-border" />
            <div data-reveal className="flex items-center gap-2.5">
              <CircleArrowButton
                dir="left"
                onClick={() => carouselRef.current?.nudge(-1)}
                label={t('newsEvents.prev')}
              />
              <CircleArrowButton
                dir="right"
                onClick={() => carouselRef.current?.nudge(1)}
                label={t('newsEvents.next')}
              />
            </div>
          </div>

          {/* 한 줄 요약 — 본문 최소화(기존 2문단 → 1문장). CTA 는 캐러셀 하단으로 이동. */}
          <p data-reveal className="mt-4 max-w-2xl text-sm text-content-soft sm:mt-5 sm:text-base">
            {t('people.intro.tagline')}
          </p>
        </div>
      </div>

      {/* 2) 캐러셀 — 카드 디자인 무변경(모바일 185px 고정폭이 이미 2장+ 밀도).
          relative: 배경 유선 장식 위에 그려지도록(장식은 항상 콘텐츠 뒤). */}
      <div className="relative mt-6 sm:mt-8 lg:mt-10">
        <LabCarousel ref={carouselRef} labs={labs} locale={locale} />
      </div>

      {/* CTA — 캐러셀 하단 우측(뉴스&행사 섹션과 동일한 위치·정렬) */}
      <div className="relative mx-auto mt-6 flex w-full max-w-[1360px] justify-end px-6 sm:mt-8 sm:px-10 lg:px-16">
        <Link
          data-reveal
          href={sectionTabHref('research', 'labs')}
          className="group inline-flex items-center gap-2 text-sm font-bold text-content transition-colors hover:text-yonsei-blue"
        >
          {t('people.cta')}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
