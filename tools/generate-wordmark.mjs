/**
 * 헤더 로고 워드마크 생성기 — 연세체 TTF → SVG 패스.
 *
 * tools/fonts/YonseiBold.TTF 의 글자를 SVG path 데이터로 변환해
 * src/components/logo-wordmark.ts 로 출력한다. 폰트 파일 자체는 배포에
 * 포함되지 않고(라이선스·용량), 생성된 패스만 번들된다.
 *
 * 실행: node tools/generate-wordmark.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadFont(file) {
  const buf = readFileSync(join(root, 'tools', 'fonts', file));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const bold = loadFont('YonseiBold.TTF');

/** 텍스트 → { d, viewBox, width, height } (baseline 기준 bbox 로 크롭) */
function wordmark(font, text, fontSize = 100, letterSpacing = 0) {
  // letterSpacing: em 단위(글자 사이 추가 간격)
  let x = 0;
  const paths = [];
  const glyphs = font.stringToGlyphs(text);
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    paths.push(g.getPath(x, 0, fontSize));
    let adv = (g.advanceWidth / font.unitsPerEm) * fontSize;
    if (i < glyphs.length - 1) {
      adv += (font.getKerningValue(g, glyphs[i + 1]) / font.unitsPerEm) * fontSize;
      adv += letterSpacing * fontSize;
    }
    x += adv;
  }
  const full = new opentype.Path();
  for (const p of paths) full.extend(p);
  const bb = full.getBoundingBox();
  const d = full.toPathData(2);
  const w = +(bb.x2 - bb.x1).toFixed(2);
  const h = +(bb.y2 - bb.y1).toFixed(2);
  return {
    d,
    viewBox: `${bb.x1.toFixed(2)} ${bb.y1.toFixed(2)} ${w} ${h}`,
    width: w,
    height: h,
  };
}

// en 은 학부 공식 영문 워드마크와 동일하게 대학명 생략(엠블럼 링이 YONSEI UNIVERSITY 담당)
// — "Yonsei Mechanical Engineering" 은 비율 18:1 로 헤더 내비게이션과 충돌한다.
const ko = wordmark(bold, '연세대학교 기계공학부');
const en = wordmark(bold, 'Mechanical Engineering');

const out = `// 자동 생성 — 편집 금지. 재생성: node tools/generate-wordmark.mjs
// 연세체 Bold(YonseiBold.TTF) 워드마크를 SVG 패스로 변환한 것.
// fill 은 컴포넌트에서 currentColor 로 지정해 배경에 따라 색이 바뀐다.

export interface WordmarkPath {
  d: string;
  viewBox: string;
  width: number;
  height: number;
}

export const WORDMARK: Record<'ko' | 'en', WordmarkPath> = {
  ko: ${JSON.stringify(ko)},
  en: ${JSON.stringify(en)},
};
`;

writeFileSync(join(root, 'src', 'components', 'logo-wordmark.ts'), out);
console.log('ko:', ko.width, 'x', ko.height, '(ratio', (ko.width / ko.height).toFixed(2) + ')');
console.log('en:', en.width, 'x', en.height, '(ratio', (en.width / en.height).toFixed(2) + ')');
console.log('written: src/components/logo-wordmark.ts');
