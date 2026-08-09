import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { CareerPaths } from '@/components/CareerPaths';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'about', 'careers');
}

/** 졸업 후 진로 — 타임라인 + 진로 분야(직무/경로/직렬) + 학위 요건 인포그래픽 */
export default async function AboutCareersPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);

  return (
    <SectionTabPage locale={params.locale} section="about" tab="careers">
      <CareerPaths locale={params.locale as Locale} />
    </SectionTabPage>
  );
}
