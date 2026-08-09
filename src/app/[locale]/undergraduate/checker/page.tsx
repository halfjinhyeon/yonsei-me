import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { GraduationChecker } from '@/components/GraduationChecker';
import { getCheckerData } from '@/lib/checker';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'undergraduate', 'checker');
}

/**
 * 나의 졸업요건 — 시간표 이미지 OCR + 요건 매칭 체커.
 * 요건·교양 데이터는 서버(getCheckerData, content/*.json 읽기)에서 조립해 넘긴다 —
 * 클라이언트 번들에 원본 카탈로그가 실리지 않게 하는 경계이므로 이 페치는 서버에 둔다.
 * (CMS 관리 대상 파일이 아니라 ISR 이 필요 없다 — 배포 시점 데이터가 곧 최신이다.)
 */
export default function UndergraduateCheckerPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  return (
    <SectionTabPage locale={params.locale} section="undergraduate" tab="checker">
      <GraduationChecker data={getCheckerData()} locale={locale} />
    </SectionTabPage>
  );
}
