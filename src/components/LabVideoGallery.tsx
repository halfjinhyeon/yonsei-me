'use client';

import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { LabDirectoryEntry } from '@/lib/faculty';
import type { Locale } from '@/i18n/routing';

/**
 * 연구실 소개 영상 갤러리 — 대학원 "연구실 소개 자료 및 영상" 탭.
 * YouTube / Google Drive 링크를 파사드(썸네일+재생 오버레이) 카드로 보여주고,
 * 클릭 시 그 자리에서 iframe으로 교체한다(초기 렌더에 iframe을 심지 않아 성능 확보).
 * 데이터는 content/labs-directory.json → getLabsDirectory() 를 통해 주입받는다.
 */

/** 영상 제공처 구분 — 배지 라벨과 임베드 URL 규칙이 서로 다르다 */
type VideoSource = 'youtube' | 'drive';

interface ParsedVideo {
  source: VideoSource;
  /** 파사드에 깔 정지 썸네일 */
  thumbnail: string;
  /** 재생 버튼 클릭 시 삽입할 iframe src (autoplay 포함) */
  embed: string;
}

/**
 * 영상 URL을 썸네일/임베드 주소로 파싱한다. 순수 함수 — 서버·클라이언트 어디서 불러도 동일.
 * YouTube watch 링크와 Google Drive file 링크 두 형태만 다루며, 그 외/파싱 실패 시 null.
 */
function parseVideo(url: string | undefined): ParsedVideo | null {
  if (!url) return null;

  // YouTube: watch?v=<ID> — 임베드는 autoplay/rel=0 로 관련영상 노출을 줄인다
  const yt = url.match(/[?&]v=([\w-]+)/);
  if (yt) {
    const id = yt[1];
    return {
      source: 'youtube',
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      embed: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
    };
  }

  // Google Drive: /file/d/<ID>/view — 썸네일은 thumbnail 엔드포인트, 임베드는 preview
  const drive = url.match(/\/file\/d\/([\w-]+)/);
  if (drive) {
    const id = drive[1];
    return {
      source: 'drive',
      thumbnail: `https://drive.google.com/thumbnail?id=${id}&sz=w800`,
      embed: `https://drive.google.com/file/d/${id}/preview`,
    };
  }

  return null;
}

/** 필터 상태 — 기본은 영상 보유 연구실만, "전체"는 미보유 연구실까지 노출 */
type Filter = 'withVideo' | 'all';

const PAGE_SIZE = 9;

export function LabVideoGallery({ items, locale }: { items: LabDirectoryEntry[]; locale: Locale }) {
  const ko = locale === 'ko';
  const [filter, setFilter] = useState<Filter>('withVideo');
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  // 요약 줄 숫자 — 하드코딩하지 않고 items에서 계산 (데이터가 늘면 자동 반영)
  const totalLabs = items.length;
  const videoCount = useMemo(() => items.filter((l) => l.video).length, [items]);

  // 필터별 표시 목록. "전체"에서는 영상 보유 연구실을 앞으로 모으되(그 안에선 원본 순서 유지),
  // 안정 정렬을 위해 원본 인덱스를 부여해 정렬한다.
  const visible = useMemo(() => {
    if (filter === 'withVideo') return items.filter((l) => l.video);
    return items
      .map((lab, idx) => ({ lab, idx }))
      .sort((a, b) => {
        const av = a.lab.video ? 0 : 1;
        const bv = b.lab.video ? 0 : 1;
        return av - bv || a.idx - b.idx;
      })
      .map((x) => x.lab);
  }, [items, filter]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount); // 필터 변경 등으로 페이지가 범위를 벗어나면 보정
  const pageItems = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  /** reduced-motion 사용자에겐 부드러운 스크롤을 끈다 */
  function scrollToGrid() {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gridRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function changeFilter(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    setPage(1); // 필터를 바꾸면 항상 1페이지로 리셋
  }

  function changePage(next: number) {
    const clamped = Math.min(Math.max(1, next), pageCount);
    setPage(clamped);
    scrollToGrid();
  }

  return (
    <div className="space-y-8">
      {/* 요약 줄 — 연구실 N곳 · 소개 영상 M편 */}
      <p className="text-sm text-content-soft">
        {ko ? (
          <>
            연구실 <span className="font-semibold text-content">{totalLabs}곳</span>
            <span className="mx-2 text-content-faint">·</span>
            소개 영상 <span className="font-semibold text-yonsei-blue">{videoCount}편</span>
          </>
        ) : (
          <>
            <span className="font-semibold text-content">{totalLabs} labs</span>
            <span className="mx-2 text-content-faint">·</span>
            <span className="font-semibold text-yonsei-blue">{videoCount} intro videos</span>
          </>
        )}
      </p>

      {/* 필터 세그먼트 토글 — GraduationChecker STEP01 스타일과 동일 계열 */}
      <div className="inline-flex overflow-hidden rounded-lg border border-surface-border">
        {(['withVideo', 'all'] as const).map((f, i) => (
          <button
            key={f}
            type="button"
            onClick={() => changeFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              'px-5 py-2.5 text-sm font-semibold transition-colors',
              i > 0 && 'border-l border-surface-border',
              filter === f
                ? 'bg-yonsei-navy text-white'
                : 'bg-surface text-content-soft hover:text-yonsei-navy',
            )}
          >
            {f === 'withVideo' ? (ko ? '영상 보유' : 'With video') : ko ? '전체 연구실' : 'All labs'}
          </button>
        ))}
      </div>

      {/* 카드 그리드 — key로 필터·페이지 전환 시 애니메이션 재생 + 재생 중이던 iframe 초기화 */}
      <div
        ref={gridRef}
        key={`${filter}-${current}`}
        className="anim-panel grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
      >
        {pageItems.map((lab, i) => (
          <LabVideoCard key={lab.nameKo + lab.professorKo} lab={lab} locale={locale} index={i} />
        ))}
      </div>

      {/* 페이지네이션 */}
      {pageCount > 1 && (
        <nav aria-label={ko ? '페이지 목록' : 'Pagination'} className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => changePage(current - 1)}
            disabled={current === 1}
            className="border border-surface-border px-3 py-1.5 text-sm text-content-soft transition-colors hover:text-yonsei-navy disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ko ? '이전' : 'Prev'}
          </button>
          {Array.from({ length: pageCount }, (_, idx) => idx + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => changePage(p)}
              aria-current={p === current ? 'page' : undefined}
              aria-label={ko ? `${p}페이지` : `Page ${p}`}
              className={cn(
                'min-w-[2.5rem] border px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors',
                p === current
                  ? 'border-yonsei-navy bg-yonsei-navy text-white'
                  : 'border-surface-border text-content-soft hover:text-yonsei-navy',
              )}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => changePage(current + 1)}
            disabled={current === pageCount}
            className="border border-surface-border px-3 py-1.5 text-sm text-content-soft transition-colors hover:text-yonsei-navy disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ko ? '다음' : 'Next'}
          </button>
        </nav>
      )}
    </div>
  );
}

