import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Container } from '@/components/Container';
import { Prose } from '@/components/Prose';
import { getPageMarkdown } from '@/lib/pages';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'footer' });
  return { title: t('legal') };
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
