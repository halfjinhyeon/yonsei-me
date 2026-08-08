import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { NewsListPage, newsEmptyLabel, newsListMetadata } from '../_shared/NewsListPage';
import { buildPressList } from '../_shared/list-data';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 목록도 ISR — revalidateTag('posts') 가 즉시 갱신, 이 값은 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return newsListMetadata(params.locale, 'press');
}

/** 뉴스 기사 목록 — URL 만 'press' 다(`/news/news` 중첩 회피). 라벨·상세는 그대로 뉴스. */
export default async function PressBoardPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const { items, categories, categoryLabel } = await buildPressList(locale);
  const emptyLabel = await newsEmptyLabel(locale);

  return (
    <NewsListPage locale={params.locale} seg="press">
      <FilterableBoardList
        items={items}
        categories={categories}
        categoryLabel={categoryLabel}
        locale={locale}
        emptyLabel={emptyLabel}
      />
    </NewsListPage>
  );
}
