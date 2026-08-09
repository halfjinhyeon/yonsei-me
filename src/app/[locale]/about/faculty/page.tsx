import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FacultyDirectoryGrid } from '@/components/FacultyDirectoryGrid';
import { getFacultyDirectoryRuntime } from '@/lib/content-runtime';
import { getFacultyProfileNames } from '@/lib/faculty';
import { AboutTabPage } from '../_shared/AboutTabPage';
import { aboutTabMetadata } from '../_shared/tabs';

// 콘텐츠 소스 전환(Stage A): 교수진이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return aboutTabMetadata(params.locale, 'faculty');
}

/** 교수진 — 사진은 파일명(public/img/faculty/<이름>)으로 매칭한다(JSON 필드가 아니다) */
export default async function AboutFacultyPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const tFaculty = await getTranslations({ locale: params.locale, namespace: 'faculty' });
  const faculty = await getFacultyDirectoryRuntime();

  return (
    <AboutTabPage locale={params.locale} tab="faculty">
      <FacultyDirectoryGrid
        items={faculty}
        moreLabel={tFaculty('moreLabel')}
        profileNames={getFacultyProfileNames()}
      />
    </AboutTabPage>
  );
}
