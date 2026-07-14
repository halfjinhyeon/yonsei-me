import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { LabList } from '@/components/LabList';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import { VisionInfographic } from '@/components/VisionInfographic';
import { getPageMarkdown } from '@/lib/pages';
import { getLabsDirectory } from '@/lib/faculty';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  return { title: t('research.label') };
}

const SECTION_SLUGS: Record<string, string | null> = {
  vision: null,
  capacity: null,
  labs: 'research-labs',
  social: null,
};

export default async function ResearchPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tResearch = await getTranslations({ locale: params.locale, namespace: 'research' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });

  const tabs: TabItem[] = Object.entries(SECTION_SLUGS).map(([key, slug]) => ({
    key,
    label: tMenu(`research.items.${key}`),
    markdown: slug ? getPageMarkdown(slug) : null,
    content:
      key === 'labs' ? (
        <LabList items={getLabsDirectory()} />
      ) : key === 'vision' ? (
        // 텍스트 도입부(EditorialTab) 아래에 구 이미지 대신 인포그래픽을 합성
        <>
          <EditorialTab data={getEditorialTab('research-vision')} locale={locale} />
          <VisionInfographic locale={locale} />
        </>
      ) : key === 'capacity' ? (
        <EditorialTab data={getEditorialTab('research-capacity')} locale={locale} />
      ) : key === 'social' ? (
        <EditorialTab data={getEditorialTab('research-social')} locale={locale} />
      ) : undefined,
  }));

  return (
    <>
      <Hero
        title={tMenu('research.label')}
        subtitle={tResearch('hero.subtitle')}
        breadcrumb={[{ label: tMenu('research.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('research.label')} />
    </>
  );
}
