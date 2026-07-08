'use client';

import { useEffect, useRef } from 'react';

/**
 * 스크롤 스크럽 배경 전환 베일 — _archive/애니메이션 초안.md(Cornell ScrollTrigger
 * 분석)의 scrub 원리를 GSAP 없이 rAF로 재현한 것. 부모 섹션 위에 이전 섹션 색의
 * 베일을 깔아 두고, 섹션이 뷰포트로 떠오르는 진행률(start: 섹션 top=뷰포트 하단,
 * end: 섹션 top=뷰포트 55%)에 따라 베일을 걷어 배경색이 이어지듯 전환되게 한다.
 * 짧은 opacity transition이 초안의 scrub 관성(랙) 역할을 한다.
 * prefers-reduced-motion에서는 베일 없이 즉시 본색을 보여준다.
 *
 * 사용: relative/isolate 섹션 안에 배경 레이어보다 뒤 순서로 배치하고,
 * className으로 이전 섹션의 배경색(예: bg-yonsei-navy)을 지정한다.
 */
export function ScrollVeil({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    const section = el?.parentElement;
    if (!el || !section) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.opacity = '0';
      return;
    }

    let raf = 0;
    const update = () => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh; // 섹션 top이 뷰포트 하단에 닿는 순간 진행 0
      const end = vh * 0.55; // 섹션 top이 뷰포트 55% 지점에 오면 진행 1
      const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
      el.style.opacity = String(1 - progress);
    };
    // 취소-재예약 방식이라 예약 플래그가 낀 채 남을 수 없다 (프레임당 최대 1회 실행)
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={className}
      // SSR/첫 페인트에서는 베일이 덮인 상태(이전 섹션 색)로 시작.
      // CSS transition은 두지 않는다 — 스크롤마다 값을 다시 쓰면 트랜지션이 매번
      // 재시작되며 currentTime 0에 고정되는(계산값이 시작값에 붙는) 문제가 있었고,
      // rAF 스크럽은 프레임 단위 갱신이라 트랜지션 없이도 충분히 부드럽다.
      style={{ opacity: 1 }}
    />
  );
}