/**
 * 개별 연구실 카드. 영상이 있으면 파사드(썸네일+재생 버튼) → 클릭 시 iframe 교체,
 * 없으면 대표 이미지 + "영상 준비 중" 배지를 보여준다.
 * index는 진입 애니메이션 지연(anim-nav-item) 계산에 쓴다.
 */
function LabVideoCard({
  lab,
  locale,
  index,
}: {
  lab: LabDirectoryEntry;
  locale: Locale;
  index: number;
}) {
  const ko = locale === 'ko';
  const parsed = parseVideo(lab.video);
  const [playing, setPlaying] = useState(false);
  // 썸네일 로드 실패 시 lab.image로, 그것도 없으면 그라디언트 배경으로 폴백
  const [thumbFailed, setThumbFailed] = useState(false);

  // 이름은 현재 로케일 우선, 비어 있으면 반대 언어로 폴백
  const name = ko ? lab.nameKo || lab.nameEn : lab.nameEn || lab.nameKo;
  const professor = ko ? `${lab.professorKo} 교수` : lab.professorEn;

  const sourceLabel = parsed?.source === 'youtube' ? 'YouTube' : 'Drive';
  const thumbSrc = parsed && !thumbFailed ? parsed.thumbnail : lab.image;

  return (
    // 진입 애니메이션(fill: forwards)이 transform을 점유해 hover 리프트를 막지 않도록
    // 애니메이션은 바깥 래퍼, hover transform은 안쪽 article로 분리한다.
    <div className="anim-nav-item" style={{ animationDelay: `${(index % PAGE_SIZE) * 60}ms` }}>
    <article
      className="overflow-hidden rounded-card border border-surface-border bg-surface shadow-card transition hover:-translate-y-1 hover:shadow-lg"
    >
      {/* 미디어 영역 16:9 */}
      <div className="relative aspect-video w-full overflow-hidden bg-surface-soft">
        {parsed ? (
          playing ? (
            <iframe
              title={name}
              src={parsed.embed}
              allow="autoplay; fullscreen"
              allowFullScreen
              className="h-full w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={ko ? `${name} 소개 영상 재생` : `Play ${name} intro video`}
              className="group relative block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-yonsei-blue"
            >
              {thumbSrc ? (
                <img
                  src={thumbSrc}
                  alt={name}
                  loading="lazy"
                  onError={() => setThumbFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                // 썸네일도 대표 이미지도 없을 때 최종 폴백
                <span aria-hidden="true" className="anim-gradient absolute inset-0 block" />
              )}

              {/* 중앙 재생 버튼 오버레이 */}
              <span
                aria-hidden="true"
                className="absolute inset-0 grid place-items-center"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-yonsei-navy to-yonsei-blue shadow-lg transition-transform group-hover:scale-110">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-6 w-6 text-white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>

              {/* 우상단 출처 배지 */}
              <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                {sourceLabel}
              </span>
            </button>
          )
        ) : (
          // 영상 미보유 카드 — 대표 이미지 + "영상 준비 중" 배지
          <>
            {lab.image ? (
              <img
                src={lab.image}
                alt={name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden="true" className="anim-gradient absolute inset-0 block" />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1.5 text-center text-xs font-medium text-white">
              {ko ? '영상 준비 중' : 'Video coming soon'}
            </span>
          </>
        )}
      </div>

      {/* 본문 */}
      <div className="space-y-1.5 p-5">
        <h3 className="text-base font-bold leading-snug text-content">{name}</h3>
        <p className="text-sm text-content-soft">{professor}</p>
        <p className="text-xs text-content-faint">{lab.location}</p>
        {lab.url && (
          <a
            href={lab.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block pt-1 text-sm font-medium text-yonsei-blue underline-offset-2 hover:underline"
          >
            {ko ? '홈페이지 ↗' : 'Website ↗'}
          </a>
        )}
      </div>
    </article>
    </div>
  );
}
