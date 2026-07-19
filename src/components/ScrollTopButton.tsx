'use client';

/**
 * 푸터 우측 '맨 위로' 원형 버튼 — 레퍼런스(이화여대)의 ↑ 원형 버튼.
 * 네이비 푸터 위 흰 원 + 네이비 화살표, 클릭 시 페이지 최상단으로 부드럽게 스크롤
 * (reduced-motion 은 즉시 이동).
 */
export function ScrollTopButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-yonsei-navy transition-colors hover:bg-yonsei-blue hover:text-white"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className="h-5 w-5"
      >
        <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
