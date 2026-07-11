// 첨부파일 업로드 토큰 발급 라우트 (Vercel Blob 클라이언트 업로드).
//
// 왜 클라이언트 직접 업로드인가: Vercel 서버리스 함수는 요청 본문 4.5MB 제한이
// 있어 파일을 서버로 받아 넘길 수 없다. 이 라우트는 업로드 "토큰"만 발급하고,
// 브라우저가 Blob 스토리지로 직접 업로드한다(@vercel/blob/client 의 upload()).
//
// 보안:
//  - 프로덕션: Auth.js 세션 필수 — 로그인 자체가 GitHub allowlist(auth.config.ts)로
//    제한되므로 세션 존재 = 허용된 관리자.
//  - 발급 토큰에 경로 접두어(uploads/)·용량·MIME 제한을 박아 클라이언트 조작으로
//    우회할 수 없다.
//  - dev(NODE_ENV!=='production')는 CMS 전체가 개방 모드이므로 동일하게 우회한다.
//    (단 로컬 dev 의 기본 저장은 /api/dev-content 폴백이라 이 라우트는 Blob 토큰이
//    설정된 경우에만 쓰인다.)

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { auth } from '@/auth';

export const runtime = 'nodejs';

/** 첨부 허용 용량 (이미지는 클라이언트에서 압축 후 도착) */
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

/** 허용 MIME — 이미지·문서류. 관리자 전용이라 과도하게 좁히지 않되,
 *  html/svg 등 브라우저가 실행할 수 있는 타입은 제외한다. */
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
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const devBypass = process.env.NODE_ENV !== 'production';
        if (!devBypass) {
          const session = await auth();
          if (!session?.user) {
            throw new Error('로그인이 필요합니다.');
          }
        }
        if (!pathname.startsWith('uploads/')) {
          throw new Error('허용되지 않은 업로드 경로입니다.');
        }
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: true, // 파일명 충돌·추측 방지
        };
      },
      // 업로드 완료 웹훅 — 현재는 후처리 없음 (URL 은 클라이언트가 JSON 에 저장).
      // 로컬에서는 Blob 이 localhost 로 콜백할 수 없어 호출되지 않는다(정상).
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '업로드 토큰 발급에 실패했습니다.' },
      { status: 400 },
    );
  }
}
