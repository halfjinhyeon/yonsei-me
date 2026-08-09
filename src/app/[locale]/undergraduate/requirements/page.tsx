import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RequirementsAccordion } from '@/components/RequirementsAccordion';
import { getUndergraduateRequirementSections } from '@/lib/pages';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'undergraduate', 'requirements');
}

/** 졸업 요건 — 학번대별 아코디언 */
export default async function UndergraduateRequirementsPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
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

  return (
    <SectionTabPage locale={params.locale} section="undergraduate" tab="requirements">
      <RequirementsAccordion items={reqSections} earlierLabel={earlierLabel} />
    </SectionTabPage>
  );
}
