/**
 * 교재 콘텐츠 빌드 — 크롤 JSON → content/textbooks.json
 *
 * 수강편람 강의계획서 크롤(교재 매칭 폴더)을 학정번호(분반 제외, 예: MEU2600) 키의
 * 정규화 JSON 으로 변환한다. 교과목 소개 페이지(CourseCatalog)의 교재 팝업이 소비한다.
 *
 * 사용법:
 *   node tools/textbooks/build-content.mjs <크롤JSON경로>
 *   (표지는 먼저 tools/textbooks/mirror-covers.mjs 로 public/img/textbooks 에 미러링)
 *
 * 구조 결정(2026-08-20 사용자 확정):
 *  - 교수(분반) 구분 없이 과목당 교재를 평탄화한다. 같은 책이 여러 분반에 나오면
 *    ISBN(없으면 정규화 제목) 기준으로 중복 제거하고, 구분이 갈리면(한 분반에선
 *    주교재·다른 분반에선 부교재) 상위 구분(주교재 > 부교재 > 참고자료)을 남긴다.
 *  - 정렬: 주교재 → 부교재 → 참고자료, 같은 구분 안에서는 등장 순서 유지.
 *  - 서지(제목·저자·출판사)는 사실 데이터라 이중언어 래핑({ko,en}) 없이 원문 그대로.
 *    UI 라벨(주교재 등)의 번역은 컴포넌트 메시지가 담당한다.
 *  - cover 는 미러링된 파일이 실제로 있을 때만 경로를 넣는다(핫링크 금지) —
 *    없으면 null → 팝업이 책 픽토그램 플레이스홀더를 그린다.
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const COVERS_DIR = 'public/img/textbooks';
const OUT = 'content/textbooks.json';

const KIND_RANK = { 주교재: 0, 부교재: 1, 참고자료: 2 };

const src = process.argv[2];
if (!src) {
  console.error('사용법: node tools/textbooks/build-content.mjs <크롤JSON경로>');
  process.exit(1);
}

const raw = JSON.parse(await readFile(src, 'utf8'));

const hasCover = async (isbn) => {
  if (!isbn) return false;
  try {
    await access(path.join(COVERS_DIR, `${isbn}.jpg`));
    return true;
  } catch {
    return false;
  }
};

// 중복 판정 키 — ISBN 이 있으면 ISBN, 없으면(강의노트 등) 정규화한 제목.
// 판이 다르면 ISBN 도 달라 별개 항목으로 남는다(10판/11판 공존은 의도된 결과 —
// 분반에 따라 실제로 다른 판을 쓴다).
const dedupeKey = (b) => b.isbn || b.title.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

/** 과목코드 → { name, books: Map(dedupeKey → book) } */
const courses = new Map();

for (const sem of raw['학기별']) {
  for (const c of sem['과목']) {
    const books = c['교재'] ?? [];
    if (books.length === 0) continue;
    const code = c['학정번호'].split('-')[0];
    if (!courses.has(code)) courses.set(code, { name: c['교과목명'], books: new Map() });
    const entry = courses.get(code);

    for (const b of books) {
      const isbn = (b['ISBN'] ?? '').trim();
      const book = {
        kind: b['교재구분'], // 주교재 | 부교재 | 참고자료
        title: (b['교재명'] ?? '').trim(),
        author: (b['저자'] ?? '').trim(),
        publisher: (b['출판사'] ?? '').trim(),
        year: (b['출판년도'] ?? '').trim(),
        isbn,
        cover: (await hasCover(isbn)) ? `/img/textbooks/${isbn}.jpg` : null,
      };
      const key = dedupeKey(book);
      const prev = entry.books.get(key);
      if (!prev) {
        entry.books.set(key, book);
      } else if ((KIND_RANK[book.kind] ?? 9) < (KIND_RANK[prev.kind] ?? 9)) {
        prev.kind = book.kind; // 구분이 갈리면 상위 구분으로 승격
      }
    }
  }
}

const out = {};
for (const [code, { name, books }] of [...courses].sort(([a], [b]) => a.localeCompare(b))) {
  out[code] = {
    name,
    books: [...books.values()].sort(
      (a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9),
    ),
  };
}

await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');

let nBooks = 0;
let nNoCover = 0;
const byCount = [];
for (const [code, c] of Object.entries(out)) {
  nBooks += c.books.length;
  nNoCover += c.books.filter((b) => !b.cover).length;
  byCount.push([code, c.name, c.books.length]);
}
byCount.sort((a, b) => b[2] - a[2]);
console.log(`${OUT}: 과목 ${Object.keys(out).length} · 교재 ${nBooks} (표지 없음 ${nNoCover})`);
console.log('교재 수 상위:', byCount.slice(0, 5).map(([c, n, k]) => `${n} ${k}권`).join(' · '));
