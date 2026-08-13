// Auth.js v5 — 엣지 안전 설정 (미들웨어·route 핸들러 공용).
// 미들웨어는 엣지 런타임에서 돌기 때문에 무거운 import(Node API·DB 등)를
// 여기 두면 안 된다. providers 선언과 로그인 허용 콜백만 담는다.
//
// 관리자 콘솔 접근 인증: GitHub OAuth 로그인 + 허용 계정(allowlist) 검사.
// 커밋 권한이 필요하므로 GitHub 스코프에 repo를 요청한다.

import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';

/**
 * 접근을 허용할 GitHub 로그인(계정명) 목록.
 * 환경변수 ALLOWED_GITHUB_LOGINS(쉼표 구분)에 더해 저장소 소유자를 항상 포함한다.
 * 소문자로 정규화해 대소문자 차이를 무시한다.
 */
function allowedLogins(): string[] {
  const fromEnv = (process.env.ALLOWED_GITHUB_LOGINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // 기본 허용: 저장소 소유자(yonsei-mech) + 인계 기간 임시 관리자(halfjinhyeon — 인계 완료 시 제거)
  return Array.from(new Set(['yonsei-mech', 'halfjinhyeon', ...fromEnv]));
}

export const authConfig = {
  providers: [
    GitHub({
      // repo: content/*.json 커밋 권한, read:user: profile.login 확인용
      authorization: { params: { scope: 'read:user repo' } },
    }),
  ],
  callbacks: {
    /**
     * 로그인 허용 판정. GitHub profile.login 이 allowlist 에 없으면 거부한다.
     * false 를 반환하면 Auth.js 가 로그인을 차단한다.
     */
    signIn({ profile }) {
      const login = (profile?.login as string | undefined)?.toLowerCase();
      if (!login) return false;
      return allowedLogins().includes(login);
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
