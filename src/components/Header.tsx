'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useEffect, useRef, useState } from 'react';
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
  // 영문은 라벨·항목이 길어 "라벨 아래 정렬형" 목록이 잘게 줄바꿈된다 →
  // 영문 로케일은 그리드형 패널(컬럼 상단에 카테고리명)로 분기한다.
  const gridMega = useLocale() === 'en';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // 모바일 아코디언

  // 메가메뉴 측정 — 마운트/리사이즈 시:
  // 1) 각 하위 목록의 최대폭 = 이웃 라벨 중간점 사이(라벨은 justify-between 으로
  //    글자 사이 여백이 균일하게 퍼지므로, 목록 겹침 방지는 폭 측정으로 보장)
  // 2) 시트 높이 = 가장 긴 목록 높이 (목록이 li 기준 absolute 라 시트가 스스로 못 늘어남)
  const navRef = useRef<HTMLElement | null>(null);
  const [panelH, setPanelH] = useState(0);

  // 메가메뉴는 CSS hover/focus-within 으로 열리므로, 항목 클릭 후에도 마우스가
  // 제자리면 계속 떠 있다 → 클릭 시 억제(suppress)해 즉시 닫고, 마우스가 nav 를
  // 벗어나거나(재호버 대비) 포커스가 다시 들어오면(키보드 대비) 해제한다.
  const [megaSuppressed, setMegaSuppressed] = useState(false);
  function onNavClick(e: React.MouseEvent) {
    if ((e.target as Element).closest('a')) {
      setMegaSuppressed(true);
      // 클릭된 링크에 남은 포커스가 focus-within 으로 패널을 다시 열지 않도록
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }
  useEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      if (!nav) return;
      const lis = Array.from(nav.querySelectorAll<HTMLElement>(':scope > ul > li'));
      if (lis.length === 0) return;
      const navRect = nav.getBoundingClientRect();
      if (navRect.width === 0) return; // 모바일(숨김) — 측정 불가
      const centers = lis.map((li) => {
        const r = li.querySelector(':scope > a')!.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      const GUTTER = 16; // 이웃 목록과의 최소 여백
      const lists: HTMLElement[] = [];
      lis.forEach((li, i) => {
        const list = li.querySelector<HTMLElement>('[data-mega-list]');
        if (!list) return;
        const leftEdge = i === 0 ? navRect.left - 24 : (centers[i - 1] + centers[i]) / 2;
        const rightEdge =
          i === lis.length - 1 ? navRect.right + 24 : (centers[i] + centers[i + 1]) / 2;
        const half = Math.min(centers[i] - leftEdge, rightEdge - centers[i]) - GUTTER / 2;
        list.style.maxWidth = `${Math.max(Math.floor(half * 2), 72)}px`;
        lists.push(list);
      });
      if (lists.length > 0) setPanelH(Math.max(...lists.map((el) => el.offsetHeight)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // 라우트 변경 시 메뉴 닫기
  useEffect(() => {
    setOpen(false);
    setExpanded(null);
  }, [pathname]);

  // 스크롤 시 헤더를 흰 배경으로 반전 (히어로 위에서는 투명).
  // 임계값 80px, rAF 스로틀 — 스크롤마다 setState 하지 않고 프레임당 1회만 판정.
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      setScrolled(window.scrollY > 80);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
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
        // 슬라이드다운은 "스크롤로 고정"될 때만 — 드로어 열림(open)으로 solid 가 된
        // 경우엔 헤더가 이미 제자리이므로 움직이면 어색하다.
        scrolled && 'header-slide-in',
      )}
    >
      <Container>
        {/* 데스크톱: 로고↔첫 항목, 마지막 항목↔우측 버튼 간격도 항목 사이 간격과
            동일하도록 nav 의 justify-evenly 바깥 여백이 그대로 경계 간격이 된다(gap 없음) */}
        <div className="flex h-16 items-center justify-between gap-4 xl:gap-0 lg:h-20">
          {/* 로고 락업(엠블럼 | 헤어라인 | 연세체 워드마크) — 밝은 헤더에선 네이비로 전환 */}
          <Link
            href="/"
            className="flex shrink-0 items-center focus-visible:outline-yonsei-blue"
          >
            <Logo onLight={solid} />
          </Link>

          {/* 데스크톱 내비게이션 — 상단 항목 아무거나 호버/포커스하면 전체 하위 목록이
              "각자 자기 메뉴 항목 바로 아래" 동시에 펼쳐진다(개별 드롭다운과 같은 위치
              문법, 전부 열리는 것만 다름 → 상단 배치와 어긋나지 않는다).
              self-stretch: nav 를 헤더 전체 높이로 늘려 링크→패널 마우스 이동 중
              hover 가 끊기는 데드존을 없앤다 */}
          <nav
            ref={navRef}
            aria-label="주 메뉴"
            onClick={onNavClick}
            onMouseLeave={() => setMegaSuppressed(false)}
            onFocus={() => setMegaSuppressed(false)}
            className="group/nav hidden min-w-0 self-stretch xl:flex xl:flex-1 xl:items-center"
          >
            {/* 딤 스크림 — 메뉴가 열리면 헤더 아래 페이지를 살짝 눌러 글라스 시트가
                배경 사진 위에서도 또렷이 읽히게 하고 시선을 메뉴로 모은다. ko/en 시트가
                공유하며, 시트보다 먼저 그려져 항상 그 뒤(아래)에 깔린다 */}
            <div
              aria-hidden="true"
              className={cn(
                'pointer-events-none invisible fixed inset-x-0 bottom-0 top-16 bg-black/15 opacity-0 transition-all duration-200 lg:top-20',
                !megaSuppressed &&
                  'group-hover/nav:visible group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:opacity-100',
              )}
            />

            {/* [정렬형 전용] 공용 백드롭 시트 — 뷰포트 전폭. 높이는 가장 긴 목록에 맞춰
                측정(panelH). megaSuppressed 면 열림 클래스를 제거해 클릭 직후 즉시 닫힌다.
                글라스는 mega-glass(globals.css) — 미지원·투명도 감소 환경은 CSS 폴백으로 불투명. */}
            {!gridMega && (
              <div
                aria-hidden="true"
                style={{ height: panelH }}
                className={cn(
                  'pointer-events-none invisible fixed inset-x-0 top-16 border-b border-t border-surface-border mega-glass opacity-0 transition-all duration-200 lg:top-20',
                  !megaSuppressed &&
                    'group-hover/nav:visible group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:opacity-100',
                )}
              />
            )}

            {/* justify-evenly: 바깥 2 + 사이 6 = 8개 여백을 모두 동일하게 분배 →
                "글자 사이 여백"이 일정하고, 로고·우측 버튼과의 경계 간격도 같아진다.
                목록 겹침 방지는 위 measure() 가 이웃 라벨 중간점 기준으로 목록
                최대폭을 지정해 보장. li 를 헤더 높이까지 늘려 top-full = 시트 상단 */}
            <ul className="flex h-full w-full items-stretch justify-evenly">
              {menu.map((group) => (
                <li key={group.key} className="relative flex items-center">
                  <Link
                    href={group.href}
                    aria-current={isActive(group.href) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-1.5 whitespace-nowrap py-2 text-[15px] font-medium transition-colors',
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
                        !megaSuppressed && 'group-hover/nav:rotate-180',
                        solid ? 'text-content-faint' : 'text-white/60',
                      )}
                    />
                  </Link>

                  {/* [정렬형: ko] 하위 목록 — 자기 라벨 아래 중앙 정렬, 최대폭은
                      measure() 가 지정(이웃 라벨 중간점까지 → 겹침 없음) */}
                  {!gridMega && (
                    <ul
                      data-mega-list
                      className={cn(
                        'invisible absolute left-1/2 top-full w-max -translate-x-1/2 translate-y-1 pb-7 pt-5 text-center opacity-0 transition-all duration-200',
                        !megaSuppressed &&
                          'group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100',
                      )}
                    >
                      {group.items.map((sub) => (
                        <li key={sub.key}>
                          <Link
                            href={sub.href}
                            className="block py-1.5 text-sm leading-snug text-content-soft transition-colors hover:text-yonsei-navy"
                          >
                            {tMenu(`${group.key}.items.${sub.key}`)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            {/* [그리드형: en] 전폭 시트 + 가운데 정렬 그리드(정렬형보다 조금 좁게).
                긴 영문 라벨이 라벨 폭에 갇혀 잘게 줄바꿈되는 문제를 컬럼 그리드로 해결.
                각 컬럼 상단에 카테고리명(구분선 포함)을 표시한다. */}
            {gridMega && (
              <div
                className={cn(
                  'invisible fixed inset-x-0 top-16 translate-y-1 opacity-0 transition-all duration-200 lg:top-20',
                  !megaSuppressed &&
                    'group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100',
                )}
              >
                <div className="border-b border-t border-surface-border mega-glass text-content">
                  <div className="mx-auto w-full max-w-6xl px-6">
                    <div className="grid grid-cols-7 divide-x divide-surface-border">
                      {menu.map((group) => (
                        <div key={group.key} className="px-2.5 pb-8 pt-6 text-center">
                          <Link
                            href={group.href}
                            className="block border-b border-surface-border pb-3 text-sm font-bold text-content transition-colors hover:text-yonsei-blue"
                          >
                            {tMenu(`${group.key}.label`)}
                          </Link>
                          <ul className="mt-3.5 space-y-0.5">
                            {group.items.map((sub) => (
                              <li key={sub.key}>
                                <Link
                                  href={sub.href}
                                  className="block py-1.5 text-[13px] leading-snug text-content-soft transition-colors hover:text-yonsei-navy"
                                >
                                  {tMenu(`${group.key}.items.${sub.key}`)}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <LocaleToggle tone={solid ? 'light' : 'dark'} />
            </div>

            {/* CTA — Cornell 'Give →' 스타일. 소개 페이지의 '입학 안내' 탭으로 연결 */}
            <Link
              href="/about#admission"
              className={cn(
                'group hidden items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors lg:inline-flex',
                solid
                  ? 'bg-yonsei-navy text-white hover:bg-yonsei-blue'
                  : 'bg-white text-yonsei-navy hover:bg-yonsei-blue hover:text-white',
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

      {/* 모바일 드로어 (아코디언) — 흰 배경.
          닫기는 pathname 변경 effect 만으로는 부족하다 — 메뉴 항목 대부분이 해시
          링크(/undergraduate#checker 등)라 같은 페이지 내 이동은 pathname 이 안
          바뀐다. 링크 클릭이면 무조건 닫는 클릭 위임을 함께 건다(버그 수정). */}
      <div
        id="mobile-menu"
        onClick={(e) => {
          if ((e.target as Element).closest('a')) {
            setOpen(false);
            setExpanded(null);
          }
        }}
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
