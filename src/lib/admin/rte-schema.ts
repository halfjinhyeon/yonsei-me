// 에디터 스키마 확장 — 표·이미지에 "디자인 토큰 열거형" 속성을 붙인다.
//
// 자유 CSS(style) 가 아니라 data 속성 열거형인 이유: 값 집합이 CSS 한 곳
// (globals.css 의 .prose-content)에 갇히므로 관리자가 사이트 톤을 벗어난 표를
// 만들 수 없고, 정화 화이트리스트도 넓힐 필요가 없다(값은 escape 될 뿐 실행 경로가 없다).
// 셀 배경과 이미지 폭만은 값이 연속적이라 인라인 style 로 두되, 정화 쪽에서
// 색은 hex/rgb, 폭은 백분율만 통과시킨다(lib/admin/sanitize.ts).
//
// TableKit 대신 개별 확장 4종을 쓰는 이유는 단순하다 — .extend() 로 속성을 더하려면
// 노드 하나하나를 직접 잡아야 한다. 구성은 TableKit 이 하던 것과 동일하다.

import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rteTable: {
      /** 커서가 들어 있는 표의 테두리 속성(border/borderColor)을 바꾼다 */
      setTableAttrs: (attrs: {
        border?: TableBorder | null;
        borderColor?: TableBorderColor | null;
      }) => ReturnType;
      /** 커서가 들어 있는 표의 모든 열 폭(colwidth)을 지운다 — 자동 폭 복귀 */
      resetColumnWidths: () => ReturnType;
    };
    rteTableRow: {
      /** 커서가 들어 있는 표의 모든 행 높이를 "지금 가장 높은 행"에 맞춘다 */
      equalizeRowHeights: () => ReturnType;
      /** 커서가 들어 있는 표의 행 높이 지정을 모두 지운다 — 내용 높이 복귀 */
      resetRowHeights: () => ReturnType;
    };
  }
}

/** 행 최소 높이(px) — 이보다 낮추면 한 줄 글자가 셀 밖으로 밀린다.
 *  드래그 클램프(rte-row-resize.ts)와 커맨드가 같은 값을 쓴다. */
export const MIN_ROW_HEIGHT = 24;

/** 표 테두리 굵기 — null(미지정)이 사이트 기본 에디토리얼 톤 */
export const TABLE_BORDERS = ['none', 'thin', 'thick'] as const;
export type TableBorder = (typeof TABLE_BORDERS)[number];

/** 표 테두리 색 — 브랜드 토큰 이름(실제 색은 globals.css) */
export const TABLE_BORDER_COLORS = ['navy', 'blue', 'sky', 'red', 'gray'] as const;
export type TableBorderColor = (typeof TABLE_BORDER_COLORS)[number];

/** 열거형 밖의 값은 버린다 — 손으로 편집된 HTML 을 되읽어도 스키마가 오염되지 않게 */
function pickEnum(value: string | null, allowed: readonly string[]): string | null {
  return value && allowed.includes(value) ? value : null;
}

export const RteTable = Table.extend({
  // ⚠️ updateAttributes('table') 은 셀 안의 TextSelection 에서 조상 표 노드에
  // 닿지 않는다(3.27 실측 — 같은 선택에서 굵게 토글은 되는데 표 속성만 무반응).
  // 그래서 $from 의 조상 사슬을 직접 걸어 올라가 표를 찾는 커맨드를 둔다.
  addCommands() {
    return {
      ...this.parent?.(),
      setTableAttrs:
        (attrs) =>
        ({ tr, dispatch, view }) => {
          // state 가 아니라 tr 의 selection 을 읽는다 — 체인 중간(예: 삽입 직후)에도
          // 앞 커맨드가 만든 선택을 이어받아 한 트랜잭션(=undo 한 번)으로 묶인다.
          const { $from } = tr.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === this.name) {
              if (dispatch) {
                const pos = $from.before(depth);
                const merged = { ...node.attrs, ...attrs };
                tr.setNodeMarkup(pos, undefined, merged);
                // prosemirror-tables 의 TableView.update 는 속성 변경을 DOM 에
                // 반영하지 않는다(실측 — 문서 상태에는 들어가는데 라이브 미리보기만
                // 낡는다). 저장 HTML 은 renderHTML 경로라 옳으므로, 여기서 뷰의
                // <table> 만 손으로 맞춘다. 뷰가 재생성되면 renderHTML 과 동일해진다.
                const dom = view.nodeDOM(pos);
                const table =
                  dom instanceof HTMLElement
                    ? dom.matches('table')
                      ? dom
                      : dom.querySelector('table')
                    : null;
                if (table) {
                  const sync = (attr: string, value: unknown) => {
                    if (value) table.setAttribute(attr, String(value));
                    else table.removeAttribute(attr);
                  };
                  sync('data-border', merged.border);
                  sync('data-border-color', merged.borderColor);
                }
              }
              return true;
            }
          }
          return false;
        },
      resetColumnWidths:
        () =>
        ({ tr, dispatch }) => {
          const { $from } = tr.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const table = $from.node(depth);
            if (table.type.name === this.name) {
              if (dispatch) {
                const tablePos = $from.before(depth);
                // colwidth 는 셀 속성이라 폭 제거도 셀 단위다. setNodeMarkup 은
                // 문서 크기를 바꾸지 않으므로 순회 중 위치가 밀리지 않는다.
                table.descendants((cell, rel) => {
                  if (
                    (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') &&
                    cell.attrs.colwidth
                  ) {
                    tr.setNodeMarkup(tablePos + 1 + rel, undefined, {
                      ...cell.attrs,
                      colwidth: null,
                    });
                  }
                  return true;
                });
              }
              return true;
            }
          }
          return false;
        },
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      border: {
        default: null,
        parseHTML: (element: HTMLElement) => pickEnum(element.getAttribute('data-border'), TABLE_BORDERS),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.border ? { 'data-border': attributes.border } : {},
      },
      borderColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          pickEnum(element.getAttribute('data-border-color'), TABLE_BORDER_COLORS),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.borderColor ? { 'data-border-color': attributes.borderColor } : {},
      },
    };
  },
});

