import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { ClubGrid } from '@/components/ClubGrid';
import { RequirementsAccordion } from '@/components/RequirementsAccordion';
import { GraduationChecker } from '@/components/GraduationChecker';
import { MileagePlanner } from '@/components/MileagePlanner';
import { getUndergraduateRequirementSections } from '@/lib/pages';
import {
  getClubsRuntime,
  getCoursesUndergraduateRuntime,
  getCourseDescriptionsRuntime,
  getPageMarkdownRuntime,
} from '@/lib/content-runtime';
import { getCheckerData } from '@/lib/checker';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import {
  CourseCatalog,
  type CatalogColumn,
  type CatalogCourse,
} from '@/components/CourseCatalog';
import { CurriculumFlow } from '@/components/CurriculumFlow';
import { pageAlternates } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 교과목·설명·동아리·장학금 본문이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tP = await getTranslations({ locale: params.locale, namespace: 'pages' });
  return {
    title: t('undergraduate.label'),
    description: tP('undergraduate.subtitle'),
    alternates: pageAlternates('undergraduate'),
  };
}

// 학부 하위 섹션: key → 임포트 마크다운 슬러그 (없으면 준비 중)
// requirements(아코디언)·checker(졸업요건 체크)·courses(분야 필터 편람)는 커스텀 컴포넌트로 렌더
const SECTION_SLUGS: Record<string, string | null> = {
  goals: null,
  requirements: null,
  checker: null,
  mileage: null,
  courses: null,
  curriculum: null,
  clubs: 'undergraduate-clubs',
  scholarship: 'undergraduate-scholarship',
};

// 개설교과목 표 컬럼 — content/pages/undergraduate-courses.md 원본 표와 동일한 구성
const COURSE_COLUMNS: CatalogColumn[] = [
  { key: 'year', label: '학년' },
  { key: 'semester', label: '학기' },
  { key: 'kind', label: '종별' },
  { key: 'code', label: '학정번호' },
  { key: 'name', label: '교과목명' },
  { key: 'credits', label: '학점' },
  { key: 'hours', label: '강의 (실습)' },
];

export default async function UndergraduatePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tPages = await getTranslations({ locale: params.locale, namespace: 'pages' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });
  const tFaculty = await getTranslations({ locale: params.locale, namespace: 'faculty' });
  const tReq = await getTranslations({ locale: params.locale, namespace: 'requirements' });

  // 졸업요건 B안 그룹 라벨 — '이전 학번' 범위(from~to)를 데이터에서 계산.
  // RequirementsAccordion 과 동일 규칙(섹션별 대표연도 = 라벨 숫자의 최댓값, 내림차순
  // 정렬 후 최신 4개 섹션만 개별 노출)으로 '이전' 섹션들을 골라 범위를 얻는다.
  const reqSections = getUndergraduateRequirementSections();
  const sectionNums = (label: string) => (label.match(/\d{2}/g) ?? []).map(Number);
  const earlierSections = reqSections
    .filter((s) => sectionNums(s.label).length > 0)
    .sort((a, b) => Math.max(...sectionNums(b.label)) - Math.max(...sectionNums(a.label)))
    .slice(4);
  const earlierAll = earlierSections.flatMap((s) => sectionNums(s.label));
  const pad = (n: number) => String(n).padStart(2, '0');
  const earlierLabel = tReq('earlier', {
    from: pad(Math.min(...earlierAll)),
    to: pad(Math.max(...earlierAll)),
  });

  // 콘텐츠 데이터 — 소스(db/git)는 lib/content-runtime 이 판별.
  const coursesUndergraduate = await getCoursesUndergraduateRuntime();
  const courseDescriptions = await getCourseDescriptionsRuntime();
  const clubs = await getClubsRuntime();

  // 탭 본문 마크다운은 비동기 조회라 map 안에서 await 할 수 없다 — Promise.all 로 받는다.
  const tabs: TabItem[] = await Promise.all(
    Object.entries(SECTION_SLUGS).map(async ([key, slug]) => ({
    key,
    label: tMenu(`undergraduate.items.${key}`),
    markdown: slug ? await getPageMarkdownRuntime(slug) : null,
    content:
      key === 'goals' ? (
        <EditorialTab data={getEditorialTab('undergraduate-goals')} locale={locale} showcaseItems />
      ) : key === 'clubs' ? (
        <ClubGrid items={clubs} moreLabel={tFaculty('moreLabel')} />
      ) : key === 'requirements' ? (
        <RequirementsAccordion items={reqSections} earlierLabel={earlierLabel} />
      ) : key === 'checker' ? (
        <GraduationChecker data={getCheckerData()} locale={locale} />
      ) : key === 'mileage' ? (
        // 마일리지 전략 플래너 — 졸업요건 결과에서 넘어오거나(자동 담기) 이 탭으로 바로 진입
        <MileagePlanner locale={locale} />
      ) : key === 'courses' ? (
        <CourseCatalog
          courses={coursesUndergraduate as CatalogCourse[]}
          columns={COURSE_COLUMNS}
          ariaLabel="교과목 분야 필터"
          emptyLabel={tStub('body')}
          grouped="semester"
          // 교과목 소개 본문 — 체계도(CurriculumFlow)와 같은 원본을 편람 표에도 노출
          descriptions={courseDescriptions}
        />
      ) : key === 'curriculum' ? (
        // 교과목 체계도 — 스윔레인 + 선수·연계 직각 화살표(구 CurriculumRoadmap 대체)
        <CurriculumFlow
          locale={locale}
          courses={coursesUndergraduate}
          descriptions={courseDescriptions}
        />
      ) : undefined,
    })),
  );

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
