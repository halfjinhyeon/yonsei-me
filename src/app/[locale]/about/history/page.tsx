import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AboutIntro } from '@/components/AboutIntro';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { getHistoryRuntime } from '@/lib/content-runtime';
import { getHistoryImages } from '@/lib/history-images';
import { AboutTabPage } from '../_shared/AboutTabPage';
import { aboutTabMetadata } from '../_shared/tabs';
import type { Locale } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 연혁이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return aboutTabMetadata(params.locale, 'history');
}

/**
 * 학과 소개 — 학부 소개 문구·비전·현황(AboutIntro) + 연혁 타임라인.
 * 소개 문구는 모든 탭 공통 상단이 아니라 이 탭 안에서만 보여준다 (UX).
 */
export default async function AboutHistoryPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const history = await getHistoryRuntime();

  return (
    <AboutTabPage locale={params.locale} tab="history">
      <AboutIntro locale={params.locale} />
      <HistoryTimeline
        events={history}
        locale={params.locale as Locale}
        images={getHistoryImages()}
      />
    </AboutTabPage>
  );
}
