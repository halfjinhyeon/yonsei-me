import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { LabList } from '@/components/LabList';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { type BoardRow } from '@/components/BoardList';
import { EditorialTab, getEditorialTab } from '@/components/EditorialTab';
import { VisionInfographic } from '@/components/VisionInfographic';
import { getPageMarkdown } from '@/lib/pages';
import { getLabsDirectory } from '@/lib/faculty';
import { pick } from '@/lib/content';
import { fetchBoardData } from '@/lib/posts';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  return { title: t('research.label') };
}

// 인턴 모집 게시판이 DB(posts)를 읽으므로 페이지를 ISR — revalidateTag('posts')가 즉시 갱신
export const revalidate = 300;

const SECTION_SLUGS: Record<string, string | null> = {
  vision: null,
  capacity: null,
  labs: 'research-labs',
  internships: null,
  social: null,
};

export default async function ResearchPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tResearch = await getTranslations({ locale: params.locale, namespace: 'research' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });

  // 인턴 모집 게시판 — 소스(db/git)는 lib/posts 가 판별. 다른 게시판과 동일한 에디토리얼 목록.
  const board = await fetchBoardData();
  const internItems: BoardRow[] = board.internships.map((n) => ({
    id: n.id,
    date: n.date,
    title: pick(n.title, locale),
    subtitle: n.excerpt ? pick(n.excerpt, locale) : undefined,
    href: `/news/post/${n.id}`,
    image: n.image,
  }));

  const tabs: TabItem[] = Object.entries(SECTION_SLUGS).map(([key, slug]) => ({
    key,
    label: tMenu(`research.items.${key}`),
    markdown: slug ? getPageMarkdown(slug) : null,
    content:
      key === 'labs' ? (
        <LabList items={getLabsDirectory()} />
      ) : key === 'internships' ? (
        <FilterableBoardList items={internItems} locale={locale} emptyLabel={tStub('empty')} />
      ) : key === 'vision' ? (
        // 텍스트 도입부(EditorialTab) 아래에 구 이미지 대신 인포그래픽을 합성
        <>
          <EditorialTab data={getEditorialTab('research-vision')} locale={locale} />
          <VisionInfographic locale={locale} />
        </>
      ) : key === 'capacity' ? (
        <EditorialTab data={getEditorialTab('research-capacity')} locale={locale} />
      ) : key === 'social' ? (
        // 신문고 절차는 각진 정사각 상자 + 셰브런 인포그래픽으로
        <EditorialTab data={getEditorialTab('research-social')} locale={locale} boxedSteps />
      ) : undefined,
  }));

  return (
    <>
      <Hero
        title={tMenu('research.label')}
        subtitle={tResearch('hero.subtitle')}
        breadcrumb={[{ label: tMenu('research.label') }]}
      />
      <TabbedContent tabs={tabs} emptyLabel={tStub('body')} navTitle={tMenu('research.label')} />
    </>
  );
}
