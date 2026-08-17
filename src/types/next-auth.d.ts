// Auth.js v5 타입 보강.
// 세션에 GitHub access_token, 계정명(login), 그리고 cms_users 의 신원(uid·권한)과
// 로그인 수단(provider)을 노출하기 위한 선언.

import type { DefaultSession } from 'next-auth';

/** cms_users.role — admin 만 사용자 관리(등록·권한 변경·삭제)를 할 수 있다 */
type CmsRole = 'admin' | 'editor';
/** 로그인 수단. 'otp' 는 이메일 인증번호(Credentials 프로바이더 id 는 'email-otp') */
type LoginProvider = 'github' | 'kakao' | 'otp';

declare module 'next-auth' {
  interface Session {
    /** GitHub OAuth access token — 저장소·배포 상태 표시에 사용 */
    accessToken?: string;
    /** 이번 세션이 어떤 수단으로 로그인했는지 */
    provider?: LoginProvider;
    user?: {
      /** GitHub 계정명(profile.login) */
      login?: string;
      /** cms_users.id — 사용자 관리 API·카카오 연결이 이 값으로 행을 찾는다 */
      uid?: string;
      role?: CmsRole;
    } & DefaultSession['user'];
  }

  /** Credentials authorize 가 돌려주는 사용자 — jwt 콜백이 그대로 받는다 */
  interface User {
    login?: string;
    uid?: string;
    role?: CmsRole;
  }
}

// ⚠️ JWT 보강 대상은 'next-auth/jwt' 가 아니라 '@auth/core/jwt' 다.
// next-auth/jwt 는 `export * from "@auth/core/jwt"` 뿐인 재수출 모듈이라
// 거기에 선언하면 **새 인터페이스**가 만들어질 뿐 콜백의 token 타입은 안 바뀐다
// (JWT extends Record<string, unknown> 이라 오류 없이 unknown 으로 남아, 보강이
// 먹은 줄 알고 쓰다가 truthiness 좁힘이 '{}' 로 튀는 식으로 뒤늦게 터진다).
declare module '@auth/core/jwt' {
  interface JWT {
    accessToken?: string;
    login?: string;
    uid?: string;
    role?: CmsRole;
    provider?: LoginProvider;
  }
}
