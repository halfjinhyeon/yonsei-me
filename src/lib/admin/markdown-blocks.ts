// 마크다운 ↔ 블록(본문/표) 왕복 변환 — 관리자 콘솔 "표 편집" 모드용.
//
// GFM 파이프 표(| a | b | + 구분선)를 구조화된 표 블록으로 파싱하고, 나머지
// 줄은 원문 그대로 텍스트 블록으로 보존한다. 직렬화 시 텍스트 블록은 바이트
// 그대로, 표는 정규화된 GFM 형식으로 다시 쓴다(렌더 결과는 동일).
//
// 왕복 보장: parse(serialize(parse(md))) 가 parse(md) 와 동일해야 한다.
// (사이트 렌더러 marked 는 gfm: true — 헤더 행 + 구분선 행이 있는 표만 표로 취급)

export type ColumnAlign = 'left' | 'center' | 'right' | null;

export type MarkdownBlock =
  | { type: 'text'; markdown: string }
  | { type: 'table'; header: string[]; align: ColumnAlign[]; rows: string[][] };

/** `| a | b |` 형태의 행인지 (셀 분리 가능 여부) */
function isPipeRow(line: string): boolean {
  const t = line.trim();
  // GFM 표 행은 파이프를 포함해야 한다. 이 프로젝트 데이터는 모두 |로 감싼 형식.
  return t.startsWith('|') && t.includes('|', 1);
}

/** 헤더 다음 줄이 GFM 구분선(`| --- | :-: |` 등)인지 */
function isDelimiterRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith('|')) return false;
  const cells = splitRow(t);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c.trim()));
}

/** 행을 셀 배열로 분리. `\|` 이스케이프는 셀 내용의 `|` 로 복원한다. */
function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);

  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (ch === '\\' && t[i + 1] === '|') {
      cur += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/** 구분선 셀에서 정렬 추출 (`:--` left, `:-:` center, `--:` right, `---` null) */
function parseAlign(cell: string): ColumnAlign {
  const t = cell.trim();
  const left = t.startsWith(':');
  const right = t.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

/** 마크다운을 텍스트/표 블록 시퀀스로 파싱 */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split('\n');
  const blocks: MarkdownBlock[] = [];
  let textBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ type: 'text', markdown: textBuf.join('\n') });
      textBuf = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    if (isPipeRow(line) && next !== undefined && isDelimiterRow(next)) {
      flushText();
      const header = splitRow(line);
      const align = splitRow(next).map(parseAlign);
      // 열 수는 헤더 기준으로 정규화 (GFM 동작과 동일)
      while (align.length < header.length) align.push(null);
      align.length = header.length;

      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isPipeRow(lines[i])) {
        const cells = splitRow(lines[i]);
        while (cells.length < header.length) cells.push('');
        cells.length = header.length;
        rows.push(cells);
        i += 1;
      }
      blocks.push({ type: 'table', header, align, rows });
    } else {
      textBuf.push(line);
      i += 1;
    }
  }
  flushText();
  return blocks;
}

/** 셀 내용의 `|` 를 `\|` 로 이스케이프하고, 개행은 공백으로 정리(GFM 셀은 한 줄) */
function escapeCell(cell: string): string {
  return cell.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function alignCell(align: ColumnAlign): string {
  switch (align) {
    case 'left':
      return ':---';
    case 'center':
      return ':---:';
    case 'right':
      return '---:';
    default:
      return '---';
  }
}

/** 블록 시퀀스를 마크다운으로 직렬화 (텍스트 블록은 원문 그대로) */
export function serializeMarkdownBlocks(blocks: MarkdownBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'text') {
      parts.push(b.markdown);
    } else {
      const lines: string[] = [];
      lines.push(`| ${b.header.map(escapeCell).join(' | ')} |`);
      lines.push(`| ${b.header.map((_, c) => alignCell(b.align[c] ?? null)).join(' | ')} |`);
      for (const row of b.rows) {
        lines.push(`| ${row.map(escapeCell).join(' | ')} |`);
      }
      parts.push(lines.join('\n'));
    }
  }
  return parts.join('\n');
}

/** 문서에 표 블록이 하나라도 있는지 (표 편집 모드 기본 진입 판단용) */
export function hasTableBlock(markdown: string): boolean {
  return parseMarkdownBlocks(markdown).some((b) => b.type === 'table');
}

/** 새 표 블록 기본형 (표 추가 버튼용) */
export function emptyTableBlock(): Extract<MarkdownBlock, { type: 'table' }> {
  return {
    type: 'table',
    header: ['항목', '내용'],
    align: [null, null],
    rows: [['', '']],
  };
}
