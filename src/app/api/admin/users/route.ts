// 사용자 관리 API — 목록(GET)·등록(POST). 관리자(role='admin')만 호출할 수 있다.
//
// 여기서 등록한 사람은 재배포 없이 즉시 로그인할 수 있다(cms_users 가 로그인
// 허용 목록의 단일 출처 — src/auth.ts 참조). 로그인 수단은 이메일 인증번호가
// 기본이고, GitHub 계정명을 넣으면 GitHub 로그인도 함께 열린다.

import {
  createUser,
  describeDbError,
  listUsers,
  normalizeKey,
  CmsUsersError,
  type CmsRole,
} from '@/lib/admin/cms-users';
import { requireOwner } from '@/lib/admin/posts-server';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(): Promise<Response> {
  const denied = await requireOwner();
  if (denied) return denied;

  try {
    const users = await listUsers();
    return Response.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        email: u.email,
        githubLogin: u.githubLogin,
        kakaoLinked: u.kakaoLinked,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    return Response.json({ error: describeDbError(err) }, { status: 500 });
  }
}

interface PostBody {
  name?: string;
  role?: string;
  email?: string | null;
  githubLogin?: string | null;
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireOwner();
  if (denied) return denied;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return Response.json({ error: '이름은 필수입니다.' }, { status: 400 });

  const role: CmsRole = body.role === 'admin' ? 'admin' : 'editor';
  if (body.role !== undefined && body.role !== 'admin' && body.role !== 'editor') {
    return Response.json({ error: '권한 값이 올바르지 않습니다.' }, { status: 400 });
  }

  const email = normalizeKey(body.email);
  const githubLogin = normalizeKey(body.githubLogin);
  // 로그인 수단이 하나도 없는 행은 아무 쓸모가 없다(카카오는 연결 전 단계라 불가)
  if (!email && !githubLogin) {
    return Response.json(
      { error: '이메일 또는 GitHub 계정 중 하나는 입력해야 합니다.' },
      { status: 400 },
    );
  }
  if (email && !EMAIL_RE.test(email)) {
    return Response.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const user = await createUser({ name, role, email, githubLogin });
    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
        githubLogin: user.githubLogin,
        kakaoLinked: user.kakaoLinked,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof CmsUsersError && err.code === '23505') {
      return Response.json(
        { error: '이미 등록된 이메일 또는 GitHub 계정입니다.' },
        { status: 409 },
      );
    }
    return Response.json({ error: describeDbError(err) }, { status: 500 });
  }
}
