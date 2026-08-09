import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { GraduateRequirementSteps } from '@/components/GraduateRequirementSteps';
import { getPageMarkdownRuntime } from '@/lib/content-runtime';
import { GraduateTabPage } from '../_shared/GraduateTabPage';
import { graduateTabMetadata } from '../_shared/tabs';

// 콘텐츠 소스 전환(Stage A): 본문이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return graduateTabMetadata(params.locale, 'requirements');
}

/**
 * 졸업 요건 — STEP 스크롤 문법: 좌측 sticky 단계 목차(스크롤스파이) +
 * 좌우 교대 STEP 헤더 + 유의사항 콜아웃 (나열식 EditorialProse 대체).
 * 마크다운은 Prose 가 아니라 GraduateRequirementSteps 가 직접 해석한다.
 */
export default async function GraduateRequirementsPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  const requirementsMarkdown = (await getPageMarkdownRuntime('graduate-requirements')) ?? '';

  return (
    <GraduateTabPage locale={params.locale} tab="requirements">
      <GraduateRequirementSteps markdown={requirementsMarkdown} />
    </GraduateTabPage>
  );
}
