'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// ScrollTrigger 도 무료 public gsap 패키지에 포함(Club 멤버십/토큰 불필요).
gsap.registerPlugin(ScrollTrigger);

/**
 * 홈 상단(히어로·스테이트먼트·통계) 전용 "다크 그라디언트 배경" 레이어.
 *
 * `position: fixed; inset: 0; z-index: -10` 그라디언트 한 장을 화면 뒤에 고정해 두고,
 * 위 섹션들의 배경을 transparent 로 두면 상단이 하나의 배경으로 이어져 보인다.
 * 각 `[data-flow]` 섹션마다 ScrollTrigger 로 스크롤 진행도에 맞춰 다음 정거장 색으로
 * `--bg-a`/`--bg-b` 를 hex 보간 → 스크롤에 따라 배경색이 부드럽게 흐른다.
 *
 * 그리고 `[data-flow-end]`(프로그램 "무브" 섹션)이 올라오면 레이어 opacity 를 1→0 으로
 * 스크럽 → 다크 배경이 흰색(body 표면)으로 **디졸브**된다. 이후 하단은 각 섹션 고유
 * 배경(흰색/네이비/블루 등) 위에 얹힌다. reduced-motion 시 정적.
 */

// data-flow 섹션 순서대로 [상단색 --bg-a, 하단색 --bg-b]. 히어로·스테이트먼트·통계 3구간.
// 공지(로열블루) 톤에서 채도만 살짝 낮춘 밝은 블루. 상단(--bg-a)은 밝게, 하단(--bg-b)은
// 흰 글자 대비를 위해 약간 더 깊게. 색만 바꾸면 되니 여기서 자유롭게 커스터마이즈.
const BG_SCENES: [string, string][] = [
  ['#3f7ad2', '#1d4a92'], // 0 히어로 (밝은 블루)
  ['#3670c4', '#193f80'], // 1 컬러 스테이트먼트
  ['#2d61b0', '#143570'], // 2 통계
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function BgFlow() {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const setScene = (a: string, b: string) => {
      layer.style.setProperty('--bg-a', a);
      layer.style.setProperty('--bg-b', b);
    };
    setScene(BG_SCENES[0][0], BG_SCENES[0][1]); // 초기 = 첫 정거장

    // 모션 최소화 선호 → 스크럽 없이 중간 정거장으로 고정(색 연결 유지, 애니메이션만 정지)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const mid = BG_SCENES[Math.floor(BG_SCENES.length / 2)];
      setScene(mid[0], mid[1]);
      return;
    }

    const sections = gsap.utils.toArray<HTMLElement>('[data-flow]');
    const ctx = gsap.context(() => {
      // 상단 구간: 스크롤에 맞춰 색 보간
      sections.forEach((sec, i) => {
        if (i === 0) return; // 0번 섹션은 초기색 유지
        const [fromA, fromB] = BG_SCENES[Math.min(i - 1, BG_SCENES.length - 1)];
        const [toA, toB] = BG_SCENES[Math.min(i, BG_SCENES.length - 1)];
        ScrollTrigger.create({
          trigger: sec,
          start: 'top center',
          end: 'bottom center',
          scrub: true,
          onUpdate: (self) => {
            const p = self.progress;
            setScene(lerpColor(fromA, toA, p), lerpColor(fromB, toB, p));
          },
        });
      });

      // 디졸브: 무브 섹션이 올라오면 다크 레이어를 걷어내 흰 배경으로 전환
      const endMarker = document.querySelector<HTMLElement>('[data-flow-end]');
      if (endMarker) {
        gsap.fromTo(
          layer,
          { autoAlpha: 1 },
          {
            autoAlpha: 0,
            ease: 'none',
            scrollTrigger: {
              trigger: endMarker,
              start: 'top bottom', // 무브 섹션 상단이 뷰포트 하단에 닿을 때 시작
              end: 'top center', //   무브 섹션 상단이 화면 중앙에 오면 완전히 흰색
              scrub: true,
            },
          },
        );
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10"
      style={{ background: 'linear-gradient(160deg, var(--bg-a, #00285E), var(--bg-b, #2E86D6))' }}
    />
  );
}
