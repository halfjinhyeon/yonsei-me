'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// SSR 에서 useLayoutEffect 경고를 피하는 동형 훅 (VisionInfographic 과 동일 관례)
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** 세션 내 재방문 감쇠 — 같은 랜딩을 두 번째 볼 땐 60% 속도로 짧게(탭을 오가며 비교하는
 *  사용자가 매번 풀 애니메이션을 기다리지 않도록). 모듈 스코프라 새로고침하면 초기화된다. */
const played = new Set<string>();

/** 랜딩 모션 어휘 — 각진 디자인 정체성상 회전·확대·바운스는 쓰지 않는다.
 *  - rise      : 아래에서 살짝 올라오며 등장 (본문·그리드 항목). data-land-y 로 이동량 조절
 *  - fade      : 제자리 페이드만 (클릭 대상·이미 transform 이 걸린 요소 — 미스클릭/충돌 방지)
 *  - wipe      : clip-path 리빌. 기본 좌→우, data-land-from="bottom" 이면 아래→위로 차오름
 *  - rule      : 선이 좌→우로 그어짐 (scaleX). 헤어라인·트랙선 전용
 *  - draw      : SVG path 가 그려짐 (stroke-dashoffset). 자신이 path 거나 하위 path 들
 *  - count     : 숫자 0→목표값 카운트업 (숫자로 시작하지 않는 값은 자동으로 fade 처리)
 *  - underline : .underline-magical 형광 밑줄이 좌→우로 그어짐 */
type LandKind = 'rise' | 'fade' | 'wipe' | 'rule' | 'draw' | 'count' | 'underline';

