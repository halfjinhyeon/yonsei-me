'use client';

// 기본 스타일 B — 화면 가운데 카드, 이미지만(버튼 없음, 이미지 클릭이 곧 링크).
//
// ⚠️ 이 파일은 Claude Design 산출물로 **통째로 교체되는 자리**다. 지금 마크업은
// 자리를 잡아 두기 위한 단정한 플레이스홀더일 뿐이다. 교체할 때 지켜야 하는 것은
// props 계약(./types.ts) 하나뿐 — 바깥 배치(fixed/absolute·z-index)는 PopupGroup 이
// 이미 처리했으므로 여기서 위치를 잡지 않는다.

import { PopupCloseX, PopupFooterBar, PopupImage, popupCardWidth } from './parts';
import type { PopupTemplateProps } from './types';

export function BasicB(props: PopupTemplateProps) {
  const { alt, device, labels, contained = false } = props;
  return (
    <div
      role="dialog"
      aria-label={`${alt} — ${labels.dialog}`}
      tabIndex={-1}
      className="pointer-events-auto relative rounded-[2px] border border-surface-border bg-surface"
      style={{ width: popupCardWidth('center', device, contained) }}
    >
      <PopupImage {...props} />
      <PopupCloseX {...props} />
      <PopupFooterBar {...props} />
    </div>
  );
}
