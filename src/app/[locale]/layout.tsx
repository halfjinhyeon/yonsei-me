import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SmoothScroll } from '@/components/SmoothScroll';
import { ScrollRestoration } from '@/components/ScrollRestoration';
import { SITE_URL } from '@/lib/site';
import { pretendard, gmarket, paperlogy } from '../fonts';
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
    // 배포 도메인 단일 출처(robots·sitemap·JSON-LD 와 동일). 예전엔 여기만 학교
    // 도메인이 하드코딩돼 있어 sitemap 이 가리키는 주소와 어긋났다.
    metadataBase: new URL(SITE_URL),
    openGraph: {
      title: t('siteName'),
      description: t('description'),
      locale: params.locale === 'ko' ? 'ko_KR' : 'en_US',
      type: 'website',
      // 정적 커버(public/og/cover.png) — 처음엔 opengraph-image.tsx 라우트였지만
      // @vercel/og 가 woff2 폰트를 못 읽어 빌드가 깨졌다(Unsupported OpenType
      // signature wOF2). 같은 디자인을 헤드리스 Chrome 으로 한 번 구워 정적 자산으로
      // 쓴다 — 런타임 폰트 파싱이 사라져 어떤 환경에서도 깨질 수 없다.
      images: [
        {
          url: '/og/cover.png',
          width: 2400,
          height: 1260,
          alt: '연세대학교 기계공학부 · School of Mechanical Engineering',
        },
      ],
    },
    // 트위터/X 카드 — og:image 를 그대로 쓰되 큰 이미지 카드로 표시되게 한다
    twitter: { card: 'summary_large_image' },
    // './' 는 현재 경로로 해석된다 — 하위 페이지가 각자 자기 URL 을 정본으로 갖는다.
    // 절대 경로를 쓰면 모든 페이지가 한 URL 을 가리켜 색인에서 사라진다.
    alternates: {
      canonical: './',
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
    <html lang={locale} className={`${pretendard.variable} ${gmarket.variable} ${paperlogy.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-surface antialiased">
        {/* 전역 부드러운 스크롤(Lenis) — reduced-motion 시 자동 비활성 */}
        <SmoothScroll />
        {/* 새로고침 시 이전 스크롤 위치 복원을 끈다(맨 아래에서 시작하는 문제) */}
        <ScrollRestoration />
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
