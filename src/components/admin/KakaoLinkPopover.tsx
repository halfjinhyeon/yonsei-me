'use client';

// 카카오 연결 유도 팝오버 — Claude Design 목업 '시안 B'.
//
// 콘솔 우하단에 고정으로 떠서 카카오 계정 연결을 한 번 권한다. 콘솔에서 유일하게
// 둥근 모서리(14px)와 그림자를 쓰는 요소다 — "콘솔 바깥에서 온 안내"라는 신호로,
// 각진 도구 UI 와 의도적으로 구분한다(목업 명세). 카카오 노랑(#FEE500)도 콘솔에서
// 여기와 아바타 배지에만 쓴다.
//
// 뜨는 조건(전부 만족해야 한다):
//  - 계정 정보(me)가 로드됐고, 카카오로 로그인 중이 아니고, 아직 연결도 안 됨
//  - 이 계정에서 ×로 닫은 적이 없음 (localStorage, 계정 기준으로 기억)
// 연결됨/카카오 로그인 중에는 유도 자체가 무의미하므로 아예 렌더하지 않는다.

import { useEffect, useState } from 'react';
import { IcoKakaoMark } from './cms-icons';

/** 닫음 기억 키 — 계정(이메일, 없으면 로그인명) 단위. 기기 공유 시 다른 계정으로
 *  로그인하면 다시 안내한다 — "내가 닫았다"는 기억이 남에게 번지면 안 된다. */
const dismissKey = (account: string) => `cms-kakao-popover-dismissed:${account}`;

export function KakaoLinkPopover({
  account,
  eligible,
}: {
  /** 이 계정의 닫음 기억을 구분하는 식별자 (이메일 또는 로그인명) */
  account: string;
  /** 미연결 상태인가 — 셸이 me 를 보고 판정해 내려준다 */
  eligible: boolean;
}) {
  // localStorage 는 서버에 없다 — 마운트 후에만 읽어 하이드레이션 불일치를 피한다.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissKey(account)) === '1');
    } catch {
      // 저장소 접근 불가(시크릿 모드 등) — 세션 동안만 보여 준다
      setDismissed(false);
    }
  }, [account]);

  if (!eligible || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(account), '1');
    } catch {
      // 기억을 못 남겨도 이번 세션에서는 닫힌다
    }
  };

  return (
    // z-50: 토스트(z-60)·모달(z-70)보다 아래, 변경 트레이·사이드바보다 위.
    <div
      role="complementary"
      aria-label="카카오 계정 연결 안내"
      className="fixed bottom-6 right-6 z-50 w-[320px] rounded-[14px] border border-surface-border bg-surface p-[18px] shadow-[0_18px_40px_-16px_rgba(0,40,94,0.22),0_2px_6px_rgba(0,40,94,0.06)]"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="안내 닫기"
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md text-content-faint transition-colors duration-200 ease-out-expo hover:bg-surface-soft hover:text-content"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3 pr-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FEE500]">
          <IcoKakaoMark size={19} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-[1.45] text-content">
            카카오로 더 빠르게 로그인하세요
          </p>
          <p className="mt-1.5 text-[12.5px] leading-[1.7] text-content-faint">
            한 번 연결해 두면 다음부터 카카오 버튼 하나로 콘솔에 들어옵니다.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          window.location.href = '/api/link/kakao';
        }}
        className="mt-4 flex h-[38px] w-full items-center justify-center rounded-lg bg-yonsei-navy text-[13.5px] font-semibold text-white transition-colors duration-200 ease-out-expo hover:bg-yonsei-blue"
      >
        연결하기
      </button>
    </div>
  );
}
