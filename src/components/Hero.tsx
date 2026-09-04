import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { Container, NARROW_MAX_W } from './Container';
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { MeshCanvas } from './MeshCanvas';
import { SITE_URL } from '@/lib/site';

interface HeroCrumb {
  label: string;
  href?: string;
}

interface HeroProps {
  eyebrow?: string;
  title: string;
  /** @deprecated 더 이상 렌더하지 않는다(사용자 지시: 페이지 헤더 소개글 전체 삭제).
   *  호출부 호환을 위해 프롭만 남겨 둔다. */
  subtitle?: string;
  children?: ReactNode;
  /** 큰 랜딩용(홈)인지, 작은 페이지 헤더인지 */
  variant?: 'landing' | 'page';
  /** 배경 이미지 경로 (기본: 블루프린트 플레이스홀더) */
  image?: string;
  /** page variant에서 제목 위에 표시할 브레드크럼 (현재 페이지 항목만 전달) */
  breadcrumb?: HeroCrumb[];
  /** 구조화 데이터(JSON-LD)에만 덧붙일 마지막 항목 — 보통 현재 문서의 제목.
   *  보이는 브레드크럼에는 그리지 않는다(아래 breadcrumbJsonLd 주석 참고). */
  crumbLeaf?: string;
  /** 큰 제목을 어떤 요소로 그릴지. 페이지 본문 쪽이 h1 을 가져가는 화면에서는 'p' 로 낮춘다
   *  — 한 문서에 눈에 띄는 제목이 둘이면 구글이 제목을 임의로 바꿔 쓴다.
   *  요소만 바뀌고 글자·클래스·스타일은 완전히 동일하다(시각 변화 없음). */
  titleTag?: 'h1' | 'p';
  /** 아래 본문이 좁은 폭(NARROW_MAX_W)을 쓰는 페이지에서 히어로 글줄의 좌측선을 맞춘다.
   *  TabbedContent 의 narrow 와 같은 값을 넘겨야 히어로→탭바→목록이 한 선에 선다. */
  narrow?: boolean;
}

/**
 * 풀블리드 히어로. 배경 이미지 + 네이비 오버레이 위에 큰 타이포.
 * 제목의 \n은 줄바꿈으로 렌더.
 */