const KINDS: readonly LandKind[] = ['rise', 'fade', 'wipe', 'rule', 'draw', 'count', 'underline'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** path 길이에 비례한 드로잉 시간 — 작은 화살표는 짧게, 긴 유선은 길게 */
const drawDuration = (len: number) => clamp(len / 900, 0.35, 1.2);

/** 어휘별 (기본 지속시간, 스태거) — 아래 addGroup 의 트윈 값과 반드시 일치시킬 것.
 *  그룹이 차지하는 길이를 미리 알아야 다음 그룹 시작 시각을 정할 수 있어 표로 둔다. */
const TIMING: Record<LandKind, { d: number; stagger: number }> = {
  rise: { d: 0.55, stagger: 0.08 },
  fade: { d: 0.4, stagger: 0.06 },
  wipe: { d: 0.5, stagger: 0.12 },
  rule: { d: 0.6, stagger: 0.1 },
  draw: { d: 0.9, stagger: 0.05 },
  count: { d: 0.9, stagger: 0 },
  underline: { d: 0.65, stagger: 0 },
};

/** 그룹이 실제로 차지하는 길이(스태거 포함) — 다음 그룹 시작 간격을 여기서 역산한다.
 *  균등 간격을 쓰면 항목이 많은 그룹(예: 절차 상자 4개)이 다음 그룹과 겹쳐
 *  "결론이 과정보다 먼저 뜨는" 역전이 생긴다. */
function groupCost(group: Map<LandKind, HTMLElement[]>, s: number) {
  let cost = 0;
  group.forEach((els, kind) => {
    const { d, stagger } = TIMING[kind];
    cost = Math.max(cost, (d + stagger * (els.length - 1)) * s);
  });
  return cost;
}

/** 그룹(같은 data-land-order) 하나를 타임라인 position `at` 에 붙인다.
 *  초기 상태(gsap.set)는 호출 즉시 적용된다 — 훅이 페인트 전(useLayoutEffect)에 돌므로
 *  스크롤 지연 그룹도 깜빡임 없이 숨겨진 채로 시작한다. */
function addGroup(
  tl: gsap.core.Timeline,
  group: Map<LandKind, HTMLElement[]>,
  at: number,
  s: number,
) {
  const rise = group.get('rise');
  if (rise) {
    gsap.set(rise, { autoAlpha: 0, y: (i, el: HTMLElement) => Number(el.dataset.landY ?? 16) });
    tl.to(
      rise,
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.55 * s,
        ease: 'power3.out',
        stagger: 0.08 * s,
        clearProps: 'transform,visibility,opacity',
      },
      at,
    );
  }

  const fade = group.get('fade');
  if (fade) {
    gsap.set(fade, { autoAlpha: 0 });
    tl.to(
      fade,
      {
        autoAlpha: 1,
        duration: 0.4 * s,
        ease: 'power2.out',
        stagger: 0.06 * s,
        clearProps: 'visibility,opacity',
      },
      at,
    );
  }

  const wipe = group.get('wipe');
  if (wipe) {
    // 4값 inset 으로 통일 — 형식이 같아야 GSAP 이 숫자만 보간한다
    gsap.set(wipe, {
      clipPath: (i, el: HTMLElement) =>
        el.dataset.landFrom === 'bottom' ? 'inset(100% 0% 0% 0%)' : 'inset(0% 100% 0% 0%)',
    });
    tl.to(
      wipe,
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: 0.5 * s,
        ease: 'power3.out',
        stagger: 0.12 * s,
        clearProps: 'clipPath',
      },
      at,
    );
  }

  const rule = group.get('rule');
  if (rule) {
    gsap.set(rule, { scaleX: 0, transformOrigin: 'left center' });
    tl.to(
      rule,
      {
        scaleX: 1,
        duration: 0.6 * s,
        ease: 'power2.inOut',
        stagger: 0.1 * s,
        clearProps: 'transform',
      },
      at,
    );
  }

  const draw = group.get('draw');
  if (draw) {
    const paths: SVGPathElement[] = [];
    draw.forEach((el) => {
      if (el instanceof SVGPathElement) paths.push(el);
      else paths.push(...Array.from(el.querySelectorAll('path')));
    });
    const lens = new Map<SVGPathElement, number>();
    const drawable = paths.filter((p) => {
      const len = typeof p.getTotalLength === 'function' ? p.getTotalLength() : 0;
      if (!len) return false;
      lens.set(p, len);
      gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
      return true;
    });
    if (drawable.length) {
      tl.to(
        drawable,
        {
          strokeDashoffset: 0,
          // 길이에 맞춘 개별 속도 — 작은 화살표와 대형 유선을 같은 표식으로 다루기 위해
          duration: (i: number, el: SVGPathElement) => drawDuration(lens.get(el) ?? 900) * s,
          ease: 'power2.inOut',
          stagger: TIMING.draw.stagger * s,
          clearProps: 'strokeDasharray,strokeDashoffset',
        },
        at,
      );
    }
  }

  const count = group.get('count');
  if (count) {
    count.forEach((el) => {
      const raw = el.textContent ?? '';
      const m = raw.match(/^\s*([\d,]+(?:\.\d+)?)/);
      gsap.set(el, { autoAlpha: 0 });
      tl.to(el, { autoAlpha: 1, duration: 0.3 * s, ease: 'power2.out', clearProps: 'visibility,opacity' }, at);
      // 숫자로 시작하지 않는 지표(예: "BK21", "전용 공작실")는 등장만 하고 카운트하지 않는다
      if (!m) return;
      const target = parseFloat(m[1].replace(/,/g, ''));
      const grouped = m[1].includes(',');
      const rest = raw.slice(m[0].length);
      const proxy = { v: 0 };
      tl.to(
        proxy,
        {
          v: target,
          duration: 0.9 * s,
          ease: 'power2.out',
          onUpdate: () => {
            const n = Math.round(proxy.v);
            el.textContent = (grouped ? n.toLocaleString('en-US') : String(n)) + rest;
          },
          onComplete: () => {
            el.textContent = raw; // 부동소수 오차 없이 원문 그대로 복원
          },
        },
        at,
      );
    });
  }

  const underline = group.get('underline');
  if (underline) {
    // .underline-magical 은 평상시 background-size 가 이미 100% 라, 폭을 0 → 100% 로 키우면
    // 밑줄이 좌→우로 그어진다. 같은 속성에 CSS transition 이 걸려 있어 트윈 동안만 끈다.
    //
    // ⚠️ 함정 두 가지.
    //  1) 시작/도착 문자열의 숫자 개수가 같아야 GSAP 이 보간한다. 계산값은 calc() 가 px 로
    //     풀린 "100% 12.6px" 형태라 도착값에 calc() 를 그대로 쓰면 트윈이 아무 일도 안 한다.
    //  2) 도착값(폭 100%)을 계산값에서 "읽으면" 안 된다 — StrictMode 이중 마운트에서 첫
    //     실행의 revert 가 CSS transition 을 발동시켜, 두 번째 실행이 전이 중간값(예: 2%)을
    //     도착값으로 읽어버린다(밑줄이 2% 에서 멈추는 증상). 폭은 CSS 평상시 값 100% 로 고정.
    // 따라서 계산값에서는 "높이 부분"만 빌려 쓴다(전이 중에도 불변).
    underline.forEach((el) => {
      const h = getComputedStyle(el).backgroundSize.split(' ')[1] ?? 'calc(0.2em + 3px)';
      gsap.set(el, { transition: 'none', backgroundSize: `0% ${h}` });
      tl.to(
        el,
        {
          backgroundSize: `100% ${h}`,
          duration: TIMING.underline.d * s,
          ease: 'power2.out',
          clearProps: 'backgroundSize',
          onComplete: () => {
            // 폭 인라인을 지운 "다음" 프레임에 transition 을 되살린다. 같은 프레임에 함께
            // 되살리면 브라우저가 0.25s CSS 전이를 새로 시작해 밑줄이 한 번 더 늘어난다.
            requestAnimationFrame(() => {
              el.style.transition = '';
            });
          },
        },
        at,
      );
    });
  }
}

