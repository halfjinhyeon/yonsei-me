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
  return sectionTabMetadata(params.locale, 'undergraduate', 'goals');
}

/** 교육 목표 — 학부 섹션의 기본 탭(`/undergraduate` 는 여기로 308) */
export default function UndergraduateGoalsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  // 구 해시 북마크 구제(LegacyBoardHash)는 셸이 기본 탭에 자동으로 얹는다
  return (
    <SectionTabPage locale={params.locale} section="undergraduate" tab="goals">
      <EditorialTab
        data={getEditorialTab('undergraduate-goals')}
        locale={locale}
        showcaseItems
      />
    </SectionTabPage>
  );
}
