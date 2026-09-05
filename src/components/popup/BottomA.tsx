'use client';

// 하단 스타일 A — 이미지 + 버튼. 모바일은 화면 하단에 붙는 바텀시트, PC 는 하단
// 가운데 카드.
//
// ⚠️ 이 파일은 Claude Design 산출물로 **통째로 교체되는 자리**다. 지금 마크업은
// 자리를 잡아 두기 위한 단정한 플레이스홀더일 뿐이다. 교체할 때 지켜야 하는 것은
// props 계약(./types.ts) 하나뿐 — 바깥 배치(fixed/absolute·z-index)는 PopupGroup 이
// 이미 처리했으므로 여기서 위치를 잡지 않는다.

import { PopupActionButton, PopupCloseX, PopupFooterBar, PopupImage, popupCardWidth } from './parts';
import type { PopupTemplateProps } from './types';

export function BottomA(props: PopupTemplateProps) {
  const { alt, device, labels, contained = false } = props;
  const sheet = device === 'mobile';
  return (
    <div
      role="dialog"
      aria-label={`${alt} — ${labels.dialog}`}
      tabIndex={-1}
      className={`pointer-events-auto relative rounded-[2px] bg-surface ${
        sheet ? 'border-t border-surface-border' : 'border border-surface-border'
      }`}
      style={{ width: popupCardWidth('bottom', device, contained) }}
    >
      <PopupImage {...props} />
      <PopupCloseX {...props} />
      <div className="p-3">
        <PopupActionButton {...props} />
      </div>
      {/* 하단 바는 항상 그린다 — X 를 '표시안함' 으로 두면 닫을 길이 사라진다 */}
      <PopupFooterBar {...props} />
    </div>
  );
}
