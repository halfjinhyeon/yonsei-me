'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** 학술활동 한 줄. 좌측 연도 블록 + 우측 제목·메타로만 이루어진 평평한 구조라
 *  다섯 분류(논문·연구과제·지적재산권·수상·학술활동)를 한 컴포넌트로 렌더한다. */
export interface FacultyActivityRow {
  /** 좌측 연도 블록. 길이 1 = 한 줄, 길이 2 = [시작, 끝] 3단 스택. 비면 연도 없음 */
  years: string[];
  title: string;
  /** 저널명·수상 내용·학회명·발주처 등. 없으면 메타 줄 자체를 생략한다 */
  meta: string | null;
}

export interface FacultyActivityTab {
  id: string;
  label: string;
  rows: FacultyActivityRow[];
}

/** 지마켓 산스(연도 숫자) — 사이트 공통 관례대로 CSS 변수를 직접 참조한다.
 *  (Tailwind 설정에 hero 폰트 패밀리 클래스가 없어 Hero/Footer 와 같은 방식) */
const HERO_FONT = { fontFamily: 'var(--font-hero), var(--font-sans), sans-serif' } as const;

/**
 * 교수 상세의 학술활동 탭. UnderlineTabs 와 문법은 같지만(글자 탭 + 슬라이딩 바)
 * 바가 단색 네이비고 탭이 가로 스크롤되어야 해서 별도 구현이다.
 *
 * 바 위치는 버튼 ref 배열의 offsetLeft/offsetWidth 로만 잰다 —
 * 페이지의 다른 aria-pressed 요소(교수진 목록 필터 등)와 섞이지 않게.
 *
 * 패널 전환은 `key={active}` 리마운트 + 사이트 공통 `.anim-panel`
 * (panelFadeUp 0.35s ease-out, y 10px→0)로 처리한다. GSAP 을 새로 배선하지 않아도
 * 같은 모션이 나오고, reduced-motion 은 globals.css 가 이미 무력화한다.
 */
export function FacultyActivityTabs({
  tabs,
  emptyLabel,
  ariaLabel,
}: {
  tabs: FacultyActivityTab[];
  emptyLabel: string;
  ariaLabel: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [bar, setBar] = useState({ left: 0, width: 0 });

  const measure = () => {
    const el = refs.current.get(active);
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  };
  // 선택 변경·마운트 시 페인트 전에 실측 (첫 렌더 점프 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [active, tabs.length]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const rows = current?.rows ?? [];

  return (
    <div>
      {/* 탭 줄 — 모바일에서는 가로 스크롤. 언더라인 바가 스크롤을 따라가도록
          바와 버튼을 같은 relative 컨테이너(w-max) 안에 둔다. */}
      <div className="no-scrollbar overflow-x-auto" data-land="fade" data-land-order="2">
        <div
          role="group"
          aria-label={ariaLabel}
          className="relative flex w-max min-w-full gap-7 border-b border-surface-border"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) refs.current.set(tab.id, el);
                else refs.current.delete(tab.id);
              }}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-pressed={active === tab.id}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 whitespace-nowrap pb-3 text-sm font-semibold transition-colors',
                active === tab.id ? 'text-yonsei-navy' : 'text-content-soft hover:text-yonsei-navy',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'text-xs font-medium tabular-nums',
                  active === tab.id ? 'text-yonsei-blue' : 'text-content-faint',
                )}
              >
                {tab.rows.length}
              </span>
            </button>
          ))}
          {/* 슬라이딩 언더라인 — 단색 네이비(그라디언트 배제, 사용자 정책) */}
          <span
            aria-hidden="true"
            className="absolute -bottom-px left-0 h-0.5 bg-yonsei-navy transition-all duration-300 ease-out-expo motion-reduce:transition-none"
            style={{ left: bar.left, width: bar.width }}
          />
        </div>
      </div>

      {/* data-land 는 리마운트되지 않는 이 바깥 상자에 건다 — 안쪽 패널에 걸면
          탭을 바꿀 때마다 GSAP 초기 상태가 새 DOM 에 남아 콘텐츠가 숨는다. */}
      <div data-land="rise" data-land-order="3">
        <div key={active} className="anim-panel">
          {rows.length === 0 ? (
            <p className="border-b border-surface-border py-12 text-center text-sm text-content-faint">
              {emptyLabel}
            </p>
          ) : (
            <ul>
              {rows.map((row, i) => (
                <li
                  key={`${active}-${i}`}
                  className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-surface-border px-3 py-5 sm:py-6"
                >
                  {/* 연도 블록 — 기간이면 시작(네이비) · 틱 · 끝(블루) 3단 스택 */}
                  <div
                    style={HERO_FONT}
                    className="flex w-[100px] shrink-0 flex-col justify-center text-[15px] font-bold leading-tight tabular-nums"
                  >
                    {row.years.map((year, yi) => (
                      <Fragment key={yi}>
                        {/* 시작–끝을 잇는 1×10px 세로 틱 */}
                        {yi > 0 && (
                          <span aria-hidden="true" className="my-1 h-2.5 w-px bg-surface-border" />
                        )}
                        <span className={yi === 0 ? 'text-yonsei-navy' : 'text-yonsei-blue'}>
                          {year}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1 basis-[240px]">
                    <p className="text-base font-semibold leading-snug text-content">{row.title}</p>
                    {row.meta && <p className="mt-1 text-sm text-content-faint">{row.meta}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
