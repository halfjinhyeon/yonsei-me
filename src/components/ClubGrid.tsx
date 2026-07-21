'use client';

import { Link } from '@/i18n/navigation';
import type { ClubSummary } from '@/lib/faculty';

const ACCENTS = [
  'from-yonsei-navy to-yonsei-blue',
  'from-yonsei-blue to-yonsei-sky',
  'from-yonsei-navy to-yonsei-gold',
  'from-yonsei-sky to-yonsei-navy',
];

/**
 * 동아리 카드 1열 그리드 (교수진보다 큰 박스). 기본으로 이름만 노출하고,
 * hover 시 한 줄 소개(teaser)가 드러난다. 카드 우하단 화살표 버튼(카드 전체
 * 클릭도 가능)으로 상세 페이지(/undergraduate/clubs/[slug])로 이동한다.
 */
export function ClubGrid({ items, moreLabel }: { items: ClubSummary[]; moreLabel: string }) {
  return (
    <ul className="space-y-6">
      {items.map((c, i) => (
        <li key={c.slug} className="anim-nav-item" style={{ animationDelay: `${i * 80}ms` }}>
          <Link
            href={`/undergraduate/clubs/${c.slug}`}
            className={`group relative block overflow-hidden rounded-card bg-gradient-to-br text-white ${ACCENTS[i % ACCENTS.length]}`}
          >
            <div className="relative flex min-h-[9rem] flex-col justify-center gap-2 p-8 pr-16 sm:min-h-[10rem]">
              {/* 왼쪽 배경 로고 — 오른쪽으로 갈수록 카드 그라디언트에 녹아들게 마스크 */}
              {c.logo ? (
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-3/5 bg-cover bg-left opacity-25 mix-blend-luminosity [mask-image:linear-gradient(to_right,black_25%,transparent_95%)]"
                  style={{ backgroundImage: `url(${c.logo})` }}
                />
              ) : (
                <div aria-hidden="true" className="absolute inset-0 flex items-center justify-start pl-6 opacity-10">
                  <span className="text-7xl font-bold">{c.name.charAt(0)}</span>
                </div>
              )}

              <div className="relative min-w-0">
                {/* 동아리명 서체 = Paperlogy 6 SemiBold(사용자 지정) — font-semibold(600)가
                    600 파일을 물린다(세부탭 제목과 동일 방식, 가짜 볼드 없음). */}
                <h3
                  style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
                  className="text-2xl font-semibold sm:text-3xl"
                >
                  {c.name}
                </h3>
                {/* hover 시 teaser 노출 */}
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/0 transition-colors duration-300 group-hover:text-white/85 sm:text-base">
                  {c.teaser}
                </p>
              </div>
            </div>

            <span
              aria-label={`${c.name} ${moreLabel}`}
              className="absolute bottom-4 right-5 grid h-6 w-6 shrink-0 place-items-center text-white transition-transform duration-200 group-hover:translate-x-1 sm:bottom-5 sm:right-6"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-full w-full">
                <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
