import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SITE_URL } from '@/lib/site';
import { pretendard, gmarket } from '../fonts';
import '../globals.css';

// 모든 로케일을 정적으로 프리렌더 → 성능(SSG)
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'meta' });
  return {
    title: {
      default: t('siteName'),
      template: `%s · ${t('shortName')}`,
    },
    description: t('description'),
    metadataBase: new URL('https://me.yonsei.ac.kr'),
    openGraph: {
      title: t('siteName'),
      description: t('description'),
      locale: params.locale === 'ko' ? 'ko_KR' : 'en_US',
      type: 'website',
    },
    alternates: {
      languages: { ko: '/ko', en: '/en' },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;

  if (!routing.locales.includes(locale as never)) {
    notFound();
  }

  // 정적 렌더링 활성화
  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'nav' });
  const tMeta = await getTranslations({ locale, namespace: 'meta' });

  // 조직 구조화 데이터(JSON-LD) — 검색엔진에 기관 정보를 명시(사이트링크·지식패널 신호).
  // 로케일별 이름을 넣고 반대 로케일 명칭은 alternateName 으로 제공한다.
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    name: tMeta('siteName'),
    alternateName:
      locale === 'ko' ? 'Yonsei University School of Mechanical Engineering' : '연세대학교 기계공학부',
    url: `${SITE_URL}/${locale}`,
    logo: `${SITE_URL}/logo.svg`,
    parentOrganization: {
      '@type': 'CollegeOrUniversity',
      name: locale === 'ko' ? '연세대학교' : 'Yonsei University',
      url: 'https://www.yonsei.ac.kr',
    },
  };

  return (
    <html lang={locale} className={`${pretendard.variable} ${gmarket.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-surface antialiased">
        <script
          type="application/ld+json"
          // 자체 생성 정적 데이터(사용자 입력 미포함) — XSS 벡터 없음
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <NextIntlClientProvider messages={messages}>
          <a href="#main" className="skip-link">
            {t('skipToContent')}
          </a>
          <Header />
          <main id="main" className="overflow-x-clip">
            {children}
          </main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
