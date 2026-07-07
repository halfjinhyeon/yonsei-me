import { getTranslations } from 'next-intl/server';
import directionsData from '@content/directions.json';
import { pick } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

type Localized = { ko: string; en: string };

interface DirectionsData {
  subway: { station: Localized; exits: Localized[] };
  bus: { color: 'green' | 'blue' | 'red'; label: Localized; routes: string }[];
}

const directions = directionsData as DirectionsData;

/** 서울 시내버스 도색(지선 초록/간선 파랑/광역 빨강)을 그대로 반영하는 라벨 색 */
const BUS_COLORS: Record<DirectionsData['bus'][number]['color'], string> = {
  green: 'text-green-600 dark:text-green-500',
  blue: 'text-blue-600 dark:text-blue-400',
  red: 'text-red-600 dark:text-red-400',
};

/**
 * 오시는 길 교통편 안내 — 지하철 출구·버스 노선 표.
 * 교직원 표와 같은 에디토리얼 표 스타일(상단 네이비 라인 + 연회색 라벨 셀).
 * 데이터는 content/directions.json (콘텐츠/코드 분리).
 */
export async function DirectionsInfo({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'contact' });

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-2">
      {/* 지하철 */}
      <section>
        <h3 className="mb-4 text-lg font-bold text-content">{t('subwayTitle')}</h3>
        <dl className="grid grid-cols-[8rem_1fr] border-t-2 border-yonsei-navy text-sm sm:text-base">
          {directions.subway.exits.map((exit, i) => (
            <div key={i} className="contents">
              <dt className="flex items-center justify-center border-b border-surface-border bg-surface-soft px-4 py-3 text-center font-semibold text-content-soft">
                {/* 역명은 첫 행에만 표기 (원본 표의 병합 셀 느낌) */}
                {i === 0 ? pick(directions.subway.station, locale) : ''}
              </dt>
              <dd className="border-b border-surface-border px-4 py-3 text-content">
                {pick(exit, locale)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 버스 노선 */}
      <section>
        <h3 className="mb-4 text-lg font-bold text-content">{t('busTitle')}</h3>
        <dl className="grid grid-cols-[8rem_1fr] border-t-2 border-yonsei-navy text-sm sm:text-base">
          {directions.bus.map((row) => (
            <div key={row.color} className="contents">
              <dt
                className={`flex items-center justify-center border-b border-surface-border bg-surface-soft px-4 py-3 text-center font-semibold ${BUS_COLORS[row.color]}`}
              >
                {pick(row.label, locale)}
              </dt>
              <dd className="border-b border-surface-border px-4 py-3 leading-relaxed text-content">
                {row.routes}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
