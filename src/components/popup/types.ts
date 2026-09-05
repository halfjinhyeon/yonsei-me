// 팝업 템플릿 컴포넌트의 **props 계약**. 이 파일이 사이트(PopupNotice)·관리자
// 미리보기(PopupStylePicker)와 4개 템플릿 파일 사이의 유일한 접점이다.
//
// ⚠️ 템플릿 파일(BottomA/BottomB/BasicA/BasicB)의 마크업은 Claude Design 산출물로
// 통째로 교체될 예정이다. 그때 지켜야 할 것은 이 인터페이스뿐 — 여기 없는 값을
// 템플릿이 직접 읽어 오거나, 템플릿이 자기 바깥의 배치(fixed 위치·z-index)를
// 손대지 않는다. 배치는 parts.tsx 의 PopupGroup 이 맡는다.

export interface PopupTemplateLabels {
  /** 닫기 (aria-label·버튼 문구) */
  close: string;
  /** 오늘 하루 보지 않기 */
  hideToday: string;
  /** 스크린리더가 읽는 창 종류 ('공지 팝업') — 템플릿 루트의 aria-label 에 제목과
   *  함께 들어간다. role="dialog"·tabIndex=-1 은 각 템플릿의 루트가 직접 단다. */
  dialog: string;
}

export interface PopupTemplateProps {
  /** 사진 URL. 빈 문자열이면 템플릿이 회색 플레이스홀더를 그린다(관리자 미리보기) */
  image: string;
  /** 사진 대체 텍스트 = 항목 제목(로케일 해석은 호출측이 끝낸 값) */
  alt: string;
  /** 사진·버튼을 눌렀을 때 갈 곳. 없으면 A 계열도 버튼을 그리지 않는다 */
  link?: string;
  newTab: boolean;
  /** A 계열 버튼 문구(로케일 해석 완료) */
  buttonLabel: string;
  /** 어느 기기용으로 그리는가 — 폭·여백이 갈린다 */
  device: 'desktop' | 'mobile';
  labels: PopupTemplateLabels;
  /** 우측 상단 X 의 동작. 'none' 이면 X 를 그리지 않는다 */
  closeControl: 'close' | 'hideToday' | 'none';
  /** 하단 "오늘 하루 보지 않기" 체크박스 + 닫기 바를 그리는가 */
  hideTodayButton: boolean;
  /** 닫기. remember=true 면 오늘 하루 숨김을 기억한다 */
  onDismiss: (remember: boolean) => void;
  /**
   * 관리자 미리보기처럼 **작은 프레임 안**에 그려지는가.
   * true 면 뷰포트 단위(100vw·70svh)를 쓰지 않고 프레임(부모) 기준 단위를 쓴다 —
   * 프레임 안에서 화면 전체 크기로 부풀지 않게 하기 위해서다.
   * 바깥 배치(fixed ↔ absolute)는 PopupGroup 이 같은 값으로 따로 처리한다.
   */
  contained?: boolean;
}
