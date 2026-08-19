// 구 사이트(me.yonsei.ac.kr) URL → 새 사이트 매핑 생성기 — 도메인 컷오버 준비물.
//
//   node tools/legacy-redirects/build-map.mjs
//
// 산출물: src/lib/legacy-redirects.gen.json (커밋 대상)
//   { posts: { "<articleNo>": ["<boardKey>", <id>] },
//     attachments: { "<articleNo>:<attachNo>": "<R2 공개 URL>" } }
//
// 왜 정적 파일인가: 리다이렉트 리졸버(src/app/me/…/route.ts)가 요청마다 DB 를
// 조회하지 않고 즉답하게 한다. 구 게시물 집합은 닫혀 있어(이전 완료·증분 없음)
// 커밋 시점 스냅숏으로 충분하다. 게시물이 삭제되면 매핑이 남아 새 URL 이 404 가
// 되는데, 그 또한 올바른 결말이다(지어내지 않는다).
//
// 데이터 소스 둘을 조인한다:
//  - posts.source_url — articleNo 의 단일 출처(이전 파이프라인의 멱등 키).
//  - 첨부의 attachNo 는 DB 에 없다(mirror 가 url 을 R2 로 치환하며 사라짐) →
//    크롤 스냅숏(tools/boards-raw/*.json)의 원본 첨부 URL 에서 뽑아, 게시물별
//    "순서"로 DB attachments 와 짝짓는다. 라벨이 아니라 순서인 이유: 임포트가
//    크롤 배열 순서대로 insert 했고, 라벨은 정규화(확장자 병합 등)로 달라질 수 있다.
//    짝이 안 맞는 게시물(첨부 수 불일치)은 그 게시물 첨부만 건너뛰고 보고한다.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const req = createRequire(join(ROOT, 'scripts', 'import-boards.mjs'));
const { createClient } = req('@supabase/supabase-js');

for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, columns, orderCol = 'id') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order(orderCol).range(from, from + 999);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

const articleNoOf = (u) => String(u ?? '').match(/[?&]articleNo=(\d+)/)?.[1] ?? null;
const attachNoOf = (u) => String(u ?? '').match(/[?&]attachNo=(\d+)/)?.[1] ?? null;

// ── ① 게시물: source_url → { boardKey, id } ─────────────────────
const posts = await fetchAll('posts', 'id,board,source_url');
const postMap = {}; // articleNo → [boardKey, id]
const byPostId = new Map(); // post id → articleNo (첨부 조인용)
let dupes = 0;
for (const p of posts) {
  const no = articleNoOf(p.source_url);
  if (!no) continue; // 손으로 만든 글 — 구 URL 이 없다
  if (postMap[no]) dupes += 1;
  postMap[no] = [p.board, p.id];
  byPostId.set(p.id, no);
}

// ── ② 첨부: 크롤 스냅숏의 attachNo ↔ DB 의 R2 URL (게시물별 순서 조인) ──
const dbAtts = await fetchAll('attachments', 'id,post_id,url');
const attsByPost = new Map();
for (const a of dbAtts) {
  if (!attsByPost.has(a.post_id)) attsByPost.set(a.post_id, []);
  attsByPost.get(a.post_id).push(a); // id 순 = insert 순
}

// 크롤 스냅숏: articleNo → 원본 첨부 URL 배열(순서 보존)
const rawAtts = new Map();
const RAW_DIR = join(ROOT, 'tools', 'boards-raw');
for (const f of readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(join(RAW_DIR, f), 'utf8'));
  for (const p of j.posts ?? []) {
    const urls = (p.attachments ?? []).map((a) => a.url);
    if (urls.length) rawAtts.set(String(p.articleNo), urls);
  }
}

const attachMap = {}; // "articleNo:attachNo" → R2 URL
const mismatches = [];
let attachPairs = 0;
for (const [postId, rows] of attsByPost) {
  const no = byPostId.get(postId);
  if (!no) continue; // 수동 글의 첨부 — 구 URL 없음
  const raw = rawAtts.get(no) ?? [];
  if (raw.length !== rows.length) {
    mismatches.push({ articleNo: no, raw: raw.length, db: rows.length });
    continue;
  }
  rows.forEach((r, i) => {
    const attNo = attachNoOf(raw[i]);
    // R2 로 치환되지 않은 첨부(다운로드 실패분)는 목적지가 구 서버라 매핑 무의미
    if (attNo && /^https?:\/\//.test(r.url) && !/yonsei\.ac\.kr/.test(r.url)) {
      attachMap[`${no}:${attNo}`] = r.url;
      attachPairs += 1;
    }
  });
}

// ── ③ 저장 + 리포트 ─────────────────────────────────────────────
const out = { posts: postMap, attachments: attachMap };
const OUT = join(ROOT, 'src', 'lib', 'legacy-redirects.gen.json');
writeFileSync(OUT, JSON.stringify(out));

console.log('── legacy-redirects 매핑 생성 ──────────────');
console.log(`  게시물: ${Object.keys(postMap).length}건 (articleNo 중복 ${dupes})`);
console.log(`  첨부:   ${attachPairs}건 매핑 · 순서 불일치로 건너뜀 ${mismatches.length}게시물`);
for (const m of mismatches.slice(0, 10)) console.log(`    articleNo ${m.articleNo}: 크롤 ${m.raw} vs DB ${m.db}`);
const kb = (JSON.stringify(out).length / 1024).toFixed(0);
console.log(`  → ${OUT} (${kb}KB)`);