export function Hero({
  eyebrow,
  title,
  children,
  variant = 'page',
  image = '/img/hero.svg',
  breadcrumb,
  crumbLeaf,
  titleTag = 'h1',
  narrow = false,
}: HeroProps) {
  const lines = title.split('\n');
  const isLanding = variant === 'landing';
  const tCrumb = useTranslations('breadcrumb');
  const locale = useLocale();
  const crumbs: HeroCrumb[] = breadcrumb ? [{ label: tCrumb('home'), href: '/' }, ...breadcrumb] : [];
  // 큰 제목의 요소 — 본문이 h1 을 갖는 페이지는 'p' 를 넘겨 제목 경합을 없앤다.
  const TitleTag = titleTag;

  // 브레드크럼 구조화 데이터(JSON-LD) — 검색결과에 경로 표기를 유도.
  // ① 홈은 JSON-LD 에서 뺀다. 구글은 결과 첫 칸에 도메인을 이미 보여 주므로 홈을 넣으면
  //    "yonsei-me.vercel.app › 홈 › 소식"처럼 같은 뜻이 두 번 나오고, 문서상으로도
  //    최상위 항목은 필수가 아니다. **보이는 <ol> 은 그대로 홈을 표시한다** — 화면의
  //    브레드크럼 디자인은 확정된 요소라 건드리지 않는다.
  // ② crumbLeaf(현재 문서 제목)는 반대로 JSON-LD 에만 넣는다. 보이는 브레드크럼에 긴
  //    글 제목까지 늘어놓지 않는 것이 현재 디자인이고, 그 텍스트는 어차피 페이지 제목으로
  //    화면에 그대로 보이므로 '숨긴 콘텐츠'가 아니다.
  // 마지막(현재 페이지) 항목은 스펙상 item(URL) 생략 가능.
  const jsonLdCrumbs: HeroCrumb[] = [
    ...(breadcrumb ?? []),
    ...(crumbLeaf ? [{ label: crumbLeaf }] : []),
  ];
  // ③ item(URL)은 **마지막 항목만** 생략할 수 있다 — 중간 항목에 item 이 없으면 구글은
  //    그 BreadcrumbList 를 통째로 버려 아무 효과가 없다. URL 을 지어낼 수는 없으므로
  //    href 없는 첫 항목에서 잘라 그 항목을 마지막으로 만든다(짧아도 유효한 편이 낫다).
  //    ⚠️ 그래서 crumbLeaf 를 넘기는 호출부는 **앞 항목에 href 를 반드시 채워야 한다** —
  //    안 그러면 leaf 가 조용히 잘린다(예: 게시판 라벨엔 목록 URL 을 함께 넘길 것).
  const firstHrefless = jsonLdCrumbs.findIndex((c) => !c.href);
  const validCrumbs =
    firstHrefless === -1 ? jsonLdCrumbs : jsonLdCrumbs.slice(0, firstHrefless + 1);
  const breadcrumbJsonLd =
    validCrumbs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: validCrumbs.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.label,
            ...(c.href ? { item: `${SITE_URL}/${locale}${c.href === '/' ? '' : c.href}` } : {}),
          })),
        }
      : null;

  return (
    // 세부탭 히어로는 메인색 #003377 전환에서 제외(사용자 지시) — 기존 연세 네이비 #00285E 로 고정.
    <section
      className={cn(
        'relative isolate flex items-end overflow-hidden bg-[#00285E] text-white',
        isLanding
          ? 'min-h-[clamp(30rem,70vh,44rem)]'
          : 'min-h-[clamp(16rem,34vh,22rem)]',
      )}
    >
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          // 자체 생성 정적 데이터(메시지 파일 라벨) — XSS 벡터 없음
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      )}
      {isLanding ? (
        <>
          {/* 배경 이미지 (장식) */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: `url(${image})` }}
          />
          {/* 가독성 확보용 그라디언트 오버레이 */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-[#00285E] via-[#00285E]/70 to-[#00285E]/30"
          />
        </>
      ) : (
        <>
          {/* 홈 히어로와 통일된 애니메이션 그라디언트 + 웨이브 배경 */}
          <div aria-hidden="true" className="anim-gradient-radial absolute inset-0 -z-20" />
          <MeshCanvas className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-70 [mask-image:linear-gradient(to_bottom,transparent,black_35%)]" />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-[#00285E] via-[#00285E]/40 to-transparent"
          />
        </>
      )}

      <Container
        className={cn(
          'relative w-full',
          isLanding ? 'pb-16 pt-28 sm:pb-20' : 'pb-10 pt-24',
          narrow && NARROW_MAX_W,
        )}
      >
        {crumbs.length > 0 && (
          <ol className="anim-crumb mb-5 flex flex-wrap items-center gap-2 text-sm text-white/70">
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <li key={i} className="flex items-center gap-2">
                  {c.href && !isLast ? (
                    /* -m/p 상쇄: 시각 변화 없이 터치 타깃을 24px 이상으로 확장 (WCAG 2.5.8) */
                    <Link href={c.href} className="-m-1.5 p-1.5 transition-colors hover:text-white">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="font-medium text-white">
                      {c.label}
                    </span>
                  )}
                  {!isLast && (
                    <span aria-hidden="true" className="text-white/40">
                      ›
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div className={cn(isLanding ? 'max-w-4xl' : 'max-w-3xl')}>
          {/* 아이브로우 — 금색 배제(사용자 정책): 네이비 배경 위 화이트 톤 */}
          {eyebrow && (
            <p className="anim-hero-title mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-white/85">
              <span aria-hidden="true" className="h-px w-8 bg-white/50" />
              {eyebrow}
            </p>
          )}
          {/* 페이지 제목 서체 = 지마켓 산스(홈 히어로 제목과 통일, 사용자 지시).
              --font-hero 는 700 단일이라 font-bold(700)와 맞아 가짜 볼드 합성이 없다.
              text-balance 를 명시하는 이유: globals.css 가 h1~h4 엔 balance, p 엔 pretty 를
              걸어 두어 titleTag='p' 일 때만 줄나눔이 달라진다. 유틸리티로 못 박아
              두 요소의 렌더 결과를 완전히 같게 만든다(요소만 바뀌고 보이는 건 그대로). */}
          <TitleTag
            style={{ fontFamily: 'var(--font-hero), var(--font-sans), sans-serif' }}
            className={cn(
              'anim-hero-title text-balance font-bold tracking-tight',
              isLanding ? 'text-display-lg' : 'text-display',
            )}
          >
            {lines.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </TitleTag>
          {/* 제목 아래 소개글(subtitle)은 렌더하지 않는다 — 사용자 지시로 전체 삭제. */}
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </div>
      </Container>
    </section>
  );
}
