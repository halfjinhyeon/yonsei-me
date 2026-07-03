'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { FacultyRecord } from '@/lib/faculty';

const ACCENTS = [
  'from-yonsei-navy to-yonsei-blue',
  'from-yonsei-blue to-yonsei-sky',
  'from-yonsei-navy to-yonsei-gold',
  'from-yonsei-sky to-yonsei-navy',
];

function accentFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return ACCENTS[hash % ACCENTS.length];
}

/**
 * 교수진 카드 그리드(모바일 2열 → 데스크톱 4열, 세로 3:4 인물사진 비율).
 * 기본으로는 이름 + 소속 연구실(또는 전공)만 노출하고, hover 시 이메일·전화·
 * 연구실 위치가 오버레이로 드러난다. 우하단 화살표 버튼은 more information 링크 →
 * 연구실 사이트 → /research#labs 순으로 연결한다.
 */
export function FacultyDirectoryGrid({
  items,
  moreLabel,
}: {
  items: FacultyRecord[];
  moreLabel: string;
}) {
  return (
    <div className="relative">
      {/* 가운데 구분선 (4열이 되는 lg 이상에서만 정중앙에 맞음) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-surface-border lg:block"
      />
      <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((f, i) => {
        const accent = accentFor(f.name);
        const hasDetail = Boolean(f.email || f.phone || f.room);
        const linkHref = f.moreInfoUrl ?? f.lab?.url ?? (f.lab ? '/research#labs' : null);
        const isExternal = !!linkHref?.startsWith('http');
        const subtitle = f.lab?.nameKo ?? f.specialty ?? f.title;

        return (
          <li key={f.name} className="anim-nav-item group" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
            <div
              className={cn(
                'relative aspect-[3/4] overflow-hidden rounded-card bg-gradient-to-br text-white',
                accent,
              )}
            >
              {/* 프로필 사진, 없으면 이름 이니셜 플레이스홀더 */}
              {f.photo ? (
                <Image
                  src={f.photo}
                  alt={f.name}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white/25">{f.name.charAt(0)}</span>
                </div>
              )}

              {/* hover 시 연락처 상세 오버레이 */}
              {hasDetail && (
                <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-yonsei-navy/85 p-3 text-xs leading-relaxed opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {f.email && <p className="truncate">{f.email}</p>}
                  {f.phone && <p>{f.phone}</p>}
                  {f.room && <p className="truncate">{f.room}</p>}
                </div>
              )}

              {/* 상세/연구실 페이지 이동 */}
              {linkHref && (
                <a
                  href={linkHref}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  aria-label={`${f.name} ${moreLabel}`}
                  className="absolute bottom-3 right-3 grid h-5 w-5 place-items-center text-white transition-transform duration-200 hover:translate-x-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-full w-full">
                    <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              )}
            </div>

            <div className="mt-3">
              <h3 className="font-bold text-content">
                {f.name}
                {f.role && (
                  <span className="ml-2 rounded-full bg-yonsei-gold/15 px-2 py-0.5 text-xs font-semibold text-yonsei-gold">
                    {f.role}
                  </span>
                )}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-sm text-content-soft">{subtitle}</p>
              {f.yearRange && <p className="text-xs text-content-faint">{f.yearRange}</p>}
            </div>
          </li>
        );
        })}
      </ul>
    </div>
  );
}
