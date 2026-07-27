'use client';

import { useEffect } from 'react';

/**
 * 새로고침했을 때 페이지 중간(또는 맨 아래)에서 시작하는 문제를 막는다.
 *
 * 원인: 브라우저 기본값 `history.scrollRestoration = 'auto'` 는 새로고침 시 이전 스크롤
 * 위치를 되살린다. 일반 문서에선 편리하지만 이 사이트에선 깨져 보인다 —
 *  ① 페이지마다 큰 히어로와 진입 애니메이션이 "맨 위에서 시작"을 전제로 짜여 있고,
 *  ② 탭 페이지는 새로고침 후 해시로 탭을 다시 고르는데, 복원된 위치는 이전 탭의 길이를
 *     기준으로 한 값이라 새 탭에서는 엉뚱한 지점(대개 맨 아래)이 된다.
 *
 * 그래서 "새로고침(reload)" 인 경우에만 복원을 끄고 맨 위에서 시작한다.
 * 뒤로/앞으로 가기(back_forward)는 손대지 않는다 — 그건 사용자가 보던 자리로 돌아가는
 * 게 맞고, Next.js 라우터와 브라우저가 이미 처리한다.
 *
 * Lenis(부드러운 스크롤)가 켜져 있으면 내부 위치도 함께 0 으로 맞춘다. 네이티브
 * scrollTo 만 부르면 Lenis 의 animatedScroll 이 옛 값으로 남아, 사용자가 휠을 처음
 * 굴리는 순간 그 위치로 튀어 오른다.
 */
export function ScrollRestoration() {
  useEffect(() => {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (entry?.type !== 'reload') return;

    // 브라우저 복원은 하이드레이션 이후에도 한 번 더 일어날 수 있다 — 아예 꺼서 막는다.
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';

    const toTop = () => {
      window.scrollTo(0, 0);
      (window as unknown as { lenis?: { scrollTo: (t: number, o?: object) => void } }).lenis?.scrollTo(
        0,
        { immediate: true },
      );
    };
    toTop();
    // 이미지·폰트가 늦게 실려 레이아웃이 자라는 동안 복원이 끼어드는 경우 대비
    const raf = requestAnimationFrame(toTop);

    return () => {
      cancelAnimationFrame(raf);
      history.scrollRestoration = previous;
    };
  }, []);

  return null;
}
