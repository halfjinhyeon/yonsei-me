// CMS 에디터 "찾기/바꾸기" — 데코레이션 기반 하이라이트 플러그인.
//
// 설계 메모
// - 문서를 건드리지 않는다. 찾기는 순수하게 "보여주기"라, 매치는 Decoration.inline 으로만
//   칠하고 문서·선택(selection)은 그대로 둔다. 다음/이전이 선택을 옮기면 관리자가 고쳐 쓰던
//   커서를 잃는다 — 그래서 이동은 activeIndex 변경 + scrollIntoView 뿐이다.
// - 상태는 플러그인 상태 하나(query/matches/activeIndex/decorations). 리액트 state 로 들고 있으면
//   문서가 바뀔 때마다 두 곳을 손으로 맞춰야 하고, 데코레이션은 어차피 PM 상태에서만 읽힌다.
// - 검색은 리터럴이다. 사용자 입력을 정규식 메타문자까지 이스케이프해 넣는다(대소문자 무시).
// - 매치 위치는 "텍스트블록 단위"로 찾는다. textBetween 의 leafText 를 1글자(U+FFFC)로 주면
//   이미지·줄바꿈 같은 인라인 리프가 nodeSize 1 그대로 1글자를 차지해, 블록 안 텍스트 오프셋이
//   문서 위치와 1:1로 맞는다(from = 블록pos + 1 + 오프셋). 블록 경계를 넘는 검색어는 찾지 않는다.

import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** 인라인 리프(이미지·hardBreak…)의 자리표시 1글자 — 오프셋 1:1 유지가 목적 */
const LEAF_PLACEHOLDER = '￼';

/** 하이라이트 클래스 — 실제 색은 globals.css(.rte .rte-area) 가 갖는다 */
const HIT_CLASS = 'search-hit';
const ACTIVE_CLASS = 'search-hit-active';

export interface SearchMatch {
  from: number;
  to: number;
}

export interface RteSearchState {
  /** 현재 검색어(빈 문자열이면 검색 꺼짐) */
  query: string;
  /** 문서 순서대로의 전체 매치 */
  matches: SearchMatch[];
  /** 활성 매치 인덱스 — 매치가 없으면 -1 */
  activeIndex: number;
  /** matches/activeIndex 에서 파생 — props.decorations 가 그대로 돌려준다 */
  decorations: DecorationSet;
}

/** 트랜잭션 meta 로 주고받는 명령 */
type SearchMeta = { type: 'query'; query: string } | { type: 'step'; delta: 1 | -1 };

export const rteSearchKey = new PluginKey<RteSearchState>('rteSearch');

const EMPTY_STATE: RteSearchState = {
  query: '',
  matches: [],
  activeIndex: -1,
  decorations: DecorationSet.empty,
};

/** 사용자 입력을 리터럴로 쓰기 위한 정규식 이스케이프 */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 문서 전체에서 매치를 찾는다(대소문자 무시, 문서 순서) */
function findMatches(doc: PMNode, query: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  if (!query) return matches;
  const re = new RegExp(escapeRegExp(query), 'gi');
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, undefined, LEAF_PLACEHOLDER);
    re.lastIndex = 0;
    let m = re.exec(text);
    while (m !== null) {
      const from = pos + 1 + m.index;
      matches.push({ from, to: from + m[0].length });
      m = re.exec(text);
    }
    // 인라인(텍스트 노드)까지 내려가면 같은 글자를 두 번 세게 된다
    return false;
  });
  return matches;
}

function buildDecorations(doc: PMNode, matches: SearchMatch[], activeIndex: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      // 한 매치 = 한 데코레이션. 활성만 클래스를 더 붙인다(겹친 데코레이션 두 장을 만들지 않는다)
      Decoration.inline(m.from, m.to, {
        class: i === activeIndex ? `${HIT_CLASS} ${ACTIVE_CLASS}` : HIT_CLASS,
      }),
    ),
  );
}

function nextState(doc: PMNode, query: string, matches: SearchMatch[], activeIndex: number): RteSearchState {
  return { query, matches, activeIndex, decorations: buildDecorations(doc, matches, activeIndex) };
}

function searchPlugin(): Plugin<RteSearchState> {
  return new Plugin<RteSearchState>({
    key: rteSearchKey,
    state: {
      init: () => EMPTY_STATE,
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(rteSearchKey) as SearchMeta | undefined;

        if (meta?.type === 'query') {
          const matches = findMatches(newState.doc, meta.query);
          return nextState(newState.doc, meta.query, matches, matches.length ? 0 : -1);
        }

        if (meta?.type === 'step') {
          const n = prev.matches.length;
          if (n === 0) return prev;
          // 아직 활성 매치가 없으면(-1) 방향에 따라 처음/마지막부터 — 나머지는 순환
          const activeIndex =
            prev.activeIndex < 0
              ? meta.delta > 0
                ? 0
                : n - 1
              : (prev.activeIndex + meta.delta + n) % n;
          return nextState(newState.doc, prev.query, prev.matches, activeIndex);
        }

        // 문서가 안 바뀌었으면 위치도 그대로 — 매 트랜잭션(커서 이동 등)마다 다시 훑지 않는다.
        // 검색이 꺼져 있으면 타자 한 번마다 문서를 훑지도, 새 상태 객체를 만들지도 않는다.
        if (!tr.docChanged || !prev.query) return prev;

        const matches = findMatches(newState.doc, prev.query);
        // 편집·치환으로 매치 수가 줄면 인덱스를 끌어당긴다(치환 후 자연스럽게 "다음"을 가리킨다)
        const activeIndex =
          matches.length === 0 ? -1 : Math.min(Math.max(prev.activeIndex, 0), matches.length - 1);
        return nextState(newState.doc, prev.query, matches, activeIndex);
      },
    },
    props: {
      decorations: (state) => rteSearchKey.getState(state)?.decorations ?? DecorationSet.empty,
    },
  });
}