/**
 * 탭 랜딩 애니메이션 훅 — 반환한 ref 를 스코프 루트에 걸고, 안쪽 요소에
 * `data-land="<어휘>"` (+ 선택 `data-land-order="<정수>"`) 를 표시하면 된다.
 *
 * TabbedContent 가 `key={activeKey}` 로 패널을 통째로 리마운트하므로 마운트 타임라인이
 * 곧 "탭 전환 랜딩"이다. 별도 이벤트 배선이 필요 없다.
 *
 * 핵심 규칙 — **뷰포트 판정 하이브리드**: 마운트 순간 화면에 보이는 그룹만 마스터
 * 타임라인으로 재생하고, 화면 아래 그룹은 각자 ScrollTrigger(once)로 넘긴다. 그래야
 * 첫 화면이 밋밋하지 않으면서도 "아무도 못 본 채 애니메이션이 소진되는" 낭비가 없다.
 *
 * 안전장치: 초기 숨김은 CSS 가 아니라 JS(gsap.set)로만 한다 — 스크립트가 실패해도
 * 콘텐츠가 영구히 사라지지 않고 "애니메이션만 없는" 상태가 된다.
 */
export function useLandingAnimation<T extends HTMLElement = HTMLDivElement>(
  name: string,
  delay = 0.18,
) {
  const rootRef = useRef<T | null>(null);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const s = played.has(name) ? 0.6 : 1; // 재방문 감쇠
    const cleanups: (() => void)[] = [];

    const ctx = gsap.context(() => {
      const els = Array.from(root.querySelectorAll<HTMLElement>('[data-land]'));
      if (els.length === 0) return;

      // order → kind → 요소들
      const byOrder = new Map<number, Map<LandKind, HTMLElement[]>>();
      for (const el of els) {
        const kind = el.dataset.land as LandKind;
        if (!KINDS.includes(kind)) continue;
        const order = Number(el.dataset.landOrder ?? 0) || 0;
        let group = byOrder.get(order);
        if (!group) byOrder.set(order, (group = new Map()));
        const list = group.get(kind);
        if (list) list.push(el);
        else group.set(kind, [el]);
      }

      const orders = [...byOrder.keys()].sort((a, b) => a - b);
      const vh = window.innerHeight;

      // 1차 — 그룹 분류: 마운트 재생 / 스크롤 지연 / 제외
      const plans: { group: Map<LandKind, HTMLElement[]>; first: HTMLElement; mount: boolean }[] = [];
      for (const order of orders) {
        const group = byOrder.get(order)!;
        // 기준 요소는 "실제로 그려지는 것" 중 가장 위 — 반응형으로 display:none 인 쌍둥이
        // 마크업(예: 데스크톱 레일 / 모바일 칩)이 그룹의 대표가 되면 안 된다
        const boxes = [...group.values()]
          .flat()
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 || rect.height > 0);
        if (boxes.length === 0) continue;
        boxes.sort((a, b) => a.rect.top - b.rect.top);
        const { el: first, rect } = boxes[0];
        // 화면 위로 완전히 지나간 그룹(스크롤한 상태에서 탭을 바꾼 경우)은 건드리지 않는다
        if (rect.bottom <= 0) continue;
        plans.push({ group, first, mount: rect.top < vh * 0.92 });
      }

      // 2차 — 마운트 그룹의 시작 시각: 앞 그룹 길이의 42% 뒤에 다음 그룹(겹치는 시퀀스).
      // 합이 길어지면 비례 축소해 전체가 1초 안팎에서 끝나게 한다.
      const gaps = plans
        .filter((p) => p.mount)
        .slice(0, -1)
        .map((p) => clamp(groupCost(p.group, s) * 0.42, 0.06, 0.3));
      const sum = gaps.reduce((a, b) => a + b, 0);
      const scale = sum > 0.85 * s ? (0.85 * s) / sum : 1;

      // 3차 — 화면에 보이는 그룹은 마스터 타임라인에 순서대로, 아래 그룹은 ScrollTrigger 로.
      // 재방문 감쇠 표시는 "끝까지 재생됐을 때"만 — React StrictMode(dev)는 마운트를 두 번
      // 돌리는데, 여기서 미리 표시하면 정작 사용자가 보는 두 번째 재생이 감쇠돼 버린다.
      const master = gsap.timeline({ delay: delay * s, onComplete: () => played.add(name) });
      let at = 0;
      let mi = 0;
      for (const p of plans) {
        if (p.mount) {
          addGroup(master, p.group, at, s);
          at += (gaps[mi] ?? 0) * scale;
          mi += 1;
        } else {
          const tl = gsap.timeline({
            scrollTrigger: { trigger: p.first, start: 'top 90%', once: true },
          });
          addGroup(tl, p.group, 0, s);
        }
      }

      // 안전망 — 콘텐츠가 숨은 채 남는 것이 최악이다. GSAP 은 rAF 로 도는데, 백그라운드
      // 탭·측정 시점 어긋남 등으로 마스터가 한 프레임도 못 돌 수 있다. rAF 와 무관한
      // setTimeout 으로 확인해, 그때까지 시작조차 안 했으면 애니메이션을 건너뛰고 최종
      // 상태로 즉시 렌더한다(progress(1) 은 동기 렌더라 티켓 없이도 반영된다).
      const safety = window.setTimeout(() => {
        if (master.progress() === 0 && master.duration() > 0) master.progress(1);
      }, 2500);
      cleanups.push(() => window.clearTimeout(safety));
    }, root);

    return () => {
      cleanups.forEach((fn) => fn());
      ctx.revert();
    };
    // 마운트 1회만 — 탭 전환은 리마운트로 처리된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return rootRef;
}

/**
 * 서버 컴포넌트가 랜딩 애니메이션을 옵트인할 때 쓰는 클라이언트 래퍼.
 * `display: contents` 라 레이아웃(그리드/플렉스 자식 관계)에 아무 영향을 주지 않는다.
 */
export function LandingScope({
  name,
  delay,
  children,
}: {
  /** 재방문 감쇠 키 — 탭/섹션마다 고유하게 */
  name: string;
  delay?: number;
  children: ReactNode;
}) {
  const ref = useLandingAnimation<HTMLDivElement>(name, delay);
  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
