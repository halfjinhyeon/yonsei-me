import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Section } from '@/components/Section';
import { FacultyDirectoryGrid } from '@/components/FacultyDirectoryGrid';
import { getFacultyDirectory } from '@/lib/faculty';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'faculty' });
  return { title: t('hero.title') };
}

export default function FacultyPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = useTranslations('faculty');
  const tNav = useTranslations('nav');
  const faculty = getFacultyDirectory();

  return (
    <>
      <Hero
        title={t('hero.title')}
        subtitle={t('hero.subtitle')}
        breadcrumb={[{ label: tNav('faculty') }]}
      />
      <Section>
        <FacultyDirectoryGrid items={faculty} moreLabel={t('moreLabel')} />
      </Section>
    </>
  );
}
