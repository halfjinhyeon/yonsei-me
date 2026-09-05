'use client';

// 4개 템플릿이 나눠 쓰는 공통 부품 + 바깥 배치 컨테이너.
//
// 템플릿 파일은 Claude Design 산출물로 교체되지만, 여기 있는 것들은 동작(닫기·
// 오늘 하루 숨김·링크)과 배치라 그대로 살아남는다. 시각은 사이트 규칙을 따른다 —
// 각진 엣지(≤2px), 그림자 없음, 금색 없음, 토큰 색만 사용.

import { useState } from 'react';
import type { PopupPlacement } from '@/lib/popup-templates';
import type { PopupTemplateProps } from './types';

/** 헤더(z-50)보다 위 */
export const POPUP_Z = 60;

/**
 * 같은 배치(placement)를 쓰는 팝업들의 바깥 컨테이너.
 *
 * 템플릿은 자기 카드만 그리고 위치는 몰라야 한다 — 그래야 디자인 산출물로 파일을
 * 통째로 갈아 끼워도 여러 개가 동시에 뜰 때의 겹침 규칙이 유지된다.
 * contained 면 fixed 대신 absolute 를 써서 관리자 미리보기 프레임을 벗어나지 않는다.
 */
export function PopupGroup({
  placement,
  device,
  contained = false,
  children,
}: {
  placement: PopupPlacement;
  device: 'desktop' | 'mobile';
  contained?: boolean;
  children: React.ReactNode;
}) {
  const pos = contained ? 'absolute' : 'fixed';
  // 하단은 세로 스택(시트가 쌓인다), 가운데는 flex-wrap(옆으로 늘어선다)
  const box =
    placement === 'bottom'
      ? `${pos} inset-x-0 bottom-0 flex flex-col items-center gap-2`
      : `${pos} inset-0 flex flex-wrap items-center justify-center gap-3 p-4`;
  return (
    <div
      className={`pointer-events-none ${box}`}
      style={{
        zIndex: contained ? undefined : POPUP_Z,
        // PC 하단 시트는 화면 끝에 붙이지 않고 살짝 띄운다(모바일은 붙인 바텀시트)
        paddingBottom: placement === 'bottom' && device === 'desktop' ? 24 : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** 카드 폭 — 템플릿 4개가 같은 규칙을 쓴다(가운데 420 / 하단 480, 모바일은 전폭) */
export function popupCardWidth(
  placement: PopupPlacement,
  device: 'desktop' | 'mobile',
  contained: boolean,
): string {
  if (device === 'desktop') return placement === 'bottom' ? '480px' : '420px';
  if (placement === 'bottom') return '100%';
  return contained ? 'calc(100% - 32px)' : 'calc(100vw - 32px)';
}

/** 사진 최대 높이 — 미리보기 프레임 안에서는 뷰포트 단위를 쓰지 않는다 */
export function popupImageMaxHeight(contained: boolean): string {
  return contained ? '360px' : '70svh';
}

/** 사진 — 링크가 있으면 <a> 로 감싼다. 값이 없으면 회색 플레이스홀더(미리보기) */
export function PopupImage({
  image,
  alt,
  link,
  newTab,
  contained = false,
}: Pick<PopupTemplateProps, 'image' | 'alt' | 'link' | 'newTab' | 'contained'>) {
  const maxHeight = popupImageMaxHeight(contained);
  if (!image) {
    return (
      <div
        className="grid w-full place-items-center border-b border-surface-border bg-surface-soft text-xs text-content-faint"
        style={{ height: contained ? 180 : 220 }}
      >
        사진 없음
      </div>
    );
  }
  const img = (
    // next/image 는 업로드 도메인(remotePatterns) 설정에 묶여 있어 쓰지 않는다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={alt}
      className="block w-full object-contain"
      style={{ maxHeight }}
    />
  );
  if (!link) return img;
  return (
    <a
      href={link}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      className="block"
    >
      {img}
    </a>
  );
}

/** 우측 상단 X — closeControl 이 'none' 이면 그리지 않는다 */
export function PopupCloseX({
  closeControl,
  labels,
  onDismiss,
}: Pick<PopupTemplateProps, 'closeControl' | 'labels' | 'onDismiss'>) {
  if (closeControl === 'none') return null;
  const remember = closeControl === 'hideToday';
  const label = remember ? labels.hideToday : labels.close;
  return (
    <button
      type="button"
      onClick={() => onDismiss(remember)}
      aria-label={label}
      className="absolute right-0 top-0 grid h-9 w-9 place-items-center border-b border-l border-surface-border bg-surface text-content-faint hover:text-content"
    >
      <span aria-hidden="true" className="text-base leading-none">
        ✕
      </span>
    </button>
  );
}

/** A 계열의 이미지 아래 전폭 남색 버튼. link 가 없으면 아무것도 그리지 않는다 */
export function PopupActionButton({
  link,
  newTab,
  buttonLabel,
}: Pick<PopupTemplateProps, 'link' | 'newTab' | 'buttonLabel'>) {
  if (!link) return null;
  return (
    <a
      href={link}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      className="block rounded-[2px] bg-yonsei-navy px-4 py-3 text-center text-sm font-semibold text-white hover:bg-yonsei-blue"
    >
      {buttonLabel}
    </a>
  );
}

/** 하단 바 — "오늘 하루 보지 않기" 체크박스 + 닫기.
 *  hideTodayButton 이 꺼져 있어도 닫기 버튼은 남긴다(X 를 '표시안함' 으로 둔 경우
 *  닫을 방법이 아예 없어지면 안 된다). */
export function PopupFooterBar({
  hideTodayButton,
  labels,
  onDismiss,
}: Pick<PopupTemplateProps, 'hideTodayButton' | 'labels' | 'onDismiss'>) {
  const [hideToday, setHideToday] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-surface-border px-3 py-2">
      {hideTodayButton ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-content-faint">
          <input
            type="checkbox"
            checked={hideToday}
            onChange={(e) => setHideToday(e.target.checked)}
            className="h-3.5 w-3.5 accent-yonsei-blue"
          />
          {labels.hideToday}
        </label>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={() => onDismiss(hideToday)}
        className="rounded-[2px] px-2 py-1 text-xs font-semibold text-content hover:text-yonsei-blue"
      >
        {labels.close}
      </button>
    </div>
  );
}
