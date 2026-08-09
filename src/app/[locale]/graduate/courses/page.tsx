import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  CourseCatalog,
  type CatalogColumn,
  type CatalogCourse,
} from '@/components/CourseCatalog';
import {
  getCourseDescriptionsRuntime,
  getCoursesGraduateRuntime,
} from '@/lib/content-runtime';
import { GraduateTabPage } from '../_shared/GraduateTabPage';
import { graduateTabMetadata } from '../_shared/tabs';

// 콘텐츠 소스 전환(Stage A): 대학원 교과목이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return graduateTabMetadata(params.locale, 'courses');
}

// 교과목 표 컬럼 — content/pages/graduate-courses.md 원본 표와 동일한 구성
const COURSE_COLUMNS: CatalogColumn[] = [
  { key: 'code', label: '학정번호' },
  { key: 'name', label: '과목명 (Title)' },
  { key: 'credits', label: '학점(Credits)' },
];

/** 교과목 소개 — 분야 필터 편람(CourseCatalog) */
export default async function GraduateCoursesPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });
  const coursesGraduate = await getCoursesGraduateRuntime();
  const courseDescriptions = await getCourseDescriptionsRuntime();

  return (
    <GraduateTabPage locale={params.locale} tab="courses">
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
    </GraduateTabPage>
  );
}
