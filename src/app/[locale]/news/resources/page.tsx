import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { ResourceLibrary } from '@/components/ResourceLibrary';
import { NewsListPage, newsListMetadata } from '../_shared/NewsListPage';
import { buildResourceItems } from '../_shared/list-data';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 목록도 ISR — revalidateTag('posts') 가 즉시 갱신, 이 값은 안전망
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return newsListMetadata(params.locale, 'resources');
}

/** 자료실 — "받아 가는 파일" 목록이라 전용 컴포넌트(검색 인덱스는 서버에서 생성) */
export default async function ResourcesBoardPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const items = await buildResourceItems(locale);

  return (
    <NewsListPage locale={params.locale} seg="resources">
      {/* ResourceLibrary 는 자체 빈 상태 문구를 갖는다 — emptyLabel 을 받지 않는다 */}
      <ResourceLibrary items={items} locale={locale} />
    </NewsListPage>
  );
}
