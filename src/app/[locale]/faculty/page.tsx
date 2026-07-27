import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Section } from '@/components/Section';
import { DetailNavBar } from '@/components/DetailNavBar';
import { FacultyDirectoryGrid } from '@/components/FacultyDirectoryGrid';
import { getFacultyDirectory, getFacultyProfileNames } from '@/lib/faculty';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'faculty' });
  return { title: t('hero.title'), description: t('hero.subtitle') };
}

export default function FacultyPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = useTranslations('faculty');
  const tNav = useTranslations('nav');
  const tCrumb = useTranslations('breadcrumb');
  const faculty = getFacultyDirectory();

  return (
    <>
      <Hero
        title={t('hero.title')}
        subtitle={t('hero.subtitle')}
        breadcrumb={[{ label: tNav('faculty') }]}
      />
      {/* 다른 페이지와 같은 상단 바 — 교수 상세에서 "목록으로" 돌아왔을 때
          바가 사라져 길을 잃는 문제를 막는다(이 페이지는 세부탭이 없어 드롭다운 없이 표기만) */}
      <DetailNavBar homeLabel={tCrumb('home')} currentLabel={tNav('faculty')} />
      <Section>
        <FacultyDirectoryGrid
          items={faculty}
          moreLabel={t('moreLabel')}
          profileNames={getFacultyProfileNames()}
        />
      </Section>
    </>
  );
}
