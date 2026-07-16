'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from '@/i18n/navigation';
import { LabCarousel } from '@/components/LabCarousel';
import { cn } from '@/lib/utils';
import type { LabDirectoryEntry } from '@/lib/faculty';
import type { Locale } from '@/i18n/routing';

// ScrollTrigger 는 무료 public gsap 패키지에 포함(Club 멤버십 불필요).
gsap.registerPlugin(ScrollTrigger);

// SSR 안전 layout effect — 클라이언트에선 페인트 전에 from-state 를 잡아 깜빡임을
// 막고, 서버 렌더 시 useLayoutEffect 경고를 피한다.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 연구실 쇼케이스 — 홍익대 조형대학 사이트 레퍼런스를 연세 톤으로 옮긴 리디자인.
 * 흰 배경 위 네이비 미니멀 구성으로, 위→아래 3블록:
 *  1) 컴팩트 헤더: 아이브로우 + 제목 + 한 줄 요약 + CTA(좌), 네이비 독수리 실루엣(우 포인트)
 *  2) 대형 영문 마퀴: 초대형 타이포가 우→좌로 끊임없이 흐른다(장식). '·'만 골드 포인트.
 *  3) 기존 LabCarousel(무변경): 연구실 카드 가로 캐러셀.
 *
 * page.tsx(서버 컴포넌트)가 넘기던 labs/locale 을 그대로 받아 캐러셀에 전달한다.
 * LabCarousel 은 수정 금지 대상이라 여기서 감싸기만 한다.
 *
 * 진입 애니메이션(ScrollTrigger 1회): 섹션이 뷰포트 75% 에 닿으면 헤더 텍스트가
 * 아래에서 스태거로 솟아오르고([data-reveal]), 독수리 워터마크가 은은히 페이드인한다.
 * 마퀴는 진입과 무관하게 마운트 직후부터 흐른다. reduced-motion 시 전부 정지.
 */
export function LabsSection({ labs, locale }: { labs: LabDirectoryEntry[]; locale: Locale }) {
  const t = useTranslations('home');
  const rootRef = useRef<HTMLElement | null>(null);
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  // 모션 최소화 선호 시 마퀴는 트윈 없이 1벌만 가운데 정렬로 정적 노출한다.
  const [reduced, setReduced] = useState(false);

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

  // 대형 마퀴 무한 흐름 — 동일 콘텐츠 2벌을 담은 트랙을 xPercent:-50 만큼 무한 반복하면
  // 두 번째 벌이 정확히 첫 번째 자리로 들어와 이음매 없이 흐른다.
  useIsoLayoutEffect(() => {
    // reduced-motion: 흐름을 멈추고 1벌만 가운데 정렬(아래 렌더에서 clone 을 생략).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      return;
    }
    const track = marqueeRef.current;
    if (!track) return;
    const ctx = gsap.context(() => {
      gsap.to(track, { xPercent: -50, ease: 'none', duration: 48, repeat: -1 });
    }, track);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      aria-labelledby="labs-heading"
      // 자유 스크롤 홈 섹션 — 자연 높이 + 통일된 상하 리듬(py-section-lg). full-bleed 는
      // 마퀴/캐러셀이 뷰포트 폭을 쓰기 위해 유지하되, 헤더·CTA 는 내부 max-w 컨테이너 정렬.
      className="full-bleed flex flex-col bg-surface py-section-lg"
    >
      {/* 1) 컴팩트 헤더 — 컨테이너 정렬. relative 는 우측 독수리 워터마크의 기준점. */}
      <div className="mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">
        <div className="relative">
          {/* 우측 포인트: 대형 네이비 독수리 워터마크(장식). 옅음은 배경 알파로,
              등장은 [data-reveal-eagle] 페이드인으로. 좁은 화면에선 숨겨 여백을 아낀다.
              다크모드에선 네이비가 배경에 묻혀 안 보이므로 밝은 블루로 대체. */}
          <span
            data-reveal-eagle
            aria-hidden="true"
            className="eagle-mask pointer-events-none absolute -top-6 right-0 hidden h-44 w-44 bg-yonsei-navy/10 dark:bg-yonsei-blue/15 sm:block lg:h-56 lg:w-56"
          />

          {/* 제목 — 뉴스&행사 섹션과 동일한 네이비 라벨 박스(각지게). 로케일별 텍스트:
              KO "우리의 연구실" / EN "RESEARCH LABS". 골드 아이브로우는 이 박스로 대체. */}
          <h2
            id="labs-heading"
            data-reveal
            className="inline-block bg-yonsei-navy px-5 py-2.5 text-lg font-bold text-white"
          >
            {t('people.intro.label')}
          </h2>

          {/* 한 줄 요약 — 본문 최소화(기존 2문단 → 1문장). CTA 는 캐러셀 하단으로 이동. */}
          <p data-reveal className="mt-5 max-w-2xl text-base text-content-soft">
            {t('people.intro.tagline')}
          </p>
        </div>
      </div>

      {/* 2) 대형 영문 마퀴(full-bleed, 헤더 아래) — 순수 장식이라 전체를 aria-hidden.
          overflow-hidden 래퍼가 넘치는 트랙을 잘라낸다. */}
      <div className="mt-10 overflow-hidden lg:mt-12" aria-hidden="true">
        <div ref={marqueeRef} className={cn('flex w-max', reduced && 'w-full justify-center')}>
          <MarqueeRun text={t('people.intro.marquee')} />
          {/* 무한 루프용 2벌째 — reduced-motion 에선 생략(정적 1벌 가운데 정렬). */}
          {!reduced && <MarqueeRun text={t('people.intro.marquee')} />}
        </div>
      </div>

      {/* 3) 캐러셀 — 컴포넌트/props 변경 없음(카드 디자인 유지가 요구사항). */}
      <div className="mt-8 lg:mt-10">
        <LabCarousel labs={labs} locale={locale} />
      </div>

      {/* CTA — 캐러셀 하단 우측(뉴스&행사 섹션과 동일한 위치·정렬) */}
      <div className="mx-auto mt-8 flex w-full max-w-[1360px] justify-end px-6 sm:px-10 lg:px-16">
        <Link
          data-reveal
          href="/research#labs"
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

/**
 * 마퀴 한 벌 — 초대형 네이비 타이포. 슬로건을 '·' 로 나눠 문구 사이를
 * 넓은 여백(마진)으로만 구분한다(구분점 장식 없음 — 사용자 결정).
 * 마진은 문자열 공백에 의존하지 않아 flex 경계의 공백 트리밍과 무관하게 균일하고,
 * 마지막 문구에도 동일 마진을 붙여 벌과 벌 사이 이음매 간격도 같아진다.
 * 다크모드에선 네이비가 배경에 묻히므로 밝은 블루로 대체한다.
 */
function MarqueeRun({ text }: { text: string }) {
  const segments = text
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <span className="flex shrink-0 items-center whitespace-nowrap text-[clamp(3rem,8vw,7rem)] font-black uppercase leading-none tracking-tight text-yonsei-navy dark:text-yonsei-blue">
      {segments.map((seg, i) => (
        <span key={i} className="mr-[1em]">
          {seg}
        </span>
      ))}
    </span>
  );
}
