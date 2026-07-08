// Auth.js v5 — 전체 설정(Node 런타임 route·서버 컴포넌트에서 사용).
// 엣지 안전 authConfig 를 확장해 jwt/session 콜백을 더한다.
//
// GitHub access_token 을 세션에 노출한다. 관리자 콘솔이 이 토큰으로 GitHub
// Contents API 에 직접 커밋하기 때문이다(기존 아키텍처가 이미 브라우저에서
// 토큰을 사용했고, 동일한 신뢰 수준이다). PAT 수동 입력을 대체한다.

import NextAuth from 'next-auth';
import authConfig from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // OAuth 최초 로그인 시 account.access_token 을 JWT 에 저장하고,
    // profile.login 을 함께 담아 세션에서 계정명을 쓸 수 있게 한다.
    jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile?.login) {
        token.login = profile.login as string;
      }
      return token;
    },
    // JWT 의 accessToken/login 을 클라이언트 세션에 노출한다.
    session({ session, token }) {
      if (typeof token.accessToken === 'string') {
        session.accessToken = token.accessToken;
      }
      if (session.user && typeof token.login === 'string') {
        session.user.login = token.login;
      }
      return session;
    },
  },
});
