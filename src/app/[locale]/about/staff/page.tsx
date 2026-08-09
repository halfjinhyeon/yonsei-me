import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { pick } from '@/lib/content';
import { getStaffRuntime } from '@/lib/content-runtime';
import { AboutTabPage } from '../_shared/AboutTabPage';
import { aboutTabMetadata } from '../_shared/tabs';
import type { Locale } from '@/i18n/routing';

// 콘텐츠 소스 전환(Stage A): 교직원이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return aboutTabMetadata(params.locale, 'staff');
}

/**
 * 행정 교직원 표 — 데이터는 content/staff.json (콘텐츠/코드 분리).
 * 에디토리얼 표 문법(prose-content table 과 동일): 네이비 상단 룰 + 헤어라인,
 * 배경 없는 작은 헤더, 넉넉한 행(py-5), 첫 컬럼(구분) 볼드 행 라벨.
 */
export default async function AboutStaffPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: 'about' });
  const staff = await getStaffRuntime();

  return (
    <AboutTabPage locale={params.locale} tab="staff">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[15px]">
          <thead className="border-b border-t-2 border-surface-border border-t-yonsei-navy">
            <tr>
              {(['role', 'name', 'phone', 'location', 'email'] as const).map((col) => (
                <th key={col} scope="col" className="whitespace-nowrap px-3 py-3.5 text-left text-xs font-bold text-content-faint">
                  {t(`staffTable.${col}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.email} className="border-b border-surface-border">
                <td className="whitespace-nowrap px-3 py-5 font-semibold text-content">{pick(s.role, params.locale as Locale)}</td>
                <td className="whitespace-nowrap px-3 py-5 font-medium text-content">{pick(s.name, params.locale as Locale)}</td>
                <td className="whitespace-nowrap px-3 py-5 tabular-nums text-content-soft">{s.phone}</td>
                <td className="whitespace-nowrap px-3 py-5 text-content-soft">{pick(s.location, params.locale as Locale)}</td>
                <td className="px-3 py-5">
                  <a href={`mailto:${s.email}`} className="font-medium text-yonsei-blue underline-offset-2 hover:underline">
                    {s.email}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AboutTabPage>
  );
}
