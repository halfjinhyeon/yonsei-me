import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { NewsListPage, newsEmptyLabel, newsListMetadata } from '../_shared/NewsListPage';
import { buildNoticeList } from '../_shared/list-data';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 목록도 ISR — revalidateTag('posts') 가 즉시 갱신, 이 값은 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return newsListMetadata(params.locale, 'notices');
}

/** 공지사항 — 뉴스 섹션의 기본 탭(`/news` 는 여기로 308) */
export default async function NoticesBoardPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const { items, categories } = await buildNoticeList(locale);
  const emptyLabel = await newsEmptyLabel(locale);

  return (
    <NewsListPage locale={params.locale} seg="notices">
      <FilterableBoardList
        items={items}
        categories={categories}
        locale={locale}
        emptyLabel={emptyLabel}
      />
    </NewsListPage>
  );
}
