import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import { LegacyBoardHash } from '@/components/LegacyBoardHash';
import { legacySectionHash } from '@/lib/board-links';
import { UndergraduateTabPage, undergraduateTabMetadata } from '../_shared/UndergraduateTabPage';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return undergraduateTabMetadata(params.locale, 'goals');
}

/** 교육 목표 — 학부 섹션의 기본 탭(`/undergraduate` 는 여기로 308) */
export default function UndergraduateGoalsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  return (
    <>
      <UndergraduateTabPage locale={params.locale} tab="goals">
        <EditorialTab
          data={getEditorialTab('undergraduate-goals')}
          locale={locale}
          showcaseItems
        />
      </UndergraduateTabPage>
      {/* 구 `/undergraduate#checker` 북마크 구제 — 해시는 서버에 오지 않아 클라이언트에서만
          잡힌다(`/undergraduate` 308 → 기본 탭이 해시를 물고 도착한다) */}
      <LegacyBoardHash map={legacySectionHash('undergraduate')} />
    </>
  );
}
