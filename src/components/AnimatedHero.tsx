'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { MeshCanvas } from './MeshCanvas';

// SplitText 는 이제 무료 — public gsap 패키지에 포함(Club 멤버십/토큰 불필요).
gsap.registerPlugin(SplitText);

// SSR 안전 layout effect — 클라이언트에선 페인트 전에 from-state 를 잡아 깜빡임을
// 막고, 서버 렌더 시 useLayoutEffect 경고를 피한다.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 풀뷰포트 히어로 — 초대형 캡스 2행 타이틀 배너.
 * - 네이비 애니메이션 그라디언트 + 캔버스 웨이브 배경
 * - "COLLEGE OF / MECHANICAL ENGINEERING" 정적 타이틀(브랜드 고정 요소라
 *   양 로케일 모두 영어, 값은 messages 양쪽에 동일하게 둠)
 * - 진입 시 GSAP SplitText 로 글자들이 마스크 뒤에서 순차로 솟아오르는 리빌
 *   + 하단 좌측 정렬 태그라인 페이드업. reduced-motion 시 정적 표시.
 */
export function AnimatedHero() {
  const t = useTranslations('home.animHero');
  const rootRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const taglineRef = useRef<HTMLParagraphElement | null>(null);

  useIsoLayoutEffect(() => {
    const title = titleRef.current;
    if (!title) return;
    // 모션 최소화 선호 → 애니메이션 없이 원문 그대로 표시
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      // aria:'auto' → 분해 요소에 aria-hidden, h1 에 aria-label(원문) 부여(접근성 유지)
      const split = SplitText.create(title, { type: 'chars,words', mask: 'chars', aria: 'auto' });
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      // 각 글자를 자기 마스크 아래(yPercent:110)에서 위로 → 무게감 있는 리빌
      tl.from(split.chars, { yPercent: 110, duration: 0.7, stagger: 0.02 });
      if (taglineRef.current) {
        tl.from(taglineRef.current, { y: 20, autoAlpha: 0, duration: 0.6, ease: 'power2.out' }, '-=0.35');
      }
    });

    // context.revert() 가 SplitText 원본 마크업 복원 + 트윈 kill 을 함께 처리
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      data-flow
      className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden pb-[14vh] text-white sm:pb-[16vh]"
    >
      {/* 캔버스 웨이브 배경 */}
      <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full [mask-image:linear-gradient(to_top,transparent,black_22%)]" />

      <div className="mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">
        <h1
          ref={titleRef}
          className="text-[clamp(2.4rem,7vw,6.5rem)] font-black uppercase leading-[1.04] tracking-tight text-white"
        >
          <span className="block">{t('title1')}</span>
          <span className="block">{t('title2')}</span>
        </h1>

        <p
          ref={taglineRef}
          className="mt-8 max-w-2xl text-base font-semibold leading-relaxed text-white/85 sm:mt-10 sm:text-xl"
        >
          {t('tagline')}
        </p>
      </div>
    </section>
  );
}
