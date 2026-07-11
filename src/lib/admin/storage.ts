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

/** 업로드 진행 단계 — 폼이 사용자에게 "지금 무엇을 하는 중인지" 표시하는 데 쓴다.
 *  작은 파일도 느릴 때가 있는데 대부분 토큰 발급('requesting') 지연이라,
 *  단계를 나눠 보여주면 어디서 시간이 가는지가 그대로 드러난다. */
export type UploadPhase = 'preparing' | 'requesting' | 'uploading' | 'done';
export interface UploadProgress {
  phase: UploadPhase;
  /** 'uploading' 단계의 0~100. undefined 면 불확정(호환 모드 전송 중) */
  percent?: number;
}
export type UploadProgressHandler = (p: UploadProgress) => void;

/** 사용자가 취소 버튼으로 중단한 경우 — 폼이 실패와 구분해 표시한다 */
export class UploadCancelledError extends Error {
  constructor() {
    super('업로드를 취소했습니다.');
    this.name = 'UploadCancelledError';
  }
}

/** 진행 이벤트가 이 시간 동안 없으면 스톨로 판정하고 연결을 끊는다.
 *  (@vercel/blob 은 진행률 추적 시 스트리밍 fetch 를 쓰는데, 프록시·백신의
 *  SSL 검사 등 HTTP/1.1 장비가 끼면 중간에서 조용히 멈추는 사례가 있다) */
const STALL_MS = 15_000;
/** 호환 모드(진행 이벤트 없음)의 총 제한 시간 */
const COMPAT_TOTAL_MS = 45_000;

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
 * onProgress 로 단계·퍼센트를 알려 폼이 실시간 상태를 표시하고,
 * signal(취소 버튼)로 어느 단계에서든 중단할 수 있다.
 *
 * 신뢰성: 1차 시도(진행률 = 스트리밍 fetch)가 STALL_MS 동안 무진행이면 끊고,
 * 진행률 없는 호환 모드(일반 fetch — HTTP/1.1 프록시·백신 환경에서도 통과)로
 * 1회 자동 재시도한다. 실패 시 원인을 담은 메시지를 던지고 콘솔에 진단을 남긴다.
 */
export async function uploadAttachment(
  cfg: RepoConfig,
  boardKey: string,
  file: File,
  onProgress?: UploadProgressHandler,
  signal?: AbortSignal,
): Promise<{ url: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('20MB 이하 파일만 올릴 수 있습니다.');
  }

  onProgress?.({ phase: 'preparing' });
  const prepared = await compressImage(file);
  if (signal?.aborted) throw new UploadCancelledError();
  const name = `${Date.now()}-${sanitizeName(prepared.name)}`;
  const pathname = `uploads/${boardKey}/${name}`;

  // dev 로컬 백엔드: Blob 토큰 없이 public/uploads/ 에 기록 → dev 서버가 즉시 서빙
  if (isLocalBackend(cfg)) {
    onProgress?.({ phase: 'uploading', percent: 0 });
    const base64 = base64FromBytes(new Uint8Array(await prepared.arrayBuffer()));
    let res: Response;
    try {
      res = await fetch('/api/dev-content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `public/${pathname}`, content: base64, encoding: 'base64' }),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw new UploadCancelledError();
      throw err;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? '로컬 업로드에 실패했습니다.');
    }
    onProgress?.({ phase: 'done', percent: 100 });
    return { url: `/${pathname}` };
  }

  // ── 프로덕션: /api/upload 토큰 → Blob 직접 업로드 (스톨 워치독 + 사용자 취소) ──
  const startedAt = Date.now();
  console.info('[업로드] 시작:', { pathname, sizeKB: Math.round(prepared.size / 1024), type: prepared.type });

  /** 1회 시도. withProgress=false 면 진행 이벤트가 없으므로 stallMs 가 총 제한이 된다. */
  async function tryUpload(withProgress: boolean, stallMs: number): Promise<{ url: string }> {
    const ctrl = new AbortController();
    const onExternalAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onExternalAbort);
    if (signal?.aborted) ctrl.abort();

    let lastActivity = Date.now();
    let stalled = false;
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > stallMs) {
        stalled = true;
        ctrl.abort();
      }
    }, 1_000);

    try {
      const blob = await upload(pathname, prepared, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        abortSignal: ctrl.signal,
        ...(withProgress
          ? {
              onUploadProgress: ({ percentage }: { percentage: number }) => {
                lastActivity = Date.now();
                onProgress?.({ phase: 'uploading', percent: Math.round(percentage) });
              },
            }
          : {}),
      });
      return { url: blob.url };
    } catch (err) {
      if (signal?.aborted) throw new UploadCancelledError();
      if (stalled) {
        throw new Error(`${Math.round(stallMs / 1000)}초 동안 진행이 없어 연결을 중단했습니다.`);
      }
      throw err;
    } finally {
      clearInterval(watchdog);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  onProgress?.({ phase: 'requesting' });
  try {
    const result = await tryUpload(true, STALL_MS);
    console.info('[업로드] 완료:', { pathname, elapsedMs: Date.now() - startedAt });
    onProgress?.({ phase: 'done', percent: 100 });
    return result;
  } catch (err) {
    if (err instanceof UploadCancelledError) throw err;
    // 스트리밍 경로가 환경(프록시·백신 SSL 검사 등)과 충돌했을 수 있다 → 호환 모드 재시도
    console.warn('[업로드] 1차 시도 실패 — 진행률 없는 호환 모드로 재시도:', err);
    onProgress?.({ phase: 'uploading' }); // percent 없음 = 불확정 표시
    try {
      const result = await tryUpload(false, COMPAT_TOTAL_MS);
      console.info('[업로드] 호환 모드 완료:', { pathname, elapsedMs: Date.now() - startedAt });
      onProgress?.({ phase: 'done', percent: 100 });
      return result;
    } catch (err2) {
      if (err2 instanceof UploadCancelledError) throw err2;
      console.error('[업로드] 최종 실패:', { pathname, firstError: err, retryError: err2 });
      const reason = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(
        `업로드에 실패했습니다 — ${reason} 네트워크(프록시·백신의 SSL 검사, VPN)를 확인하고 다시 시도해 주세요.`,
      );
    }
  }
}
