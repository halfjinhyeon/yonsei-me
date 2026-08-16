// 서버 임시저장(초안) admin API — 기기 간 이어쓰기.
//
// 저장처는 기존 `content_files(path, body, version)` 테이블이다. 초안 하나가 행 하나이고
// 경로는 `drafts/<login>/<board>/<postId|new>.json` — 테이블을 새로 만들지 않기 위한
// 재활용이다(DDL 없이 붙는다).
//
// ⚠️ 왜 /api/admin/content 를 쓰지 않는가: 그 라우트는 저장할 때마다
//    revalidateTag('content') 를 쏜다. 초안은 8초 디바운스로 자동저장되므로 그 경로를
//    타면 글 한 편 쓰는 동안 사이트 콘텐츠 캐시가 수십 번 통째로 무효화된다.
//    여기서는 **어떤 태그도 무효화하지 않는다** — 초안은 사이트에 나가는 값이 아니다.
//    그래서 isManagedPath allowlist 도 지나지 않는다(그 목록은 '사이트에 나가는 파일'이다).
//
// ⚠️ 초안은 게시물이 아니다. posts 테이블에는 손도 대지 않으므로, 여기 쌓인 내용이
//    사이트에 새어 나갈 경로는 없다. 게시는 오직 CMS 의 '저장' 한 번으로만 일어난다.
//
// ⚠️ 알아 둘 결합 두 가지 (content_files 를 빌려 쓰는 대가):
//    1) lib/content-runtime.ts 의 fetchAllContentFiles 가 `select('path, body, version')`
//       로 **전 행**을 읽어 Vercel Data Cache 에 넣는다. 그 캐시는 항목 하나가 2MB 를
//       넘으면 조용히 저장을 포기한다(lib/posts.ts 의 LIST_COLUMNS 주석과 같은 함정).
//       그래서 초안 한 건의 크기를 아래 MAX_DRAFT_BYTES 로 묶고, 게시 성공 시 지운다.
//       근본 해법은 그 조회에 `.not('path','like','drafts/%')` 한 줄을 더하는 것이다
//       (이 작업의 소유 파일이 아니라 손대지 않았다 — 후속 과제).
//    2) content_files 에는 변경 이력 트리거가 붙어 있다(schema-content.sql). 자동저장이
//       돌 때마다 직전 내용이 content_file_history 에 쌓인다. 경로당 50벌로 잘리므로
//       무한히 커지지는 않지만, 초안 경로가 이력을 만든다는 사실 자체는 의도가 아니다.
//
// 인증은 다른 admin 라우트와 같다(requireAdmin) — 프로덕션은 Auth.js 세션 필수,
// dev 는 CMS 개방 모드. 초안은 dev 에서도 DB 를 쓴다: 기기 간 이어쓰기가 목적이라
// 로컬 파일로 떨어뜨리면 기능 자체가 성립하지 않는다.

import { auth } from '@/auth';
import { adminDb, requireAdmin } from '@/lib/admin/posts-server';

export const runtime = 'nodejs';

/** 초안 본문 상한. 위 결합 1) 때문에 넉넉하되 무제한이 아니다(사진은 본문에 URL 로만
 *  들어가므로 실제 초안은 대개 수십 KB 다). */
const MAX_DRAFT_BYTES = 256 * 1024;

/** 초안 키 허용 문자 — 경로 탈출('..', 절대경로, 다른 prefix 침범) 차단이 목적이다.
 *  점(.)을 빼 두면 '..' 자체가 만들어질 수 없다. */
const KEY_RE = /^[A-Za-z0-9/_-]{1,200}$/;

/** 세션 계정명 → 경로 한 칸. 사람마다 자기 초안만 보게 하는 칸이다.
 *  GitHub login 은 [A-Za-z0-9-] 지만 경로에 쓰는 값이라 한 번 더 눕힌다.
 *  login 이 없는 경우(구 JWT — 이 필드는 auth.ts 가 나중에 넣기 시작했다)는 이메일로,
 *  그것도 없으면 'dev'(개방 모드)로 떨어진다. 초안은 잃어도 로컬 사본이 남는 값이라
 *  여기서 요청을 거절하지는 않는다. */
async function draftOwner(): Promise<string> {
  const session = await auth().catch(() => null);
  const safe = (s: string | null | undefined) => (s ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  return safe(session?.user?.login) || safe(session?.user?.email) || 'dev';
}

/** 초안 행 경로. 반드시 이 함수로만 조립한다 — 'drafts/' 밖은 이 라우트가 만질 수 없다. */
async function draftPath(key: string): Promise<string | null> {
  if (!KEY_RE.test(key)) return null;
  // '//' 나 앞뒤 '/' 로 빈 칸이 생기면 경로 모양이 흐트러진다
  if (key.startsWith('/') || key.endsWith('/') || key.includes('//')) return null;
  return `drafts/${await draftOwner()}/${key}.json`;
}

const BAD_KEY = Response.json({ error: '초안 키가 올바르지 않습니다.' }, { status: 400 });

/** GET /api/admin/drafts?key=news/12 — 초안 { savedAt, rec } (없으면 404) */
export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const path = await draftPath(new URL(request.url).searchParams.get('key') ?? '');
  if (!path) return BAD_KEY;

  const { data, error } = await adminDb()
    .from('content_files')
    .select('body')
    .eq('path', path)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: '초안이 없습니다.' }, { status: 404 });

  // 깨진 원문은 없는 것으로 친다 — 초안 때문에 글쓰기 화면이 열리지 않으면 안 된다.
  try {
    const parsed = JSON.parse(String(data.body)) as { savedAt?: string; rec?: unknown };
    if (!parsed?.rec) return Response.json({ error: '초안이 없습니다.' }, { status: 404 });
    return Response.json({ savedAt: String(parsed.savedAt ?? ''), rec: parsed.rec });
  } catch {
    return Response.json({ error: '초안이 없습니다.' }, { status: 404 });
  }
}

interface PutBody {
  key?: string;
  rec?: unknown;
}

/** PUT /api/admin/drafts — 초안 덮어쓰기(자동저장). 낙관적 동시성은 두지 않는다:
 *  같은 초안을 두 기기에서 동시에 고치는 상황에서 사용자가 원하는 것은 충돌 화면이
 *  아니라 "마지막에 친 것"이고, 잃더라도 로컬 사본이 각 기기에 남는다. */
export async function PUT(request: Request): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return Response.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const path = await draftPath(body.key ?? '');
  if (!path) return BAD_KEY;
  if (!body.rec || typeof body.rec !== 'object') {
    return Response.json({ error: '초안 내용(rec)이 필요합니다.' }, { status: 400 });
  }

  const savedAt = new Date().toISOString();
  const text = JSON.stringify({ savedAt, rec: body.rec });
  if (Buffer.byteLength(text, 'utf8') > MAX_DRAFT_BYTES) {
    return Response.json(
      { error: '초안이 너무 큽니다. 본문 사진은 업로드해서 링크로 넣어 주세요.' },
      { status: 413 },
    );
  }

  // version 은 초안에 의미가 없다(충돌 검사를 하지 않는다). 칼럼이 not null 이라 1 로 고정.
  const { error } = await adminDb()
    .from('content_files')
    .upsert({ path, body: text, version: 1 }, { onConflict: 'path' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ savedAt });
}

/** DELETE /api/admin/drafts?key=news/12 — 게시가 끝나 수명이 다한 초안 지우기 */
export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const path = await draftPath(new URL(request.url).searchParams.get('key') ?? '');
  if (!path) return BAD_KEY;

  const { error } = await adminDb().from('content_files').delete().eq('path', path);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
