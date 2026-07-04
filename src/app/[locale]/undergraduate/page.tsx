import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { ClubGrid } from '@/components/ClubGrid';
import { Accordion } from '@/components/Accordion';
import { GraduationChecker } from '@/components/GraduationChecker';
import { getPageMarkdown, getUndergraduateRequirementSections } from '@/lib/pages';
import { getClubs } from '@/lib/faculty';
import { getCheckerData } from '@/lib/checker';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  return { title: t('undergraduate.label') };
}

// 학부 하위 섹션: key → 임포트 마크다운 슬러그 (없으면 준비 중)
// requirements(아코디언)·checker(졸업요건 체크)는 커스텀 컴포넌트로 렌더
const SECTION_SLUGS: Record<string, string | null> = {
  goals: 'undergraduate-goals',
  requirements: null,
  checker: null,
  courses: 'undergraduate-courses',
  curriculum: 'undergraduate-curriculum',
  clubs: 'undergraduate-clubs',
  scholarship: 'undergraduate-scholarship',
};

export default async function UndergraduatePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
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
      ) : key === 'checker' ? (
        <GraduationChecker data={getCheckerData()} locale={locale} />
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
