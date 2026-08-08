import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { TabbedContent, type TabItem } from '@/components/TabbedContent';
import { type BoardRow } from '@/components/BoardList';
import { FilterableBoardList } from '@/components/FilterableBoardList';
import { GuideSections, type GuideSection } from '@/components/AdmissionGuide';
import { pick } from '@/lib/content';
import { fetchAlumniNews, fetchAlumniEvents } from '@/lib/posts';
import { pageAlternates } from '@/lib/seo';
import assoc from '@content/alumni-association.json';

// DB 소스 전환(Phase 2): 목록도 ISR — revalidateTag('posts') 가 즉시 갱신, 이 값은 안전망
export const revalidate = 300;
import type { Locale } from '@/i18n/routing';

// 인사말 아래에 이어 붙는 총동문회 안내 — 입학 안내와 같은 섹션 렌더러를 재사용
const assocSections = (assoc as { sections: GuideSection[] }).sections;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'alumni' });
  return {
    title: t('hero.title'),
    description: t('hero.subtitle'),
    alternates: pageAlternates('alumni'),
  };
}

export default async function AlumniPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tNews = await getTranslations({ locale, namespace: 'news' });
  const tAlumni = await getTranslations({ locale, namespace: 'alumni' });
  const tStub = await getTranslations({ locale, namespace: 'stub' });

  // 게시판 데이터 — 기존 매핑 코드 유지를 위해 모듈 상수와 같은 이름의 지역 변수로
  const alumniNews = await fetchAlumniNews();
  const alumniEvents = await fetchAlumniEvents();

  // 동문 뉴스 — 뉴스·공지와 동일한 에디토리얼 목록, 동문 전용 상세 라우트로 이동
  const newsItems: BoardRow[] = alumniNews.map((item) => ({
    id: item.slug,
    date: item.date,
    title: pick(item.title, locale),
    subtitle: pick(item.excerpt, locale),
    tag: tNews(`categories.${item.category}`),
    href: `/alumni/news/${item.slug}`,
    image: item.image || undefined,
    pinned: item.pinned,
  }));

  // 동문 소식·네트워크: 세미나형 게시판(alumniEvents) → 게시판 행
  const eventRows: BoardRow[] = alumniEvents.map((e) => ({
    id: e.id,
    date: e.date,
    title: pick(e.title, locale),
    subtitle: pick(e.host, locale),
    href: `/alumni/post/${e.id}`,
    image: e.image,
    pinned: e.pinned,
  }));

  const tabs: TabItem[] = [
    {
      key: 'association',
      label: tMenu('alumni.items.association'),
      markdown: null,
      content: (
        <GuideSections sections={assocSections} locale={locale} landingName="alumni-association" />
      ),
    },
    {
      key: 'news',
      label: tMenu('alumni.items.news'),
      markdown: null,
      content: <FilterableBoardList items={newsItems} locale={locale} emptyLabel={tStub('empty')} />,
    },
    {
      key: 'network',
      label: tMenu('alumni.items.network'),
      markdown: null,
      content: <FilterableBoardList items={eventRows} locale={locale} emptyLabel={tStub('empty')} />,
    },
  ];

  return (
    <>
      <Hero
        title={tAlumni('hero.title')}
        subtitle={tAlumni('hero.subtitle')}
        breadcrumb={[{ label: tMenu('alumni.label') }]}
        narrow
      />
      {/* narrow: 동문 소식·행사도 게시판 목록이라 /news 와 같은 폭·밀도를 쓴다 */}
      <TabbedContent tabs={tabs} emptyLabel={tStub('empty')} navTitle={tMenu('alumni.label')} narrow />
    </>
  );
}
