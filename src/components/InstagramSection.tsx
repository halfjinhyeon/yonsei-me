import type { CSSProperties } from 'react';
import Image from 'next/image';

/** 홈 그리드 타일 한 장 — 부모(page)가 로케일 해석을 끝내 넘긴다 */
export interface InstagramTile {
  /** 실제 인스타그램 게시물 URL(새 창) */
  href: string;
  /** 타일 사진(R2 업로드 썸네일) — 없으면 그라디언트 플레이스홀더 */
  image?: string;
  /** 캡션 한 줄(hover 오버레이·접근성 라벨) */
  caption: string;
}

/** 밴드에 함께 노출하는 보조 계정(아웃라인 버튼) */
export interface InstagramAccount {
  /** @ 없는 핸들 */
  handle: string;
  /** 계정 URL(새 창) */
  url: string;
}

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

// 플레이스홀더 타일(이미지 없는 게시물) — 인스타 그라디언트를 조금 진하게
const placeholderStyle: CSSProperties = {
  background:
    'linear-gradient(135deg, rgba(254, 218, 117, 0.45), rgba(214, 41, 118, 0.35) 45%, rgba(79, 91, 213, 0.45))',
};

/**
 * 인스타그램 섹션 — 홈 맨 아래(연구실 아래, 푸터 위).
 * 상단 밴드(헤드라인 + 계정 버튼들, 옅은 인스타 그라디언트 워시 배경 유지 — 사용자 지시)
 * + 실제 게시물 그리드. 게시물은 CMS '인스타그램' 게시판(Supabase)에 캡션·대표 이미지·
 * 게시물 URL 로 등록하면 즉시 반영된다(revalidateTag). 게시물이 없으면 밴드만 렌더.
 *
 * 밴드 우측은 '버튼 확장형' — 대표 계정은 채운 네이비 버튼, 보조 계정은 아웃라인 버튼
 * (hover 시 네이비로 반전). 계정이 하나뿐이면 자동으로 기존 단일 버튼 모습이 된다.
 *
 * 그리드 디자인 — 인스타그램 프로필 그리드의 문법을 사이트 톤으로:
 *  - 정사각 타일 + 촘촘한 간격(모자이크), 각진 모서리(사이트 직각 엣지와 통일)
 *  - hover/focus: 사진이 살짝 확대되고 하단 스크림 위로 캡션 2줄 + 우상단 글리프
 *  - 타일 전체가 실제 게시물로 가는 새 창 링크(캡션이 접근성 라벨)
 *
 * 문구는 부모(page)가 messages 에서 해석해 props 로 넘긴다(서버 컴포넌트 유지).
 * 핸들·URL·보조 계정(accounts)은 content/instagram.json — 계정이 바뀌면 JSON 만 수정.
 */
export function InstagramSection({
  handle,
  url,
  tagline,
  followLabel,
  externalLabel,
  openLabel,
  accounts = [],
  items = [],
}: {
  handle: string;
  url: string;
  /** 밴드 헤드라인(로케일 해석 완료) */
  tagline: string;
  /** 버튼 라벨("팔로우하기") */
  followLabel: string;
  /** 새 창 안내(접근성) */
  externalLabel: string;
  /** 타일 링크 안내("인스타그램에서 보기") */
  openLabel: string;
  /** 대표 계정 외 보조 계정 — 아웃라인 버튼으로 이어 붙는다 */
  accounts?: InstagramAccount[];
  /** 게시물 타일(최신순, 부모가 개수 제한) — 비어 있으면 그리드 생략 */
  items?: InstagramTile[];
}) {
  const hasItems = items.length > 0;
  return (
    <section
      aria-labelledby="instagram-heading"
      className="full-bleed relative overflow-hidden bg-surface"
    >
      {/* 배경 워시 (장식) — 인스타그램 컨셉 컬러 유지(사용자 지시) */}
      <div aria-hidden="true" className="absolute inset-0" style={washStyle} />
      <div
        className={
          // 계정 버튼이 셋이라 헤드라인과 한 줄에 들어가는 xl 부터만 좌우 배치,
          // 그 아래는 세로 스택(버튼 셋은 여전히 한 줄에 나란히 들어간다).
          'relative mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 pt-12 sm:px-10 lg:px-16 lg:pt-14 xl:flex-row xl:items-center xl:justify-between ' +
          (hasItems ? 'pb-8' : 'pb-12 lg:pb-14')
        }
      >
        {/* 좌: 아이콘 + 헤드라인 */}
        <div className="flex items-center gap-4">
          <InstagramGlyph className="h-9 w-9 shrink-0 text-yonsei-navy dark:text-white" />
          <h2 id="instagram-heading" className="text-xl font-bold tracking-tight text-content sm:text-2xl">
            {tagline}
          </h2>
        </div>

        {/* 우: 계정 버튼들 — 대표 계정은 채운 네이비, 보조 계정은 아웃라인 */}
        <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`@${handle} ${followLabel} — ${externalLabel}`}
            className="inline-flex items-center justify-center gap-2.5 bg-yonsei-navy px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-yonsei-blue"
          >
            <InstagramGlyph className="h-[1.1em] w-[1.1em]" />
            <span>
              @{handle} {followLabel}
            </span>
            <span aria-hidden="true">↗</span>
          </a>

          {accounts.map((a) => (
            <a
              key={a.url}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`@${a.handle} ${followLabel} — ${externalLabel}`}
              className="inline-flex items-center justify-center gap-2 border border-yonsei-navy/45 bg-white/60 px-5 py-[13px] text-sm font-bold text-yonsei-navy transition-colors hover:border-yonsei-navy hover:bg-yonsei-navy hover:text-white dark:border-white/40 dark:bg-white/5 dark:text-white dark:hover:border-white dark:hover:bg-white dark:hover:text-yonsei-navy"
            >
              <span>@{a.handle}</span>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </div>

      {/* 게시물 그리드 — 정사각 모자이크(모바일 2열 → sm 3열 → lg 4열) */}
      {hasItems && (
        <div className="relative mx-auto w-full max-w-[1360px] px-6 pb-12 sm:px-10 lg:px-16 lg:pb-14">
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it) => (
              <li key={it.href}>
                <a
                  href={it.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${it.caption || 'Instagram'} — ${openLabel} (${externalLabel})`}
                  className="group relative block aspect-square overflow-hidden bg-surface-soft outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yonsei-blue"
                >
                  {it.image ? (
                    <Image
                      src={it.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                  ) : (
                    // 이미지 없는 게시물 — 컨셉 그라디언트 + 중앙 글리프
                    <span aria-hidden="true" className="absolute inset-0 grid place-items-center" style={placeholderStyle}>
                      <InstagramGlyph className="h-10 w-10 text-white/85" />
                    </span>
                  )}

                  {/* hover/focus 오버레이 — 하단 스크림 + 캡션 2줄(인스타 프로필 그리드 문법) */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/65 via-black/15 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <span className="line-clamp-2 text-xs font-semibold leading-snug text-white">
                      {it.caption}
                    </span>
                  </span>
                  {/* 우상단 글리프 — 오버레이와 함께 등장(각진 반투명 칩 위라 밝은 사진에서도 보임) */}
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center bg-black/35 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <InstagramGlyph className="h-4 w-4" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
