import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { NewsListPage, newsEmptyLabel, newsListMetadata } from '../_shared/NewsListPage';
import { buildCareerRows } from '../_shared/list-data';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 목록도 ISR — revalidateTag('posts') 가 즉시 갱신, 이 값은 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return newsListMetadata(params.locale, 'career');
}

/** 취업 정보 */
export default async function CareerBoardPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const items = await buildCareerRows(locale);
  const emptyLabel = await newsEmptyLabel(locale);

  return (
    <NewsListPage locale={params.locale} seg="career">
      <FilterableBoardList items={items} locale={locale} emptyLabel={emptyLabel} />
    </NewsListPage>
  );
}
