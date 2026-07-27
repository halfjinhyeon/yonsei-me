'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { Container } from '@/components/Container';
import { Prose } from '@/components/Prose';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface TabItem {
  key: string;
  label: string;
  markdown: string | null;
  /** 마크다운 대신 커스텀 컴포넌트(카드 그리드 등)를 렌더할 때 사용 */
  content?: ReactNode;
}

/**
 * 히어로 바로 아래에 붙는 가로 내비게이션 바(홈 아이콘 + 그룹명 + 현재 섹션 드롭다운)로
 * 세부탭을 전환하고, 그 아래 본문이 화면 전폭을 쓰는 공용 셸.
 * 우측 목차 박스/모바일 필 탭을 하나의 sticky 바로 통일해 모바일·데스크톱 공용으로 쓴다.
 */
export function TabbedContent({
  tabs,
  emptyLabel,
  navTitle,
}: {
  tabs: TabItem[];
  emptyLabel: string;
  /** 바의 드롭다운 앞에 표시할 그룹명 (예: "학부") */
  navTitle?: string;
}) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  // 드롭다운 열림 상태 — aria 및 GSAP 열기/닫기 애니메이션의 단일 소스
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  /** sticky 바 바로 앞의 0높이 앵커 — 바의 "원래 자리"를 재는 기준점 */
  const barAnchorRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLSpanElement>(null);
  // 최초 마운트에서 닫기 애니메이션이 헛돌지 않도록 하는 가드
  const didMountRef = useRef(false);

  // /undergraduate#curriculum 처럼 해시로 진입하거나 해시가 바뀌면 해당 탭을 선택.
  // 헤더 메가메뉴의 "같은 페이지" 해시 링크는 SPA(pushState) 내비게이션이라
  // hashchange 이벤트가 발생하지 않으므로, 문서 레벨 클릭도 함께 감지한다.
  useEffect(() => {
    function syncFromHash() {
      const key = window.location.hash.replace('#', '');
      if (key && tabs.some((t) => t.key === key)) setActiveKey(key);
    }
    function onDocClick(e: MouseEvent) {
      const anchor = (e.target as Element | null)?.closest?.(
        'a[href*="#"]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname !== window.location.pathname) return;
      const key = url.hash.replace('#', '');
      if (key && tabs.some((t) => t.key === key)) setActiveKey(key);
    }
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    document.addEventListener('click', onDocClick);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
      document.removeEventListener('click', onDocClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTab(key: string) {
    setActiveKey(key);
    setOpen(false);
    window.history.replaceState(null, '', `#${key}`);
    // 탭을 바꾸면 새 내용의 첫 줄부터 보여 준다. 스크롤을 그대로 두면 이전 탭 길이
    // 기준의 위치가 남아, 짧은 탭으로 옮겼을 때 그 탭의 맨 아래에 떨어진다
    // (드롭다운으로 탭을 바꿨을 때 "맨 밑에서 시작"하던 문제).
    scrollToBar();
  }

  /** 바가 헤더 밑에 딱 붙는 지점으로 이동 — 탭 내용이 화면 맨 위에서 시작한다.
   *  바 자체는 sticky 라 위치 계산에 쓸 수 없어, 바로 앞에 둔 앵커의 문서 좌표를 쓴다.
   *  Lenis 가 있으면 내부 위치까지 함께 맞춘다(안 그러면 다음 휠에서 옛 위치로 튄다). */
  function scrollToBar() {
    const anchor = barAnchorRef.current;
    if (!anchor) return;
    // 헤더 높이 = 바의 sticky top (모바일 64 / lg 이상 80)
    const headerH = window.matchMedia('(min-width: 1024px)').matches ? 80 : 64;
    const top = Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - headerH);
    const lenis = (window as unknown as { lenis?: { scrollTo: (t: number, o?: object) => void } })
      .lenis;
    if (lenis) lenis.scrollTo(top, { immediate: true });
    else window.scrollTo(0, top);
  }

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
    <>
      {/* 히어로 하단 풀와이드 남색 내비게이션 바 (모바일·데스크톱 공용, sticky) —
          부모 <main> 이 폭 제한을 두지 않아 이 div 는 뷰포트 전폭을 채운다 */}
      {/* 바의 원래 위치를 재기 위한 앵커(sticky 인 바 자신은 기준이 될 수 없다) */}
      <span ref={barAnchorRef} aria-hidden="true" className="block h-0" />
      <div
        ref={barRef}
        className="sticky top-16 z-30 w-full border-b border-white/10 bg-yonsei-navy lg:top-20"
      >
        <Container>
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
                  GSAP 가 인라인 display 로 노출/은닉을 제어한다 */}
              <div
                ref={panelRef}
                id="tab-nav-menu"
                role="menu"
                aria-label={navTitle}
                className="absolute left-0 top-full hidden w-max min-w-[14rem] divide-y divide-white/10 border border-white/10 bg-yonsei-navy shadow-xl"
              >
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    data-menuitem
                    type="button"
                    role="menuitem"
                    onClick={() => selectTab(t.key)}
                    aria-current={active?.key === t.key ? 'page' : undefined}
                    className={cn(
                      'block w-full px-5 py-3 text-left text-sm transition-colors hover:bg-white/10 hover:text-white',
                      active?.key === t.key ? 'font-semibold text-yonsei-gold' : 'text-white/85',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </Container>
      </div>

      <Container className="py-10 lg:py-16">
        {/* 본문 (레이아웃에 이미 <main id="main">이 있어 중첩 방지를 위해 section 사용) */}
        <section className="min-w-0" aria-labelledby={`${active?.key}-title`}>
          <div key={active?.key} className="anim-panel relative isolate">
            {/* 장식용 독수리 — 탭 큰 제목 좌상단, 남색(eagle.png 를 마스크로 틴트) */}
            <span
              aria-hidden="true"
              className="eagle-mask pointer-events-none absolute -left-2 -top-12 -z-10 h-[230px] w-[230px] bg-yonsei-navy opacity-[0.08]"
            />
            {/* 탭 큰 제목 서체 = Paperlogy 6 SemiBold(사용자 지정) — font-semibold(600)가
                text-display-sm 내장 굵기(700)를 덮어 600 파일이 물린다(가짜 볼드 없음). */}
            <h2
              id={`${active?.key}-title`}
              style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
              className="mb-10 scroll-mt-24 text-display-sm font-semibold tracking-tight text-content"
            >
              {active?.label}
            </h2>
            {active?.content ? (
              active.content
            ) : active?.markdown ? (
              <Prose markdown={active.markdown} />
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-card border border-surface-border bg-surface-soft px-6 py-20 text-center">
                <span
                  aria-hidden="true"
                  className="grid h-12 w-12 place-items-center rounded-full bg-yonsei-navy/10 text-yonsei-navy"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path
                      d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <p className="max-w-sm text-content-soft">{emptyLabel}</p>
              </div>
            )}
          </div>
        </section>
      </Container>
    </>
  );
}
