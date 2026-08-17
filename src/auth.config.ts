// Auth.js v5 — 엣지 안전 설정 (미들웨어·route 핸들러 공용).
// 미들웨어는 엣지 런타임에서 돌기 때문에 무거운 import(Node API·DB 등)를
// 여기 두면 안 된다. providers 선언만 담는다.
//
// ⚠️ signIn 콜백은 여기 있었지만 auth.ts 로 옮겼다. 로그인 허용 판정이
// Supabase(cms_users) 조회를 타게 되면서, 이 파일에 두면 supabase-js 가
// 미들웨어 엣지 번들에 딸려 들어가기 때문이다. 미들웨어는 세션 쿠키만 읽고
// signIn 콜백을 실행하지 않으므로(로그인 흐름은 /api/auth/* 라우트 = Node)
// 콜백이 여기 없어도 게이트는 그대로 동작한다.

import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Kakao from 'next-auth/providers/kakao';

/**
 * 접근을 허용할 GitHub 로그인(계정명) 목록 — cms_users 테이블의 **폴백**이다.
 * DB 조회가 실패하거나(테이블 미생성·장애) 행이 없어도 저장소 소유자는 콘솔에
 * 들어갈 수 있어야 한다(관리자 잠금 방지). 소문자로 정규화해 대소문자 차이를 무시한다.
 */
export function allowedLogins(): string[] {
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
    // 카카오는 기본 동의(프로필)만 쓴다 — 이메일 등 추가 동의항목을 요구하지 않는다.
    // 로그인 허용 판정은 미리 "계정 연결"해 둔 회원번호(cms_users.kakao_id)로만 한다.
    // clientId/clientSecret 은 AUTH_KAKAO_ID / AUTH_KAKAO_SECRET 에서 자동 주입된다.
    Kakao({}),
  ],
} satisfies NextAuthConfig;

export default authConfig;
