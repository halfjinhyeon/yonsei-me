/**
 * 페이지 한 장의 metadata 를 **통째로** 만들어 주는 헬퍼 — title·description·
 * alternates(+robots)·openGraph·twitter 를 한 번에 돌려준다.
 *
 * 왜 "통째로"인가 (얕은 병합 함정)
 *   Next 의 metadata 병합은 **top-level 얕은 병합**이다. 페이지가 `openGraph` 를
 *   조금이라도 건드리면 레이아웃의 openGraph 는 통째로 사라지고, 반대로 아무것도
 *   안 쓰면 레이아웃의 사이트 공통 og:title·og:description 이 수천 문서에 똑같이
 *   붙는다(실측: 전 페이지의 og 가 사이트 기본값이었다). 중간이 없으므로 페이지마다
 *   og 를 완전한 형태로 새로 쓴다 — 그 조립을 여기 한 곳에 모은다.
 *   같은 이유로 alternates 도 부분 대입이 불가능하다(seo.ts 주석 참고).
 *
 * 왜 og:title 에 사이트명을 안 붙이나
 *   `<title>` 은 레이아웃 템플릿이 `%s | 사이트명` 으로 만든다. og:title 까지 그러면
 *   SNS 카드 제목이 "제목 | 사이트명 | 사이트명" 꼴로 겹쳐 보인다 — og 는
 *   `siteName` 필드가 따로 있으니 제목만 싣는다.
 *
 * 번역 유무 판정(fields)은 **넘긴 그대로** documentMetadata 에 전달한다.
 * 판정 규칙을 여기서 바꾸면 사이트맵과 결론이 갈려 hreflang 상호 참조가 깨진다.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { documentMetadata, localeUrl, pageAlternates } from '@/lib/seo';
import type { Localized } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

/**
 * 기본 공유 이미지 — 1200×630(og 권장비 1.91:1).
 * 2400×1260 원본은 트위터/카카오 일부 클라이언트가 용량으로 거르는 크기라
 * 표준 치수의 정적 자산을 따로 둔다(파일은 public/og/cover.jpg).
 */
const DEFAULT_OG_IMAGE = {
  url: '/og/cover.jpg',
  width: 1200,
  height: 630,
  alt: '연세대학교 기계공학부 · School of Mechanical Engineering',
} as const;

export interface PageMetadataInput {
  locale: Locale;
  /** 로케일 접두사·선행 슬래시 없는 경로 (홈은 '') */
  path: string;
  /** 템플릿(`%s | 사이트명`)에 들어갈 제목. `{ absolute }` 면 템플릿을 건너뛴다 */
  title: string | { absolute: string };
  description?: string;
  /** 번역 유무 판정 필드 — 넘기면 documentMetadata(=alternates+robots), 없으면 alternates 만 */
  fields?: (Localized<string> | null | undefined)[];
  /** og:type — 게시물·기사는 'article' */
  type?: 'website' | 'article';
  /** 이 문서 고유의 공유 이미지(썸네일). 없으면 기본 커버 */
  image?: string | null;
  /** article:published_time — type 이 'article' 일 때만 실린다 */
  publishedTime?: string;
}

/** 페이지 metadata 전체 — 각 라우트의 generateMetadata 가 이 결과를 그대로 반환한다 */
export async function pageMetadata({
  locale,
  path,
  title,
  description,
  fields,
  type = 'website',
  image,
  publishedTime,
}: PageMetadataInput): Promise<Metadata> {
  const tMeta = await getTranslations({ locale, namespace: 'meta' });
  const siteName = tMeta('siteName');
  // og:title 에는 사이트명을 붙이지 않는다(위 주석). absolute 는 그 문자열이 곧 제목이다.
  const ogTitle = typeof title === 'string' ? title : title.absolute;
  const images = [image ? { url: image } : DEFAULT_OG_IMAGE];
  const ogLocale = locale === 'ko' ? 'ko_KR' : 'en_US';

  const shared = {
    title: ogTitle,
    ...(description ? { description } : {}),
    url: localeUrl(locale, path),
    siteName,
    locale: ogLocale,
    // 반대 로케일 판이 존재한다는 신호 — hreflang 과 같은 사실을 og 어휘로 한 번 더 말한다
    alternateLocale: locale === 'ko' ? 'en_US' : 'ko_KR',
    images,
  };

  return {
    title,
    ...(description ? { description } : {}),
    // fields 를 넘긴 문서만 번역 유무를 따진다(게시물·기사). 나머지는 항상 ko/en 양쪽.
    ...(fields
      ? documentMetadata({ path, locale, fields })
      : { alternates: pageAlternates(path) }),
    openGraph:
      type === 'article'
        ? { ...shared, type: 'article', ...(publishedTime ? { publishedTime } : {}) }
        : { ...shared, type: 'website' },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      ...(description ? { description } : {}),
      images,
    },
  };
}
