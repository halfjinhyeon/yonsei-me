'use client';

// AI 연구요약 — 토글 버튼과, 열었을 때 타이핑되며 나타나는 요약 패널.
//
// 요약문은 실시간 생성이 아니라 미리 써 둔 문장이다. 교수 상세는 크롤링된 학술활동
// 데이터를 바탕으로 한 content/faculty-profiles/<이름>.json 의 aiSummary 를, 연구실
// 목록은 content/lab-summaries.json 을 원본으로 쓴다. 타이핑 연출은 "지금 만들어지는
// 중"인 것처럼 보이게 하는 장치일 뿐이므로, 패널 하단에 사전 생성이라는 사실을 명시한다.
//
// 쓰는 곳마다 레이아웃이 달라(교수 상세 = flex-wrap 형제 / 연구실 목록 = 2열 그리드의
// 전폭 자식) 훅·버튼·패널 세 조각으로 쪼개 각각 export 한다. AiResearchSummary 는 그
// 셋을 원래 조합대로 묶은 래퍼라, 기존 호출부는 손대지 않아도 그대로 동작한다.
//
// 이 컴포넌트만 클라이언트다 — FacultyProfileArticle 은 서버 컴포넌트로 두고, 상호작용이
// 필요한 이 조각만 경계를 넘긴다.

import { useEffect, useId, useRef, useState } from 'react';

/** 한 틱에 늘리는 글자 수와 틱 간격 — 시안 값(3자 / 24ms) 그대로 */
const CHARS_PER_TICK = 3;
const TICK_MS = 24;

/**
 * 토글 상태 + 타이핑 진행도. 인스턴스마다 고유한 panelId 를 함께 돌려준다 —
 * 연구실 목록엔 인스턴스가 33개라 ID 를 하드코딩하면 문서 안에서 중복되고
 * 버튼의 aria-controls 가 엉뚱한 패널을 가리킨다.
 */
export function useAiSummaryTyping(summary: string) {
  const panelId = `ai-research-summary${useId()}`;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 언마운트 시 타이머 정리 — 열어 둔 채 다른 교수로 이동하거나(교수 상세),
  // 분야 필터를 바꿔 행이 통째로 리마운트되면(연구실 목록) 타이머가 남는다
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

  return { open, toggle, typed, done: typed >= summary.length, panelId };
}

/** 그라디언트 토글 버튼(돋보기 + 반짝임 두 개 + 셰브런). 패널과 형제로 두든 떨어뜨려
 *  두든 상관없도록 aria-controls 만으로 연결한다.
 *  ariaLabel — 한 화면에 버튼이 여럿일 때(연구실 목록) 스크린리더에서 구분하기 위한 것.
 *  size — 'md'(기본)는 교수 상세의 제목 옆 스케일, 'sm'은 연구실 목록의 '바로가기'
 *  보더 버튼(text-xs, py-2, 1px 테두리 = 34px)과 같은 줄에 서는 축소판. 테두리가 없는
 *  버튼이라 py 를 1px 씩 키워(0.5625rem) 보더 버튼과 높이를 맞춘다 — 자료실 배지와 같은 보정. */
export function AiSummaryToggle({
  open,
  onToggle,
  panelId,
  label,
  ariaLabel,
  size = 'md',
}: {
  open: boolean;
  onToggle: () => void;
  panelId: string;
  label: string;
  ariaLabel?: string;
  size?: 'md' | 'sm';
}) {
  const sm = size === 'sm';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={ariaLabel}
      className={`inline-flex items-center bg-gradient-to-br from-yonsei-navy via-yonsei-blue to-yonsei-sky font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue ${
        sm ? 'gap-2 px-4 py-[0.5625rem] text-xs' : 'gap-2.5 px-5 py-2.5 text-sm'
      }`}
    >
      {/* 돋보기 + 반짝임 두 개(엇갈린 딜레이) — AI 생성물임을 알리는 시안의 표식.
          축소판 치수(15px + 9/6px)는 시안 1a 의 목록 스케일 값 그대로 */}
      <span aria-hidden="true" className={`relative inline-flex ${sm ? 'h-[15px] w-[15px]' : 'h-[18px] w-[18px]'}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={sm ? 'h-[15px] w-[15px]' : 'h-[18px] w-[18px]'}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" strokeLinecap="round" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`ai-sparkle absolute ${sm ? '-top-[5px] -right-[6px] h-[9px] w-[9px]' : '-top-1.5 -right-[7px] h-[11px] w-[11px]'}`}
        >
          <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2Z" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`ai-sparkle ai-sparkle-delay absolute ${sm ? '-bottom-[3px] -left-[5px] h-[6px] w-[6px]' : '-bottom-1 -left-1.5 h-[7px] w-[7px]'}`}
        >
          <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2Z" />
        </svg>
      </span>
      {label}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`${sm ? 'h-3 w-3' : 'h-3.5 w-3.5'} transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** 타이핑되는 요약 패널. 열렸을 때만 렌더한다(등장 애니메이션이 마운트 기반).
 *  className 은 바깥 레이아웃 슬롯 — 기본값은 교수 상세가 쓰는 flex-wrap 전폭(basis-full)
 *  이고, 그리드 안에 놓는 쪽(연구실 목록)은 col-span-full 같은 값으로 갈아 끼운다.
 *  cn 은 tailwind-merge 가 아니라 단순 join 이므로 겹칠 수 있는 클래스는 여기 두지 않는다. */
export function AiSummaryPanel({
  panelId,
  text,
  done,
  panelLabel,
  betaLabel,
  disclaimer,
  className = 'mt-0 w-full basis-full',
}: {
  panelId: string;
  /** 지금까지 타이핑된 부분 문자열 */
  text: string;
  /** 타이핑 완료 여부 — 진행 중에만 캐럿을 붙인다 */
  done: boolean;
  panelLabel: string;
  betaLabel: string;
  disclaimer: string;
  className?: string;
}) {
  return (
    <div
      id={panelId}
      className={`anim-panel ${className} border border-l-2 border-surface-border border-l-yonsei-blue bg-surface-soft px-6 py-6 sm:px-7`}
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
        {text}
        {!done && <span aria-hidden="true" className="ai-caret ml-px text-yonsei-blue">▍</span>}
      </p>
      <p className="mt-3.5 text-xs text-content-faint">{disclaimer}</p>
    </div>
  );
}

/** 버튼 + 패널을 형제로 두는 기본 조합(교수 상세). 부모가 flex-wrap 이라는 전제 아래
 *  패널이 basis-full 로 다음 줄 전폭을 차지한다. */
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
  const { open, toggle, typed, done, panelId } = useAiSummaryTyping(summary);

  return (
    <>
      <AiSummaryToggle open={open} onToggle={toggle} panelId={panelId} label={buttonLabel} />
      {open && (
        <AiSummaryPanel
          panelId={panelId}
          text={summary.slice(0, typed)}
          done={done}
          panelLabel={panelLabel}
          betaLabel={betaLabel}
          disclaimer={disclaimer}
        />
      )}
    </>
  );
}
