import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Section } from '@/components/Section';
import { DetailNavBar } from '@/components/DetailNavBar';
import { FacultyDirectoryGrid } from '@/components/FacultyDirectoryGrid';
import { getFacultyProfileNames } from '@/lib/faculty';
import { getFacultyDirectoryRuntime } from '@/lib/content-runtime';

// 콘텐츠 소스 전환(Stage A): 교수진이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'faculty' });
  return { title: t('hero.title'), description: t('hero.subtitle') };
}

// 데이터 레이어가 async 라 페이지도 async — useTranslations 는 async 컴포넌트에서
// 쓸 수 없으므로 다른 페이지들과 같은 getTranslations 로 맞춘다(라벨 출처는 동일).
export default async function FacultyPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: 'faculty' });
  const tNav = await getTranslations({ locale: params.locale, namespace: 'nav' });
  const tCrumb = await getTranslations({ locale: params.locale, namespace: 'breadcrumb' });
  const faculty = await getFacultyDirectoryRuntime();

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
