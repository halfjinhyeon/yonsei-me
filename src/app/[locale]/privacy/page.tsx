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
  return { title: t('privacy') };
}

/** 개인정보처리방침 — 본문은 content/pages/privacy.md (콘텐츠/코드 분리) */
export default async function PrivacyPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: 'footer' });
  const markdown = getPageMarkdown('privacy');

  return (
    <>
      <Hero title={t('privacy')} breadcrumb={[{ label: t('privacy') }]} />
      <Container className="py-14 lg:py-20">
        {markdown ? <Prose markdown={markdown} /> : null}
      </Container>
    </>
  );
}
