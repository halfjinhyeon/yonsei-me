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
import { type ResearchField } from '@/lib/faculty';
import { getLabsDirectoryRuntime, getLabSummariesRuntime } from '@/lib/content-runtime';
import { pick } from '@/lib/content';
import { fetchBoardData } from '@/lib/posts';
import galleryData from '@content/research-gallery.json';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tR = await getTranslations({ locale: params.locale, namespace: 'research' });
  return { title: t('research.label'), description: tR('hero.subtitle') };
}

// 인턴 모집 게시판이 DB(posts)를 읽으므로 페이지를 ISR — revalidateTag('posts')가 즉시 갱신
export const revalidate = 300;

const SECTION_SLUGS: Record<string, string | null> = {
  vision: null,
  capacity: null,
  labs: 'research-labs',
  internships: null,
  social: null,
  recruit: null,
};

export default async function ResearchPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const tMenu = await getTranslations({ locale: params.locale, namespace: 'menu' });
  const tResearch = await getTranslations({ locale: params.locale, namespace: 'research' });
  const tStub = await getTranslations({ locale: params.locale, namespace: 'stub' });

  // 인턴 모집 게시판 — 소스(db/git)는 lib/posts 가 판별. 다른 게시판과 동일한 에디토리얼 목록.
  const board = await fetchBoardData();
  // 연구실 목록 — 소스(db/git)는 lib/content-runtime 이 판별.
  const labs = await getLabsDirectoryRuntime();
  const internItems: BoardRow[] = board.internships.map((n) => ({
    id: n.id,
    date: n.date,
    title: pick(n.title, locale),
    subtitle: n.excerpt ? pick(n.excerpt, locale) : undefined,
    href: `/news/post/${n.id}`,
    image: n.image,
    pinned: n.pinned,
  }));

  // 분야 인트로 — research-gallery.json(분야명·설명·대표 이미지)을 로케일 해석해
  // 연구실 목록의 분야 선택 헤더로 재사용(콘텐츠 단일 출처).
  const fieldIntros = (
    galleryData as { field: string; title: { ko: string; en: string }; description: { ko: string; en: string }; image: string }[]
  ).map((g) => ({
    field: g.field as ResearchField,
    title: pick(g.title, locale),
    description: pick(g.description, locale),
    image: g.image,
  }));

  // 연구실 AI 연구요약 — 지도교수 한글 이름으로 조인한다(lab-summaries.json 키 = professorKo).
  // 로케일 해석을 서버에서 끝내 한쪽 언어만 클라이언트로 보낸다(번들에 한/영 양쪽 금지).
  // 개행은 공백으로 접는다 — 패널이 whitespace-pre-line 이라 개행이 그대로 빈 줄이 된다.
  const labSummaries = Object.fromEntries(
    Object.entries(await getLabSummariesRuntime()).map(([professorKo, text]) => [
      professorKo,
      pick(text, locale).replace(/\r\n|\r|\n/g, ' ').replace(/\s{2,}/g, ' ').trim(),
    ]),
  );

  const tabs: TabItem[] = Object.entries(SECTION_SLUGS).map(([key, slug]) => ({
    key,
    label: tMenu(`research.items.${key}`),
    markdown: slug ? getPageMarkdown(slug) : null,
    content:
      key === 'labs' ? (
        <LabList items={labs} fieldIntros={fieldIntros} summaries={labSummaries} />
      ) : key === 'internships' ? (
        <FilterableBoardList items={internItems} locale={locale} emptyLabel={tStub('empty')} />
      ) : key === 'vision' ? (
        // 텍스트 도입부(EditorialTab) 아래에 구 이미지 대신 인포그래픽을 합성
        <>
          <EditorialTab data={getEditorialTab('research-vision')} locale={locale} />
          <VisionInfographic locale={locale} />
        </>
      ) : key === 'capacity' ? (
        // landing = GSAP 탭 진입 애니메이션 옵트인. 연구 비전은 "빨리 읽히는" 탭이라
        // 내용을 즉시 보여주는 쪽을 택해 일부러 켜지 않았다(사용자 지시).
        <EditorialTab data={getEditorialTab('research-capacity')} locale={locale} landing="research-capacity" />
      ) : key === 'social' ? (
        // 신문고 절차는 각진 정사각 상자 + 셰브런 인포그래픽으로
        <EditorialTab
          data={getEditorialTab('research-social')}
          locale={locale}
          boxedSteps
          landing="research-social"
        />
      ) : key === 'recruit' ? (
        // 교수 초빙 안내 + 지원서 작성 CTA(맨 아래) — 구 /faculty-recruitment 통합 이전
        <EditorialTab data={getEditorialTab('recruit-info')} locale={locale} landing="recruit-info" />
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
