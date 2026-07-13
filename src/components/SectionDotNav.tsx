'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Observer } from 'gsap/Observer';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { CustomEase } from 'gsap/CustomEase';
import { cn } from '@/lib/utils';

// Observer·ScrollToPlugin·CustomEase 모두 무료 public gsap 패키지에 포함.
gsap.registerPlugin(Observer, ScrollToPlugin, CustomEase);

// 섹션 이동 이징 — fullPage.js(고려대 기계공학부 등)가 쓰는 CSS `ease` 커브
// (cubic-bezier 0.25,0.1,0.25,1)를 그대로 이식: 초반이 빠르고 끝이 길게 감속해
// power2.inOut(초반 느림)보다 반응이 즉각적으로 느껴진다. 700ms 도 동일 값.
const SECTION_EASE = CustomEase.create('sectionEase', 'M0,0 C0.25,0.1 0.25,1 1,1');

export interface DotNavItem {
  /** 대상 섹션 래퍼의 DOM id (page.tsx 에서 부여) */
  id: string;
  /** 접근성 라벨 + 툴팁 텍스트 */
  label: string;
}

/** 고정 헤더 높이(px) — h-16(64) / lg:h-20(80). 스냅 좌표를 헤더 아래로 정렬한다. */
function headerOffset(): number {
  return window.innerWidth >= 1024 ? 80 : 64;
}

/**
 * 홈 좌측 고정 섹션 내비 + 섹션 고정스크롤(GSAP Observer 페이징).
 *
 * 이전의 ScrollTrigger snap 은 "스크롤이 완전히 멈춘 뒤" 가장 가까운 지점으로
 * 당기는 방식이라, 트랙패드 관성 스크롤에선 관성이 끝나길 기다렸다 늦게 붙었다.
 * → GSAP 공식 풀페이지 데모의 Observer 패턴으로 교체: 휠/터치 "제스처" 자체를
 *   가로채 즉시 다음/이전 섹션 상단(헤더 보정)으로 트윈한다. 임계값을 넘기는
 *   순간 바로 착 붙는 감각.
 *
 * 구간 경계:
 *  - 마지막 스냅 섹션(뉴스&행사)에서 아래 제스처 → Observer 를 끄고 네이티브
 *    자유 스크롤로 개방(캘린더·공지·푸터). 다시 스냅 구간 위로 올라오면 재가동.
 *  - 모바일(lg 미만)·모션 최소화 선호에선 페이징을 켜지 않는다 — 모바일은 섹션이
 *    한 화면보다 길어질 수 있어 페이징이 콘텐츠를 건너뛴다.
 *
 * 내비: 작은 각진 사각 점(회색), 활성 = 세로 막대(네이비 + 얇은 흰 링 — 다크 배경
 * 가시성). 자유 구간에선 페이드아웃. 데스크톱 전용(lg 미만 숨김).
 */
