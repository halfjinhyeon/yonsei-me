// Auth.js v5 — 전체 설정(Node 런타임 route·서버 컴포넌트에서 사용).
// 엣지 안전 authConfig(providers)를 확장해 로그인 판정과 jwt/session 콜백을 더한다.
//
// 로그인 수단은 셋이다. 어느 쪽으로 들어오든 "허용된 사람인가"의 답은 한 곳,
// Supabase cms_users 테이블에서 나온다(CMS 에서 등록하면 재배포 없이 즉시 반영):
//   1. GitHub OAuth      — cms_users.github_login 매칭. 조회 실패·행 없음이면
//                          env allowlist(allowedLogins) 로 폴백해 관리자 잠금을 막는다.
//   2. 이메일 인증번호     — Credentials('email-otp'). /api/auth/otp/request 가 발급한
//                          6자리 코드의 sha256 해시를 대조한다.
//   3. 카카오             — 사전 "계정 연결"(/api/link/kakao)로 저장된 회원번호만 통과.
//                          카카오는 신원 확인이 아니라 편한 재로그인 수단이다.
//
// GitHub access_token 은 계속 세션에 담는다 — 콘솔의 저장 경로가 /api/admin/* 로
// 옮겨간 뒤에도 저장소 표시·배포 상태 라벨이 이 값을 참조한다.

import { createHash } from 'node:crypto';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import authConfig, { allowedLogins } from './auth.config';
import {
  bumpOtpAttempts,
  clearOtp,
  findUserByEmail,
  findUserByGithubLogin,
  findUserByKakaoId,
  type CmsUser,
} from '@/lib/admin/cms-users';

/** 카카오 로그인 실패(연결 안 된 계정) 목적지. Auth.js v5 는 signIn 콜백이
 *  문자열을 반환하면 그 URL 로 보낸다. 내부 도구라 로케일은 ko 로 고정한다. */
const KAKAO_UNLINKED_URL = '/ko/contentmanagement/login?error=kakao-unlinked';

/** OTP 오입력 허용 횟수 — 넘으면 재발급을 받아야 한다(무차별 대입 방지) */
const OTP_MAX_ATTEMPTS = 5;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** cms_users 조회는 로그인 판정의 보조 수단이다 — DB 가 죽었다고 GitHub
 *  관리자까지 잠기면 복구할 손이 없다. 실패는 "행 없음"과 같게 취급한다. */
