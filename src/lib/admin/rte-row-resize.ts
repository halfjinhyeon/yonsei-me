// 표 "행 높이" 드래그 리사이즈 — prosemirror-tables 의 열 드래그(columnResizing)를
// 행 방향으로 옮겨 놓은 판. 열은 라이브러리가 주지만 행은 주지 않아 직접 만든다.
//
// 설계 메모
// - 열 드래그는 colgroup(=TableView 노드뷰가 직접 만든, 문서에 없는 DOM)을 만지므로
//   미리보기가 공짜다. 행은 <tr> 자체가 문서 노드라 사정이 다르다 — 아래 두 문단 참고.
// - 판정은 데코레이션이 아니라 DOM 클래스 토글이다. 커서 모양 하나 바꾸자고
//   트랜잭션을 돌릴 이유가 없고, 열 드래그(.resize-cursor)도 같은 방식이다.
// - 모서리(셀 오른쪽 아래 귀퉁이)에서는 열 드래그에 양보한다. 두 판정이 겹치면
//   사용자가 어느 쪽이 잡힐지 예측할 수 없고, 열 쪽이 라이브러리 동작이라 우선이다.

import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { MIN_ROW_HEIGHT } from './rte-schema';

/** 행 경계 판정 폭(px) — tr 아래 모서리에서 이 안이면 리사이즈 후보 */
const ROW_EDGE = 4;
/** 셀 오른쪽 경계 양보 폭(px) — 열 리사이즈 활성 범위(±5)보다 살짝 넓게 잡는다 */
const COL_EDGE = 6;
/** ProseMirror 루트에 붙였다 떼는 커서 클래스 (실제 cursor 값은 globals.css) */
const CURSOR_CLASS = 'row-resize-cursor';

/**
 * 드래그 중 PM 의 DOM 감시자를 잠시 끈다.
 *
 * ⚠️ 이걸 안 하면 미리보기용 `tr.style.height` 변경을 PM 이 "문서가 밖에서 바뀌었다"로
 * 읽는다(DOMObserver 는 attributes 도 관찰하고, 우리 스키마의 parseHTML 이 그 style 을
 * rowheight 로 되읽기 때문에 실제로 "다른 노드"로 파싱된다). 결과는 mousemove 마다
 * 행 교체 트랜잭션 — 실행 취소 스택이 드래그 한 번에 수십 단계로 오염된다.
 * domObserver 는 공개 타입에는 없지만 노드뷰들이 관행적으로 쓰는 통로다(없으면 조용히 포기).
 */
function domObserver(view: EditorView): { stop(): void; start(): void } | null {
  const obs = (view as unknown as { domObserver?: { stop?: unknown; start?: unknown } }).domObserver;
  return obs && typeof obs.stop === 'function' && typeof obs.start === 'function'
    ? (obs as { stop(): void; start(): void })
    : null;
}

interface DragSession {
  view: EditorView;
  row: HTMLElement;
  /** 드래그 시작 시점의 커서 Y — 이동량의 기준 */
  startY: number;
  /** 드래그 시작 시점의 행 높이(레이아웃 px) */
  startHeight: number;
  /** 현재 미리보기 높이(레이아웃 px) — mouseup 에서 이 값이 문서로 들어간다 */
  height: number;
  /** 조상에 걸린 CSS zoom 배율 — 편집 캔버스(PostCanvas)가 폼이 좁을 때 1 미만으로 준다.
   *  마우스 좌표는 화면 px, 높이 값(style.height·rowheight)은 레이아웃 px 이라 서로 단위가
   *  다르다. 보정 없이 빼면 zoom 0.8 에서 커서보다 25% 더 늘어난다. */
  zoom: number;
  /** 실제로 움직였는가 — 경계 클릭만으로 높이가 박제되지 않게 */
  moved: boolean;
}

/** 커서가 든 <tr> 의 문서 위치를 찾아 rowheight 를 확정한다(드래그 1회 = 실행 취소 1회) */
function commitRowHeight(view: EditorView, rowEl: HTMLElement, height: number) {
  if (!rowEl.isConnected) return;
  let pos: number;
  try {
    // tr DOM 의 "안쪽 0번째" 위치 → 그 지점을 resolve 하면 조상 사슬에 tableRow 가 있다
    pos = view.posAtDOM(rowEl, 0);
  } catch {
    return; // 드래그 도중 표가 지워진 경우
  }
  if (pos < 0) return;
  const $pos = view.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name !== 'tableRow') continue;
    if (node.attrs.rowheight === height) return; // 값이 같으면 빈 트랜잭션을 만들지 않는다
    view.dispatch(
      view.state.tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, rowheight: height }),
    );
    return;
  }
}

