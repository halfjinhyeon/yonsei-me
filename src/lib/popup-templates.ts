// 팝업 공지 템플릿 목록 — PC·모바일이 **각각** 고르는 스타일의 단일 출처.
//
// 사이트(PopupNotice·popup/*)와 관리자 콘솔(PopupStylePicker·resources.ts)이 모두
// 여기서 읽는다. 순수 모듈이라 서버·클라이언트 어디서든 import 할 수 있다.
//
// 아임웹처럼 "모바일용 팝업을 따로 하나 더 등록" 하지 않아도 되게 하는 것이 요지다 —
// 한 항목이 styleDesktop / styleMobile 두 값을 가지며, 기기 판정은 브라우저가 한다.

/** 템플릿 키 — content/popups.json 의 styleDesktop·styleMobile 값 */
export type PopupTemplateKey = 'bottomA' | 'bottomB' | 'basicA' | 'basicB';

/** 화면 어디에 붙는가 — 여러 개가 동시에 뜰 때의 묶음 배치를 정한다 */
export type PopupPlacement = 'bottom' | 'center';

export interface PopupTemplateDef {
  key: PopupTemplateKey;
  /** 관리자에게 보이는 이름 */
  label: string;
  /** 무엇으로 이루어졌는지 한 줄 */
  summary: string;
  /** 이미지 아래 버튼(A 계열)을 그리는가 */
  hasButton: boolean;
  placement: PopupPlacement;
}

export const POPUP_TEMPLATES: readonly PopupTemplateDef[] = [
  {
    key: 'bottomA',
    label: '하단 스타일 A',
    summary: '이미지 + 버튼',
    hasButton: true,
    placement: 'bottom',
  },
  {
    key: 'bottomB',
    label: '하단 스타일 B',
    summary: '이미지만',
    hasButton: false,
    placement: 'bottom',
  },
  {
    key: 'basicA',
    label: '기본 스타일 A',
    summary: '이미지 + 버튼',
    hasButton: true,
    placement: 'center',
  },
  {
    key: 'basicB',
    label: '기본 스타일 B',
    summary: '이미지만',
    hasButton: false,
    placement: 'center',
  },
] as const;

/** PC 기본값 — 화면이 넓어 가운데 카드가 자연스럽다 */
export const DEFAULT_DESKTOP_TEMPLATE: PopupTemplateKey = 'basicB';
/** 모바일 기본값 — 손가락이 닿는 하단 시트가 실사용에서 가장 무난하다 */
export const DEFAULT_MOBILE_TEMPLATE: PopupTemplateKey = 'bottomB';

/** 알 수 없는 값(옛 데이터·오타)은 기본 템플릿으로 떨어뜨린다 — 팝업이 통째로
 *  사라지는 것보다 낫다. 기기를 모르면 PC 기본값을 쓴다. */
export function popupTemplate(
  key: string | undefined | null,
  device: 'desktop' | 'mobile' = 'desktop',
): PopupTemplateDef {
  const found = POPUP_TEMPLATES.find((t) => t.key === key);
  if (found) return found;
  const fallback = device === 'mobile' ? DEFAULT_MOBILE_TEMPLATE : DEFAULT_DESKTOP_TEMPLATE;
  return POPUP_TEMPLATES.find((t) => t.key === fallback)!;
}

/** 목록 셀·요약줄에 쓰는 짧은 이름 ('기본 B') */
export function popupTemplateShortLabel(key: string | undefined | null): string {
  const t = POPUP_TEMPLATES.find((x) => x.key === key);
  if (!t) return '';
  return t.placement === 'bottom' ? `하단 ${t.key.endsWith('A') ? 'A' : 'B'}` : `기본 ${t.key.endsWith('A') ? 'A' : 'B'}`;
}
