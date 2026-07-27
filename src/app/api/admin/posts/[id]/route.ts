// 게시글 admin API — 수정(PUT)·삭제(DELETE). 백엔드 전환 Phase 3.

import { revalidateTag } from 'next/cache';
import { auth } from '@/auth';
import {
  adminDb,
  endDateError,
  isValidBoard,
  payloadToRow,
  type AdminPostPayload,
} from '@/lib/admin/posts-server';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<Response | null> {
  if (process.env.NODE_ENV !== 'production') return null;
  const session = await auth();
  if (!session?.user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  return null;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** PUT /api/admin/posts/[id] — 글 수정(첨부는 전체 교체) */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId(params.id);
  if (!id) return Response.json({ error: '잘못된 글 번호입니다.' }, { status: 400 });

  const payload = (await request.json()) as AdminPostPayload;
  if (!isValidBoard(payload.board)) {
    return Response.json({ error: '알 수 없는 게시판입니다.' }, { status: 400 });
  }
  if (!payload.titleKo?.trim() || !payload.date?.trim()) {
    return Response.json({ error: '제목과 날짜는 필수입니다.' }, { status: 400 });
  }
  // 종료일(기간 일정) 검증 — 형식·순서(종료 ≥ 시작)
  const endErr = endDateError(payload);
  if (endErr) return Response.json({ error: endErr }, { status: 400 });

  const row = payloadToRow(payload);
  const { error } = await adminDb().from('posts').update(row).eq('id', id);
  if (error) {
    const msg = error.code === '23505' ? '이미 같은 slug 의 글이 있습니다.' : error.message;
    return Response.json({ error: msg }, { status: 400 });
  }

  // 첨부 전체 교체 — 편집 폼이 항상 전체 목록을 보내므로 단순·확실
  const del = await adminDb().from('attachments').delete().eq('post_id', id);
  if (del.error) return Response.json({ error: del.error.message }, { status: 500 });
  const atts = (payload.attachments ?? []).filter((a) => a.href?.trim());
  if (atts.length > 0) {
    const ins = await adminDb().from('attachments').insert(
      atts.map((a, i) => ({
        post_id: id,
        label_ko: a.labelKo?.trim() || null,
        label_en: a.labelEn?.trim() || null,
        url: a.href.trim(),
        sort: i,
        // 업로드로 붙인 첨부만 크기를 안다(URL 직접 입력은 null → 목록에서 크기 생략)
        size_bytes: a.size && a.size > 0 ? a.size : null,
      })),
    );
    if (ins.error) return Response.json({ error: ins.error.message }, { status: 500 });
  }

  revalidateTag('posts');
  return Response.json({ ok: true });
}

/** DELETE /api/admin/posts/[id] — 글 삭제(첨부는 FK cascade) */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId(params.id);
  if (!id) return Response.json({ error: '잘못된 글 번호입니다.' }, { status: 400 });

  const { error } = await adminDb().from('posts').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  revalidateTag('posts');
  return Response.json({ ok: true });
}
