import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import { ResearchTabPage, researchTabMetadata } from '../_shared/ResearchTabPage';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return researchTabMetadata(params.locale, 'capacity');
}

/** 연구 역량 */
export default function ResearchCapacityPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  return (
    <ResearchTabPage locale={params.locale} tab="capacity">
      {/* landing = GSAP 탭 진입 애니메이션 옵트인. 연구 비전은 "빨리 읽히는" 탭이라
          내용을 즉시 보여주는 쪽을 택해 일부러 켜지 않았다(사용자 지시). */}
      <EditorialTab
        data={getEditorialTab('research-capacity')}
        locale={locale}
        landing="research-capacity"
      />
    </ResearchTabPage>
  );
}
