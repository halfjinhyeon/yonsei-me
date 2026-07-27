'use client';

// AI 연구요약 — 학술활동 제목 옆 토글 버튼과, 열었을 때 타이핑되며 나타나는 요약 패널.
//
// 요약문은 실시간 생성이 아니라 크롤링된 학술활동 데이터를 바탕으로 미리 써 둔 문장이다
// (content/faculty-profiles/<이름>.json 의 aiSummary). 타이핑 연출은 "지금 만들어지는 중"인
// 것처럼 보이게 하는 장치일 뿐이므로, 패널 하단에 사전 생성이라는 사실을 명시한다.
//
// 이 컴포넌트만 클라이언트다 — FacultyProfileArticle 은 서버 컴포넌트로 두고, 상호작용이
// 필요한 이 조각만 경계를 넘긴다.

import { useEffect, useRef, useState } from 'react';

/** 한 틱에 늘리는 글자 수와 틱 간격 — 시안 값(3자 / 24ms) 그대로 */
const CHARS_PER_TICK = 3;
const TICK_MS = 24;

export function AiResearchSummary({
  summary,
  buttonLabel,
  panelLabel,
  betaLabel,
  disclaimer,
}: {
  /** 미리 생성해 둔 요약문 */
  summary: string;
  buttonLabel: string;
  /** 패널 상단 eyebrow (예: "AI Research Summary") */
  panelLabel: string;
  betaLabel: string;
  /** 사전 생성 안내 문구 */
  disclaimer: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 언마운트 시 타이머 정리 — 열어 둔 채 다른 교수로 이동하면 타이머가 남는다
  useEffect(() => stop, []);

  function toggle() {
    const opening = !open;
    setOpen(opening);
    stop();
    if (!opening) return;

    // 모션을 끈 사용자에게는 타이핑 없이 전문을 즉시 보여 준다(읽는 데 방해가 되면 안 된다)
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setTyped(summary.length);
      return;
    }

    setTyped(0);
    timerRef.current = setInterval(() => {
      setTyped((n) => {
        const next = Math.min(n + CHARS_PER_TICK, summary.length);
        if (next >= summary.length) stop();
        return next;
      });
    }, TICK_MS);
  }

  const done = typed >= summary.length;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="ai-research-summary"
        className="inline-flex items-center gap-2.5 bg-gradient-to-br from-yonsei-navy via-yonsei-blue to-yonsei-sky px-5 py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
      >
        {/* 돋보기 + 반짝임 두 개(엇갈린 딜레이) — AI 생성물임을 알리는 시안의 표식 */}
        <span aria-hidden="true" className="relative inline-flex h-[18px] w-[18px]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5" strokeLinecap="round" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="ai-sparkle absolute -top-1.5 -right-[7px] h-[11px] w-[11px]">
            <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2Z" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="ai-sparkle ai-sparkle-delay absolute -bottom-1 -left-1.5 h-[7px] w-[7px]">
            <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2Z" />
          </svg>
        </span>
        {buttonLabel}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id="ai-research-summary"
          className="anim-panel mt-0 w-full basis-full border border-l-2 border-surface-border border-l-yonsei-blue bg-surface-soft px-6 py-6 sm:px-7"
        >
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-yonsei-blue">
            {panelLabel}
            <span className="bg-yonsei-blue/10 px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.05em]">
              {betaLabel}
            </span>
          </p>
          {/* aria-live 로 타이핑이 끝난 전문을 스크린리더에 한 번 전달한다 */}
          <p
            aria-live="polite"
            className="min-h-[4.5rem] whitespace-pre-line text-[15.5px] leading-[1.8] text-content"
          >
            {summary.slice(0, typed)}
            {!done && <span aria-hidden="true" className="ai-caret ml-px text-yonsei-blue">▍</span>}
          </p>
          <p className="mt-3.5 text-xs text-content-faint">{disclaimer}</p>
        </div>
      )}
    </>
  );
}