export function SectionDotNav({ items, ariaLabel }: { items: DotNavItem[]; ariaLabel: string }) {
  const [active, setActive] = useState(0);
  const [hidden, setHidden] = useState(false);
  const ticking = useRef(false);
  // 섹션 이동 트윈 진행 중 잠금 — 제스처 연타·점 클릭이 서로 끼어들지 않게 공유한다.
  const animatingRef = useRef(false);

  // ── 섹션 고정스크롤(Observer 페이징) — 데스크톱 + 모션 허용 시에만 ──
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      // CSS smooth 스크롤은 GSAP 스크롤 트윈과 겹치면 덜컹거린다 → 홈에 있는 동안 auto.
      const html = document.documentElement;
      const prevBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';

      // 스냅 좌표(각 섹션 상단 − 헤더). 레이아웃 변동에 대비해 매 호출 재계산.
      const tops = () =>
        items
          .map((it) => {
            const el = document.getElementById(it.id);
            return el ? Math.max(0, el.offsetTop - headerOffset()) : 0;
          })
          .sort((a, b) => a - b);

      const goTo = (y: number) => {
        animatingRef.current = true;
        gsap.to(window, {
          scrollTo: y,
          duration: 0.7,
          ease: SECTION_EASE,
          overwrite: true,
          onComplete: () => {
            animatingRef.current = false;
          },
        });
      };

      /** 현재 위치가 속한 섹션 인덱스(상단 통과 기준) */
      const indexFor = (y: number, ts: number[]) => {
        let i = 0;
        ts.forEach((t, k) => {
          if (t <= y + 2) i = k;
        });
        return i;
      };

      // Observer 활성 여부를 직접 관리(자유 구간 개방/복귀 판단용)
      let obsEnabled = true;

      const release = () => {
        obsEnabled = false;
        obs.disable();
      };

      const step = (dir: 1 | -1) => {
        const ts = tops();
        const lastI = ts.length - 1;
        const y = window.scrollY;
        const i = indexFor(y, ts);
        if (dir > 0) {
          // 마지막 스냅 섹션에서 아래로 → 자유 구간 개방(네이티브 스크롤에 양보)
          if (i >= lastI && y >= ts[lastI] - 2) {
            release();
            return;
          }
          goTo(ts[Math.min(lastI, i + 1)]);
        } else {
          if (y <= ts[0] + 2) return; // 이미 최상단
          // 섹션 상단에서 살짝 어긋나 있으면(스크롤바 드래그 등) 그 섹션 상단으로 정렬,
          // 정확히 상단이면 이전 섹션으로.
          goTo(y - ts[i] > 4 ? ts[i] : ts[Math.max(0, i - 1)]);
        }
      };

      // ── 제스처 판별 게이트 ──
      // 트랙패드 한 번의 스와이프는 관성으로 1~2초간 휠 이벤트를 연달아 쏟아낸다.
      // Observer 의 onUp/onDown 은 그 이벤트마다 불리므로, "트윈 중 잠금"만으로는
      // 트윈이 끝난 직후 남은 관성 꼬리가 새 제스처로 오인돼 2~3 섹션씩 연쇄 이동한다.
      // → 직전 이벤트와의 간격이 INTENT_GAP 이상 비었거나 방향이 바뀐 경우에만
      //   "새 제스처"로 인정하고, 꼬리 이벤트는 시각만 갱신하며 전부 흡수한다.
      const INTENT_GAP = 250; // ms
      let lastTime = -1e9;
      let lastDir = 0;
      const handleGesture = (dir: 1 | -1) => {
        const now = performance.now();
        const fresh = now - lastTime > INTENT_GAP || dir !== lastDir;
        lastTime = now;
        lastDir = dir;
        if (animatingRef.current) return; // 트윈 중 — 꼬리로 취급(시각은 위에서 갱신됨)
        if (!fresh) return; // 관성 꼬리 — 무시
        step(dir);
      };

      // GSAP 공식 데모 매핑: wheelSpeed:-1 → onUp = 아래로 스크롤 제스처, onDown = 위로.
      const obs = Observer.create({
        type: 'wheel,touch',
        wheelSpeed: -1,
        tolerance: 12,
        preventDefault: true,
        onDown: () => handleGesture(-1),
        onUp: () => handleGesture(1),
      });

      // 자유 구간 → 스냅 구간 복귀 감시: 마지막 스냅 지점 위로 올라오면 재가동.
      const watch = () => {
        if (!obsEnabled) {
          const ts = tops();
          if (window.scrollY < ts[ts.length - 1] - 2) {
            obsEnabled = true;
            obs.enable();
          }
        }
      };
      window.addEventListener('scroll', watch, { passive: true });

      // 새로고침 스크롤 복원 등으로 자유 구간에서 시작한 경우 — 곧바로 개방 상태로.
      if (window.scrollY > tops()[items.length - 1] + 2) release();

      return () => {
        window.removeEventListener('scroll', watch);
        obs.kill();
        html.style.scrollBehavior = prevBehavior;
      };
    });
    return () => mm.revert();
  }, [items]);

  // ── 활성 섹션 추적 + 자유 구간에서 내비 숨김 ──
  // (뷰포트 세로 중앙이 어느 섹션 안에 있는지로 판정 — 섹션 높이가 달라도 단순·확실)
  useEffect(() => {
    const update = () => {
      ticking.current = false;
      const mid = window.scrollY + window.innerHeight / 2;
      let cur = 0;
      items.forEach((it, i) => {
        const el = document.getElementById(it.id);
        if (el && el.offsetTop <= mid) cur = i;
      });
      setActive(cur);
      const last = items.length > 0 ? document.getElementById(items[items.length - 1].id) : null;
      setHidden(
        last ? window.scrollY > last.offsetTop + last.offsetHeight - window.innerHeight / 2 : false,
      );
    };
    const onScroll = () => {
      // rAF 스로틀 — 스크롤마다 setState 폭주 방지
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [items]);

  // 점 클릭 — 섹션 상단(헤더 보정)으로 트윈. 트윈 잠금을 공유해 제스처와 안 싸운다.
  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = Math.max(0, el.offsetTop - headerOffset());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, y);
      return;
    }
    animatingRef.current = true;
    gsap.to(window, {
      scrollTo: y,
      duration: 0.7,
      ease: SECTION_EASE,
      overwrite: true,
      onComplete: () => {
        animatingRef.current = false;
      },
    });
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-2.5 transition-opacity duration-300 lg:flex xl:left-7',
        hidden && 'pointer-events-none opacity-0',
      )}
    >
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          onClick={() => go(it.id)}
          aria-label={it.label}
          title={it.label}
          aria-current={i === active ? 'true' : undefined}
          // 각진 사각 점(rounded 없음). 활성 = 세로로 늘어난 네이비 막대 + 얇은 흰 링
          // (히어로·갤러리의 어두운 배경 위에서도 활성 점이 보이게 하는 안전장치).
          className={cn(
            'w-2 transition-all duration-300',
            i === active
              ? 'h-6 bg-yonsei-navy shadow-[0_0_0_1px_rgba(255,255,255,0.55)]'
              : 'h-2 bg-neutral-400/70 hover:bg-yonsei-navy/70 dark:bg-neutral-500/70',
          )}
        />
      ))}
    </nav>
  );
}
