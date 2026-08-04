import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Container } from './Container';
import { RelatedSites } from './RelatedSites';
import { ScrollTopButton } from './ScrollTopButton';
import { pick } from '@/lib/content';
import relatedSitesData from '@content/related-sites.json';
import type { Locale } from '@/i18n/routing';

/**
 * 사이트 공통 푸터 — 레퍼런스(이화여대) 구조의 연세 네이비 버전.
 * 3열: [엠블럼 + 워드마크] [카피라이트 + 법적링크·주소(작게)]
 *      [관련 사이트 알약 드롭다운 + 맨 위로 원형 버튼].
 * 관련 사이트 목록·URL 은 content/related-sites.json(콘텐츠/코드 분리).
 */
export function Footer() {
  const t = useTranslations('footer');
  const tMeta = useTranslations('meta');
  const locale = useLocale() as Locale;
  const year = new Date().getFullYear();

  const relatedSites = (
    relatedSitesData as { label: { ko: string; en: string }; href: string }[]
  ).map((s) => ({ label: pick(s.label, locale), href: s.href }));

  return (
    <footer className="bg-yonsei-navy text-white">
      <Container>
        <div className="flex flex-col gap-10 py-12 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:py-14">
          {/* 좌: 엠블럼 + 워드마크 */}
          <div className="flex items-center gap-4 lg:shrink-0">
            {/* 흰 원형 엠블럼(백색 디스크 + 네이비 문양)이라 네이비 위에서 그대로 보인다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-14 w-14 shrink-0" />
            <div className="leading-tight">
              <p className="text-xl font-bold tracking-tight text-white">{tMeta('siteName')}</p>
              <p className="mt-1 text-[11px] font-medium tracking-[0.14em] text-white/55">
                {t('brandRoman')}
              </p>
            </div>
          </div>

          {/* 중: 카피라이트 + 법적 링크·주소(작게) — 레퍼런스의 중앙 열.
              인스타그램은 홈 SNS 밴드에서 이미 크게 안내하므로 푸터에서는 뺐다. */}
          <div className="flex flex-col items-center gap-3 text-center lg:flex-1">
            <p className="text-sm text-white/85">
              © {year} {t('copyright')}
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-semibold text-white/70">
              <Link href="/privacy" className="-my-1 py-1 transition-colors hover:text-white">
                {t('privacy')}
              </Link>
              <span aria-hidden="true" className="text-white/25">|</span>
              <Link href="/legal" className="-my-1 py-1 transition-colors hover:text-white">
                {t('legal')}
              </Link>
              <span aria-hidden="true" className="text-white/25">|</span>
              <Link href="/sitemap" className="-my-1 py-1 transition-colors hover:text-white">
                {t('sitemap')}
              </Link>
            </p>
            <p className="text-xs leading-relaxed text-white/45">
              {t('address')} · {t('phones')}
            </p>
          </div>

          {/* 우: 관련 사이트 알약 드롭다운 + 맨 위로 원형 버튼 */}
          <div className="flex items-center gap-3 lg:shrink-0">
            <RelatedSites
              sites={relatedSites}
              triggerLabel={t('relatedSites')}
              openLabel={t('relatedSitesOpen')}
              externalLabel={t('siteExternal')}
            />
            <ScrollTopButton label={t('toTop')} />
          </div>
        </div>
      </Container>

    </footer>
  );
}
