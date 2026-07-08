import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { getPageMarkdown } from '@/lib/pages';
import { getLabsDirectory } from '@/lib/faculty';
import { LabVideoGallery } from '@/components/LabVideoGallery';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import {
  CourseCatalog,
  type CatalogColumn,
  type CatalogCourse,
} from '@/components/CourseCatalog';
import coursesGraduate from '@content/courses-graduate.json';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  return { title: t('graduate.label') };
}

// labs 는 마크다운 대신 LabVideoGallery(연구실 소개 영상 갤러리)로,
// courses 는 CourseCatalog(분야 필터 편람)로 렌더 → slug null 유지
const SECTION_SLUGS: Record<string, string | null> = {
  admission: null,
  requirements: 'graduate-requirements',
  courses: null,
  labs: null,
  bk21: 'graduate-bk21',
};

// 교과목 표 컬럼 — content/pages/graduate-courses.md 원본 표와 동일한 구성
const COURSE_COLUMNS: CatalogColumn[] = [
  { key: 'code', label: '학정번호' },
  { key: 'name', label: '과목명 (Title)' },
  { key: 'credits', label: '학점(Credits)' },
];

export default async function GraduatePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tPages = await getTranslations({ locale: params.locale, namespace: 'pages' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });

  const tabs: TabItem[] = Object.entries(SECTION_SLUGS).map(([key, slug]) => ({
    key,
    label: tMenu(`graduate.items.${key}`),
    markdown: slug ? getPageMarkdown(slug) : null,
    content:
      key === 'admission' ? (
        <EditorialTab data={getEditorialTab('graduate-admission')} locale={params.locale as Locale} />
      ) : key === 'labs' ? (
        <LabVideoGallery items={getLabsDirectory()} locale={params.locale as Locale} />
      ) : key === 'courses' ? (
        <CourseCatalog
          courses={coursesGraduate as CatalogCourse[]}
          columns={COURSE_COLUMNS}
          ariaLabel="교과목 분야 필터"
          emptyLabel={tStub('body')}
        />
      ) : undefined,
  }));

  return (
    <>
      <Hero
        title={tMenu('graduate.label')}
        subtitle={tPages('graduate.subtitle')}
        breadcrumb={[{ label: tMenu('graduate.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('graduate.label')} />
    </>
  );
}
