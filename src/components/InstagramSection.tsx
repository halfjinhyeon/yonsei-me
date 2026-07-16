import type { CSSProperties } from 'react';

/** 공용 인스타그램 아이콘(선형) — currentColor */
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// 배경 워시 — 인스타그램 브랜드 그라디언트를 아주 옅게(8~10% 알파) 가로로 깔아
// '인스타그램 밴드'라는 정체성만 주고 사이트 네이비 톤을 해치지 않는다.
const washStyle: CSSProperties = {
  background:
    'linear-gradient(115deg, rgba(254, 218, 117, 0.12), rgba(214, 41, 118, 0.08) 45%, rgba(79, 91, 213, 0.12))',
};

/**
 * 인스타그램 밴드 — 홈 맨 아래(공지 쇼케이스 아래, 푸터 위).
 * 실시간 피드 연동이 불가한 현실을 그대로 반영한 정직한 디자인:
 * 사진 그리드 없이 좌우로 긴 낮은 밴드 하나 + 계정으로 가는 버튼 하나.
 * 배경은 옅은 인스타 그라디언트 워시 + 우측 대형 글리프 워터마크(장식).
 *
 * 문구는 부모(page)가 messages 에서 해석해 props 로 넘긴다(서버 컴포넌트 유지).
 * 핸들·URL 은 content/instagram.json — 계정이 바뀌면 JSON 만 수정.
 */
export function InstagramSection({
  handle,
  url,
  tagline,
  followLabel,
  externalLabel,
}: {
  handle: string;
  url: string;
  /** 밴드 헤드라인(로케일 해석 완료) */
  tagline: string;
  /** 버튼 라벨("팔로우하기") */
  followLabel: string;
  /** 새 창 안내(접근성) */
  externalLabel: string;
}) {
  return (
    <section
      aria-labelledby="instagram-heading"
      className="full-bleed relative overflow-hidden bg-surface"
    >
      {/* 배경 워시 (장식) */}
      <div aria-hidden="true" className="absolute inset-0" style={washStyle} />
      {/* 우측 대형 글리프 워터마크 (장식) — 좁은 화면에선 숨김 */}
      <InstagramGlyph className="pointer-events-none absolute -right-8 -top-10 hidden h-56 w-56 text-yonsei-navy/[0.07] dark:text-white/[0.06] sm:block" />

      <div className="relative mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-16 lg:py-14">
        {/* 좌: 아이콘 + 헤드라인 */}
        <div className="flex items-center gap-4">
          <InstagramGlyph className="h-9 w-9 shrink-0 text-yonsei-navy dark:text-white" />
          <h2 id="instagram-heading" className="text-xl font-bold tracking-tight text-content sm:text-2xl">
            {tagline}
          </h2>
        </div>

        {/* 우: 단일 버튼 — 계정으로 새 창 이동 */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`@${handle} ${followLabel} — ${externalLabel}`}
          className="inline-flex items-center justify-center gap-2.5 bg-yonsei-navy px-7 py-3.5 text-sm font-bold text-white transition-colors hover:bg-yonsei-blue sm:shrink-0"
        >
          <InstagramGlyph className="h-[1.1em] w-[1.1em]" />
          <span>
            @{handle} {followLabel}
          </span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}
