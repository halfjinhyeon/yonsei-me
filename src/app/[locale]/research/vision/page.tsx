import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import { VisionInfographic } from '@/components/VisionInfographic';
import { LegacyBoardHash } from '@/components/LegacyBoardHash';
import { legacySectionHash } from '@/lib/board-links';
import { ResearchTabPage, researchTabMetadata } from '../_shared/ResearchTabPage';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return researchTabMetadata(params.locale, 'vision');
}

/** 연구 비전 — 연구 섹션의 기본 탭(`/research` 는 여기로 308) */
export default function ResearchVisionPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  return (
    <>
      <ResearchTabPage locale={params.locale} tab="vision">
        {/* 텍스트 도입부(EditorialTab) 아래에 구 이미지 대신 인포그래픽을 합성 */}
        <EditorialTab data={getEditorialTab('research-vision')} locale={locale} />
        <VisionInfographic locale={locale} />
      </ResearchTabPage>
      {/* 구 `/research#internships` 북마크 구제 — 해시는 서버에 오지 않아 클라이언트에서만
          잡힌다(`/research` 308 → 기본 탭이 해시를 물고 도착한다) */}
      <LegacyBoardHash map={legacySectionHash('research')} />
    </>
  );
}