/** 커서가 든 표를 조상 사슬에서 찾아 [표 노드, 표 위치] 를 돌려준다(못 찾으면 null).
 *  표 속성 커맨드와 같은 이유로 updateAttributes 를 못 쓴다 — RteTable 상단 주석 참고. */
function findTable($from: ResolvedPos): [PMNode, number] | null {
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'table') return [node, $from.before(depth)];
  }
  return null;
}

/** 표의 각 행을 [행 노드, 행 위치] 로 훑는다. setNodeMarkup 은 문서 크기를 바꾸지
 *  않으므로 순회 중에 위치가 밀리지 않는다(열 폭 초기화와 같은 전제). */
function forEachRow(table: PMNode, tablePos: number, fn: (row: PMNode, rowPos: number) => void) {
  table.forEach((row, offset) => {
    if (row.type.name === 'tableRow') fn(row, tablePos + 1 + offset);
  });
}

export const RteTableRow = TableRow.extend({
  addCommands() {
    return {
      ...this.parent?.(),
      equalizeRowHeights:
        () =>
        ({ tr, dispatch, view }) => {
          const found = findTable(tr.selection.$from);
          if (!found) return false;
          if (dispatch) {
            const [table, tablePos] = found;
            // "지금 화면에 그려진" 높이를 잰다 — 내용이 가장 많은 행에 맞춰야 글자가
            // 잘리지 않는다(rowheight 는 최소 높이 시맨틱이라 더 늘어날 수는 있다).
            let max = 0;
            forEachRow(table, tablePos, (_row, rowPos) => {
              const dom = view.nodeDOM(rowPos);
              if (dom instanceof HTMLElement) max = Math.max(max, dom.getBoundingClientRect().height);
            });
            const height = Math.max(MIN_ROW_HEIGHT, Math.ceil(max));
            forEachRow(table, tablePos, (row, rowPos) => {
              if (row.attrs.rowheight === height) return;
              tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, rowheight: height });
            });
          }
          return true;
        },
      resetRowHeights:
        () =>
        ({ tr, dispatch }) => {
          const found = findTable(tr.selection.$from);
          if (!found) return false;
          if (dispatch) {
            const [table, tablePos] = found;
            forEachRow(table, tablePos, (row, rowPos) => {
              if (row.attrs.rowheight == null) return;
              tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, rowheight: null });
            });
          }
          return true;
        },
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      // 행 높이는 <tr style="height:Npx"> 로 직렬화한다 — 브라우저가 tr 의 height 를
      // "최소 높이"로 다루므로 게시 화면(.prose-content)에 추가 CSS 가 필요 없다.
      // 값이 연속적이라(드래그 결과) data 열거형이 아니라 인라인 style 이고,
      // 정화(sanitize.ts)가 tr 의 height 를 px 패턴으로만 통과시킨다.
      rowheight: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const m = /^(\d+)px$/.exec(element.style.height || '');
          return m ? Number(m[1]) : null;
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.rowheight ? { style: `height: ${attributes.rowheight}px` } : {},
      },
    };
  },
});

/** 셀 배경 — 속성명을 backgroundColor 로 두면 표 확장의 setCellAttribute 가 그대로 먹는다 */
const cellBackground = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
  },
};

export const RteTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellBackground };
  },
});

export const RteTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellBackground };
  },
});

/** 이미지 정렬 — 좌/중/우. margin 규칙은 globals.css 가 갖는다 */
export const IMAGE_ALIGNS = ['left', 'center', 'right'] as const;
export type ImageAlign = (typeof IMAGE_ALIGNS)[number];

export const RteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-align': {
        default: null,
        parseHTML: (element: HTMLElement) => pickEnum(element.getAttribute('data-align'), IMAGE_ALIGNS),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes['data-align'] ? { 'data-align': attributes['data-align'] } : {},
      },
      // 폭은 백분율만 — px 로 두면 모바일에서 본문을 뚫고 나간다(정화도 백분율만 통과)
      widthPct: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const m = /^(\d{1,3})%$/.exec(element.style.width || '');
          return m ? Number(m[1]) : null;
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.widthPct ? { style: `width: ${attributes.widthPct}%` } : {},
      },
    };
  },
});
