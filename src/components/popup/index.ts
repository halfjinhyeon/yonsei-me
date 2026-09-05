// 템플릿 키 → 컴포넌트. 사이트(PopupNotice)와 관리자 미리보기(PopupStylePicker)가
// 같은 매핑을 쓴다 — 미리보기가 "학생이 보는 그 컴포넌트" 를 그대로 그리기 위해서.

import type { PopupTemplateKey } from '@/lib/popup-templates';
import { popupTemplate } from '@/lib/popup-templates';
import { BasicA } from './BasicA';
import { BasicB } from './BasicB';
import { BottomA } from './BottomA';
import { BottomB } from './BottomB';
import type { PopupTemplateProps } from './types';

const MAP: Record<PopupTemplateKey, (p: PopupTemplateProps) => JSX.Element> = {
  bottomA: BottomA,
  bottomB: BottomB,
  basicA: BasicA,
  basicB: BasicB,
};

/** 알 수 없는 키는 popupTemplate 의 기본값으로 떨어진다(팝업이 사라지지 않게) */
export function templateComponent(
  key: string | undefined | null,
  device: 'desktop' | 'mobile' = 'desktop',
): (p: PopupTemplateProps) => JSX.Element {
  return MAP[popupTemplate(key, device).key];
}

export { BasicA, BasicB, BottomA, BottomB };
export { PopupGroup } from './parts';
export type { PopupTemplateProps } from './types';
