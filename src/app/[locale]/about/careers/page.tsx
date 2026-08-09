import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { CareerPaths } from '@/components/CareerPaths';
import { AboutTabPage } from '../_shared/AboutTabPage';
import { aboutTabMetadata } from '../_shared/tabs';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return aboutTabMetadata(params.locale, 'careers');
}

/** 졸업 후 진로 — 타임라인 + 진로 분야(직무/경로/직렬) + 학위 요건 인포그래픽 */
export default async function AboutCareersPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);

  return (
    <AboutTabPage locale={params.locale} tab="careers">
      <CareerPaths locale={params.locale as Locale} />
    </AboutTabPage>
  );
}
