import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AnimatedHero } from '@/components/AnimatedHero';
import { BgFlow } from '@/components/BgFlow';
import { ProgramTabs } from '@/components/ProgramTabs';
import { NoticeShowcase } from '@/components/NoticeShowcase';
import { LabsSection } from '@/components/LabsSection';
import { NewsEventsSection } from '@/components/NewsEventsSection';
import { SectionDotNav } from '@/components/SectionDotNav';
import { ResearchGallery } from '@/components/ResearchGallery';
import { programs, pick } from '@/lib/content';
import { fetchNews, fetchBoardData } from '@/lib/posts';
import galleryData from '@content/research-gallery.json';
import { getLabsDirectory } from '@/lib/faculty';
import type { Locale } from '@/i18n/routing';

// 연구 분야 갤러리 데이터(content/research-gallery.json) 형태
type RawGalleryItem = {
  field: string;
  title: { ko: string; en: string };
  description: { ko: string; en: string };
  image: string;
  images: string[];
};

// DB 소스 전환(Phase 2): 홈의 뉴스&행사·공지 쇼케이스가 DB 를 읽는다 — ISR 안전망
export const revalidate = 300;

export default async function HomePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const t = await getTranslations({ locale, namespace: 'home' });
  const tBoard = await getTranslations({ locale, namespace: 'board' });
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const tNews = await getTranslations({ locale, namespace: 'news' });
  const labs = getLabsDirectory();

  // 게시판 데이터 — 기존 매핑 코드 유지를 위해 모듈 상수와 같은 이름의 지역 변수로
  const news = await fetchNews();
  const board = await fetchBoardData();

  // 연구 분야 갤러리 항목: 로케일 해석 후 클라이언트 컴포넌트로 전달
  const galleryItems = (galleryData as RawGalleryItem[]).map((g) => ({
    field: g.field,
    title: pick(g.title, locale),
    description: pick(g.description, locale),
    image: g.image,
    images: g.images,
  }));

  // 공지 쇼케이스 데이터: 학부·대학원 공지를 합쳐 날짜 내림차순, 상위 7건.
  // group 라벨은 기존 board 키를 재사용(신규 메시지 키 금지).
  const showcaseNotices = [
    ...board.noticesUndergrad.map((n) => ({ ...n, groupLabel: tBoard('noticesUndergrad.title') })),
    ...board.noticesGraduate.map((n) => ({ ...n, groupLabel: tBoard('noticesGraduate.title') })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 7)
    .map((n) => ({
      id: n.id,
      date: n.date,
      title: pick(n.title, locale),
      groupLabel: n.groupLabel,
    }));

  // 뉴스 & 행사 섹션 데이터: 뉴스(news.json)와 행사 게시판(board.events)을 합쳐
  // 날짜 내림차순으로 상위 12건. 각 항목을 카드가 쓰는 단일 형태로 정규화한다.
  const newsEventItems = [
    ...news.map((n) => ({
      date: n.date,
      title: pick(n.title, locale),
      image: n.image || undefined, // 빈 문자열이면 플레이스홀더로 처리되도록 undefined
      href: `/news/${n.slug}`,
      kind: 'news' as const,
    })),
    ...board.events.map((e) => ({
      date: e.date,
      title: pick(e.title, locale),
      image: undefined, // 행사 게시판은 이미지 필드가 없어 항상 플레이스홀더
      href: `/news/post/${e.id}`,
      kind: 'event' as const,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 12);

  // 좌측 고정 섹션 내비 항목 — 스냅 구간(히어로~뉴스&행사)만. 캘린더·공지는 자유 구간.
  const sectionNavItems = [
    { id: 'sec-hero', label: t('sectionNav.hero') },
    { id: 'sec-research', label: t('sectionNav.research') },
    { id: 'sec-programs', label: t('sectionNav.programs') },
    { id: 'sec-labs', label: t('sectionNav.labs') },
    { id: 'sec-news', label: t('sectionNav.news') },
  ];

  return (
    <>
      {/* 홈 단일 연속 배경(고정 그라디언트 레이어 + 섹션별 스크롤 색 전환) */}
      <BgFlow />

      {/* 좌측 고정 섹션 내비 + 섹션 고정스크롤(GSAP ScrollTrigger snap) 담당 */}
      <SectionDotNav items={sectionNavItems} ariaLabel={t('sectionNav.label')} />

      {/* 1. 애니메이션 히어로 (풀뷰포트) — 로테이션 헤드라인(영문 타이틀 ↔ 한글 스테이트먼트)
          + 독수리 마스코트 + 소개 링크를 한 화면에 통합. 페이지 최상단 스냅 지점. */}
      <div id="sec-hero">
        <AnimatedHero />
      </div>

      {/* 2. 연구 분야 갤러리 → 오버레이 (Osmo Flip). 배경 플로우 위 풀뷰포트 섹션.
          data-flow 로 BgFlow 색 흐름·ProgramTabs 디졸브 여백 유지. 스냅은 고정 헤더
          아래로 정렬(scroll-mt = 헤더 높이). */}
      <div id="sec-research" data-flow className="scroll-mt-16 lg:scroll-mt-20">
        <ResearchGallery items={galleryItems} />
      </div>

      {/* 3. 프로그램 탭 (이미지 스왑 + 학부/대학원) */}
      <div id="sec-programs" className="scroll-mt-16 lg:scroll-mt-20">
        <ProgramTabs
          undergraduate={programs.undergraduate}
          graduate={programs.graduate}
          locale={locale}
        />
      </div>

      {/* 4. 연구실 쇼케이스(네이비 라벨 + 마퀴 + 카드 캐러셀) — 풀뷰포트. */}
      <div id="sec-labs" className="scroll-mt-16 lg:scroll-mt-20">
        <LabsSection labs={labs} locale={locale} />
      </div>

      {/* 5. 뉴스 & 행사 — 마지막 스냅 섹션. 뉴스(news.json) + 행사(board.events) 카드. */}
      <div id="sec-news" className="scroll-mt-16 lg:scroll-mt-20">
        <NewsEventsSection items={newsEventItems} />
      </div>

      {/* ── 여기부터 자유 스크롤 구간(스냅 지점 없음) — 내비도 이 구간에선 숨는다 ── */}

      {/* 6. 공지 쇼케이스 (풀블리드, 맨 아래) — 학부·대학원 공지를 로열블루 위에 지그재그로 */}
      <NoticeShowcase
        notices={showcaseNotices}
        locale={locale}
        heading={tMenu('news.items.notices')}
        subtitle={tNews('hero.subtitle')}
        moreLabel={t('newsPreview.viewAll')}
      />
    </>
  );
}
