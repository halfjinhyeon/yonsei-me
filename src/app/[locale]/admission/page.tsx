import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { StubPage } from '@/components/StubPage';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'admission' });
  return { title: t('hero.title') };
}

export default function AdmissionPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = useTranslations('admission');
  const tNav = useTranslations('nav');
  return (
    <StubPage
      title={t('hero.title')}
      subtitle={t('hero.subtitle')}
      crumbLabel={tNav('admission')}
    />
  );
}
