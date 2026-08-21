import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { CurriculumFlow } from '@/components/CurriculumFlow';
import {
  getCoursesUndergraduateRuntime,
  getCourseDescriptionsRuntime,
  getCurriculumMapRuntime,
} from '@/lib/content-runtime';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';
import type { Locale } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 교과목·설명이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'undergraduate', 'curriculum');
}

/** 교과목 체계도 — 스윔레인 + 선수·연계 직각 화살표(구 CurriculumRoadmap 대체) */
export default async function UndergraduateCurriculumPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  // 콘텐츠 데이터 — 소스(db/git)는 lib/content-runtime 이 판별.
  const coursesUndergraduate = await getCoursesUndergraduateRuntime();
  const courseDescriptions = await getCourseDescriptionsRuntime();
  const curriculumMap = await getCurriculumMapRuntime();

  return (
    <SectionTabPage locale={params.locale} section="undergraduate" tab="curriculum">
      <CurriculumFlow
        locale={locale}
        courses={coursesUndergraduate}
        descriptions={courseDescriptions}
        flow={curriculumMap}
      />
    </SectionTabPage>
  );
}
