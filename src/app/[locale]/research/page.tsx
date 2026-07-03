import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { LabList } from '@/components/LabList';
import { getPageMarkdown } from '@/lib/pages';
import { getLabsDirectory } from '@/lib/faculty';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  return { title: t('research.label') };
}

const SECTION_SLUGS: Record<string, string | null> = {
  vision: 'research-vision',
  capacity: 'research-capacity',
  labs: 'research-labs',
  social: 'research-social',
};

export default async function ResearchPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tResearch = await getTranslations({ locale: params.locale, namespace: 'research' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });

  const tabs: TabItem[] = Object.entries(SECTION_SLUGS).map(([key, slug]) => ({
    key,
    label: tMenu(`research.items.${key}`),
    markdown: slug ? getPageMarkdown(slug) : null,
    content: key === 'labs' ? <LabList items={getLabsDirectory()} /> : undefined,
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
