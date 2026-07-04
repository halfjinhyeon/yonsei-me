'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Container } from '@/components/Container';
import { Prose } from '@/components/Prose';
import { cn } from '@/lib/utils';

export interface TabItem {
  key: string;
  label: string;
  markdown: string | null;
  /** 마크다운 대신 커스텀 컴포넌트(카드 그리드 등)를 렌더할 때 사용 */
  content?: ReactNode;
}

/**
 * 콘텐츠(좌, 넓게) + 우측 컴팩트 목차 박스(데스크톱) / 상단 스크롤 탭(모바일).
 * 좌측 풀-높이 사이드바 대신 짧은 "바로가기" 카드로, 한 번에 한 섹션만 보여준다.
 */
export function TabbedContent({
  tabs,
  emptyLabel,
  navTitle,
}: {
  tabs: TabItem[];
  emptyLabel: string;
  /** 우측 목차 박스 상단에 표시할 그룹명 (예: "학부") */
  navTitle?: string;
}) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  // /news#seminars 처럼 해시로 진입하거나 해시가 바뀌면 해당 탭을 선택.
  // 헤더 드롭다운의 "같은 페이지" 해시 링크는 SPA(pushState) 내비게이션이라
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
    window.history.replaceState(null, '', `#${key}`);
  }

  return (
    <>
      {/* 모바일용 상단 스크롤 탭 */}
      <div className="sticky top-16 z-30 flex gap-2 overflow-x-auto border-b border-surface-border bg-surface px-4 py-3 lg:hidden">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={cn(
              'anim-nav-item whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-all',
              activeKey === t.key
                ? 'bg-yonsei-navy text-white'
                : 'border border-surface-border text-content-soft hover:border-yonsei-blue hover:text-yonsei-blue'
            )}
            style={{ animationDelay: `${i * 60}ms` }}
            aria-current={activeKey === t.key ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Container className="flex flex-col gap-10 py-10 lg:flex-row lg:items-start lg:gap-14 lg:py-16">
        {/* 콘텐츠 (레이아웃에 이미 <main id="main">이 있어 중첩 방지를 위해 section 사용) */}
        <section className="min-w-0 flex-1" aria-labelledby={`${active.key}-title`}>
          <div key={active.key} className="anim-panel">
            <h2
              id={`${active.key}-title`}
              className="mb-10 scroll-mt-24 text-display tracking-tight text-content"
            >
              {active.label}
            </h2>
            {active.content ? (
              active.content
            ) : active.markdown ? (
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

        {/* 우측 목차 박스 (데스크톱 전용, 모바일은 상단 스크롤 탭으로 대체) — 테두리 없이,
            리스트 왼쪽을 이어지는 세로 그라디언트 막대 하나로 표시 */}
        <nav className="hidden shrink-0 lg:sticky lg:top-28 lg:block lg:w-72" aria-label="섹션 목차">
          {navTitle && (
            <p className="mb-4 text-xl font-bold text-content">{navTitle}</p>
          )}
          <div className="relative pl-5">
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[3px] rounded-full bg-gradient-to-b from-yonsei-navy via-yonsei-blue to-yonsei-gold"
            />
            <ul>
              {tabs.map((t, i) => (
                <li
                  key={t.key}
                  className="anim-nav-item border-b border-surface-border last:border-b-0"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <button
                    onClick={() => selectTab(t.key)}
                    className={cn(
                      'group flex w-full items-center justify-between gap-3 py-3 text-left text-sm transition-colors',
                      activeKey === t.key
                        ? 'font-bold text-yonsei-navy'
                        : 'font-medium text-content-soft hover:text-yonsei-navy'
                    )}
                    aria-current={activeKey === t.key ? 'page' : undefined}
                  >
                    {t.label}
                    <span
                      aria-hidden="true"
                      className="text-xs text-content-faint transition-transform group-hover:translate-x-0.5 group-hover:text-yonsei-blue"
                    >
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </Container>
    </>
  );
}
