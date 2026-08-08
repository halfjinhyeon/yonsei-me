import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // 지원 로케일: 한국어(기본), 영어
  locales: ['ko', 'en'],
  defaultLocale: 'ko',
  // 기본 로케일에도 prefix 유지 → /ko, /en 항상 명시 (SEO/영문판 가점에 유리)
  localePrefix: 'always',
  // hreflang 은 **HTML <head> 한 곳에서만** 낸다(@/lib/seo 의 pageAlternates).
  // next-intl 은 기본적으로 모든 응답에 `Link: <…>; rel="alternate"; hreflang=…` 헤더를
  // 붙이는데, 그건 "모든 문서에 ko·en 판이 다 있다"고 무조건 단언한다. 실제로는 영문
  // 번역이 없는 게시판·아카이브 글의 /en 판을 noindex 로 뺐으므로, 헤더를 켜 두면
  // "ko 는 en 을 가리키는데 en 은 noindex" 라는 모순 신호가 되어 hreflang 이 통째로
  // 무시된다. 페이지마다 alternates 를 정확히 계산해 넣으므로 헤더 쪽을 끈다.
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];
