// dev 전용 로컬 콘텐츠 백엔드.
//
// 정적 사이트라 운영 저장은 GitHub Contents API로 하지만("Git이 곧 DB"), 로컬
// 개발/검증 중에는 토큰·rate limit·실제 커밋 없이 content/* 파일을 직접 읽고 쓰기
// 위한 dev 전용 경로다. 저장하면 로컬 파일이 바뀌어 dev 사이트에 바로 반영된다.
//
// 안전장치:
//  - 프로덕션(NODE_ENV==='production')에서는 항상 404 → 배포본에 절대 노출 안 됨.
//  - content/ 와 public/img/ 하위 경로만 허용하고 상위 경로(..)·절대 경로를 차단한다.

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 쓰기·읽기를 허용하는 루트: 콘텐츠 파일과 업로드 이미지 폴더
const ALLOWED_ROOTS = [
  { prefix: 'content/', abs: resolve(process.cwd(), 'content') },
  { prefix: 'public/img/', abs: resolve(process.cwd(), 'public', 'img') },
];

/** 프로덕션이면 404 Response, 아니면 null(계속 진행) */
function blockInProd(): Response | null {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}

/** 허용 루트 하위의 안전한 절대 경로로 해석. 벗어나면 null. */
function safeAbsPath(rel: string | null | undefined): string | null {
  if (!rel) return null;
  const norm = rel.replace(/\\/g, '/');
  if (norm.includes('..')) return null;
  const root = ALLOWED_ROOTS.find((r) => norm.startsWith(r.prefix));
  if (!root) return null;
  const abs = resolve(process.cwd(), norm);
  // resolve 후에도 반드시 허용 루트 안에 있어야 한다 (심볼릭·정규화 우회 방지)
  if (abs !== root.abs && !abs.startsWith(root.abs + sep)) return null;
  return abs;
}

/** GitHub sha 자리를 대체할 로컬 콘텐츠 해시 (낙관적 동시성용) */
function contentSha(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex');
}

export async function GET(req: Request): Promise<Response> {
  const blocked = blockInProd();
  if (blocked) return blocked;

  const rel = new URL(req.url).searchParams.get('path');
  const abs = safeAbsPath(rel);
  if (!abs) return Response.json({ error: '허용되지 않은 경로입니다.' }, { status: 400 });

  try {
    const content = await readFile(abs, 'utf8');
    return Response.json({ content, sha: contentSha(content) });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return Response.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }
    return Response.json({ error: '파일 읽기에 실패했습니다.' }, { status: 500 });
  }
}

export async function PUT(req: Request): Promise<Response> {
  const blocked = blockInProd();
  if (blocked) return blocked;

  let body: { path?: string; content?: string; encoding?: 'base64'; replaceSiblings?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const abs = safeAbsPath(body.path);
  if (!abs) return Response.json({ error: '허용되지 않은 경로입니다.' }, { status: 400 });
  if (typeof body.content !== 'string') {
    return Response.json({ error: 'content 문자열이 필요합니다.' }, { status: 400 });
  }

  try {
    await mkdir(dirname(abs), { recursive: true });
    // encoding='base64'면 이미지 등 바이너리로, 아니면 UTF-8 텍스트로 기록
    const data =
      body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : body.content;
    await writeFile(abs, data);
    // replaceSiblings: 같은 basename 의 다른 확장자 파일 제거(교수당 사진 1개 보장)
    if (body.replaceSiblings) {
      const filename = basename(abs);
      const stem = filename.replace(/\.[^.]+$/, '');
      const dir = dirname(abs);
      for (const name of await readdir(dir)) {
        if (name !== filename && name.replace(/\.[^.]+$/, '') === stem) {
          await unlink(join(dir, name)).catch(() => {});
        }
      }
    }
    // GitHub commit 응답 형태를 흉내내 클라이언트 코드를 공용으로 쓴다.
    return Response.json({ commit: { sha: contentSha(body.content), html_url: '' } });
  } catch {
    return Response.json({ error: '파일 쓰기에 실패했습니다.' }, { status: 500 });
  }
}
