'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { menu } from './menu';
import { LocaleToggle } from './LocaleToggle';
import { Container } from './Container';
import { Logo } from './Logo';

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn('h-3.5 w-3.5 transition-transform duration-200', className)}
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 상단 글로벌 헤더 — Cornell식 편집형 내비게이션.
 * 히어로 위에서는 투명(흰 텍스트), 스크롤/드로어 열림 시 흰 배경 + 진한 텍스트로 반전.
 * 같은 페이지 해시 링크의 탭 전환은 TabbedContent가 클릭/해시 변경을 감지해 처리한다.
 */
export function Header() {
  const t = useTranslations('nav');
  const tMenu = useTranslations('menu');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // 모바일 아코디언

  // 라우트 변경 시 메뉴 닫기
  useEffect(() => {
    setOpen(false);
    setExpanded(null);
  }, [pathname]);

  // 스크롤 시 헤더를 흰 배경으로 반전 (히어로 위에서는 투명)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 드로어 열림 시 ESC 닫기 + 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  function isActive(href: string) {
    const base = href.split('#')[0];
    return pathname === base || pathname.startsWith(`${base}/`);
  }

  const solid = scrolled || open;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        solid
          ? 'border-b border-surface-border bg-surface text-content shadow-sm'
          : 'bg-transparent text-white',
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-6 lg:h-20">
          {/* 로고 락업(엠블럼 | 헤어라인 | 연세체 워드마크) — 밝은 헤더에선 네이비로 전환 */}
          <Link
            href="/"
            className="flex shrink-0 items-center focus-visible:outline-yonsei-blue"
          >
            <Logo onLight={solid} />
          </Link>

          {/* 데스크톱 내비게이션 */}
          <nav aria-label="주 메뉴" className="hidden xl:block">
            <ul className="flex items-center gap-x-8">
              {menu.map((group) => (
                <li key={group.key} className="group relative">
                  <Link
                    href={group.href}
                    aria-current={isActive(group.href) ? 'page' : undefined}
                    aria-haspopup="true"
                    className={cn(
                      'flex items-center gap-1.5 py-2 text-[15px] font-medium transition-colors',
                      solid
                        ? isActive(group.href)
                          ? 'text-content'
                          : 'text-content-soft hover:text-content'
                        : isActive(group.href)
                          ? 'text-white'
                          : 'text-white/85 hover:text-white',
                    )}
                  >
                    {tMenu(`${group.key}.label`)}
                    <Chevron
                      className={cn(
                        'group-hover:rotate-180',
                        solid ? 'text-content-faint' : 'text-white/60',
                      )}
                    />
                  </Link>

                  {/* 드롭다운 패널 */}
                  <div className="invisible absolute left-1/2 top-full min-w-[15rem] -translate-x-1/2 translate-y-1 pt-3 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    <ul className="border border-surface-border bg-surface py-2 text-content shadow-card-hover">
                      {group.items.map((sub) => (
                        <li key={sub.key}>
                          <Link
                            href={sub.href}
                            className="block px-5 py-2.5 text-[15px] text-content-soft transition-colors hover:bg-surface-soft hover:text-yonsei-navy"
                          >
                            {tMenu(`${group.key}.items.${sub.key}`)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <LocaleToggle tone={solid ? 'light' : 'dark'} />
            </div>

            {/* CTA — Cornell 'Give →' 스타일 */}
            <Link
              href="/admission"
              className={cn(
                'group hidden items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors lg:inline-flex',
                solid
                  ? 'bg-yonsei-navy text-white hover:bg-yonsei-blue'
                  : 'bg-white text-yonsei-navy hover:bg-yonsei-gold',
              )}
            >
              {t('admission')}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              >
                <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            {/* 모바일/태블릿 메뉴 토글 */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t('close') : t('menu')}
              className={cn(
                'grid h-10 w-10 place-items-center xl:hidden',
                solid ? 'text-content hover:bg-surface-soft' : 'text-white hover:bg-white/10',
              )}
            >
              <span aria-hidden="true" className="relative block h-4 w-5">
                <span
                  className={cn(
                    'absolute left-0 top-0 h-0.5 w-5 bg-current transition-transform duration-200',
                    open && 'translate-y-[7px] rotate-45',
                  )}
                />
                <span
                  className={cn(
                    'absolute left-0 top-[7px] h-0.5 w-5 bg-current transition-opacity duration-200',
                    open && 'opacity-0',
                  )}
                />
                <span
                  className={cn(
                    'absolute bottom-0 left-0 h-0.5 w-5 bg-current transition-transform duration-200',
                    open && '-translate-y-[7px] -rotate-45',
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      </Container>

      {/* 모바일 드로어 (아코디언) — 흰 배경 */}
      <div
        id="mobile-menu"
        className={cn(
          'max-h-[calc(100dvh-4rem)] overflow-y-auto xl:hidden',
          open ? 'block' : 'hidden',
        )}
      >
        <nav aria-label="모바일 메뉴" className="border-t border-surface-border bg-surface">
          <Container>
            <ul className="flex flex-col py-2">
              {menu.map((group) => {
                const isExp = expanded === group.key;
                return (
                  <li key={group.key} className="border-b border-surface-border/60 last:border-0">
                    <div className="flex items-center">
                      <Link
                        href={group.href}
                        className="flex-1 px-3 py-3 text-base font-semibold text-content hover:text-yonsei-navy"
                      >
                        {tMenu(`${group.key}.label`)}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setExpanded(isExp ? null : group.key)}
                        aria-expanded={isExp}
                        aria-label={tMenu(`${group.key}.label`)}
                        className="grid h-10 w-10 place-items-center text-content-faint hover:bg-surface-soft"
                      >
                        <Chevron className={cn(isExp && 'rotate-180')} />
                      </button>
                    </div>
                    {isExp && (
                      <ul className="pb-2 pl-3">
                        {group.items.map((sub) => (
                          <li key={sub.key}>
                            <Link
                              href={sub.href}
                              className="block px-3 py-2 text-sm text-content-soft hover:bg-surface-soft hover:text-yonsei-navy"
                            >
                              {tMenu(`${group.key}.items.${sub.key}`)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-surface-border py-4">
              <LocaleToggle tone="light" />
            </div>
          </Container>
        </nav>
      </div>
    </header>
  );
}
