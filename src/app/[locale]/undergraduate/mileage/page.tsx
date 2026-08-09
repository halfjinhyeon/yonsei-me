import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { MileagePlanner } from '@/components/MileagePlanner';
import { UndergraduateTabPage, undergraduateTabMetadata } from '../_shared/UndergraduateTabPage';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return undergraduateTabMetadata(params.locale, 'mileage');
}

/**
 * 수강신청 도우미(마일리지 전략 플래너).
 * 예측 번들(public/data/mileage-*.json)은 플래너가 클라이언트에서 lazy 로드하므로
 * 서버 페치가 없다 — 졸업요건 체커에서 넘어온 과목(sessionStorage 핸드오프)은
 * 플래너가 마운트될 때 스스로 읽는다.
 */
export default function UndergraduateMileagePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  return (
    <UndergraduateTabPage locale={params.locale} tab="mileage">
      <MileagePlanner locale={locale} />
    </UndergraduateTabPage>
  );
}
