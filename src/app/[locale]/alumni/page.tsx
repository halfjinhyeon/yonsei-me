import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { BoardShell } from '@/components/BoardShell';
import { LegacyBoardHash } from '@/components/LegacyBoardHash';
import { GuideSections, type GuideSection } from '@/components/AdmissionGuide';
import { LEGACY_ALUMNI_HASH } from '@/lib/board-links';
import { pageAlternates } from '@/lib/seo';
import { getAlumniTabs } from './_shared/tabs';
import assoc from '@content/alumni-association.json';
import type { Locale } from '@/i18n/routing';

// /alumni 는 '동문회 소개' 자체다 — 게시판 둘은 /alumni/news, /alumni/network 로 독립했다.
// 여기서 읽는 것은 정적 JSON 뿐이라 DB 페치가 없다(그래서 ISR revalidate 도 없다).
const assocSections = (assoc as { sections: GuideSection[] }).sections;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'alumni' });
  return {
    title: t('hero.title'),
    description: t('hero.subtitle'),
    alternates: pageAlternates('alumni'),
  };
}

export default async function AlumniPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tAlumni = await getTranslations({ locale, namespace: 'alumni' });

  const tabs = await getAlumniTabs(locale);

  return (
    <>
      <Hero
        title={tAlumni('hero.title')}
        subtitle={tAlumni('hero.subtitle')}
        breadcrumb={[{ label: tMenu('alumni.label') }]}
      />
      <BoardShell tabs={tabs} activeKey="association" navTitle={tMenu('alumni.label')}>
        <GuideSections sections={assocSections} locale={locale} landingName="alumni-association" />
      </BoardShell>
      {/* 구 링크 /alumni#news · /alumni#network 를 새 경로로 보낸다 */}
      <LegacyBoardHash map={LEGACY_ALUMNI_HASH} />
    </>
  );
}
