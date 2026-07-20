'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { UnderlineTabs } from './UnderlineTabs';
import { cn } from '@/lib/utils';

export type NoticeCategory = 'undergrad' | 'graduate' | 'external' | 'scholarship';

/** 로케일 해석이 끝난 학과 공지 한 건(부모가 날짜 포맷·제목 해석 완료) */
export interface NoticeSectionItem {
  id: string;
  /** 정렬·시맨틱용 원본 날짜 'YYYY-MM-DD' */
  date: string;
  /** 화면 표시용 포맷 날짜(formatDate 결과) */
  dateText: string;
  title: string;
  category: NoticeCategory;
}

export interface NoticeFilter {
  /** 'all' 또는 NoticeCategory */
  key: string;
  label: string;
}

// 카테고리 배지 톤 — 학과 공지 스캔성을 위한 색 구분(금색 배제 — 사용자 지시).
// 옅은 면 + 진한 글자의 각진 소형 pill. 학부는 브랜드 블루, 나머지는 절제된 액센트.
const BADGE: Record<NoticeCategory, string> = {
  undergrad: 'bg-yonsei-blue/10 text-yonsei-blue',
  graduate: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  external: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  scholarship: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
};

/** 공지 한 행 — 날짜 → 제목(1줄 말줄임) → 카테고리 배지. 행 전체가 게시물 Link. */
function NoticeRow({
  item,
  label,
  delayIndex,
}: {
  item: NoticeSectionItem;
  label: string;
  delayIndex: number;
}) {
  return (
    <li
      className="anim-nav-item border-b border-surface-border"
      style={{ animationDelay: `${Math.min(delayIndex, 8) * 45}ms` }}
    >
      <Link
        href={`/news/post/${item.id}`}
        className="group flex items-center gap-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
      >
        <time dateTime={item.date} className="shrink-0 text-sm tabular-nums text-content-faint">
          {item.dateText}
        </time>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-content transition-colors group-hover:text-yonsei-blue sm:text-base">
          {item.title}
        </span>
        <span
          className={cn(
            'shrink-0 whitespace-nowrap px-2.5 py-1 text-xs font-bold',
            BADGE[item.category],
          )}
        >
          {label}
        </span>
      </Link>
    </li>
  );
}

/**
 * '공지 & 일정' 통합 섹션 — 학과 공지 리스트 + (children 으로 받은) 학과 일정을 한 섹션에
 * 담는다(사용자 지시로 두 섹션 통합). 헤더는 공지 것 하나만("공지&일정"), children 앞에
 * 가로 구분선(border-t)을 둔다.
 *
 * 구성:
 *  - 헤더 행: 좌측 네이비 박스 제목 + 헤어라인 + 우측 'MORE ›'(공지 게시판).
 *  - 필터 탭: 사이트 공통 UnderlineTabs(전체 + 학부/대학원/외부기관/장학, 건수 배지).
 *  - 리스트: 2열 grid(모바일 1열). 좌열 = 최신 앞 절반, 우열 = 뒤 절반 — grid-cols-1 에선
 *    두 열이 세로로 쌓여 좌→우 순서가 그대로 보존된다(중복 렌더 없이 반응형 처리).
 *  - children: 구분선 아래에 학과 일정(CalendarSection bare)을 임베드.
 *
 * 데이터(4개 공지 배열: 학부/대학원/외부기관/장학)는 page.tsx(서버)가 최신순으로 합쳐
 * props 로 넘긴다. 탭 전환은 클라이언트에서 필터링. reduced-motion: 정적 노출.
 */
