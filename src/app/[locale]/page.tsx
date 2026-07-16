import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeroSlideshow } from '@/components/HeroSlideshow';
import { NoticeShowcase } from '@/components/NoticeShowcase';
import { LabsSection } from '@/components/LabsSection';
import { NewsEventsSection } from '@/components/NewsEventsSection';
import { ResearchGallery } from '@/components/ResearchGallery';
import { pick } from '@/lib/content';
import { fetchNews, fetchBoardData } from '@/lib/posts';
import galleryData from '@content/research-gallery.json';
import heroSlidesData from '@content/hero-slides.json';
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

  // 히어로 슬라이드(content/hero-slides.json) — 로케일 라벨 해석 후 클라이언트로 전달.
  // 라벨 문구는 research-gallery 와 동일 분야명 재사용(콘텐츠/코드 분리).
  const heroSlides = (heroSlidesData as { field: string; title: { ko: string; en: string }; image: string }[]).map(
    (s) => ({ field: s.field, label: pick(s.title, locale), image: s.image }),
  );

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

  return (
    <>
      {/* 1. 애니메이션 히어로 — 고정 배경 레이어(hicoda 식 "fixed background reveal").
          inset-0 으로 모바일 URL바 수축·확장에도 항상 뷰포트를 가득 채우고, 히어로
          그라디언트(위→아래)를 이 래퍼가 직접 갖는다. -z-10(음수)이라 in-flow 인
          푸터 아래로 깔려, 페이지 하단에서 푸터가 히어로를 덮는다. mt-[100svh] 콘텐츠
          래퍼가 스크롤에 따라 이 위로 슬라이드해 덮는다(순수 CSS 레이어링, JS 스크롤
          핸들러 없음). */}
      <div
        id="sec-hero"
        className="fixed inset-0 -z-10"
        style={{ backgroundImage: 'linear-gradient(#3f7ad2, #1d4a92)' }}
      >
        <HeroSlideshow
          slides={heroSlides}
          title={t('heroSlideshow.title')}
          navLabel={t('heroSlideshow.navLabel')}
        />
      </div>

      {/* 콘텐츠 래퍼 — 고정 히어로 위로 슬라이드되어 덮는 흰 판(연구~공지 다섯 섹션).
          mt(패딩 아님)여야 초기 화면에서 히어로가 보이고, 마진 영역은 히트테스트가 안 돼
          히어로의 재생/일시정지·인디케이터 버튼을 클릭할 수 있다. 상단은 각진 직각 엣지로
          히어로를 덮는다(그림자·둥근 모서리 없음 — 사용자 지시). ⚠️ transform/will-change/
          filter 금지 — containing block 이 생기면 내부의 position:fixed 가 뷰포트 대신 이
          래퍼 기준이 된다. */}
      <div className="relative z-10 mt-[100svh] bg-surface">
        {/* 2. 연구 분야 갤러리 → 오버레이 (Osmo Flip). 이제 흰 래퍼 위에 놓인다.
            scroll-mt 는 앵커 딥링크(#sec-research) 이동 시 고정 헤더 아래로 정렬. */}
        <div id="sec-research" className="scroll-mt-16 lg:scroll-mt-20">
          <ResearchGallery items={galleryItems} />
        </div>

        {/* 3. (구 프로그램 탭 "기계공학부의 체계" 삭제 — 새 디자인 삽입 예정, 현재 공백)
            컴포넌트 src/components/ProgramTabs.tsx 는 보존되어 있으나 홈에서 미사용.
            여기에 새 섹션을 넣으면 됨(연구 갤러리 ↔ 연구실 쇼케이스 사이). */}

        {/* 4. 연구실 쇼케이스(네이비 라벨 + 마퀴 + 카드 캐러셀) — 풀뷰포트. */}
        <div id="sec-labs" className="scroll-mt-16 lg:scroll-mt-20">
          <LabsSection labs={labs} locale={locale} />
        </div>

        {/* 5. 뉴스 & 행사 — 뉴스(news.json) + 행사(board.events) 카드. */}
        <div id="sec-news" className="scroll-mt-16 lg:scroll-mt-20">
          <NewsEventsSection items={newsEventItems} />
        </div>

        {/* 6. 공지 쇼케이스 (풀블리드, 맨 아래) — 학부·대학원 공지를 로열블루 위에 지그재그로 */}
        <NoticeShowcase
          notices={showcaseNotices}
          locale={locale}
          heading={tMenu('news.items.notices')}
          subtitle={tNews('hero.subtitle')}
          moreLabel={t('newsPreview.viewAll')}
        />
      </div>
    </>
  );
}
