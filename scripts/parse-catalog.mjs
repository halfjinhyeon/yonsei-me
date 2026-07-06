import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// tools/course-list.csv (완성본) — 컬럼 순서: 교과목명, 학정번호, 학점
const raw = readFileSync('tools/course-list.csv', 'utf-8').replace(/^﻿/, '');

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** 학정번호(예: LEA3101)에서 단위 추출 — 알파벳 뒤 첫 숫자 × 1000. XXX#### 형식. */
const levelFromCode = (code) => {
  const m = code.match(/[A-Za-z]+(\d)/);
  return m ? Number(m[1]) * 1000 : undefined;
};

const normalizeName = (s) =>
  s.toLowerCase().replace(/[\s​·ㆍ・]/g, '').replace(/[()[\]{}]/g, '').replace(/[Ⅰ]/g, '1').replace(/[Ⅱ]/g, '2');

/** 이수구분 마커 정리: P/NP·필수/선택 등 꼬리표 제거 (숫자 괄호 "(1)"은 과목번호라 보존).
 *  예: "리더십워크숍(필수)ⓟ" → "리더십워크숍", "UT세미나ⓟ" → "UT세미나" */
function cleanName(raw) {
  return raw
    .trim()
    .replace(/[ⓟⓐⓝ＊*]/g, '')
    .replace(/\((?:필수|선택|교직|재수강|계절|영어|H)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const rows = parseCSV(raw).filter((r) => r.length >= 3 && r[0]);
rows.shift(); // header

// 별도 처리(채플 카운터·사회참여 SE, YONSEI RC101은 curated에 존재)되는 예약 과목명은
// 타과 카탈로그에서 제외 — 그대로 두면 시간표의 "채플"/"사회참여"가 이중 집계된다.
// (YONSEI RC101은 id가 curated와 같아 병합 시 자동 dedup되므로 별도 제외 불필요)
const EXCLUDE = new Set(['채플', '사회참여', 'rc자기주도활동']);

// 정규화 이름 기준 dedup — 같은 이름이 여러 학과에 있으면 OCR 토큰 1개가 여러 과목에
// 매칭돼 학점이 중복 집계되므로, 이름당 1개만 남긴다(단위 높은 것 우선 → 3/4000 요건 유리).
const byNorm = new Map();
for (const [name, code, creditsStr] of rows) {
  const c = (code || '').trim();
  const credits = Number(creditsStr);
  if (!c || !name || Number.isNaN(credits)) continue;
  const nm = cleanName(name);
  if (nm.length < 2) continue;
  const level = levelFromCode(c) ?? 0;
  const key = normalizeName(nm);
  if (key.length < 2 || EXCLUDE.has(key)) continue;
  const prev = byNorm.get(key);
  if (!prev || level > prev.level) byNorm.set(key, { name: nm, credits, level });
}

const catalog = [...byNorm.values()];
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/course-catalog.json', JSON.stringify(catalog) + '\n', 'utf-8');

console.log('원본 행:', rows.length, '→ 이름 dedup 후:', catalog.length);
const lvl = {};
for (const r of catalog) lvl[r.level || '?'] = (lvl[r.level || '?'] || 0) + 1;
console.log('단위 분포:', JSON.stringify(lvl));
console.log('JSON 크기:', (Buffer.byteLength(JSON.stringify(catalog), 'utf-8') / 1024).toFixed(0), 'KB');

// 검증
const find = (n) => catalog.find((r) => normalizeName(r.name) === normalizeName(n));
for (const t of ['리더십워크숍', 'Yonsei RC101', '기계학습', '대기과학입문']) {
  const h = find(t);
  console.log('  ', t.padEnd(14), h ? `${h.name} | ${h.credits}학점 | ${h.level}단위` : '(없음/curated)');
}