async function lookup(fn: () => Promise<CmsUser | null>): Promise<CmsUser | null> {
  try {
    return await fn();
  } catch (err) {
    console.error('[auth] cms_users 조회 실패 — 폴백 경로로 진행합니다.', err);
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      id: 'email-otp',
      name: '이메일 인증번호',
      credentials: {
        email: { label: '이메일', type: 'email' },
        code: { label: '인증번호', type: 'text' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').trim().toLowerCase();
        const code = String(credentials?.code ?? '').trim();
        if (!email || !/^\d{6}$/.test(code)) return null;

        // 로컬 개발 전용 고정 코드. NODE_ENV 는 Next 가 빌드 시점에 못박으므로
        // 프로덕션 번들에서는 이 분기에 도달할 수 없다(/api/auth/otp/request 의
        // dev 응답 devCode 와 짝 — dev 는 DB·메일 없이 로그인 UI 를 돌린다).
        if (process.env.NODE_ENV !== 'production' && code === '000000') {
          return { id: 'dev', name: 'dev', email, role: 'admin' as const };
        }

        try {
          const user = await findUserByEmail(email);
          if (!user) return null;
          if (!user.otpHash || !user.otpExpiresAt) return null;
          if (Date.parse(user.otpExpiresAt) < Date.now()) return null;
          if (user.otpAttempts >= OTP_MAX_ATTEMPTS) return null;
          if (sha256(code) !== user.otpHash) {
            await bumpOtpAttempts(user.id);
            return null;
          }
          // 한 번 쓴 코드는 즉시 폐기 — 메일함에 남은 코드로 재로그인되면 안 된다
          await clearOtp(user.id);
          return { id: user.id, name: user.name, email: user.email ?? email, role: user.role };
        } catch (err) {
          console.error('[auth] OTP 검증 실패', err);
          return null;
        }
      },
    }),
  ],
  // 내부 운영 도구라 로그인·오류 화면 로케일을 ko 로 고정한다(en 콘솔은 없다).
  pages: {
    signIn: '/ko/contentmanagement/login',
    error: '/ko/contentmanagement/login',
  },
  callbacks: {
    /**
     * 로그인 허용 판정. false 면 차단, 문자열이면 그 URL 로 리다이렉트한다.
     * (엣지 번들 오염을 막으려고 auth.config.ts 가 아니라 여기 둔다 — 파일 상단 주석 참조)
     */
    async signIn({ account, profile }) {
      const provider = account?.provider;

      if (provider === 'github') {
        const login = (profile?.login as string | undefined)?.toLowerCase();
        if (!login) return false;
        const row = await lookup(() => findUserByGithubLogin(login));
        // DB 매칭이 정본, env allowlist 는 DB 가 없거나 죽었을 때의 폴백
        return Boolean(row) || allowedLogins().includes(login);
      }

      if (provider === 'kakao') {
        const kakaoId = account?.providerAccountId;
        if (!kakaoId) return KAKAO_UNLINKED_URL;
        const row = await lookup(() => findUserByKakaoId(String(kakaoId)));
        // 카카오 단독 가입은 없다 — 먼저 다른 수단으로 로그인해 계정을 연결해야 한다
        return row ? true : KAKAO_UNLINKED_URL;
      }

      // 이메일 인증번호는 authorize 에서 이미 검증을 마쳤다(null 이면 여기 오지 않는다)
      if (provider === 'email-otp') return true;

      return false;
    },

    // 최초 로그인(account 존재) 때만 신원을 확정해 JWT 에 박는다. 이후 세션 갱신은
    // DB 를 다시 때리지 않는다 — 권한 변경은 재로그인 시점에 반영된다.
    async jwt({ token, account, profile, user }) {
      if (!account) return token;

      if (account.provider === 'github') {
        if (account.access_token) token.accessToken = account.access_token;
        const login = ((profile?.login as string | undefined) ?? '').toLowerCase();
        if (login) token.login = login;
        token.provider = 'github';
        const row = await lookup(() => findUserByGithubLogin(login));
        if (row) {
          token.uid = row.id;
          token.role = row.role;
          token.name = row.name;
        } else {
          // env allowlist 폴백으로 통과한 계정 = 저장소 소유자 — 최고 권한으로 본다
          token.role = 'admin';
        }
      } else if (account.provider === 'kakao') {
        token.provider = 'kakao';
        const row = await lookup(() => findUserByKakaoId(String(account.providerAccountId)));
        if (row) {
          token.uid = row.id;
          token.role = row.role;
          token.name = row.name;
          if (row.email) token.email = row.email;
        }
      } else if (account.provider === 'email-otp') {
        token.provider = 'otp';
        if (user?.id) token.uid = user.id;
        if (user?.name) token.name = user.name;
        if (user?.role) token.role = user.role;
      }

      return token;
    },

    // JWT 의 신원·권한을 클라이언트 세션에 노출한다.
    session({ session, token }) {
      if (typeof token.accessToken === 'string') {
        session.accessToken = token.accessToken;
      }
      if (token.provider) {
        session.provider = token.provider;
      }
      if (session.user) {
        if (typeof token.login === 'string') session.user.login = token.login;
        if (typeof token.uid === 'string') session.user.uid = token.uid;
        if (token.role === 'admin' || token.role === 'editor') session.user.role = token.role;
        if (typeof token.name === 'string') session.user.name = token.name;
      }
      return session;
    },
  },
});