/** 행 리사이즈 ProseMirror 플러그인 — 에디터(뷰)마다 하나씩 만들어진다(상태는 클로저) */
export function rowResizingPlugin(): Plugin {
  /** 지금 커서가 걸려 있는 행 — mousedown 이 이 값을 보고 드래그를 시작한다 */
  let hoverRow: HTMLElement | null = null;
  let drag: DragSession | null = null;

  const setHover = (view: EditorView, row: HTMLElement | null) => {
    hoverRow = row;
    view.dom.classList.toggle(CURSOR_CLASS, row !== null);
  };

  const onWindowMove = (event: MouseEvent) => {
    if (!drag) return;
    if (event.clientY === drag.startY && !drag.moved) return;
    drag.moved = true;
    // 커서 이동량(화면 px)을 zoom 으로 나눠 레이아웃 px 로 되돌린 뒤 더한다
    const next = Math.max(
      MIN_ROW_HEIGHT,
      Math.round(drag.startHeight + (event.clientY - drag.startY) / drag.zoom),
    );
    if (next === drag.height) return;
    drag.height = next;
    // 라이브 미리보기 — 문서가 아니라 DOM 만 만진다(감시자는 꺼 둔 상태)
    drag.row.style.height = `${next}px`;
  };

  const onWindowUp = () => {
    const session = drag;
    drag = null;
    window.removeEventListener('mousemove', onWindowMove);
    window.removeEventListener('mouseup', onWindowUp);
    if (!session) return;
    // 커밋 먼저, 감시자 복구는 그 뒤 — PM 이 자기 손으로 쓴 DOM 을 되읽지 않게 한다
    if (session.moved) commitRowHeight(session.view, session.row, session.height);
    domObserver(session.view)?.start();
  };

  return new Plugin({
    props: {
      handleDOMEvents: {
        mousemove: (view, event) => {
          if (drag) return false; // 드래그 중 판정은 window 리스너가 맡는다
          const target = event.target;
          const cell = target instanceof Element ? target.closest('td, th') : null;
          if (!(cell instanceof HTMLElement) || !view.dom.contains(cell)) {
            if (hoverRow) setHover(view, null);
            return false;
          }
          // 모서리 충돌 회피 — 셀 오른쪽 경계는 열 리사이즈의 자리다
          if (Math.abs(cell.getBoundingClientRect().right - event.clientX) <= COL_EDGE) {
            if (hoverRow) setHover(view, null);
            return false;
          }
          const row = cell.closest('tr');
          const near =
            row instanceof HTMLElement &&
            Math.abs(row.getBoundingClientRect().bottom - event.clientY) <= ROW_EDGE;
          const next = near ? (row as HTMLElement) : null;
          if (next !== hoverRow) setHover(view, next);
          return false;
        },
        mouseleave: (view) => {
          if (!drag && hoverRow) setHover(view, null);
          return false;
        },
        mousedown: (view, event) => {
          if (drag || event.button !== 0 || !hoverRow) return false;
          event.preventDefault(); // 텍스트 선택(드래그 셀렉션) 시작 차단
          // 높이는 offsetHeight(레이아웃 px)로 잰다 — rowheight 로 저장될 값이 레이아웃 값이고,
          // zoom 아래에서 rect 는 화면 px 라 저장하는 순간 표가 줄어든다.
          const startHeight = hoverRow.offsetHeight;
          drag = {
            view,
            row: hoverRow,
            startY: event.clientY,
            startHeight,
            height: startHeight,
            // rect(화면) ÷ offset(레이아웃) = 조상 누적 zoom. 0 나눗셈·미측정은 1 로 폴백.
            zoom: hoverRow.getBoundingClientRect().height / startHeight || 1,
            moved: false,
          };
          domObserver(view)?.stop();
          window.addEventListener('mousemove', onWindowMove);
          window.addEventListener('mouseup', onWindowUp);
          return true;
        },
      },
    },
    view: (view) => ({
      destroy: () => {
        // 에디터가 사라져도 window 리스너가 남으면 끊긴 뷰에 dispatch 하게 된다
        window.removeEventListener('mousemove', onWindowMove);
        window.removeEventListener('mouseup', onWindowUp);
        if (drag) domObserver(drag.view)?.start();
        drag = null;
        hoverRow = null;
        view.dom.classList.remove(CURSOR_CLASS);
      },
    }),
  });
}

/** 에디터 등록용 껍데기 — extensions 배열에 이걸 넣는다 */
export const RteRowResize = Extension.create({
  name: 'rowResizing',
  addProseMirrorPlugins() {
    return [rowResizingPlugin()];
  },
});
