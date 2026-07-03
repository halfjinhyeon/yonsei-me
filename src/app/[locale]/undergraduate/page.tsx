import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { ClubGrid } from '@/components/ClubGrid';
import { Accordion } from '@/components/Accordion';
import { getPageMarkdown, getUndergraduateRequirementSections } from '@/lib/pages';
import { getClubs } from '@/lib/faculty';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  return { title: t('undergraduate.label') };
}

// 학부 하위 섹션: key → 임포트 마크다운 슬러그 (없으면 준비 중)
// requirements는 학번별 아코디언으로 별도 렌더하므로 여기서는 제외
const SECTION_SLUGS: Record<string, string | null> = {
  goals: 'undergraduate-goals',
  requirements: null,
  courses: 'undergraduate-courses',
  curriculum: 'undergraduate-curriculum',
  clubs: 'undergraduate-clubs',
  scholarship: 'undergraduate-scholarship',
};

export default async function UndergraduatePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tPages = await getTranslations({ locale: params.locale, namespace: 'pages' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });
  const tFaculty = await getTranslations({ locale: params.locale, namespace: 'faculty' });

  const tabs: TabItem[] = Object.entries(SECTION_SLUGS).map(([key, slug]) => ({
    key,
    label: tMenu(`undergraduate.items.${key}`),
    markdown: slug ? getPageMarkdown(slug) : null,
    content:
      key === 'clubs' ? (
        <ClubGrid items={getClubs()} moreLabel={tFaculty('moreLabel')} />
      ) : key === 'requirements' ? (
        <Accordion items={getUndergraduateRequirementSections()} />
      ) : undefined,
  }));

  return (
    <>
      <Hero
        title={tMenu('undergraduate.label')}
        subtitle={tPages('undergraduate.subtitle')}
        breadcrumb={[{ label: tMenu('undergraduate.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('undergraduate.label')} />
    </>
  );
}
