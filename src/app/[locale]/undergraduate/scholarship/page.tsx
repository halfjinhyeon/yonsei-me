import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getPageMarkdownRuntime } from '@/lib/content-runtime';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';

// 콘텐츠 소스 전환(Stage A): 장학금 본문이 데이터 레이어를 읽는다 — ISR 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'undergraduate', 'scholarship');
}

/** 장학금 — CMS 가 편집하는 마크다운 본문(content/pages/undergraduate-scholarship.md) */
export default async function UndergraduateScholarshipPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  const markdown = await getPageMarkdownRuntime('undergraduate-scholarship');

  return <SectionTabPage locale={params.locale} section="undergraduate" tab="scholarship" markdown={markdown} />;
}
