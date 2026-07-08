'use client';

// 마크다운 "표 편집" 모드 — GFM 파이프 표를 스프레드시트형 그리드로 편집한다.
// (장학금 안내처럼 표 위주 문서를 셀 단위로 다루기 위한 기능.)
//
// 상태 설계: value 를 매 렌더 파싱하는 파생 방식은 커서 튐을 유발한다
// (serializeMarkdownBlocks 가 셀을 trim 하므로, 셀 끝 공백 입력 시 값이 되돌아옴).
// 따라서 blocks 를 내부 state 로 보관하고, 외부 변경(원문 탭 수정·재로드)일 때만
// 재초기화한다. 표시 값은 blocks 의 원시 문자열(트림 전)이라 타이핑이 강제 정리되지 않는다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useEffect, useRef, useState } from 'react';
import {
  emptyTableBlock,
  parseMarkdownBlocks,
  serializeMarkdownBlocks,
  type MarkdownBlock,
} from '@/lib/admin/markdown-blocks';

// RecordForm 의 fieldClass 계열 (셀 입력 테두리·포커스 스타일)
const cellClass =
  'w-full rounded-lg border border-surface-border bg-surface-soft px-2 py-1.5 text-sm text-content outline-none focus:border-yonsei-blue';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

// 텍스트 블록 textarea 행 수: 줄 수 + 1, 2~14 로 클램프
function textRows(markdown: string): number {
  return clamp(markdown.split('\n').length + 1, 2, 14);
}

// 셀 textarea 행 수: ceil(길이/40), 1~6 로 클램프
function cellRows(text: string): number {
  return clamp(Math.ceil(text.length / 40), 1, 6);
}

type TableBlock = Extract<MarkdownBlock, { type: 'table' }>;

