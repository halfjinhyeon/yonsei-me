// 첨부파일 외부 스토리지(Vercel Blob) 업로드 — 관리자 콘솔 전용(클라이언트).
//
// "Git이 곧 DB"는 텍스트(content/*.json)에만 유지하고, 바이너리(공지 첨부 등)는
// Blob 에 올린 뒤 공개 URL 만 JSON 에 저장한다. 저장소가 첨부로 무거워지지 않는다.
//
// 흐름: (이미지면) 캔버스 리사이즈+WebP 압축 → @vercel/blob/client 의 upload() 가
// /api/upload 에서 토큰을 받아 Blob 으로 직접 업로드 → 공개 URL 반환.
// dev(토큰 없는 로컬 백엔드)에서는 /api/dev-content 로 public/uploads/ 에 기록해
// 실제 스토리지 없이 동일한 흐름을 검증한다(.gitignore 처리, 커밋되지 않음).

import { upload } from '@vercel/blob/client';
import { base64FromBytes, isLocalBackend, type RepoConfig } from './github';

/** 업로드 허용 최대 크기 — /api/upload 의 서버 제한과 동일하게 유지 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

/** 압축 대상 이미지 타입 (gif 는 애니메이션 보존을 위해 제외) */
const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DIMENSION = 1600; // 긴 변 기준 px
const WEBP_QUALITY = 0.82;
const COMPRESS_THRESHOLD = 300 * 1024; // 이보다 작으면 압축 생략

/** 파일명에서 경로 구분자·특수문자를 제거 (한글은 유지) */
function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|#%\s]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

/**
 * 이미지를 긴 변 MAX_DIMENSION 이하로 리사이즈하고 WebP 로 변환한다.
 * 압축 결과가 원본보다 크거나 변환에 실패하면 원본을 그대로 반환한다(무손실 폴백).
 */
async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type) || file.size < COMPRESS_THRESHOLD) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const stem = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${stem}.webp`, { type: 'image/webp' });
  } catch {
    return file; // 압축 실패는 치명적이지 않다 — 원본 업로드
  }
}

/**
 * 첨부파일을 스토리지에 업로드하고 게시물 JSON 에 저장할 URL 을 반환한다.
 * boardKey 는 경로 구분용 (uploads/<게시판>/<파일명>).
 */
export async function uploadAttachment(
  cfg: RepoConfig,
  boardKey: string,
  file: File,
): Promise<{ url: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('20MB 이하 파일만 올릴 수 있습니다.');
  }

  const prepared = await compressImage(file);
  const name = `${Date.now()}-${sanitizeName(prepared.name)}`;
  const pathname = `uploads/${boardKey}/${name}`;

  // dev 로컬 백엔드: Blob 토큰 없이 public/uploads/ 에 기록 → dev 서버가 즉시 서빙
  if (isLocalBackend(cfg)) {
    const base64 = base64FromBytes(new Uint8Array(await prepared.arrayBuffer()));
    const res = await fetch('/api/dev-content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `public/${pathname}`, content: base64, encoding: 'base64' }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? '로컬 업로드에 실패했습니다.');
    }
    return { url: `/${pathname}` };
  }

  // 프로덕션: /api/upload 에서 토큰을 받아 Blob 으로 직접 업로드
  const blob = await upload(pathname, prepared, {
    access: 'public',
    handleUploadUrl: '/api/upload',
  });
  return { url: blob.url };
}
