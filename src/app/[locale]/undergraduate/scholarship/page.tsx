import { Fragment } from 'react';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getScholarshipsRuntime, type ScholarshipRecord } from '@/lib/content-runtime';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';

// 콘텐츠 소스 전환(Stage A): 장학금 표가 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'undergraduate', 'scholarship');
}

/** 표 머리 — 구 마크다운 표의 헤더 그대로(현행 유지: /en 도 한국어 표기) */
const HEAD = ['장학금명', '추천기준', '선발인원', '장학금액', '선발시기'] as const;
const CELL_KEYS = ['name', 'criteria', 'count', 'amount', 'timing'] as const;

/** 셀 안 줄바꿈(\n) — 구 md 의 <br> 과 같은 표시가 되도록 <br> 로 그린다 */
function MultiLine({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}

/**
 * 장학금 — CMS 가 편집하는 구조화 데이터(content/scholarships.json).
 * 2026-08 마크다운 본문에서 전환. 같은 묶음(section)끼리 한 표가 되고, 배열 순서가
 * 섹션·행 순서다. 마크업은 구 Prose(marked) 출력과 같은 모양(prose-content 의
 * h2 + table)을 그대로 내 시각 결과가 전환 전과 동일하다.
 */
export default async function UndergraduateScholarshipPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  const records = await getScholarshipsRuntime();

  // 묶음(section)별 그룹 — 첫 등장 순서가 곧 표 순서
  const sections: { title: string; rows: ScholarshipRecord[] }[] = [];
  for (const r of records) {
    const cur = sections.find((s) => s.title === r.section);
    if (cur) cur.rows.push(r);
    else sections.push({ title: r.section, rows: [r] });
  }

  return (
    <SectionTabPage locale={params.locale} section="undergraduate" tab="scholarship">
      <div className="prose-content">
        {sections.map((s) => (
          <Fragment key={s.title}>
            <h2>{s.title}</h2>
            <table>
              <thead>
                <tr>
                  {HEAD.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((row, i) => (
                  <tr key={i}>
                    {CELL_KEYS.map((k) => (
                      <td key={k}>
                        <MultiLine text={row[k]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Fragment>
        ))}
      </div>
    </SectionTabPage>
  );
}
