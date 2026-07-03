import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // 지원 로케일: 한국어(기본), 영어
  locales: ['ko', 'en'],
  defaultLocale: 'ko',
  // 기본 로케일에도 prefix 유지 → /ko, /en 항상 명시 (SEO/영문판 가점에 유리)
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
