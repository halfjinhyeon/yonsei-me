import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  CourseCatalog,
  type CatalogColumn,
  type CatalogCourse,
} from '@/components/CourseCatalog';
import {
  getCoursesUndergraduateRuntime,
  getCourseDescriptionsRuntime,
} from '@/lib/content-runtime';
// 교재는 CMS 관리 대상이 아니라 학술정보원 수강편람에서 뽑아 고정한 자료라
// content-runtime(db/git 분기)을 거치지 않고 빌드에 그대로 인라인한다.
import textbooks from '@content/textbooks.json';
import type { TextbookData } from '@/components/TextbookPopover';
import {
  SectionTabPage,
  sectionEmptyLabel,
  sectionTabMetadata,
} from '../../_shared/section-tabs';
import type { Locale } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 교과목·설명이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

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

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'undergraduate', 'courses');
}

/** 교과목 소개 — 분야 필터 편람 표 */
export default async function UndergraduateCoursesPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  // 콘텐츠 데이터 — 소스(db/git)는 lib/content-runtime 이 판별.
  const coursesUndergraduate = await getCoursesUndergraduateRuntime();
  const courseDescriptions = await getCourseDescriptionsRuntime();
  const emptyLabel = await sectionEmptyLabel(locale);

  return (
    <SectionTabPage locale={params.locale} section="undergraduate" tab="courses">
      <CourseCatalog
        courses={coursesUndergraduate as CatalogCourse[]}
        columns={COURSE_COLUMNS}
        ariaLabel="교과목 분야 필터"
        emptyLabel={emptyLabel}
        grouped="semester"
        // 교과목 소개 본문 — 체계도(CurriculumFlow)와 같은 원본을 편람 표에도 노출
        descriptions={courseDescriptions}
        textbooks={textbooks as TextbookData}
      />
    </SectionTabPage>
  );
}
