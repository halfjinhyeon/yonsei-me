import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Container } from './Container';
import { RelatedSites } from './RelatedSites';
import { pick } from '@/lib/content';
import relatedSitesData from '@content/related-sites.json';
import type { Locale } from '@/i18n/routing';

// 개인정보처리방침·법적고지 — 학과 자체 페이지가 없어 대학 대표 사이트로 임시 연결한다.
// 실제 방침 페이지 URL 이 확정되면 이 상수만 교체하면 된다.
const PRIVACY_URL = 'https://www.yonsei.ac.kr';
const LEGAL_URL = 'https://www.yonsei.ac.kr';

/**
 * 사이트 공통 푸터 — 레퍼런스(학과 사이트) 기준 네이비 푸터.
 * 좌: 연세 엠블럼(흰 원형 로고) + 연세대학교/YONSEI UNIVERSITY | 기계공학부,
 * 중: 개인정보처리방침·법적고지·사이트맵 + 주소 + 대표전화 + 카피라이트,
 * 우: '관련 사이트' 패밀리 사이트 선택기(RelatedSites, 위로 펼침).
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
        <div className="flex flex-col gap-10 py-12 lg:flex-row lg:items-start lg:justify-between lg:gap-12 lg:py-14">
          {/* 좌: 엠블럼 + 학부명 */}
          <div className="flex items-center gap-4">
            {/* 흰 원형 엠블럼(백색 디스크 + 네이비 문양)이라 네이비 위에서 그대로 보인다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-14 w-14 shrink-0" />
            <div className="flex items-center gap-4">
              <span className="leading-tight">
                <span className="block text-sm font-semibold text-white">{tMeta('university')}</span>
                <span className="block text-[11px] font-medium tracking-[0.12em] text-white/55">
                  {t('brandRoman')}
                </span>
              </span>
              <span aria-hidden="true" className="h-8 w-px bg-white/25" />
              <span className="text-2xl font-bold tracking-tight text-white">{tMeta('shortName')}</span>
            </div>
          </div>

          {/* 중: 법적 링크 + 주소 + 대표전화 + 카피라이트 */}
          <div className="space-y-2 text-sm leading-relaxed text-white/70 lg:flex-1 lg:px-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold text-white/90">
              <a
                href={PRIVACY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="-my-1 py-1 transition-colors hover:text-white"
              >
                {t('privacy')}
              </a>
              <span aria-hidden="true" className="text-white/25">|</span>
              <a
                href={LEGAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="-my-1 py-1 transition-colors hover:text-white"
              >
                {t('legal')}
              </a>
              <span aria-hidden="true" className="text-white/25">|</span>
              <Link href="/sitemap" className="-my-1 py-1 transition-colors hover:text-white">
                {t('sitemap')}
              </Link>
            </div>
            <address className="not-italic">{t('address')}</address>
            <p>{t('phones')}</p>
            <p className="pt-1 text-white/50">
              © {year} {t('copyright')}
            </p>
          </div>

          {/* 우: 관련 사이트 드롭다운 */}
          <div className="lg:shrink-0">
            <RelatedSites
              sites={relatedSites}
              triggerLabel={t('relatedSites')}
              openLabel={t('relatedSitesOpen')}
              externalLabel={t('siteExternal')}
            />
          </div>
        </div>
      </Container>
    </footer>
  );
}
