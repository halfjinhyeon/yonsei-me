import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import {
  getCourseDescriptionsRuntime,
  getCoursesGraduateRuntime,
  getLabsDirectoryRuntime,
  getPageMarkdownRuntime,
} from '@/lib/content-runtime';
import { LabVideoGallery } from '@/components/LabVideoGallery';
import { GraduateRequirementSteps } from '@/components/GraduateRequirementSteps';
import {
  CourseCatalog,
  type CatalogColumn,
  type CatalogCourse,
} from '@/components/CourseCatalog';
import type { Locale } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 대학원 교과목·연구실이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tP = await getTranslations({ locale: params.locale, namespace: 'pages' });
  return { title: t('graduate.label'), description: tP('graduate.subtitle') };
}

// labs 는 마크다운 대신 LabVideoGallery(연구실 소개 영상 갤러리)로,
// courses 는 CourseCatalog(분야 필터 편람)로 렌더 → slug null 유지
// (입학 안내는 /about#admission 통합 입학 안내로 일원화 — 대학원 탭에서 제거)
const SECTION_SLUGS: Record<string, string | null> = {
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

  // 콘텐츠 데이터 — 소스(db/git)는 lib/content-runtime 이 판별.
  const coursesGraduate = await getCoursesGraduateRuntime();
  const courseDescriptions = await getCourseDescriptionsRuntime();
  const labs = await getLabsDirectoryRuntime();
  const requirementsMarkdown = (await getPageMarkdownRuntime('graduate-requirements')) ?? '';

  // 탭 본문 마크다운은 비동기 조회라 map 안에서 await 할 수 없다 — Promise.all 로 받는다.
  const tabs: TabItem[] = await Promise.all(
    Object.entries(SECTION_SLUGS).map(async ([key, slug]) => ({
    key,
    label: tMenu(`graduate.items.${key}`),
    markdown: slug ? await getPageMarkdownRuntime(slug) : null,
    content:
      key === 'labs' ? (
        <LabVideoGallery items={labs} locale={params.locale as Locale} />
      ) : key === 'requirements' ? (
        // 졸업 요건 — STEP 스크롤 문법: 좌측 sticky 단계 목차(스크롤스파이) +
        // 좌우 교대 STEP 헤더 + 유의사항 콜아웃 (나열식 EditorialProse 대체)
        <GraduateRequirementSteps markdown={requirementsMarkdown} />
      ) : key === 'courses' ? (
        <CourseCatalog
          courses={coursesGraduate as CatalogCourse[]}
          columns={COURSE_COLUMNS}
          ariaLabel="교과목 분야 필터"
          emptyLabel={tStub('body')}
          grouped="field"
          // 교과목 소개 본문 — 현재 대학원 과목은 영문명만 있고 desc 가 모두 비어 있어
          // 설명 열이 렌더되지 않는다(CourseCatalog 가 본문 유무로 판단). CMS 에서
          // 채우는 즉시 학부와 같은 모양으로 열이 붙는다.
          descriptions={courseDescriptions}
        />
      ) : undefined,
    })),
  );

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
