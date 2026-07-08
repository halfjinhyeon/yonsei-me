import type { ReactNode } from 'react';
import { Container } from '@/components/Container';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface BoardShellTab {
  key: string;
  label: string;
}

/**
 * TabbedContent의 주변 레이아웃(모바일 상단 스크롤 탭 + 데스크톱 우측 목차)을
 * 상세 페이지용 "링크 내비"로 재현하는 셸. TabbedContent는 클라이언트 상태로 탭을
 * 전환하지만, 여기서는 상태가 없으므로 각 탭을 목록 페이지의 `/news#<key>` 해시로
 * 이동하는 Link로 렌더한다. 현재 게시판(activeKey)만 활성 스타일을 갖는다.
 * 마크업/클래스는 TabbedContent와 시각적으로 동일하게 맞춘다.
 */
export function BoardShell({
  tabs,
  activeKey,
  navTitle,
  basePath = '/news',
  children,
}: {
  tabs: BoardShellTab[];
  activeKey: string;
  /** 우측 목차 박스 상단에 표시할 그룹명 (예: "뉴스 및 공지사항") */
  navTitle?: string;
  /** 탭 링크가 이동할 목록 페이지 경로 (기본 '/news'). 동문 상세는 '/alumni' 를 준다 */
  basePath?: string;
  children: ReactNode;
}) {
  return (
    <>
      {/* 모바일용 상단 스크롤 탭 (TabbedContent와 동일 마크업, 버튼 대신 Link) */}
      <div className="sticky top-16 z-30 flex gap-2 overflow-x-auto border-b border-surface-border bg-surface px-4 py-3 lg:hidden">
        {tabs.map((t, i) => (
          <Link
            key={t.key}
            href={`${basePath}#${t.key}`}
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
          </Link>
        ))}
      </div>

      <Container className="flex flex-col gap-10 py-10 lg:flex-row lg:items-start lg:gap-14 lg:py-16">
        {/* 콘텐츠 (레이아웃에 이미 <main id="main">이 있어 중첩 방지를 위해 section 사용) */}
        <section className="min-w-0 flex-1">{children}</section>

        {/* 우측 목차 박스 (데스크톱 전용, 모바일은 상단 스크롤 탭으로 대체) —
            TabbedContent와 동일한 세로 그라디언트 막대 + 링크 리스트 */}
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
                  <Link
                    href={`${basePath}#${t.key}`}
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
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </Container>
    </>
  );
}
