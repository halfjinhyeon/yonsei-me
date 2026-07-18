import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tP = await getTranslations({ locale: params.locale, namespace: 'pages' });
  return { title: t('recruit.label'), description: tP('recruit.subtitle') };
}

export default async function FacultyRecruitmentPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tPages = await getTranslations({ locale: params.locale, namespace: 'pages' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });

  // 줄글 마크다운 대신 에디토리얼 타이포 컴포넌트로 렌더 (EditorialTab + content/editorial-tabs.json)
  const tabs: TabItem[] = [
    {
      key: 'info',
      label: tMenu('recruit.items.info'),
      markdown: null,
      content: <EditorialTab data={getEditorialTab('recruit-info')} locale={locale} />,
    },
    {
      key: 'apply',
      label: tMenu('recruit.items.apply'),
      markdown: null,
      content: <EditorialTab data={getEditorialTab('recruit-apply')} locale={locale} />,
    },
  ];

  return (
    <>
      <Hero
        title={tMenu('recruit.label')}
        subtitle={tPages('recruit.subtitle')}
        breadcrumb={[{ label: tMenu('recruit.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('recruit.label')} />
    </>
  );
}
