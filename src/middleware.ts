// 미들웨어: next-intl 로케일 라우팅 + 관리자 콘솔(/contentmanagement) 인증 게이트.
//
// 사이트 전 라우트가 이 지점을 통과한다. 보호 경로가 아니면 기존 next-intl
// 동작을 100% 그대로 유지해야 한다(홈·뉴스 등 모든 페이지가 영향받으므로).
// Auth.js v5 는 엣지에서 도는 미들웨어용으로 "엣지 안전 authConfig"만 쓴다.

import createMiddleware from 'next-intl/middleware';
import NextAuth from 'next-auth';
import { routing } from './i18n/routing';
import authConfig from './auth.config';

const { auth } = NextAuth(authConfig);
const intl = createMiddleware(routing);

// 보호 경로: /ko/contentmanagement, /en/contentmanagement (그 하위 포함).
// signin 하위 경로가 생겨도 로그인 페이지는 인증 없이 접근 가능해야 하므로,
// 현재는 콘솔 진입 자체를 next-intl 이전에 가로챈다.
const PROTECTED = /^\/(?:ko|en)\/contentmanagement(?:\/|$)/;

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // 개발 편의: 로컬 dev 서버에서는 콘솔 진입 게이트를 건너뛴다(레이아웃 작업용).
  // NODE_ENV 는 Next.js 가 자동 설정 → 프로덕션 빌드에서는 절대 우회되지 않는다.
  const devBypass = process.env.NODE_ENV !== 'production';

  if (PROTECTED.test(pathname) && !req.auth && !devBypass) {
    // 미인증 → Auth.js 기본 사인인 페이지로. 로그인 후 원래 경로로 복귀.
    const signInUrl = new URL('/api/auth/signin', req.nextUrl.origin);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(signInUrl);
  }

  // 보호 경로(인증 통과 포함)와 그 외 모든 경로는 기존 next-intl 처리로.
  return intl(req);
});

export const config = {
  // 내부 경로(_next, api)와 정적 파일(점 포함)을 제외한 모든 경로에 적용.
  // api 제외 유지 → /api/auth/* 는 route 핸들러가 직접 처리(미들웨어 우회).
  matcher: ['/', '/(ko|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