export function NoticeSection({
  items,
  heading,
  listLabel,
  moreLabel,
  moreHref,
  emptyLabel,
  filters,
  children,
}: {
  items: NoticeSectionItem[];
  heading: string;
  /** 공지 리스트 소제목(예: "공지사항") — 일정 소제목과 같은 장치로 두 반쪽의 위계를 통일 */
  listLabel: string;
  moreLabel: string;
  moreHref: string;
  emptyLabel: string;
  /** [전체, 학부, 대학원, 외부기관, 장학] — key='all' 포함 */
  filters: NoticeFilter[];
  /** 소제목 행 아래 임베드할 콘텐츠(학과 일정 CalendarSection bare 등) */
  children?: ReactNode;
}) {
  const [active, setActive] = useState('all');

  // 탭별 건수(배지) — 'all' 은 전체, 나머지는 카테고리별.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const f of filters) if (f.key !== 'all') c[f.key] = 0;
    for (const it of items) c[it.category] = (c[it.category] ?? 0) + 1;
    return c;
  }, [items, filters]);

  // 카테고리 → 배지 라벨(필터 라벨 재사용)
  const catLabel = (cat: NoticeCategory) => filters.find((f) => f.key === cat)?.label ?? cat;

  // 필터 적용 후 상위 8건 → 2열 분배(좌: 앞 절반 / 우: 뒤 절반).
  const visible = useMemo(
    () => (active === 'all' ? items : items.filter((i) => i.category === active)).slice(0, 8),
    [items, active],
  );
  const half = Math.ceil(visible.length / 2);
  const columns = [visible.slice(0, half), visible.slice(half)];

  return (
    <section aria-labelledby="notices-heading" className="full-bleed bg-surface py-section-lg">
      <div className="mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16">
        {/* 헤더 — 네이비 박스 제목(다른 홈 섹션과 통일) + 헤어라인 + MORE */}
        <div className="flex items-center gap-6">
          <h2
            id="notices-heading"
            className="inline-block bg-yonsei-navy px-5 py-2.5 text-lg font-bold text-white"
          >
            {heading}
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-surface-border" />
          <Link
            href={moreHref}
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-content transition-colors hover:text-yonsei-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
          >
            {moreLabel}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              ›
            </span>
          </Link>
        </div>

        {/* 소제목 '공지사항' — 각진 네이비 사각 마커 + 볼드. 아래 학과 일정(CalendarSection
            bare) 소제목과 동일한 장치로, 한 섹션 안 두 반쪽이 형제임을 시각적으로 드러낸다. */}
        <h3 className="mt-9 flex items-center gap-2.5 text-base font-bold text-content">
          <span aria-hidden="true" className="h-2 w-2 bg-yonsei-navy" />
          {listLabel}
        </h3>

        {/* 필터 탭 — 사이트 공통 UnderlineTabs(건수 배지). 좁은 화면은 가로 스크롤. */}
        <div className="mt-3 overflow-x-auto">
          <UnderlineTabs
            active={active}
            onChange={setActive}
            ariaLabel={heading}
            tabs={filters.map((f) => ({
              id: f.key,
              label: (
                <>
                  <span className="whitespace-nowrap">{f.label}</span>
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      active === f.key ? 'text-yonsei-blue' : 'text-content-faint',
                    )}
                  >
                    {counts[f.key] ?? 0}
                  </span>
                </>
              ),
            }))}
          />
        </div>

        {visible.length > 0 ? (
          // key={active} 로 필터 전환 시 행 스태거 등장을 재트리거(교과목 편람과 동일 패턴).
          <div key={active} className="mt-4 grid grid-cols-1 lg:grid-cols-2 lg:gap-x-14">
            {columns.map((col, ci) => (
              <ul key={ci}>
                {col.map((it, i) => (
                  <NoticeRow
                    key={it.id}
                    item={it}
                    label={catLabel(it.category)}
                    delayIndex={ci * half + i}
                  />
                ))}
              </ul>
            ))}
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-center justify-center gap-4 py-16 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/eagle_empty.png" alt="" aria-hidden="true" className="h-16 w-auto opacity-70" />
            <p className="text-sm font-medium text-content-faint">{emptyLabel}</p>
          </div>
        )}

        {/* 학과 일정(children = CalendarSection bare) — 두 섹션 통합(사용자 지시).
            별도 border-t 를 두지 않는다: 일정 쪽 소제목 행([마커+라벨 ─ 헤어라인 ─ 화살표])이
            구분선 역할을 겸해, 맨민한 선 하나로 붙어 있던 이질감을 없앤다. */}
        {children && <div className="mt-14">{children}</div>}
      </div>
    </section>
  );
}
