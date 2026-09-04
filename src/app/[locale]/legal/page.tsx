import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Container } from '@/components/Container';
import { Prose } from '@/components/Prose';
import { getPageMarkdown } from '@/lib/pages';
import { pageMetadata } from '@/lib/page-metadata';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale = params.locale as Locale;
  const t = await getTranslations({ locale, namespace: 'footer' });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  return pageMetadata({
    locale,
    path: 'legal',
    title: t('legal'),
    description: tSeo('pages.legal'),
  });
}

/** 법적고지 — 본문은 content/pages/legal.md (콘텐츠/코드 분리) */
export default async function LegalPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: 'footer' });
  const markdown = getPageMarkdown('legal');

  return (
    <>
      <Hero title={t('legal')} breadcrumb={[{ label: t('legal') }]} />
      <Container className="py-14 lg:py-20">
        {markdown ? <Prose markdown={markdown} /> : null}
      </Container>
    </>
  );
}
