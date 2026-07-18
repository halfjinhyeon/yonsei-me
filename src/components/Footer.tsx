import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Container } from './Container';
import { navItems } from './nav-items';

export function Footer() {
  const t = useTranslations('footer');
  const tNav = useTranslations('nav');
  const tMeta = useTranslations('meta');
  const year = new Date().getFullYear();

  const externalLinks = [
    { label: t('university'), href: 'https://www.yonsei.ac.kr' },
    { label: t('engineering'), href: 'https://engineering.yonsei.ac.kr' },
    { label: t('portal'), href: 'https://portal.yonsei.ac.kr' },
    { label: t('library'), href: 'https://library.yonsei.ac.kr' },
  ];

  return (
    <footer className="border-t border-surface-border bg-surface-soft">
      <Container>
        <div className="grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
          {/* 학부 정보 */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 place-items-center rounded-md bg-yonsei-navy text-sm font-black text-white"
              >
                Y
              </span>
              <span className="text-base font-bold text-content">{tMeta('siteName')}</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-content-soft">
              {t('tagline')}
            </p>
            <address className="mt-4 space-y-1 text-sm not-italic text-content-faint">
              <p>{t('address')}</p>
              <p>
                {t('tel')}: 02-2123-0000 · Email: me@yonsei.ac.kr
              </p>
            </address>
          </div>

          {/* 바로가기 */}
          <nav aria-label={t('quickLinks')}>
            <h2 className="text-sm font-bold text-content">{t('quickLinks')}</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {navItems.slice(0, 5).map((item) => (
                <li key={item.href}>
                  {/* py-1 -my-1: 시각 변화 없이 터치 타깃을 24px 이상으로 확장 (WCAG 2.5.8) */}
                  <Link
                    href={item.href}
                    className="-my-1 inline-block py-1 text-content-soft transition-colors hover:text-yonsei-blue"
                  >
                    {tNav(item.labelKey)}
                  </Link>
                </li>
              ))}
              {/* 사용자용 HTML 사이트맵 페이지(/sitemap) — 크롤러용 XML 과 별개 */}
              <li>
                <Link
                  href="/sitemap"
                  className="-my-1 inline-block py-1 text-content-soft transition-colors hover:text-yonsei-blue"
                >
                  {t('sitemap')}
                </Link>
              </li>
            </ul>
          </nav>

          {/* 관련 링크 */}
          <nav aria-label={t('related')}>
            <h2 className="text-sm font-bold text-content">{t('related')}</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {externalLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-my-1 inline-flex items-center gap-1 py-1 text-content-soft transition-colors hover:text-yonsei-blue"
                  >
                    {link.label}
                    <span aria-hidden="true" className="text-xs">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-surface-border py-6 text-xs text-content-faint">
          © {year} {t('copyright')}
        </div>
      </Container>
    </footer>
  );
}