export function MarkdownBlocksEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [blocks, setBlocks] = useState<MarkdownBlock[]>(() => parseMarkdownBlocks(value));
  // 마지막으로 우리가 방출한 직렬화 결과 — 외부 변경 감지용
  const lastEmitted = useRef<string>(value);

  // 외부에서 value 가 바뀐 경우(원문 탭 수정·재로드)에만 재초기화한다.
  // 우리가 방출한 값이면(value === lastEmitted) 무시해 커서 튐을 막는다.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setBlocks(parseMarkdownBlocks(value));
    }
  }, [value]);

  // 불변 갱신 → 직렬화 → 방출
  function commit(next: MarkdownBlock[]) {
    setBlocks(next);
    const out = serializeMarkdownBlocks(next);
    lastEmitted.current = out;
    onChange(out);
  }

  // 특정 인덱스의 블록을 교체
  function updateBlock(index: number, block: MarkdownBlock) {
    const next = blocks.slice();
    next[index] = block;
    commit(next);
  }

  // ---- 텍스트 블록 ----

  function setTextMarkdown(index: number, markdown: string) {
    updateBlock(index, { type: 'text', markdown });
  }

  // ---- 표 블록: 셀·헤더·정렬 ----

  function setCell(index: number, t: TableBlock, r: number, c: number, value2: string) {
    const rows = t.rows.map((row) => row.slice());
    rows[r][c] = value2;
    updateBlock(index, { ...t, rows });
  }

  function setHeader(index: number, t: TableBlock, c: number, value2: string) {
    const header = t.header.slice();
    header[c] = value2;
    updateBlock(index, { ...t, header });
  }

  // ---- 표 블록: 열 추가/삭제 ----

  function addColumn(index: number, t: TableBlock) {
    const header = [...t.header, '새 열'];
    const align = [...t.align, null];
    const rows = t.rows.map((row) => [...row, '']);
    updateBlock(index, { ...t, header, align, rows });
  }

  function deleteColumn(index: number, t: TableBlock, c: number) {
    if (t.header.length <= 1) return;
    if (!window.confirm(`"${t.header[c] || `${c + 1}열`}" 열을 삭제할까요?`)) return;
    const header = t.header.filter((_, i) => i !== c);
    const align = t.align.filter((_, i) => i !== c);
    const rows = t.rows.map((row) => row.filter((_, i) => i !== c));
    updateBlock(index, { ...t, header, align, rows });
  }

  // ---- 표 블록: 행 추가/삭제/이동 ----

  function emptyRow(t: TableBlock): string[] {
    return t.header.map(() => '');
  }

  function addRow(index: number, t: TableBlock) {
    updateBlock(index, { ...t, rows: [...t.rows, emptyRow(t)] });
  }

  function insertRowBelow(index: number, t: TableBlock, r: number) {
    const rows = t.rows.slice();
    rows.splice(r + 1, 0, emptyRow(t));
    updateBlock(index, { ...t, rows });
  }

  function deleteRow(index: number, t: TableBlock, r: number) {
    if (!window.confirm(`${r + 1}행을 삭제할까요?`)) return;
    const rows = t.rows.filter((_, i) => i !== r);
    updateBlock(index, { ...t, rows });
  }

  function moveRow(index: number, t: TableBlock, r: number, dir: -1 | 1) {
    const target = r + dir;
    if (target < 0 || target >= t.rows.length) return;
    const rows = t.rows.map((row) => row.slice());
    [rows[r], rows[target]] = [rows[target], rows[r]];
    updateBlock(index, { ...t, rows });
  }

  // ---- 표 삭제 ----

  function deleteTable(index: number) {
    if (!window.confirm('이 표를 삭제할까요?')) return;
    const next = blocks.filter((_, i) => i !== index);
    commit(next);
  }

  // ---- 문서 하단: 표 추가 ----

  function addTable() {
    const next = blocks.slice();
    // 앞 블록이 있으면 빈 줄 텍스트 블록을 먼저 넣어 표가 앞 내용과 붙지 않게 한다
    if (next.length > 0) next.push({ type: 'text', markdown: '' });
    next.push(emptyTableBlock());
    commit(next);
  }

  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        if (block.type === 'text') {
          // 공백뿐인 텍스트 블록은 렌더하지 않는다(직렬화 데이터에는 보존됨)
          if (block.markdown.trim() === '') return null;
          return (
            <fieldset
              key={index}
              className="rounded-lg border border-surface-border p-4"
            >
              <legend className="px-1 text-sm font-semibold text-content">본문</legend>
              <textarea
                aria-label="본문 블록"
                rows={textRows(block.markdown)}
                value={block.markdown}
                onChange={(e) => setTextMarkdown(index, e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 font-mono text-sm text-content outline-none focus:border-yonsei-blue"
              />
            </fieldset>
          );
        }

        // 표 블록
        const t = block;
        const singleColumn = t.header.length <= 1;
        return (
          <fieldset key={index} className="rounded-lg border border-surface-border p-4">
            <legend className="px-1 text-sm font-semibold text-content">표</legend>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-left">
                    {t.header.map((h, c) => (
                      <th key={c} className="min-w-[10rem] px-2 py-2 align-top">
                        <input
                          type="text"
                          aria-label={`${c + 1}열 헤더`}
                          value={h}
                          onChange={(e) => setHeader(index, t, c, e.target.value)}
                          className={`${cellClass} text-xs font-bold uppercase tracking-wide text-content-faint`}
                        />
                        <button
                          type="button"
                          onClick={() => deleteColumn(index, t, c)}
                          disabled={singleColumn}
                          aria-label={`${c + 1}열 삭제`}
                          className="btn-secondary mt-1 px-2 py-1 text-xs disabled:opacity-40"
                        >
                          열 삭제
                        </button>
                      </th>
                    ))}
                    <th className="px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => addColumn(index, t)}
                        className="btn-secondary px-2 py-1 text-xs"
                      >
                        ＋ 열
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row, r) => (
                    <tr key={r} className="border-b border-surface-border align-top">
                      {row.map((cell, c) => (
                        <td key={c} className="px-2 py-2">
                          <textarea
                            aria-label={`${t.header[c] || `${c + 1}열`} ${r + 1}행`}
                            rows={cellRows(cell)}
                            value={cell}
                            onChange={(e) => setCell(index, t, r, c, e.target.value)}
                            className={cellClass}
                          />
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveRow(index, t, r, -1)}
                            disabled={r === 0}
                            aria-label={`${r + 1}행 위로`}
                            className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(index, t, r, 1)}
                            disabled={r === t.rows.length - 1}
                            aria-label={`${r + 1}행 아래로`}
                            className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => insertRowBelow(index, t, r)}
                            aria-label={`${r + 1}행 아래에 행 삽입`}
                            className="btn-secondary px-2 py-1 text-xs"
                          >
                            ＋
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(index, t, r)}
                            aria-label={`${r + 1}행 삭제`}
                            className="btn-secondary px-2 py-1 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => addRow(index, t)}
                className="btn-secondary px-4 py-2 text-xs"
              >
                행 추가
              </button>
              <button
                type="button"
                onClick={() => deleteTable(index)}
                className="btn-secondary px-3 py-1.5 text-xs text-red-600 hover:border-red-400 hover:text-red-600"
              >
                표 삭제
              </button>
            </div>
          </fieldset>
        );
      })}

      <button type="button" onClick={addTable} className="btn-secondary px-4 py-2 text-sm">
        ＋ 표 추가
      </button>
    </div>
  );
}
