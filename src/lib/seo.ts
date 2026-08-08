/**
 * 다국어 SEO 공용 헬퍼 — hreflang(ko/en/x-default)과 "영문판 존재 여부" 판정.
 *
 * 왜 필요한가
 *   `localePrefix: 'always'` 라 같은 문서가 /ko/... 와 /en/... 두 URL 로 존재한다.
 *   이 둘이 한 쌍이라는 신호(hreflang)가 없으면 검색엔진은 서로 무관한 페이지로 보고
 *   둘 중 하나를 중복으로 떨어뜨린다(GSC '사용자가 선택한 표준이 없는 중복 페이지' 실측).
 *   또 게시판·아카이브 글처럼 **본문이 한국어 그대로인 /en 문서**는 진짜 중복이라
 *   색인에서 빼야 크롤 예산이 실제 콘텐츠로 간다(GSC '크롤링됨-미색인' 실측).
 *
 * 사용처
 *   · 페이지: `alternates: pageAlternates(path)` — canonical + hreflang 을 함께 돌려준다.
 *     (metadata 병합은 top-level 얕은 병합이라, 페이지가 alternates 를 쓰면 레이아웃의
 *      canonical 이 사라진다. 그래서 이 헬퍼가 canonical 까지 같이 실어 준다.)
 *   · 사이트맵: `alternateLinks(path)` — <xhtml:link> 항목 생성.
 *
 * ⚠️ hreflang 은 **상호 참조**가 성립해야 유효하다. 어떤 문서를 koOnly 로 판정했다면
 *    페이지 메타데이터와 사이트맵 **양쪽 모두** 같은 판정을 써야 한다. 한쪽만 바꾸면
 *    "ko 는 en 을 가리키는데 en 은 noindex" 같은 모순 신호가 된다.
 */
import type { Metadata } from 'next';
import { routing, type Locale } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site';
import type { Localized } from '@/lib/content';

/** 경로 세그먼트만 퍼센트 인코딩 (한글 slug 대응, '/' 는 유지) */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/** 로케일 접두사 없는 경로(선행 슬래시 없음, 홈은 '')를 절대 URL 로 */
export function localeUrl(locale: Locale, path: string): string {
  const suffix = path ? `/${encodePath(path)}` : '';
  return `${SITE_URL}/${locale}${suffix}`;
}

/** 문서 하나가 어떤 로케일 판을 갖는지 — koOnly 면 /en 은 색인 대상이 아니다 */
export interface AlternateOptions {
  /** 영문 번역이 없어 /en 이 ko 의 중복인 문서 (기본 false) */
  koOnly?: boolean;
}

/**
 * 사이트맵의 <xhtml:link rel="alternate"> 목록.
 * x-default 는 기본 로케일(ko)을 가리킨다 — 언어 미지정 검색자에게 보여줄 판.
 */
export function alternateLinks(
  path: string,
  { koOnly = false }: AlternateOptions = {},
): { hreflang: string; href: string }[] {
  const ko = localeUrl('ko', path);
  if (koOnly) return [{ hreflang: 'ko', href: ko }, { hreflang: 'x-default', href: ko }];
  return [
    ...routing.locales.map((locale) => ({ hreflang: locale, href: localeUrl(locale, path) })),
    { hreflang: 'x-default', href: ko },
  ];
}

/**
 * 페이지 metadata 의 alternates — 자기 canonical + hreflang.
 * canonical 은 './'(현재 경로 상대) 를 유지한다. 절대 경로를 넣으면 모든 페이지가
 * 한 URL 을 정본으로 가리켜 색인에서 통째로 사라진다.
 */
export function pageAlternates(path: string, opts: AlternateOptions = {}): Metadata['alternates'] {
  const languages: Record<string, string> = {};
  for (const { hreflang, href } of alternateLinks(path, opts)) languages[hreflang] = href;
  return { canonical: './', languages };
}

/** 한 필드에 실제 영문 번역이 있는지 — 영문이 비었거나 한국어와 같으면 없음 */
function translated(field?: Localized<string> | null): boolean {
  if (!field) return false;
  const ko = (field.ko ?? '').trim();
  const en = (field.en ?? '').trim();
  if (!en) return false;
  return en !== ko;
}

/**
 * 이 문서가 **독립된 영문판**을 갖는지 — /en 을 색인할지 판정한다.
 *
 * ⚠️ 판정에 쓰는 필드는 **목록 조회와 상세 조회 양쪽에 다 있는 것**이어야 한다.
 *    사이트맵은 목록(LIST_COLUMNS — 본문 없음), 페이지는 상세를 읽으므로, 본문으로
 *    판정하면 두 곳의 결론이 갈려 hreflang 상호 참조가 깨진다. 제목·요약은 양쪽에
 *    모두 실려 오고, 실측상 이 둘만으로 번역 유무가 정확히 갈린다:
 *      · 이관 아카이브(2020-06-08-96195 등) — 제목·요약이 ko/en 동일 → 중복
 *      · 게시판 글(news/post/*) — title_en 이 null → 중복
 *      · 실제 번역글(2026-07-28-post) — 제목·요약이 모두 다름 → 영문판 있음
 */
export function hasEnglishVersion(...fields: (Localized<string> | null | undefined)[]): boolean {
  return fields.some(translated);
}

/**
 * 번역 없는 /en 문서에 붙이는 robots 지시.
 * follow 를 남기는 이유: 목록·첨부 링크는 계속 크롤되게 두어야 ko 판 발견에 도움이 된다.
 */
export const NOINDEX_FOLLOW: NonNullable<Metadata['robots']> = { index: false, follow: true };

/**
 * 상세 페이지 공통 metadata 조각 — 번역 유무에 따라 hreflang·robots 를 함께 맞춘다.
 * (한쪽만 맞추면 상호 참조가 깨지므로 반드시 이 헬퍼로 한 번에 계산한다.)
 */
export function documentMetadata({
  path,
  locale,
  fields,
}: {
  path: string;
  locale: Locale;
  /** 번역 유무 판정 필드 — 사이트맵과 **같은 필드**를 넘겨야 한다(제목·요약) */
  fields: (Localized<string> | null | undefined)[];
}): Pick<Metadata, 'alternates' | 'robots'> {
  const koOnly = !hasEnglishVersion(...fields);
  return {
    alternates: pageAlternates(path, { koOnly }),
    ...(koOnly && locale === 'en' ? { robots: NOINDEX_FOLLOW } : {}),
  };
}
