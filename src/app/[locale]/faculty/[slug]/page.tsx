import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/Hero';
import { Section } from '@/components/Section';
import { FacultyProfileArticle } from '@/components/FacultyProfileArticle';
import { getFacultyDirectory, getFacultyProfile, getFacultyProfileNames } from '@/lib/faculty';
import { routing } from '@/i18n/routing';

// content/faculty-profiles 의 파일명(한글 이름)이 그대로 slug 다. CMS 연동 없는
// 정적 페이지라 빌드 시 전수 프리렌더한다(revalidate 불필요).
export function generateStaticParams() {
  const names = getFacultyProfileNames();
  return routing.locales.flatMap((locale) => names.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const profile = getFacultyProfile(decodeURIComponent(params.slug));
  if (!profile) return {};
  const record = getFacultyDirectory().find((f) => f.name === profile.name) ?? null;
  return {
    title: profile.nameEn ? `${profile.name} (${profile.nameEn})` : profile.name,
    description: record?.title ?? undefined,
  };
}

export default async function FacultyProfilePage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(params.locale);
  const name = decodeURIComponent(params.slug);
  const profile = getFacultyProfile(name);
  if (!profile) notFound();

  // 직위·보직·연구실·사진은 프로필 JSON 에 없다 — 같은 이름의 인명록 레코드에서 가져온다
  const record = getFacultyDirectory().find((f) => f.name === profile.name) ?? null;

  const t = await getTranslations({ locale: params.locale, namespace: 'faculty' });
  const tNav = await getTranslations({ locale: params.locale, namespace: 'nav' });

  return (
    <>
      <Hero
        title={t('hero.title')}
        breadcrumb={[{ label: tNav('faculty'), href: '/faculty' }, { label: profile.name }]}
      />
      <Section>
        <FacultyProfileArticle profile={profile} record={record} locale={params.locale} />
      </Section>
    </>
  );
}
