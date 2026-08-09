import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ClubGrid } from '@/components/ClubGrid';
import { getClubsRuntime } from '@/lib/content-runtime';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';

// 콘텐츠 소스 전환(Stage A): 동아리 인덱스가 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'undergraduate', 'clubs');
}

/**
 * 동아리 소개 목록 — 상세(`/undergraduate/clubs/<slug>`)의 부모 경로이기도 하다.
 * 구 탭에는 `undergraduate-clubs` 마크다운도 매달려 있었지만 카드 그리드가
 * 우선 렌더돼 한 번도 화면에 나온 적이 없다 — 그래서 옮기지 않았다.
 */
export default async function UndergraduateClubsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const tFaculty = await getTranslations({ locale: params.locale, namespace: 'faculty' });

  // 콘텐츠 데이터 — 소스(db/git)는 lib/content-runtime 이 판별.
  const clubs = await getClubsRuntime();

  return (
    <SectionTabPage locale={params.locale} section="undergraduate" tab="clubs">
      <ClubGrid items={clubs} moreLabel={tFaculty('moreLabel')} />
    </SectionTabPage>
  );
}
