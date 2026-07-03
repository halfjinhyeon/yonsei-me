'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { menu } from './menu';
import { LocaleToggle } from './LocaleToggle';
import { Container } from './Container';
import { Logo } from './Logo';

export function Header() {
  const t = useTranslations('nav');
  const tMenu = useTranslations('menu');
  const tMeta = useTranslations('meta');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // 모바일 아코디언

  // 라우트 변경 시 메뉴 닫기
  useEffect(() => {
    setOpen(false);
    setExpanded(null);
  }, [pathname]);

  // 스크롤 시 헤더를 솔리드로 반전 (히어로 위에서는 투명)
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
        'fixed inset-x-0 top-0 z-50 text-white transition-colors duration-300',
        solid
          ? 'bg-yonsei-navy/95 shadow-lg shadow-yonsei-navy/20 backdrop-blur supports-[backdrop-filter]:bg-yonsei-navy/85'
          : 'bg-transparent',
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]">
          {/* 로고 / 학부명 */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3 rounded-md focus-visible:outline-white"
          >
            <Logo size={40} className="h-10 w-10" />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold sm:text-base">{tMeta('shortName')}</span>
              <span className="text-[11px] text-white/60">{tMeta('university')}</span>
            </span>
          </Link>

          {/* 데스크톱 메가 네비 */}
          <nav aria-label="주 메뉴" className="hidden xl:block">
            <ul className="flex items-center">
              {menu.map((group) => (
                <li key={group.key} className="group relative">
                  <Link
                    href={group.href}
                    aria-current={isActive(group.href) ? 'page' : undefined}
                    aria-haspopup="true"
                    className={cn(
                      'flex items-center gap-1 rounded-md px-3.5 py-2 text-sm font-medium transition-colors',
                      isActive(group.href) ? 'text-white' : 'text-white/80 hover:text-white',
                    )}
                  >
                    {tMenu(`${group.key}.label`)}
                    <span
                      aria-hidden="true"
                      className="text-[0.6rem] opacity-60 transition-transform duration-200 group-hover:rotate-180"
                    >
                      ▾
                    </span>
                  </Link>

                  {/* 드롭다운 패널 */}
                  <div
                    className="invisible absolute left-0 top-full min-w-[15rem] translate-y-1 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
                  >
                    <ul className="overflow-hidden rounded-xl border border-surface-border bg-surface p-2 text-content shadow-card-hover">
                      {group.items.map((sub) => (
                        <li key={sub.key}>
                          <Link
                            href={sub.href}
                            onClick={(e) => {
                              const base = sub.href.split('#')[0];
                              const sameBase = pathname === base || pathname.endsWith(base) || pathname.startsWith(`${base}/`);
                              if (sameBase) {
                                // same-page anchor: force navigation to the anchor by updating hash and reloading
                                e.preventDefault();
                                const hash = sub.href.split('#')[1] ?? '';
                                if (hash) {
                                  window.location.hash = `#${hash}`;
                                  window.location.reload();
                                } else {
                                  window.location.reload();
                                }
                              }
                            }}
                            className="block rounded-lg px-3 py-2 text-sm text-content-soft transition-colors hover:bg-surface-soft hover:text-yonsei-blue"
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

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <LocaleToggle tone="dark" />
            </div>

            {/* 모바일/태블릿 메뉴 토글 */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t('close') : t('menu')}
              className="grid h-10 w-10 place-items-center rounded-md text-white hover:bg-white/10 xl:hidden"
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

      {/* 모바일 드로어 (아코디언) */}
      <div
        id="mobile-menu"
        className={cn(
          'max-h-[calc(100dvh-4rem)] overflow-y-auto xl:hidden',
          open ? 'block' : 'hidden',
        )}
      >
        <nav aria-label="모바일 메뉴" className="border-t border-white/10 bg-yonsei-navy">
          <Container>
            <ul className="flex flex-col py-2">
              {menu.map((group) => {
                const isExp = expanded === group.key;
                return (
                  <li key={group.key} className="border-b border-white/5 last:border-0">
                    <div className="flex items-center">
                      <Link
                        href={group.href}
                        className="flex-1 rounded-md px-3 py-3 text-base font-semibold text-white/90 hover:text-white"
                      >
                        {tMenu(`${group.key}.label`)}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setExpanded(isExp ? null : group.key)}
                        aria-expanded={isExp}
                        aria-label={tMenu(`${group.key}.label`)}
                        className="grid h-10 w-10 place-items-center rounded-md text-white/70 hover:bg-white/10"
                      >
                        <span
                          aria-hidden="true"
                          className={cn('transition-transform duration-200', isExp && 'rotate-180')}
                        >
                          ▾
                        </span>
                      </button>
                    </div>
                    {isExp && (
                      <ul className="pb-2 pl-3">
                        {group.items.map((sub) => (
                          <li key={sub.key}>
                            <Link
                              href={sub.href}
                              onClick={(e) => {
                                const base = sub.href.split('#')[0];
                                const sameBase = pathname === base || pathname.endsWith(base) || pathname.startsWith(`${base}/`);
                                if (sameBase) {
                                  // force reload so page content updates when navigating within same category
                                  e.preventDefault();
                                  const hash = sub.href.split('#')[1] ?? '';
                                  if (hash) {
                                    window.location.hash = `#${hash}`;
                                    window.location.reload();
                                  } else {
                                    window.location.reload();
                                  }
                                }
                              }}
                              className="block rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white"
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
            <div className="border-t border-white/10 py-4">
              <LocaleToggle tone="dark" />
            </div>
          </Container>
        </nav>
      </div>
    </header>
  );
}
