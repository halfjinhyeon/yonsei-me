import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { pretendard } from '../fonts';
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

  return (
    <html lang={locale} className={pretendard.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-surface antialiased">
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
