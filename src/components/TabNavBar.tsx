'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Container, NARROW_MAX_W } from '@/components/Container';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface TabNavItem {
  key: string;
  label: string;
  /** 로케일 접두사 없는 경로 (예: '/undergraduate/curriculum') — @/i18n/navigation 의 Link 가 붙여 준다 */
  href: string;
}

/**
 * 히어로 바로 아래에 붙는 가로 sticky 내비게이션 바(홈 아이콘 + 그룹명 + 현재 섹션 드롭다운).
 * TabbedContent 의 바를 그대로 떼어낸 것으로, 탭 전환이 클라이언트 상태가 아니라
 * **실제 라우트 이동(Link)** 이라는 점만 다르다. 시각·애니메이션은 원본과 동일하다.
 */
export function TabNavBar({
  navTitle,
  tabs,
  activeKey,
  narrow = false,
}: {
  /** 바의 드롭다운 앞에 표시할 그룹명 (예: "학부") */
  navTitle?: string;
  tabs: TabNavItem[];
  /** 현재 페이지에 해당하는 탭 key */
  activeKey: string;
  /** 게시판 목록처럼 한 화면에 많은 항목을 보여야 하는 페이지용 좁은 폭(NARROW_MAX_W).
   *  본문 컨테이너·Hero 에도 같은 값을 걸어야 좌측 정렬선이 어긋나지 않는다. */
  narrow?: boolean;
}) {
  const containerWidth = narrow ? NARROW_MAX_W : undefined;
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  // 드롭다운 열림 상태 — aria 및 GSAP 열기/닫기 애니메이션의 단일 소스
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLSpanElement>(null);
  // 최초 마운트에서 닫기 애니메이션이 헛돌지 않도록 하는 가드
  const didMountRef = useRef(false);

  // ── 바 진입 애니메이션 ── 마운트 시 바가 살짝 위에서 내려오고 내부 요소가 스태거.
  // reduced-motion 이면 생략(바는 그대로 보인 채). gsap.context 로 스코프 후 언마운트 revert.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from(bar, { y: -12, autoAlpha: 0, duration: 0.5, ease: 'power2.out' });
      tl.from(
        gsap.utils.toArray<HTMLElement>('[data-bar-item]'),
        { y: -6, autoAlpha: 0, duration: 0.4, ease: 'power2.out', stagger: 0.06 },
        '-=0.25',
      );
    }, bar);
    return () => ctx.revert();
  }, []);

  // ── 드롭다운 열기/닫기 애니메이션 ── clipPath 위→아래 펼침 + 항목 스태거 + 셰브론 180° 회전.
  // 진행 중 트윈을 먼저 kill 해 열기/닫기 도중 재클릭해도 상태가 꼬이지 않게 한다.
  useEffect(() => {
    const panel = panelRef.current;
    const chevron = chevronRef.current;
    if (!panel) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const items = gsap.utils.toArray<HTMLElement>('[data-menuitem]', panel);

    gsap.killTweensOf(panel);
    gsap.killTweensOf(items);
    if (chevron) gsap.killTweensOf(chevron);

    // 최초 마운트: 닫힘 상태이면 아무것도 하지 않는다(패널은 hidden 클래스로 이미 숨김).
    if (!didMountRef.current) {
      didMountRef.current = true;
      if (!open) return;
    }

    if (open) {
      // hidden 클래스를 인라인 display 로 덮어써 패널을 노출(React 는 display 를 관리하지 않음)
      gsap.set(panel, { display: 'block' });
      if (reduce) {
        gsap.set(panel, { autoAlpha: 1, clipPath: 'none' });
        gsap.set(items, { autoAlpha: 1, y: 0 });
        if (chevron) gsap.set(chevron, { rotation: 180 });
        return;
      }
      gsap.set(panel, { autoAlpha: 1, clipPath: 'inset(0 0 100% 0)' });
      gsap.set(items, { autoAlpha: 0, y: 8 });
      if (chevron) gsap.to(chevron, { rotation: 180, duration: 0.35, ease: 'power3.out' });
      gsap.to(panel, { clipPath: 'inset(0 0 0% 0)', duration: 0.35, ease: 'power3.out' });
      gsap.to(items, {
        autoAlpha: 1,
        y: 0,
        duration: 0.3,
        stagger: 0.04,
        delay: 0.05,
        ease: 'power3.out',
      });
    } else {
      if (chevron) gsap.to(chevron, { rotation: 0, duration: reduce ? 0 : 0.2, ease: 'power2.in' });
      if (reduce) {
        gsap.set(panel, { display: 'none' });
        return;
      }
      // 역방향 짧게 접은 뒤 display none 으로 접근성 트리에서 제거
      gsap.to(panel, {
        clipPath: 'inset(0 0 100% 0)',
        autoAlpha: 0,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => gsap.set(panel, { display: 'none' }),
      });
    }
  }, [open]);

  // 바깥 클릭·ESC 로 닫기. ESC 는 포커스를 드롭다운 버튼으로 되돌린다.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      // 바(홈/그룹명/버튼/패널) 내부 클릭은 각 버튼 핸들러가 처리
      if (barRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    /* 히어로 하단 풀와이드 남색 내비게이션 바 (모바일·데스크톱 공용, sticky) —
       부모 <main> 이 폭 제한을 두지 않아 이 div 는 뷰포트 전폭을 채운다 */
    <div
      ref={barRef}
      className="sticky top-16 z-30 w-full border-b border-white/10 bg-yonsei-navy lg:top-20"
    >
      <Container className={containerWidth}>
        <nav aria-label="섹션 탭" className="flex h-12 items-stretch">
          {/* 홈 아이콘 — 흰색, hover 시 골드. 우측 구분선으로 그룹과 분리 */}
          <Link
            data-bar-item
            href="/"
            aria-label="홈"
            className="flex items-center border-r border-white/15 pr-4 text-white transition-colors hover:text-yonsei-gold"
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M3 10.5 12 4l9 6.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 9.5V20h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          {/* 그룹명(정적) — 있을 때만, 우측 구분선 포함 */}
          {navTitle && (
            <span
              data-bar-item
              className="flex items-center border-r border-white/15 px-4 text-sm font-medium text-white/60"
            >
              {navTitle}
            </span>
          )}

          {/* 현재 탭 드롭다운 */}
          <div className="relative flex items-stretch">
            <button
              ref={triggerRef}
              data-bar-item
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={open}
              aria-controls="tab-nav-menu"
              className="flex min-w-[12rem] items-center justify-between gap-3 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/5"
            >
              <span>{active?.label}</span>
              {/* 셰브론 — 열리면 GSAP 로 180° 회전 */}
              <span ref={chevronRef} aria-hidden="true" className="inline-flex text-white/70">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>

            {/* 드롭다운 패널 — 각지게(rounded 금지). 초기엔 hidden 클래스로 숨기고
                GSAP 가 인라인 display 로 노출/은닉을 제어한다.
                항목은 라우트 링크라 이동은 라우터가, 닫기만 여기서 한다. */}
            <div
              ref={panelRef}
              id="tab-nav-menu"
              role="menu"
              aria-label={navTitle}
              className="absolute left-0 top-full hidden w-max min-w-[14rem] divide-y divide-white/10 border border-white/10 bg-yonsei-navy shadow-xl"
            >
              {tabs.map((t) => (
                <Link
                  key={t.key}
                  data-menuitem
                  role="menuitem"
                  href={t.href}
                  onClick={() => setOpen(false)}
                  aria-current={active?.key === t.key ? 'page' : undefined}
                  className={cn(
                    'block w-full px-5 py-3 text-left text-sm transition-colors hover:bg-white/10 hover:text-white',
                    active?.key === t.key ? 'font-semibold text-yonsei-gold' : 'text-white/85',
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </Container>
    </div>
  );
}
