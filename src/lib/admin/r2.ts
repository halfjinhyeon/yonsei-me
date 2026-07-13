// Cloudflare R2 클라이언트 — 서버 전용(라우트 핸들러에서만 import).
//
// 첨부 실체 저장소를 Vercel Blob 에서 R2 로 이전(2026-07 백엔드 전환 Phase 1).
// 이유: Blob Hobby 는 저장 1GB + 초과 시 "차단"이라 공개 사이트에 치명적,
// R2 는 무료 10GB + 전송(egress) 영구 무료. S3 호환 API 를 그대로 쓴다.
//
// 키는 전부 환경변수(Vercel env / .env.local)로만 공급되고, 클라이언트 번들에
// 절대 노출되지 않는다. S3Client 는 lazy 초기화 — env 가 없는 빌드 타임에도
// import 만으로는 터지지 않고, 실제 호출 시점에 명확한 에러를 낸다.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  return v;
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${requiredEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  return _client;
}

function bucket(): string {
  return requiredEnv('R2_BUCKET');
}

/** 저장된 객체의 공개 URL (R2.dev 퍼블릭 도메인 또는 커스텀 도메인) */
export function r2PublicUrl(key: string): string {
  const base = requiredEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');
  return `${base}/${key}`;
}

/** 경로 충돌·추측 방지용 랜덤 접미사 — Blob 의 addRandomSuffix 를 대체한다.
 *  확장자 앞에 -xxxxxxxx 를 끼워 넣는다: uploads/news/a.pdf → uploads/news/a-1a2b3c4d.pdf */
export function withRandomSuffix(key: string): string {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const m = key.match(/^(.*?)(\.[A-Za-z0-9]+)?$/);
  return `${m?.[1] ?? key}-${suffix}${m?.[2] ?? ''}`;
}

/** 서버 경유 업로드 — 본문 바이트를 R2 에 저장하고 공개 URL 을 돌려준다 */
export async function r2Put(key: string, body: Buffer, contentType: string): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return r2PublicUrl(key);
}

/** 대용량(서버리스 본문 한도 초과) 직접 업로드용 presigned PUT URL 발급.
 *  브라우저가 이 URL 로 PUT 하면 R2 에 바로 저장된다(버킷 CORS 필요). */
export async function r2PresignPut(
  key: string,
  contentType: string,
  expiresInSeconds = 600,
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}
