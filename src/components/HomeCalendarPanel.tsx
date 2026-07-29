'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { KIND_LABELS, KIND_STYLES, kindRank, type CalendarEntry } from '@/lib/calendar-kinds';
import type { Locale } from '@/i18n/routing';

/**
 * 홈 '공지&일정' 섹션 우열의 월간 일정 패널.
 *
 * 이전의 가로 카드 캐러셀은 "이번 달에 뭐가 있나"를 한눈에 못 보여 줬다 —
 * 12건을 시간순으로 늘어놓기만 해서, 지금이 몇 월인지도 화면에 없었다. 여기서는
 * **달을 단위로** 자른다: 상단에 큰 월 라벨과 이전/다음 달 버튼, 아래에 그 달과 겹치는
 * 일정만 [기간 — 분류 칩 — 제목] 한 행씩.
 *
 * 종류별 색·라벨·정렬 순서는 뉴스 '일정' 탭의 EventCalendar 와 **같은 상수**를 쓴다.
 * 두 화면에서 같은 일정이 다른 색으로 보이면 안 되기 때문이다.
 *
 * 하이드레이션: '이번 달'을 클라이언트에서 계산하면 서버(UTC)와 어긋날 수 있어,
 * initialMonth('YYYY-MM')를 서버가 KST 로 계산해 내려준다.
 */
/** 한 달에 보여줄 최대 행 수 — 시안 패널 높이(min-h 432px) 안에 한 줄 행이 들어가는
 *  한도. 그 이상은 숨긴다(전체는 VIEW MORE → 뉴스 일정 탭이 담당). */
const MAX_ROWS = 6;

