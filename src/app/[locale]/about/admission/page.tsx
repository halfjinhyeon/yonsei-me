import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AdmissionGuide } from '@/components/AdmissionGuide';
import { AboutTabPage } from '../_shared/AboutTabPage';
import { aboutTabMetadata } from '../_shared/tabs';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return aboutTabMetadata(params.locale, 'admission');
}

/** 입학 안내 — 대학/대학원 2단 섹션(문안·버튼은 content/admission-guide.json) */
export default async function AboutAdmissionPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);

  return (
    <AboutTabPage locale={params.locale} tab="admission">
      <AdmissionGuide locale={params.locale as Locale} />
    </AboutTabPage>
  );
}
