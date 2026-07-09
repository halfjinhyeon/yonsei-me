'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { pick, type Program } from '@/lib/content';
import type { Locale } from '@/i18n/routing';

// ── 커스터마이즈 상수 ────────────────────────────────────────────────
// 밑줄·구분선·강조어 그라데이션(네이비→스카이). 흰 배경 위라 잘 보인다.
const ACCENT_GRADIENT = 'linear-gradient(90deg,#00285E 39%,#2E86D6 100%)';

// 배경을 관통하는 물결 라인아트 곡선 — path 만 갈아끼우면 결이 바뀐다.
const WAVE_PATHS = [
  'M0,150 C220,110 420,190 620,150 C820,110 1020,190 1200,150',
  'M0,185 C210,150 410,220 610,185 C810,150 1010,220 1200,185',
  'M0,120 C240,85 440,160 640,120 C840,85 1040,160 1200,120',
];
// 흰 배경용 — 네이비 저투명 라인.
const WAVE_SVG =
  `url("data:image/svg+xml,` +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300" preserveAspectRatio="none">` +
      WAVE_PATHS.map(
        (d) => `<path d="${d}" fill="none" stroke="%2300285E" stroke-opacity="0.08" stroke-width="1.5"/>`,
      ).join('') +
      `</svg>`,
  ) +
  `")`;
// ─────────────────────────────────────────────────────────────────────

/**
 * 'How will you move the world forward?' 스타일 탭 섹션 (흰 배경, 2단).
 * 상단 다크 그라디언트(BgFlow)가 이 섹션에서 흰색으로 디졸브되며(`data-flow-end`),
 * 여기부터 흰 배경 + 어두운 텍스트.
 * - 왼쪽: 리스트 항목 호버 시 바뀌는 사진 패널
 * - 오른쪽: 세리프-이탤릭 혼합 헤드라인(강조어 네이비→스카이 그라데이션 텍스트) +
 *   학부/대학원 탭(활성 밑줄 ::after 그라데이션, CSS transition) +
 *   화살표(→) 리스트(행 구분선도 같은 그라데이션). 오른쪽 열 뒤엔 물결 라인아트.
 */
export function ProgramTabs({
  undergraduate,
  graduate,
  locale,
}: {
  undergraduate: Program[];
  graduate: Program[];
  locale: Locale;
}) {
  const t = useTranslations('home.programs');
  const [tab, setTab] = useState<'ug' | 'grad'>('ug');
  const list = tab === 'ug' ? undergraduate : graduate;
  const [hoverId, setHoverId] = useState<string>(list[0]?.id);
  const activeItem = list.find((p) => p.id === hoverId) ?? list[0];

  // ::after 그라데이션(밑줄·구분선)에서 참조할 CSS 변수
  const accentStyle = { '--accent': ACCENT_GRADIENT } as React.CSSProperties;
  // 강조어 그라데이션 텍스트(네이비→스카이) — 크로스브라우저 배경 클립
  const emStyle = {
    backgroundImage: ACCENT_GRADIENT,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
  } as React.CSSProperties;

  const tabs = [
    { id: 'ug', label: t('tabUg') },
    { id: 'grad', label: t('tabGrad') },
  ] as const;

  return (
    <section
      data-flow-end
      aria-labelledby="programs-heading"
      className="full-bleed relative isolate grid overflow-hidden text-content lg:grid-cols-2"
    >
      {/* 왼쪽: 사진 패널 (리스트 호버로 스왑) */}
      <div className="relative min-h-[11rem] overflow-hidden bg-surface-soft lg:min-h-[22rem]">
        {[...undergraduate, ...graduate].map((p) => (
          <div
            key={p.id}
            aria-hidden="true"
            className={cn(
              'absolute inset-0 bg-cover bg-center transition-opacity duration-500',
              activeItem && p.id === activeItem.id ? 'opacity-100' : 'opacity-0',
            )}
            style={{ backgroundImage: `url(${p.image})` }}
          />
        ))}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-yonsei-navy/25 to-transparent" />
      </div>

      {/* 오른쪽: 콘텐츠 */}
      <div className="relative px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
        {/* 물결 라인아트 배경 — 오른쪽 열 뒤로 흐른다 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage: WAVE_SVG,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: '140% 100%',
          }}
        />

        <h2
          id="programs-heading"
          className="max-w-xl text-[clamp(1.35rem,2.2vw,2.1rem)] font-bold leading-[1.2] tracking-tight"
        >
          {t.rich('moveHeadline', {
            em: (chunks) => (
              <em
                style={emStyle}
                className="font-normal italic text-transparent [font-family:Georgia,'Times_New_Roman',serif]"
              >
                {chunks}
              </em>
            ),
          })}
        </h2>

        {/* 탭바 — 활성 밑줄은 ::after 그라데이션(scaleX transition) */}
        <div role="tablist" aria-labelledby="programs-heading" className="mt-6 flex gap-8">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              role="tab"
              aria-selected={tab === tb.id}
              onClick={() => {
                setTab(tb.id);
                const next = tb.id === 'ug' ? undergraduate : graduate;
                setHoverId(next[0]?.id);
              }}
              style={accentStyle}
              className={cn(
                "relative pb-3 text-lg font-semibold transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:origin-left after:rounded-full after:[background-image:var(--accent)] after:transition-transform after:duration-300 after:ease-out after:content-['']",
                tab === tb.id
                  ? 'text-content after:scale-x-100'
                  : 'text-content-faint hover:text-content after:scale-x-0',
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* 항목 리스트 — 화살표(→) + 그라데이션 행 구분선, 호버 시 왼쪽 사진 스왑 */}
        <ul className="mt-5 max-w-xl">
          {list.map((p) => (
            <li
              key={p.id}
              style={accentStyle}
              className="relative after:absolute after:inset-x-0 after:bottom-0 after:h-px after:[background-image:var(--accent)] after:opacity-50 after:content-['']"
            >
              <Link
                href={p.href}
                onMouseEnter={() => setHoverId(p.id)}
                onFocus={() => setHoverId(p.id)}
                className="group flex items-center justify-between gap-4 py-2.5 transition-colors hover:text-yonsei-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{pick(p.title, locale)}</span>
                  <span className="mt-0.5 grid grid-rows-[0fr] overflow-hidden text-sm text-content-soft transition-all duration-300 group-hover:grid-rows-[1fr] group-focus:grid-rows-[1fr]">
                    <span className="min-h-0">{pick(p.desc, locale)}</span>
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-xl text-content-faint transition-transform group-hover:translate-x-1 group-hover:text-yonsei-blue"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href={tab === 'ug' ? '/undergraduate' : '/graduate'}
          className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-yonsei-blue hover:underline"
        >
          {tab === 'ug' ? t('exploreUg') : t('exploreGrad')}
        </Link>
      </div>
    </section>
  );
}
