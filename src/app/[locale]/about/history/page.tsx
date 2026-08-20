import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AboutIntro } from '@/components/AboutIntro';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { getHistoryImagesRuntime, getHistoryRuntime } from '@/lib/content-runtime';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';
import type { Locale } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 연혁이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'about', 'history');
}

/**
 * 학과 소개 — 학부 소개 문구·비전·현황(AboutIntro) + 연혁 타임라인.
 * 소개 문구는 모든 탭 공통 상단이 아니라 이 탭 안에서만 보여준다 (UX).
 */
export default async function AboutHistoryPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  // 연대 사진도 CMS 데이터가 됐다(구 public/img/history 폴더 스캔 → content-runtime).
  // 두 조회는 서로를 기다릴 이유가 없다.
  const [history, images] = await Promise.all([getHistoryRuntime(), getHistoryImagesRuntime()]);

  return (
    <SectionTabPage locale={params.locale} section="about" tab="history">
      <AboutIntro locale={params.locale} />
      <HistoryTimeline
        events={history}
        locale={params.locale as Locale}
        images={images}
      />
    </SectionTabPage>
  );
}
