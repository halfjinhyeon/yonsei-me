import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import { VisionInfographic } from '@/components/VisionInfographic';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'research', 'vision');
}

/** 연구 비전 — 연구 섹션의 기본 탭(`/research` 는 여기로 308) */
export default function ResearchVisionPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  // 구 해시 북마크 구제(LegacyBoardHash)는 셸이 기본 탭에 자동으로 얹는다
  return (
    <SectionTabPage locale={params.locale} section="research" tab="vision">
      {/* 텍스트 도입부(EditorialTab) 아래에 구 이미지 대신 인포그래픽을 합성 */}
      <EditorialTab data={getEditorialTab('research-vision')} locale={locale} />
      <VisionInfographic locale={locale} />
    </SectionTabPage>
  );
}
