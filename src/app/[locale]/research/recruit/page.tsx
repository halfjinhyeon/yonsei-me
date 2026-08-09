import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'research', 'recruit');
}

/** 교수 초빙 — 안내 + 지원서 작성 CTA(맨 아래). 구 /faculty-recruitment 통합 이전 */
export default function ResearchRecruitPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  return (
    <SectionTabPage locale={params.locale} section="research" tab="recruit">
      <EditorialTab data={getEditorialTab('recruit-info')} locale={locale} landing="recruit-info" />
    </SectionTabPage>
  );
}
