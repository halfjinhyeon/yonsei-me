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
  return sectionTabMetadata(params.locale, 'research', 'social');
}

/** 사회난제 신문고 */
export default function ResearchSocialPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  return (
    <SectionTabPage locale={params.locale} section="research" tab="social">
      {/* 신문고 절차는 각진 정사각 상자 + 셰브런 인포그래픽으로 */}
      <EditorialTab
        data={getEditorialTab('research-social')}
        locale={locale}
        boxedSteps
        landing="research-social"
      />
    </SectionTabPage>
  );
}
