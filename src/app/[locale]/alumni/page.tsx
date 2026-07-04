import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import {
  AlumniGreeting,
  AlumniOrganization,
  AlumniNotable,
  AlumniNetwork,
} from '@/components/AlumniContent';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'alumni' });
  return { title: t('hero.title') };
}

export default async function AlumniPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tAlumni = await getTranslations({ locale, namespace: 'alumni' });
  const tStub = await getTranslations({ locale, namespace: 'stub' });

  const tabs: TabItem[] = [
    {
      key: 'greeting',
      label: tMenu('alumni.items.greeting'),
      markdown: null,
      content: <AlumniGreeting locale={locale} />,
    },
    {
      key: 'organization',
      label: tMenu('alumni.items.organization'),
      markdown: null,
      content: <AlumniOrganization locale={locale} />,
    },
    {
      key: 'notable',
      label: tMenu('alumni.items.notable'),
      markdown: null,
      content: <AlumniNotable locale={locale} />,
    },
    {
      key: 'network',
      label: tMenu('alumni.items.network'),
      markdown: null,
      content: <AlumniNetwork locale={locale} emptyLabel={tStub('body')} />,
    },
  ];

  return (
    <>
      <Hero
        title={tAlumni('hero.title')}
        subtitle={tAlumni('hero.subtitle')}
        breadcrumb={[{ label: tMenu('alumni.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('alumni.label')} />
    </>
  );
}