export function HomeCalendarPanel({
  entries,
  initialMonth,
  locale,
  title,
  moreLabel,
  moreHref,
  prevLabel,
  nextLabel,
  emptyLabel,
}: {
  entries: CalendarEntry[];
  /** 서버가 KST 로 계산한 초기 표시 월 'YYYY-MM' */
  initialMonth: string;
  locale: Locale;
  title: string;
  moreLabel: string;
  moreHref: string;
  prevLabel: string;
  nextLabel: string;
  emptyLabel: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const ko = locale === 'ko';

  // 내비게이션 범위 — 등록된 일정의 최소~최대 달(종료일 기준) ∪ 초기 달.
  // 일정이 하나도 없어도 초기 달은 항상 포함돼 라벨이 빈칸이 되지 않는다.
  const [minMonth, maxMonth] = useMemo(() => {
    let lo = initialMonth;
    let hi = initialMonth;
    for (const e of entries) {
      const s = e.date.slice(0, 7);
      const en = (e.endDate || e.date).slice(0, 7);
      if (s < lo) lo = s;
      if (en > hi) hi = en;
    }
    return [lo, hi];
  }, [entries, initialMonth]);

  // 이 달과 겹치는 일정 — ISO(YYYY-MM-DD)는 사전순 == 시간순이라 문자열 비교로 충분하다.
  // Date 객체를 쓰지 않는 이유: ISO 파싱이 UTC 로 해석돼 KST 사용자에게 하루가 밀린다.
  // monthEnd 를 '-31' 로 고정해도 안전하다 — 실제 말일보다 큰 문자열이라 비교가 성립한다.
  //
  // 표시는 앞에서 MAX_ROWS 건까지만 — 홈 패널은 "이번 달 분위기"를 보여주는 요약이지
  // 전체 목록이 아니다(사용자 지시). 다 보려면 소헤더의 VIEW MORE(뉴스 일정 탭)로 간다.
  const monthEntries = useMemo(() => {
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`;
    return entries
      .filter((e) => e.date <= monthEnd && (e.endDate || e.date) >= monthStart)
      .slice()
      .sort(
        (a, b) =>
          (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
          kindRank(a.kind) - kindRank(b.kind) ||
          a.title.localeCompare(b.title),
      )
      .slice(0, MAX_ROWS);
  }, [entries, month]);

  // 월 증감은 'YYYY-MM' 을 정수로 풀어 계산한다(Date 생성자·타임존을 타지 않는다).
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const total = y * 12 + (m - 1) + delta;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  };

  const [labelYear, labelMonth] = month.split('-');
  // "2026.7" — 월은 제로패딩하지 않는다(큰 숫자 라벨에서 앞의 0 이 군더더기로 읽힌다).
  const monthLabel = `${labelYear}.${Number(labelMonth)}`;

  /** 기간 라벨 — 하루면 'MM.DD', 기간이면 'MM.DD ~ MM.DD'. dateLabel(자유형식)은 쓰지
   *  않는다: "7월 20일부터 24일까지" 같은 값이 들어오면 118px 열을 넘겨 줄이 깨진다. */
  const periodText = (e: CalendarEntry) => {
    const s = e.date.slice(5).replace('-', '.');
    const en = (e.endDate || e.date).slice(5).replace('-', '.');
    return s === en ? s : `${s} ~ ${en}`;
  };

  // 원형 화살표 버튼 — 폐기한 일정 캐러셀의 버튼 문법을 그대로 이식(30px).
  const arrowBtnClass =
    'grid h-[30px] w-[30px] place-items-center rounded-full border border-content/40 text-content transition-colors hover:border-yonsei-blue hover:text-yonsei-blue disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue';

  return (
    <div>
      {/* 소헤더 행 — 좌열 '공지사항' 소헤더와 같은 장치(사각 마커 + 라벨, 우측 끝 더보기)로
          두 열이 형제임을 드러낸다. 라벨과 더보기를 잇던 헤어라인은 삭제(사용자 지시). */}
      <div className="flex items-center justify-between gap-5">
        <h3 className="flex shrink-0 items-center gap-2.5 text-base font-bold text-content">
          <span aria-hidden="true" className="h-2 w-2 bg-yonsei-navy" />
          {title}
        </h3>
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

      {/* 패널 — 옅은 면(surface-soft)만으로 좌열 리스트와 구분한다. 보더·그림자 없음.
          min-h 는 달을 넘길 때 일정 수에 따라 패널이 출렁이지 않게 잡아 둔 바닥값이다. */}
      <div className="mt-4 min-h-[432px] rounded-card bg-surface-soft px-6 pb-8 pt-7 sm:px-9 sm:pb-10 sm:pt-9">
        <div className="flex items-center justify-between gap-4">
          <p className="text-2xl font-extrabold tabular-nums tracking-tight text-content">
            {monthLabel}
          </p>
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(-1))}
              disabled={month <= minMonth}
              aria-label={prevLabel}
              className={arrowBtnClass}
            >
              <ArrowSmall dir="left" />
            </button>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(1))}
              disabled={month >= maxMonth}
              aria-label={nextLabel}
              className={arrowBtnClass}
            >
              <ArrowSmall dir="right" />
            </button>
          </div>
        </div>

        <span aria-hidden="true" className="mt-[22px] block h-px bg-surface-border" />

        {/* aria-live 는 목록이 아니라 이 래퍼가 갖는다 — key 로 통째로 갈리는 노드에 걸면
            교체된 새 노드는 라이브 리전으로 인식되지 않아 달 전환이 읽히지 않는다.
            key={month} 로 달을 넘길 때 행 스태거 등장을 재트리거(공지 리스트와 같은 관례).
            .anim-nav-item 의 nth-child 딜레이는 인라인 style 이 덮는다(인라인 우선). */}
        <div className="mt-[22px]" aria-live="polite">
          <ul key={month}>
            {monthEntries.length > 0 ? (
              monthEntries.map((e, i) => {
                // 링크 여부와 무관하게 배치는 같고, hover 색 전환만 링크일 때 붙인다
                // (누를 곳이 없는데 눌릴 것처럼 보이면 안 된다).
                // 배치가 화면폭에 따라 갈린다:
                // - sm 미만: [날짜 · 칩] 윗줄 / 제목 전폭 아랫줄 — 한 줄에 다 넣으면
                //   날짜 열이 폭을 다 먹어 제목이 한글 6~8자에서 잘렸다.
                // - sm 이상: [날짜(118px) — 칩 — 제목] 한 줄.
                // 같은 마크업이 flex-wrap 으로 두 배치를 오간다: 제목의 w-full 이
                // 모바일에서 줄바꿈을 강제하고, sm 에서 w-auto flex-1 로 풀린다.
                // 가로 간격은 gap 대신 마진 — 날짜↔칩(10px→sm 24px)과 칩↔제목(10px)이
                // 달라 gap 하나로는 못 잡는다.
                const row = (linked: boolean) => (
                  <>
                    <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums text-yonsei-navy sm:w-[118px] sm:text-[15px]">
                      {periodText(e)}
                    </span>
                    <span
                      className={cn(
                        'ml-2.5 shrink-0 px-[7px] py-px text-[11px] font-extrabold leading-normal sm:ml-6',
                        KIND_STYLES[e.kind].badge,
                      )}
                    >
                      {ko ? KIND_LABELS[e.kind].ko : KIND_LABELS[e.kind].en}
                    </span>
                    {/* 제목은 한 줄 말줄임 — 요약 패널이라 전문이 필요 없다(사용자 지시).
                        전문은 행 링크(게시물 상세)나 VIEW MORE 캘린더에서 본다. */}
                    <span
                      className={cn(
                        'w-full min-w-0 truncate text-[15px] font-medium text-content sm:ml-2.5 sm:w-auto sm:flex-1',
                        linked && 'transition-colors group-hover:text-yonsei-blue',
                      )}
                    >
                      {e.title}
                    </span>
                  </>
                );
                return (
                  <li
                    key={e.id}
                    className="anim-nav-item"
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    {e.href ? (
                      <Link
                        href={e.href}
                        className="group flex flex-wrap items-center gap-y-1.5 py-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue sm:flex-nowrap"
                      >
                        {row(true)}
                      </Link>
                    ) : (
                      <div className="flex flex-wrap items-center gap-y-1.5 py-[13px] sm:flex-nowrap">
                        {row(false)}
                      </div>
                    )}
                  </li>
                );
              })
            ) : (
              <li className="py-12 text-center text-sm text-content-soft">{emptyLabel}</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** 원형 버튼 내부 화살표 — 시안의 가는 홑화살표(각진 라운드). */
function ArrowSmall({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      {dir === 'left' ? (
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
