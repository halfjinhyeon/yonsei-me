import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { type BoardRow } from '@/components/BoardList';
import { pick } from '@/lib/content';
import { fetchBoardData } from '@/lib/posts';
import { boardPostHref } from '@/lib/board-links';
import { SectionTabPage, sectionTabMetadata } from '../../_shared/section-tabs';
import type { Locale } from '@/i18n/routing';

// 인턴 모집 게시판이 DB(posts)를 읽으므로 페이지를 ISR — revalidateTag('posts')가 즉시 갱신
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return sectionTabMetadata(params.locale, 'research', 'internships');
}

/**
 * 인턴 모집 목록 — 게시판이지만 **연구 메뉴 소속**이라 `/research` 아래에 산다.
 * 상세(`/research/internships/<id>`)의 부모 경로이기도 하다.
 */
export default async function ResearchInternshipsPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;

  // 인턴 모집 게시판 — 소스(db/git)는 lib/posts 가 판별. 다른 게시판과 동일한 에디토리얼 목록.
  const board = await fetchBoardData();
  // 목록이 비었을 때 문구 — 구 탭은 `stub.empty`(본문 없음 문구와 다름)를 썼다
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });
  const internItems: BoardRow[] = board.internships.map((n) => ({
    id: n.id,
    date: n.date,
    title: pick(n.title, locale),
    subtitle: n.excerpt ? pick(n.excerpt, locale) : undefined,
    // 인턴 모집 상세는 연구 소속이라 /research/internships/<id> 로 간다 — boardPostHref 가 단일 출처
    href: boardPostHref({ id: n.id, boardKey: 'internships' }),
    image: n.image,
    pinned: n.pinned,
  }));

  return (
    <SectionTabPage locale={params.locale} section="research" tab="internships">
      <FilterableBoardList items={internItems} locale={locale} emptyLabel={tStub('empty')} />
    </SectionTabPage>
  );
}
