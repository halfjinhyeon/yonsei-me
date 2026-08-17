// 사용자 관리 API — 수정(PATCH)·삭제(DELETE). 관리자(role='admin')만 호출할 수 있다.
//
// 마지막 관리자를 지우거나 편집자로 강등하면 아무도 사용자 관리를 못 하게 된다
// (env allowlist 폴백이 있긴 하나 학과 실무자는 쓸 수 없다) — 그래서 막는다.

import {
  countAdmins,
  deleteUser,
  describeDbError,
  findUserById,
  normalizeKey,
  updateUser,
  CmsUsersError,
  type CmsRole,
  type UpdateUserInput,
} from '@/lib/admin/cms-users';
import { requireOwner } from '@/lib/admin/posts-server';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAST_ADMIN_ERROR = '마지막 관리자는 삭제·강등할 수 없습니다.';

interface PatchBody {
  name?: string;
  role?: string;
  email?: string | null;
  githubLogin?: string | null;
  unlinkKakao?: boolean;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const denied = await requireOwner();
  if (denied) return denied;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const patch: UpdateUserInput = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return Response.json({ error: '이름은 비울 수 없습니다.' }, { status: 400 });
    patch.name = name;
  }
  if (body.role !== undefined) {
    if (body.role !== 'admin' && body.role !== 'editor') {
      return Response.json({ error: '권한 값이 올바르지 않습니다.' }, { status: 400 });
    }
    patch.role = body.role as CmsRole;
  }
  if (body.email !== undefined) {
    const email = normalizeKey(body.email);
    if (email && !EMAIL_RE.test(email)) {
      return Response.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    patch.email = email;
  }
  if (body.githubLogin !== undefined) patch.githubLogin = normalizeKey(body.githubLogin);
  if (body.unlinkKakao === true) patch.unlinkKakao = true;

  try {
    const target = await findUserById(params.id);
    if (!target) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });

    // 강등 가드 — 남은 관리자가 하나뿐이면 그 하나를 편집자로 내릴 수 없다
    if (target.role === 'admin' && patch.role === 'editor' && (await countAdmins()) <= 1) {
      return Response.json({ error: LAST_ADMIN_ERROR }, { status: 400 });
    }

    // 수정 후에도 로그인 수단은 하나 이상 남아야 한다(카카오 연결은 보조 수단)
    const nextEmail = patch.email !== undefined ? patch.email : target.email;
    const nextGithub = patch.githubLogin !== undefined ? patch.githubLogin : target.githubLogin;
    if (!nextEmail && !nextGithub) {
      return Response.json(
        { error: '이메일 또는 GitHub 계정 중 하나는 남아 있어야 합니다.' },
        { status: 400 },
      );
    }

    const user = await updateUser(params.id, patch);
    if (!user) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
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

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const denied = await requireOwner();
  if (denied) return denied;

  try {
    const target = await findUserById(params.id);
    if (!target) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    if (target.role === 'admin' && (await countAdmins()) <= 1) {
      return Response.json({ error: LAST_ADMIN_ERROR }, { status: 400 });
    }
    await deleteUser(params.id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: describeDbError(err) }, { status: 500 });
  }
}