/** 에디터 등록용 껍데기 — extensions 배열에 이걸 넣는다 */
export const RteSearch = Extension.create({
  name: 'rteSearch',
  addProseMirrorPlugins() {
    return [searchPlugin()];
  },
});

/* ── 툴바(리액트)에서 커맨드처럼 쓰는 헬퍼 ── */

/** 현재 검색 상태 — 플러그인이 아직 없으면 빈 상태 */
export function getSearchState(editor: Editor): RteSearchState {
  return rteSearchKey.getState(editor.state) ?? EMPTY_STATE;
}

/**
 * 활성 매치를 화면 안으로 — 선택(selection)은 건드리지 않는다.
 * dispatch 는 동기로 DOM 까지 갱신하므로, 호출 시점엔 활성 데코레이션 span 이 이미 붙어 있다.
 */
function scrollToActive(view: EditorView): void {
  const state = rteSearchKey.getState(view.state);
  const match = state && state.activeIndex >= 0 ? state.matches[state.activeIndex] : undefined;
  if (!match) return;
  let dom: Node;
  try {
    const at = view.domAtPos(match.from);
    // 요소를 돌려주면 offset 은 자식 인덱스다 — 그 자식이 실제 글자를 담은 노드
    dom = at.node instanceof Element ? (at.node.childNodes.item(at.offset) ?? at.node) : at.node;
  } catch {
    return; // 위치가 이미 사라진 경우(치환 직후 등)
  }
  const el = dom instanceof Element ? dom : dom.parentElement;
  // 텍스트 노드의 부모가 곧 활성 하이라이트 span 이다 — 없으면 가장 가까운 요소로 대신한다
  const target = el?.closest(`.${ACTIVE_CLASS}`) ?? el;
  target?.scrollIntoView({ block: 'center' });
}

/** 트랜잭션은 meta 만 실어 보낸다(문서 변경 0 → 실행 취소 스택에 남지 않는다) */
function dispatchMeta(editor: Editor, meta: SearchMeta): void {
  const { view } = editor;
  view.dispatch(view.state.tr.setMeta(rteSearchKey, meta).setMeta('addToHistory', false));
}

/** 검색어 설정 — 매치를 다시 찾고 첫 매치를 활성으로 */
export function setSearchQuery(editor: Editor, query: string): void {
  dispatchMeta(editor, { type: 'query', query });
  scrollToActive(editor.view);
}

/** 검색 종료 — 하이라이트 제거(이미 비어 있으면 빈 트랜잭션을 만들지 않는다) */
export function clearSearch(editor: Editor): void {
  const state = getSearchState(editor);
  if (!state.query && state.matches.length === 0) return;
  setSearchQuery(editor, '');
}

function step(editor: Editor, delta: 1 | -1): void {
  if (getSearchState(editor).matches.length === 0) return;
  dispatchMeta(editor, { type: 'step', delta });
  scrollToActive(editor.view);
}

export function findNext(editor: Editor): void {
  step(editor, 1);
}

export function findPrev(editor: Editor): void {
  step(editor, -1);
}

/**
 * 활성 매치 한 개를 바꾼다.
 *
 * 문자열을 HTML 로 파싱하는 insertContent 계열 대신 `tr.insertText` 를 쓴다 — 찾기/바꾸기의
 * 바꿀 문자열은 리터럴 텍스트다(`a < b` 같은 입력이 태그로 먹히면 안 된다). 덤으로
 * insertText 는 구간 전체에 걸친 마크(굵게·색)를 물려받아 서식이 유지되고,
 * '모두 바꾸기'와 동작이 같아진다.
 */
export function replaceActive(editor: Editor, replacement: string): boolean {
  const { view } = editor;
  const state = getSearchState(editor);
  const match = state.activeIndex >= 0 ? state.matches[state.activeIndex] : undefined;
  if (!match) return false;
  // storedMarks(커서에 걸어 둔 "다음에 칠 서식")를 끊는다 — 안 그러면 첫 치환에만 그 마크가
  // 묻어 나머지와 서식이 달라진다. 치환문은 원래 글자의 마크를 물려받는 게 맞다.
  const tr = view.state.tr.setStoredMarks(null);
  if (replacement) tr.insertText(replacement, match.from, match.to);
  else tr.delete(match.from, match.to);
  view.dispatch(tr);
  // 문서가 바뀌면 apply 가 매치를 다시 찾고 인덱스를 끌어당긴다 → 같은 인덱스가 곧 "다음 매치"
  scrollToActive(view);
  return true;
}

/**
 * 모든 매치를 한 트랜잭션으로 바꾼다 — 실행 취소 한 번에 통째로 되돌아간다.
 *
 * ⚠ 반드시 뒤에서 앞으로 순회한다. 매치 위치는 "치환 전" 문서 기준인데, 위치 p 를 고치면
 * p 이후의 위치만 밀린다. 뒤부터 고치면 아직 처리하지 않은(더 앞쪽) 매치는 한 번도 밀리지 않아
 * 위치 매핑(tr.mapping) 없이도 정확하다. 앞에서부터 가면 길이가 다른 치환마다 뒤가 어긋난다.
 */
export function replaceAll(editor: Editor, replacement: string): number {
  const { view } = editor;
  const { matches } = getSearchState(editor);
  if (matches.length === 0) return 0;
  const tr = view.state.tr.setStoredMarks(null); // replaceActive 와 같은 이유
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const m = matches[i];
    if (replacement) tr.insertText(replacement, m.from, m.to);
    else tr.delete(m.from, m.to);
  }
  view.dispatch(tr);
  return matches.length;
}
