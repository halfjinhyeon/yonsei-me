// 게시글 admin API — 목록(GET)·작성(POST). 백엔드 전환 Phase 3.
// 프로덕션은 Auth.js 세션(=GitHub allowlist) 필수, dev 는 CMS 개방 모드와 동일하게 우회.
// 쓰기 성공 시 revalidateTag('posts') → 사이트(ISR)가 재배포 없이 수 초 내 갱신된다.

import { revalidateTag } from 'next/cache';
import { auth } from '@/auth';
import {
  adminDb,
  isValidBoard,
  payloadToRow,
  rowToEditRecord,
  type AdminPostPayload,
} from '@/lib/admin/posts-server';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<Response | null> {
  if (process.env.NODE_ENV !== 'production') return null; // dev 개방 모드
  const session = await auth();
  if (!session?.user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  return null;
}

/** GET /api/admin/posts?board=news — 게시판 글 목록(편집 레코드 형태, 최신순) */
export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const board = new URL(request.url).searchParams.get('board') ?? '';
  if (!isValidBoard(board)) {
    return Response.json({ error: '알 수 없는 게시판입니다.' }, { status: 400 });
  }
  const { data, error } = await adminDb()
    .from('posts')
    .select('*, attachments(*)')
    .eq('board', board)
    .order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ items: (data ?? []).map(rowToEditRecord) });
}

/** POST /api/admin/posts — 새 글 작성 */
export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const payload = (await request.json()) as AdminPostPayload;
  if (!isValidBoard(payload.board)) {
    return Response.json({ error: '알 수 없는 게시판입니다.' }, { status: 400 });
  }
  if (!payload.titleKo?.trim() || !payload.date?.trim()) {
    return Response.json({ error: '제목과 날짜는 필수입니다.' }, { status: 400 });
  }

  const row = payloadToRow(payload);
  const { data, error } = await adminDb().from('posts').insert(row).select('id').single();
  if (error) {
    const msg = error.code === '23505' ? '이미 같은 slug 의 글이 있습니다.' : error.message;
    return Response.json({ error: msg }, { status: 400 });
  }

  const atts = (payload.attachments ?? []).filter((a) => a.href?.trim());
  if (atts.length > 0) {
    const r = await adminDb().from('attachments').insert(
      atts.map((a, i) => ({
        post_id: data.id,
        label_ko: a.labelKo?.trim() || null,
        label_en: a.labelEn?.trim() || null,
        url: a.href.trim(),
        sort: i,
      })),
    );
    if (r.error) return Response.json({ error: r.error.message }, { status: 500 });
  }

  revalidateTag('posts');
  return Response.json({ id: String(data.id) });
}
