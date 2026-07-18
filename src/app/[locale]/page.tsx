import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeroSlideshow } from '@/components/HeroSlideshow';
import { LabsSection } from '@/components/LabsSection';
import { NewsEventsSection } from '@/components/NewsEventsSection';
import { InstagramSection } from '@/components/InstagramSection';
import { GoalsSection } from '@/components/GoalsSection';
// ⚠️ 임시 — 히어로 제목 폰트 시험 패널(선택 끝나면 이 import 와 아래 렌더 한 줄 삭제)
import { pick } from '@/lib/content';
import { fetchNews, fetchBoardData } from '@/lib/posts';
import heroSlidesData from '@content/hero-slides.json';
import instagramData from '@content/instagram.json';
import editorialTabs from '@content/editorial-tabs.json';
import { getLabsDirectory } from '@/lib/faculty';
import type { Locale } from '@/i18n/routing';

// DB 소스 전환(Phase 2): 홈의 뉴스&행사가 DB 를 읽는다 — ISR 안전망
export const revalidate = 300;

export default async function HomePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const locale = params.locale as Locale;
  const t = await getTranslations({ locale, namespace: 'home' });
  const tMenu = await getTranslations({ locale, namespace: 'menu' });
  const labs = getLabsDirectory();

  // 게시판 데이터 — 기존 매핑 코드 유지를 위해 모듈 상수와 같은 이름의 지역 변수로
  const news = await fetchNews();
  const board = await fetchBoardData();

  // 학과 목표(content/editorial-tabs.json 의 undergraduate-goals.items 재사용 —
  // 학부 페이지와 단일 출처 공유). 대형 타이포는 영문 제목, 부제는 ko 로케일만.
  type RawGoal = { title: { ko: string; en: string }; body: { ko: string; en: string } };
  const goalsRaw =
    (editorialTabs as Record<string, { items?: RawGoal[] }>)['undergraduate-goals']?.items ?? [];
  const goals = goalsRaw.map((g) => ({
    big: g.title.en,
    sub: locale === 'ko' ? g.title.ko : null,
    body: pick(g.body, locale),
  }));
  // 바로가기 4종 — menu.ts 와 동일 라우트, 라벨은 기존 menu.* 키 재사용.
  // desc(연결 탭 설명)만 home.goals.links.* 신규 키.
  const goalLinks = [
    { label: tMenu('about.items.faculty'), href: '/about#faculty', desc: t('goals.links.faculty') },
    {
      label: tMenu('undergraduate.items.courses'),
      href: '/undergraduate#courses',
      desc: t('goals.links.courses'),
    },
    {
      label: tMenu('undergraduate.items.checker'),
      href: '/undergraduate#checker',
      desc: t('goals.links.checker'),
    },
    { label: tMenu('research.items.labs'), href: '/research#labs', desc: t('goals.links.labs') },
  ];

  // 히어로 슬라이드(content/hero-slides.json) — 로케일 라벨 해석 후 클라이언트로 전달.
  // 라벨 문구는 research-gallery 와 동일 분야명 재사용(콘텐츠/코드 분리).
  // linkLabel = 분야 목록의 '연구 분야 바로가기' 화살표 링크 접근성 라벨(ICU 보간).
  const heroSlides = (heroSlidesData as { field: string; title: { ko: string; en: string }; image: string }[]).map(
    (s) => ({
      field: s.field,
      label: pick(s.title, locale),
      image: s.image,
      linkLabel: t('heroSlideshow.fieldLink', { field: pick(s.title, locale) }),
    }),
  );

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
          taglines={[
            t('heroSlideshow.tagline1'),
            t('heroSlideshow.tagline2'),
            t('heroSlideshow.tagline3'),
          ]}
        />
      </div>

      {/* 콘텐츠 래퍼 — 고정 히어로 위로 슬라이드되어 덮는 흰 판(연구실~인스타그램 네 섹션).
          mt(패딩 아님)여야 초기 화면에서 히어로가 보이고, 마진 영역은 히트테스트가 안 돼
          히어로의 재생/일시정지·인디케이터 버튼을 클릭할 수 있다. 상단은 각진 직각 엣지로
          히어로를 덮는다(그림자·둥근 모서리 없음 — 사용자 지시). ⚠️ transform/will-change/
          filter 금지 — containing block 이 생기면 내부의 position:fixed 가 뷰포트 대신 이
          래퍼 기준이 된다. */}
      <div className="relative z-10 mt-[100svh] bg-surface">
        {/* ⚠️ 다음 작업(예정): 이 콘텐츠 래퍼 맨 위에 공지사항·일정 섹션을 순서대로
            한 섹션씩 추가한다(사용자 지시). 현재 첫 섹션은 학과 목표. */}

        {/* 홈에서 제거된 섹션들(컴포넌트는 보존, 홈에서만 미사용):
            · 연구 분야 갤러리 "여섯 갈래의 연구" → 히어로 슬라이드쇼와 기능 통합(ResearchGallery.tsx)
            · 프로그램 탭 "기계공학부의 체계"(ProgramTabs.tsx)
            · 공지 쇼케이스(NoticeShowcase.tsx) */}

        {/* 1. 학과 목표 — hicoda 'goals' 식 회전 타이포(3.5초, 글자 하나씩 등장) +
            바로가기 버튼 4종. */}
        <div id="sec-goals" className="scroll-mt-16 lg:scroll-mt-20">
          <GoalsSection
            heading={t('goals.label')}
            linksLabel={t('goals.linksLabel')}
            goals={goals}
            links={goalLinks}
          />
        </div>

        {/* 2. 뉴스 & 행사 — 뉴스(news.json) + 행사(board.events) 카드. */}
        <div id="sec-news" className="scroll-mt-16 lg:scroll-mt-20">
          <NewsEventsSection items={newsEventItems} />
        </div>

        {/* 3. 우리의 연구실 — 연구실 쇼케이스(네이비 라벨 + 마퀴 + 카드 캐러셀).
            사용자 지시로 뉴스 & 행사 아래(인스타그램 밴드 위)로 이동. */}
        <div id="sec-labs" className="scroll-mt-16 lg:scroll-mt-20">
          <LabsSection labs={labs} locale={locale} />
        </div>

        {/* 4. 인스타그램 밴드 (맨 아래) — 사진 그리드 없이 낮은 밴드 + 계정 버튼 하나.
            실시간 피드 연동 불가(API 제약)를 반영한 정직한 구성. 핸들·URL 은
            content/instagram.json 에서 관리. */}
        <InstagramSection
          handle={instagramData.handle}
          url={instagramData.url}
          tagline={t('instagram.tagline')}
          followLabel={t('instagram.follow')}
          externalLabel={t('instagram.external')}
        />
      </div>
    </>
  );
}
