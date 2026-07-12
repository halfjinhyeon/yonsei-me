// 첨부파일 서버 경유 업로드 라우트 (같은 출처 → 서버가 Blob 에 대신 저장).
//
// 왜 서버 경유인가: 브라우저가 Blob 스토리지 호스트로 직접 PUT 하는 클라이언트 업로드
// (/api/upload + @vercel/blob/client)는 일부 사내·캠퍼스망(프록시·백신의 HTTPS 검사)이
// HTTP/2 흐름제어를 망가뜨려 업로드 중간(예: 74%)에서 멈춘다. 사이트 GET 은 잘 되는
// 같은 출처이므로, 파일을 이 라우트로 보내 서버가 Blob 에 저장하면(서버→Blob 은 프록시
// 바깥) 그런 환경에서도 안전하다.
//
// 한계: Vercel 서버리스 함수 요청 본문은 4.5MB 제한이 있어 이 경로는 작은 파일 전용이다
// (클라이언트가 4MB 이하일 때만 이 라우트를 쓰고, 더 큰 파일은 직접 업로드로 보낸다).
//
// 보안은 /api/upload 와 동일: 프로덕션은 Auth.js 세션(=GitHub allowlist) 필수, 경로
// 접두어(uploads/)·용량·MIME 를 서버에서 재검증한다. dev(NODE_ENV!=='production')는
// CMS 개방 모드라 우회하지만, 로컬 dev 는 애초에 /api/dev-content 폴백을 쓰므로 이 라우트에
// 도달하지 않는다.

import { put } from '@vercel/blob';
import { auth } from '@/auth';

export const runtime = 'nodejs';

/** 서버 경유 최대 크기 — Vercel 함수 본문 한도(4.5MB) 안쪽. 클라이언트도 동일 기준으로 분기 */
const MAX_SIZE = 4 * 1024 * 1024;

/** 허용 MIME — /api/upload 와 동일 목록 (브라우저가 실행 가능한 html/svg 등은 제외) */
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/haansofthwp',
  'application/x-hwp',
  'application/octet-stream', // hwp 등 브라우저가 타입을 모르는 문서
];

export async function POST(request: Request): Promise<Response> {
  try {
    const devBypass = process.env.NODE_ENV !== 'production';
    if (!devBypass) {
      const session = await auth();
      if (!session?.user) {
        return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
      }
    }

    const pathname = request.headers.get('x-upload-pathname') ?? '';
    if (!pathname.startsWith('uploads/')) {
      return Response.json({ error: '허용되지 않은 업로드 경로입니다.' }, { status: 400 });
    }

    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    if (!ALLOWED_TYPES.includes(contentType)) {
      return Response.json({ error: '허용되지 않은 파일 형식입니다.' }, { status: 415 });
    }

    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) {
      return Response.json({ error: '빈 파일입니다.' }, { status: 400 });
    }
    if (bytes.byteLength > MAX_SIZE) {
      return Response.json(
        { error: '4MB 이하 파일만 서버 경유로 올릴 수 있습니다.' },
        { status: 413 },
      );
    }

    const blob = await put(pathname, Buffer.from(bytes), {
      access: 'public',
      contentType,
      addRandomSuffix: true, // 파일명 충돌·추측 방지 (/api/upload 와 동일)
    });

    return Response.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : '업로드에 실패했습니다.';
    console.error('[api/upload-file] 저장 실패:', message, {
      hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
