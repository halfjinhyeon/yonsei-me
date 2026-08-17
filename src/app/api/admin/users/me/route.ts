// 내 계정 정보 API — 콘솔 사이드바의 계정 표시와 "카카오 연결" 버튼 상태용.
// 사용자 관리(목록·등록)와 달리 편집자도 자기 자신은 볼 수 있어야 하므로
// requireOwner 가 아니라 requireAdmin(=로그인만 확인) 을 쓴다.

import { auth } from '@/auth';
import { findUserById } from '@/lib/admin/cms-users';
import { requireAdmin } from '@/lib/admin/posts-server';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (process.env.NODE_ENV !== 'production') {
    return Response.json({
      name: 'dev',
      email: null,
      role: 'admin',
      provider: 'dev',
      kakaoLinked: false,
    });
  }

  const session = await auth();
  // env allowlist 폴백으로 들어온 계정은 cms_users 행이 없다 — 세션 값으로 최선을 답한다
  const fallback = {
    name: session?.user?.name ?? session?.user?.login ?? '',
    email: session?.user?.email ?? null,
    role: session?.user?.role ?? 'admin',
    provider: session?.provider ?? 'github',
    kakaoLinked: false,
  };

  const uid = session?.user?.uid;
  if (!uid) return Response.json(fallback);

  try {
    const row = await findUserById(uid);
    if (!row) return Response.json(fallback);
    return Response.json({
      name: row.name,
      email: row.email ?? session?.user?.email ?? null,
      role: row.role,
      provider: session?.provider ?? 'github',
      kakaoLinked: row.kakaoLinked,
    });
  } catch (err) {
    // 계정 배지 하나 때문에 콘솔 전체가 막히면 안 된다 — 조용히 세션 값으로 내린다
    console.error('[users/me] cms_users 조회 실패', err);
    return Response.json(fallback);
  }
}
