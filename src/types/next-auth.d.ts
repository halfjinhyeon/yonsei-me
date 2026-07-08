// Auth.js v5 타입 보강.
// 세션에 GitHub access_token 과 계정명(login)을 노출하기 위한 선언.

import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    /** GitHub OAuth access token — 관리자 콘솔의 Contents API 커밋에 사용 */
    accessToken?: string;
    user?: {
      /** GitHub 계정명(profile.login) */
      login?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    login?: string;
  }
}
