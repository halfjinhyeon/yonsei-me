import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { LabVideoGallery } from '@/components/LabVideoGallery';
import { getLabsDirectoryRuntime } from '@/lib/content-runtime';
import { GraduateTabPage } from '../_shared/GraduateTabPage';
import { graduateTabMetadata } from '../_shared/tabs';
import type { Locale } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 연구실이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return graduateTabMetadata(params.locale, 'labs');
}

/** 연구실 소개 — 마크다운 대신 연구실 소개 영상 갤러리 */
export default async function GraduateLabsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const labs = await getLabsDirectoryRuntime();

  return (
    <GraduateTabPage locale={params.locale} tab="labs">
      <LabVideoGallery items={labs} locale={params.locale as Locale} />
    </GraduateTabPage>
  );
}
