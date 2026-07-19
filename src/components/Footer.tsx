import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Container } from './Container';
import { RelatedSites } from './RelatedSites';
import { ScrollTopButton } from './ScrollTopButton';
import { pick } from '@/lib/content';
import relatedSitesData from '@content/related-sites.json';
import instagramData from '@content/instagram.json';
import type { Locale } from '@/i18n/routing';

// 개인정보처리방침·법적고지 — 학과 자체 페이지가 없어 대학 대표 사이트로 임시 연결한다.
// 실제 방침 페이지 URL 이 확정되면 이 상수만 교체하면 된다.
const PRIVACY_URL = 'https://www.yonsei.ac.kr';
const LEGAL_URL = 'https://www.yonsei.ac.kr';

// 하단 대형 마퀴 문구 — 양 로케일 동일한 영문 브랜드 장식(aria-hidden)
const MARQUEE_TEXT = 'YONSEI SCHOOL OF MECHANICAL ENGINEERING';

/**
 * 사이트 공통 푸터 — 레퍼런스(이화여대) 구조의 연세 네이비 버전.
 * 상단 3열: [엠블럼 + 워드마크] [SNS 아이콘 + 카피라이트 + 법적링크·주소(작게)]
 *          [관련 사이트 알약 드롭다운 + 맨 위로 원형 버튼],
 * 하단: 학부 영문명이 오른쪽→왼쪽으로 무한히 흐르는 초대형 마퀴(footer-marquee,
 *       지마켓산스 볼드 — 히어로 제목과 동일 서체로 브랜드 일관성).
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

          {/* 중: SNS 아이콘 + 카피라이트 + 법적 링크·주소(작게) — 레퍼런스의 중앙 열 */}
          <div className="flex flex-col items-center gap-3 text-center lg:flex-1">
            {/* SNS — 실계정이 있는 인스타그램만 노출 */}
            <a
              href={instagramData.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t('instagram')} — ${t('siteExternal')}`}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/35 text-white transition-colors hover:border-white hover:bg-white hover:text-yonsei-navy"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4.2" />
                <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <p className="text-sm text-white/85">
              © {year} {t('copyright')}
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-semibold text-white/70">
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

      {/* 하단 대형 마퀴 — 오른쪽→왼쪽 무한 루프(장식, reduced-motion 시 정지).
          지마켓산스 볼드(히어로 제목 서체). 문구 2벌 = 이음새 없는 -50% 루프. */}
      <div className="footer-marquee pb-3 pt-0 lg:pb-4" aria-hidden="true">
        <div
          className="footer-marquee-track text-[clamp(2.75rem,8.5vw,7rem)] font-bold leading-none tracking-tight text-white"
          style={{ fontFamily: 'var(--font-hero), var(--font-sans), sans-serif' }}
        >
          <span className="px-[0.35em]">{MARQUEE_TEXT}</span>
          <span className="px-[0.35em]">{MARQUEE_TEXT}</span>
        </div>
      </div>
    </footer>
  );
}
