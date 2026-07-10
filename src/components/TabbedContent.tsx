'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
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
  const tToc = useTranslations('toc');
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  // 우측 목차 접기 — 체계도처럼 넓은 콘텐츠를 볼 때 본문이 전폭을 쓰도록.
  // useState 초기화에서 localStorage 를 읽으면 SSR 마크업과 어긋나므로 마운트 후 복원.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem('toc-collapsed') === '1') setCollapsed(true);
    } catch {
      /* localStorage 접근 불가 시 펼침 유지 */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('toc-collapsed', next ? '1' : '0');
      } catch {
        /* 저장 실패해도 이번 세션 동작엔 지장 없음 */
      }
      return next;
    });
  }

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
          <div key={active.key} className="anim-panel relative isolate">
            {/* 장식용 독수리 — 탭 큰 제목 좌상단, 남색(eagle.png 를 마스크로 틴트) */}
            <span
              aria-hidden="true"
              className="eagle-mask pointer-events-none absolute -left-2 -top-12 -z-10 h-[230px] w-[230px] bg-yonsei-navy opacity-[0.08]"
            />
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
            리스트 왼쪽을 이어지는 세로 그라디언트 막대 하나로 표시.
            접기 토글: 체계도 같은 넓은 콘텐츠를 볼 때 얇은 레일만 남기고 본문에 전폭을 양보 */}
        <nav
          className={cn(
            'hidden shrink-0 overflow-hidden transition-[width] duration-300 lg:sticky lg:top-28 lg:block',
            collapsed ? 'lg:w-10' : 'lg:w-72',
          )}
          aria-label="섹션 목차"
        >
          {collapsed ? (
            /* 접힌 레일 — 펼치기 버튼 + 브랜드 그라디언트 바 + 세로 그룹명 */
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={toggleCollapsed}
                aria-expanded={false}
                aria-label={tToc('expand')}
                title={tToc('expand')}
                className="grid h-8 w-8 shrink-0 place-items-center border border-surface-border text-content-soft transition-colors hover:border-yonsei-blue hover:text-yonsei-blue"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span
                aria-hidden="true"
                className="h-20 w-[3px] rounded-full bg-gradient-to-b from-yonsei-navy via-yonsei-blue to-yonsei-gold"
              />
              {navTitle && (
                <span
                  aria-hidden="true"
                  className="text-xs font-bold tracking-widest text-content-faint [writing-mode:vertical-rl]"
                >
                  {navTitle}
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                {navTitle && <p className="text-xl font-bold text-content">{navTitle}</p>}
                <button
                  onClick={toggleCollapsed}
                  aria-expanded={true}
                  aria-label={tToc('collapse')}
                  title={tToc('collapse')}
                  className="ml-auto grid h-8 w-8 shrink-0 place-items-center border border-surface-border text-content-soft transition-colors hover:border-yonsei-blue hover:text-yonsei-blue"
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
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
            </>
          )}
        </nav>
      </Container>
    </>
  );
}
