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

/** 스트리밍(실시간 %) 시도에서 진행 이벤트가 이 시간 동안 없으면 스톨로 보고 끊는다.
 *  @vercel/blob 은 진행률 추적 시 요청 본문을 64KB 청크 스트리밍(duplex:'half')으로
 *  보내는데, 프록시·백신의 SSL 검사 등 HTTP/1.1 장비가 끼면 청크 경계에서 백프레셔가
 *  안 풀려 조용히 멈춘다(예: 173KB 파일이 128KB=74% 에서 정지). 짧게 끊고 버퍼 모드로 넘긴다. */
const STREAM_STALL_MS = 8_000;
/** 버퍼 모드(진행 이벤트 없음, 프록시·백신·HTTP/1.1 안전)의 총 제한 시간 */
const BUFFERED_TIMEOUT_MS = 45_000;

/** 이 세션에서 스트리밍 전송이 한 번이라도 막히면(스톨) 이후 업로드는 바로 버퍼 모드로.
 *  프록시·백신 환경에서 매 업로드마다 스트리밍으로 8초씩 낭비하지 않도록 한다
 *  (특히 이미지 풀 다중 업로드에서 파일마다 지연이 누적되는 걸 막는다). */
let preferBufferedUpload = false;

/** 서버 경유(/api/upload-file)로 처리하는 최대 크기 — Vercel 함수 본문 한도(4.5MB) 안쪽.
 *  이보다 큰 파일만 브라우저가 Blob 로 직접 올린다(직접 경로는 프록시·백신망에서 불안정). */
const SERVER_PROXY_MAX = 4 * 1024 * 1024;
/** 서버 경유 업로드 총 제한 시간 */
const SERVER_UPLOAD_TIMEOUT_MS = 60_000;

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
 * 같은 출처 서버 라우트(/api/upload-file)로 파일을 올리고 저장된 Blob URL 을 받는다.
 * XHR 을 쓰는 이유:
 *  - upload.onprogress 로 실시간 % 를 준다(fetch 로는 업로드 진행률을 못 얻는다).
 *  - 본문을 통째로(Content-Length) 보내는 버퍼 전송이라 프록시·백신·HTTP/1.1 을 통과한다
 *    (스트리밍 요청 본문이 막히는 환경을 피한다).
 * 취소(signal)·타임아웃·HTTP 오류를 각각 구분해 거부한다.
 */
function serverUpload(
  pathname: string,
  file: File,
  onProgress?: UploadProgressHandler,
  signal?: AbortSignal,
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onExternalAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', onExternalAbort);

    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }

    xhr.open('POST', '/api/upload-file', true);
    xhr.timeout = SERVER_UPLOAD_TIMEOUT_MS;
    // HTTP 헤더 값은 Latin-1(ISO-8859-1)만 허용 — 한글이 든 pathname 을 그대로 넣으면
    // 'non ISO-8859-1 code point' 로 던진다. 퍼센트 인코딩해 보내고 서버가 decodeURIComponent
    // 로 복원한다(hwp 등 한글 파일명이 여기서 막히던 문제).
    xhr.setRequestHeader('x-upload-pathname', encodeURIComponent(pathname));
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.({ phase: 'uploading', percent: Math.round((e.loaded / e.total) * 100) });
      }
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText) as { url?: string };
          if (parsed.url) resolve({ url: parsed.url });
          else reject(new Error('서버가 URL 을 반환하지 않았습니다.'));
        } catch {
          reject(new Error('서버 응답을 해석하지 못했습니다.'));
        }
      } else {
        let msg = `서버 오류 (HTTP ${xhr.status}).`;
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch {
          /* 응답이 JSON 이 아님 — 기본 메시지 유지 */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error('네트워크 오류로 업로드에 실패했습니다.'));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error(`${Math.round(SERVER_UPLOAD_TIMEOUT_MS / 1000)}초 안에 업로드를 끝내지 못했습니다.`));
    };
    xhr.onabort = () => {
      cleanup();
      reject(signal?.aborted ? new UploadCancelledError() : new Error('업로드가 중단되었습니다.'));
    };

    signal?.addEventListener('abort', onExternalAbort, { once: true });
    xhr.send(file);
  });
}

