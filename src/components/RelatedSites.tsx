'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface RelatedSite {
  /** 로케일 해석이 끝난 사이트명 */
  label: string;
  href: string;
}

/**
 * 푸터 우측 '관련 사이트' 선택기 — 연세대 유관 기관 패밀리 사이트 드롭다운.
 * 네이비 푸터 위 흰 트리거 버튼을 클릭하면 위로 펼쳐지는(푸터가 페이지 하단이라 아래로
 * 열면 화면 밖) 사이트 목록을 노출한다. 각 항목은 새 창 링크 — 접근성상 '메뉴(명령)'가
 * 아니라 링크 disclosure 패턴: 트리거(aria-expanded)가 링크 목록을 토글하고 바깥 클릭·
 * ESC 로 닫는다. 항상 네이비 배경 위라 색은 흰 패널·네이비 텍스트로 고정(테마 무관).
 *
 * 사이트 목록은 content/related-sites.json(콘텐츠/코드 분리) — 부모(Footer)가 로케일을
 * 해석해 label 문자열로 넘긴다. 문구는 messages 의 footer.*.
 */
export function RelatedSites({
  sites,
  triggerLabel,
  openLabel,
  externalLabel,
}: {
  sites: RelatedSite[];
  /** 트리거 버튼 문구(예: "관련 사이트") */
  triggerLabel: string;
  /** 트리거 aria-label(목록 열기 안내) */
  openLabel: string;
  /** 각 링크의 새 창 안내(접근성) */
  externalLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  // 바깥 클릭·ESC 로 닫기(ESC 는 포커스를 트리거로 되돌린다)
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full sm:w-72">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={openLabel}
        className="flex w-full items-center justify-between gap-4 border border-white/20 bg-white px-5 py-3 text-sm font-bold text-yonsei-navy transition-colors hover:border-white"
      >
        <span>{triggerLabel}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-4 w-4 text-yonsei-navy/50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* 목록 패널 — bottom-full 로 위로 펼침(하단이라 아래로 열면 화면 밖).
          항목이 많으면 스크롤(레퍼런스와 동일). */}
      {open && (
        <ul
          id={panelId}
          className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-72 overflow-y-auto border border-yonsei-navy/10 bg-white shadow-xl"
        >
          {sites.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${s.label} — ${externalLabel}`}
                className="flex items-center justify-between gap-3 border-b border-yonsei-navy/10 px-5 py-3 text-sm text-yonsei-navy transition-colors last:border-b-0 hover:bg-yonsei-navy/5 hover:text-yonsei-blue focus-visible:bg-yonsei-navy/5 focus-visible:text-yonsei-blue focus-visible:outline-none"
                onClick={() => setOpen(false)}
              >
                <span>{s.label}</span>
                <span aria-hidden="true" className="text-yonsei-navy/40">↗</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
