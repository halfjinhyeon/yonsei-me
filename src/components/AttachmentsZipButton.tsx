'use client';

// 첨부 전체를 ZIP 한 파일로 내려받는 버튼.
//
// PostArticle 은 본문을 서버에서 marked 로 렌더하는 서버 컴포넌트라 통째로
// 'use client' 로 만들 수 없다. 상세 화면에서 상호작용이 필요한 조각은 이 버튼
// 하나뿐이라, 이 파일만 클라이언트 경계로 떼어내 PostArticle 안에서 쓴다.

import { useState } from 'react';
import { filenameFromDisposition } from '@/lib/files';

export function AttachmentsZipButton({
  postId,
  idleLabel,
  pendingLabel,
  failedLabel,
  fallbackFileName,
}: {
  /** ZIP API 에 넘길 게시물 id — 이 글의 첨부 전체가 대상이다 */
  postId: string;
  idleLabel: string;
  pendingLabel: string;
  failedLabel: string;
  /** 서버가 파일명을 안 줬을 때 쓸 이름 (로케일별) */
  fallbackFileName: string;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postIds: [postId] }),
      });
      // 실패 응답은 JSON { error } 라 blob 으로 받으면 안 된다 — 여기서 끊는다.
      if (!res.ok) throw new Error(`zip ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // blob URL 은 서버의 Content-Disposition 을 무시한다 — a.download 가 곧 파일명이라
      // 헤더에서 서버가 지은 이름(글 제목 기반, 한글)을 직접 꺼내 쓴다.
      a.download =
        filenameFromDisposition(res.headers.get('content-disposition')) ?? fallbackFileName;
      // 일부 브라우저는 문서에 붙어 있지 않은 앵커의 click() 을 무시한다
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // 네트워크 오류든 4xx/5xx 든 이용자에겐 결과가 같다 — 한 문구로 알린다
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={download}
        disabled={pending}
        className="inline-flex items-center gap-2 border border-yonsei-navy bg-yonsei-navy px-[18px] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-yonsei-blue hover:border-yonsei-blue disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-[15px] w-[15px] shrink-0"
        >
          <path
            d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {pending ? pendingLabel : idleLabel}
      </button>

      {failed && (
        <p role="alert" className="mt-2 text-[13px] text-content-soft">
          {failedLabel}
        </p>
      )}
    </div>
  );
}
