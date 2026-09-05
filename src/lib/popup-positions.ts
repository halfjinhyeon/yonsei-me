// 팝업 공지 **위치** 목록 — PC·모바일이 각각 고르는 값의 단일 출처.
//
// 사이트(PopupNotice·popup/*)와 관리자 콘솔(PopupPositionPicker·resources.ts)이 모두
// 여기서 읽는다. 순수 모듈이라 서버·클라이언트 어디서든 import 할 수 있다.
//
// 형식(카드 생김새)은 기기마다 **하나로 고정**이다 — 관리자가 고르는 것은 "화면 어디에
// 뜨는가" 뿐이다(예전에는 템플릿 4종을 골랐다). 아임웹처럼 "모바일용 팝업을 따로 하나 더
// 등록" 하지 않아도 되게, 한 항목이 positionDesktop / positionMobile 두 값을 갖고
// 기기 판정은 브라우저가 한다.

export type PopupDevice = 'desktop' | 'mobile';

/** PC 위치 — content/popups.json 의 positionDesktop 값 */
export type PopupDesktopPosition = 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
/** 모바일 위치 — content/popups.json 의 positionMobile 값 */
export type PopupMobilePosition = 'bottom' | 'center' | 'top';

export type PopupPositionKey = PopupDesktopPosition | PopupMobilePosition;

export interface PopupPositionDef {
  key: PopupPositionKey;
  /** 관리자에게 보이는 이름 */
  label: string;
}

export const POPUP_POSITIONS: Record<PopupDevice, readonly PopupPositionDef[]> = {
  desktop: [
    { key: 'center', label: '가운데' },
    { key: 'topLeft', label: '좌측 상단' },
    { key: 'topRight', label: '우측 상단' },
    { key: 'bottomLeft', label: '좌측 하단' },
    { key: 'bottomRight', label: '우측 하단' },
  ],
  mobile: [
    { key: 'bottom', label: '하단' },
    { key: 'center', label: '가운데' },
    { key: 'top', label: '상단' },
  ],
};

/** 기기별 기본 위치 — PC 는 화면 정중앙, 모바일은 손가락이 닿는 하단 시트 */
export const DEFAULT_POSITION: { desktop: PopupDesktopPosition; mobile: PopupMobilePosition } = {
  desktop: 'center',
  mobile: 'bottom',
};

/** 그 기기에서 쓸 수 있는 위치 키인가 — 옛 데이터·오타 판정 */
export function isPopupPosition(device: PopupDevice, v: unknown): boolean {
  return POPUP_POSITIONS[device].some((p) => p.key === v);
}

/** 알 수 없는 값(옛 데이터·오타)은 기본 위치로 떨어뜨린다 — 팝업이 통째로 사라지는
 *  것보다 낫다. */
export function popupPosition(
  device: PopupDevice,
  key: string | undefined | null,
): PopupPositionDef {
  const list = POPUP_POSITIONS[device];
  return list.find((p) => p.key === key) ?? list.find((p) => p.key === DEFAULT_POSITION[device])!;
}