/**
 * 첨부파일을 스토리지에 업로드하고 게시물 JSON 에 저장할 URL 을 반환한다.
 * boardKey 는 경로 구분용 (uploads/<게시판>/<파일명>).
 * onProgress 로 단계·퍼센트를 알려 폼이 실시간 상태를 표시하고,
 * signal(취소 버튼)로 어느 단계에서든 중단할 수 있다.
 *
 * 신뢰성/경로: 작은 파일(≤4MB, 대부분의 이미지·문서)은 같은 출처 서버 라우트를 경유해
 * 서버가 Blob 에 저장한다 — 프록시·백신의 HTTPS 검사가 브라우저→Blob 직접 업로드를 막는
 * 환경(스트리밍이든 버퍼든 74% 부근에서 멈춤)에서도 통과한다. 4.5MB 함수 한도를 넘는 큰
 * 파일만 브라우저가 Blob 로 직접 업로드하며, 이때는 스트리밍(실시간 %)이 STREAM_STALL_MS
 * 무진행 시 버퍼 모드로 전환된다. 실패 시 원인을 메시지에 담아 던지고 콘솔에 진단을 남긴다.
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

  // ── 프로덕션 ──
  const startedAt = Date.now();

  // 1순위: 작은 파일(≤4MB)은 같은 출처 서버 라우트(/api/upload-file)를 경유한다.
  //
  // 브라우저 → Blob 스토리지 직접 업로드는 일부 사내·캠퍼스망(프록시·백신의 HTTPS 검사)이
  // HTTP/2 흐름제어를 망가뜨려 업로드 중간(예: 128KB=74%)에서 멈춘다. 스트리밍이든 버퍼든
  // '다른 출처'로의 업로드가 막히는 것이라 전송 방식으로는 못 고친다. 사이트 GET 이 잘 되는
  // '같은 출처'로 보내 서버가 대신 Blob 에 저장하면(서버→Blob 은 프록시 밖) 통과한다.
  // 진행률은 XHR 의 upload.onprogress 로 실시간 표시한다(버퍼 전송이라 프록시에도 안전).
  if (prepared.size <= SERVER_PROXY_MAX) {
    console.info('[업로드] 시작(서버 경유):', {
      pathname,
      sizeKB: Math.round(prepared.size / 1024),
      type: prepared.type,
    });
    onProgress?.({ phase: 'requesting' });
    try {
      const result = await serverUpload(pathname, prepared, onProgress, signal);
      console.info('[업로드] 완료(서버 경유):', { pathname, elapsedMs: Date.now() - startedAt });
      onProgress?.({ phase: 'done', percent: 100 });
      return result;
    } catch (err) {
      if (err instanceof UploadCancelledError) throw err;
      console.error('[업로드] 서버 경유 실패:', err);
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`업로드에 실패했습니다 — ${reason} 잠시 후 다시 시도해 주세요.`);
    }
  }

  // 2순위: 큰 파일(>4MB)은 서버 함수 본문 한도(4.5MB)를 넘으므로 브라우저가 Blob 로 직접
  // 업로드한다. 실시간 % 를 주는 스트리밍이 기본이나 위 STREAM_STALL_MS 주석대로 일부
  // 네트워크에서 청크 경계에 멈춘다 → 스톨 시 버퍼 모드로 전환하고, 한 번 막힌 세션에서는
  // 이후 업로드를 곧장 버퍼 모드로 한다.
  console.info('[업로드] 시작(직접):', {
    pathname,
    sizeKB: Math.round(prepared.size / 1024),
    type: prepared.type,
    mode: preferBufferedUpload ? 'buffered' : 'stream',
  });

  /**
   * upload() 1회 실행. withProgress=true 면 실시간 %(스트리밍), false 면 버퍼 모드.
   * timeoutMs 동안 진행이 없으면 스톨로 보고 abort 후 거부한다. 라이브러리가 abort 에
   * 곧바로 반응하지 않아도 Promise.race 로 확실히 빠져나온다(멈춘 promise 는 버려짐).
   */
  function runUpload(withProgress: boolean, timeoutMs: number): Promise<{ url: string }> {
    const ctrl = new AbortController();
    const onExternalAbort = () => ctrl.abort();
    if (signal?.aborted) ctrl.abort();
    else signal?.addEventListener('abort', onExternalAbort);

    let lastActivity = Date.now();

    const uploadPromise = upload(pathname, prepared, {
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
    }).then((blob) => ({ url: blob.url }));
    // race 가 워치독으로 끝나면 이 promise 는 버려지므로, 나중의 거부가 uncaught 되지 않게.
    uploadPromise.catch(() => {});

    const watchdog = new Promise<never>((_, reject) => {
      const iv = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(iv);
          ctrl.abort();
          reject(new UploadCancelledError());
        } else if (Date.now() - lastActivity > timeoutMs) {
          clearInterval(iv);
          ctrl.abort();
          reject(new Error(`${Math.round(timeoutMs / 1000)}초 동안 응답이 없어 연결을 중단했습니다.`));
        }
      }, 500);
      // 업로드가 먼저 끝나면 워치독도 멈춘다(거부하지 않도록).
      uploadPromise.finally(() => clearInterval(iv));
    });

    return Promise.race([uploadPromise, watchdog]).finally(() => {
      signal?.removeEventListener('abort', onExternalAbort);
    });
  }

  // 1) 스트리밍(실시간 %) — 이 세션에서 아직 막히지 않았을 때만 시도
  if (!preferBufferedUpload) {
    onProgress?.({ phase: 'requesting' });
    try {
      const result = await runUpload(true, STREAM_STALL_MS);
      console.info('[업로드] 완료:', { pathname, elapsedMs: Date.now() - startedAt });
      onProgress?.({ phase: 'done', percent: 100 });
      return result;
    } catch (err) {
      if (err instanceof UploadCancelledError) throw err;
      preferBufferedUpload = true; // 이 환경은 스트리밍이 막힘 → 이후엔 바로 버퍼 모드
      console.warn('[업로드] 스트리밍 전송이 막혀 버퍼 모드로 전환:', err);
    }
  }

  // 2) 버퍼 모드(진행률 없음, 프록시·백신·HTTP/1.1 안전) — 기본 폴백
  onProgress?.({ phase: 'uploading' }); // percent 없음 = 불확정(전송 중…) 표시
  try {
    const result = await runUpload(false, BUFFERED_TIMEOUT_MS);
    console.info('[업로드] 버퍼 모드 완료:', { pathname, elapsedMs: Date.now() - startedAt });
    onProgress?.({ phase: 'done', percent: 100 });
    return result;
  } catch (err) {
    if (err instanceof UploadCancelledError) throw err;
    console.error('[업로드] 최종 실패:', { pathname, error: err });
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `업로드에 실패했습니다 — ${reason} 네트워크(프록시·백신의 SSL 검사, VPN)를 확인하고 다시 시도해 주세요.`,
    );
  }
}
