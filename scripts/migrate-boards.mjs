// 게시판 JSON → Supabase 이전 스크립트 (백엔드 전환 Phase 2).
// 실행: node scripts/migrate-boards.mjs [--reset]
//  - 기본: posts 테이블이 비어 있을 때만 실행(중복 적재 방지).
//  - --reset: 기존 rows 전부 삭제 후 재적재(개발 반복용).
//
// 변환 규칙:
//  - body 마크다운 → HTML (사이트 렌더와 동일 설정: marked gfm+breaks) — DB 는
//    에디터 산출물(HTML)을 저장하는 계약이므로 여기서 미리 변환한다.
//  - 뉴스형은 slug 보존(기존 URL 불변). 게시판형 id(nu-1 등)는 DB identity 로 대체
//    (현재 게시판이 비어 있어 보존할 URL 없음).
//  - date(YYYY-MM-DD) → created_at 자정(KST 아님, 표시용으로만 씀).
//    행사/isEvent 는 event_date 에도 기록.

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Marked } from 'marked';

// ── .env.local 로더 ──
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const marked = new Marked({ gfm: true, breaks: true });
const html = (md) => (md && md.trim() ? marked.parse(md) : '');

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const news = json('content/news.json');
const alumniNews = json('content/alumni-news.json');
const board = json('content/board.json');

// ── 안전장치 ──
const reset = process.argv.includes('--reset');
{
  const { count, error } = await sb.from('posts').select('id', { count: 'exact', head: true });
  if (error) { console.error('posts 조회 실패:', error.message); process.exit(1); }
  if (count > 0 && !reset) {
    console.error(`posts 에 이미 ${count}건 존재 — 중복 방지로 중단. 재적재하려면 --reset.`);
    process.exit(1);
  }
  if (count > 0 && reset) {
    const del = await sb.from('posts').delete().gte('id', 0);
    if (del.error) { console.error('reset 실패:', del.error.message); process.exit(1); }
    console.log(`기존 ${count}건 삭제(reset).`);
  }
}

// ── 변환기 ──
const ts = (date) => `${date}T00:00:00+09:00`;

function newsRow(n, boardKey) {
  return {
    row: {
      board: boardKey,
      slug: n.slug,
      title_ko: n.title?.ko ?? '', title_en: n.title?.en ?? null,
      body_html_ko: html(n.body?.ko), body_html_en: n.body?.en ? html(n.body.en) : null,
      excerpt_ko: n.excerpt?.ko ?? null, excerpt_en: n.excerpt?.en ?? null,
      category: n.category ?? 'notice',
      thumbnail_url: n.image?.trim() ? n.image.trim() : null,
      created_at: ts(n.date),
    },
    attachments: n.attachments ?? [],
  };
}

function boardRow(item, boardKey, extra = {}) {
  return {
    row: {
      board: boardKey,
      slug: null,
      title_ko: item.title?.ko ?? '', title_en: item.title?.en ?? null,
      body_html_ko: html(item.body?.ko), body_html_en: item.body?.en ? html(item.body.en) : null,
      created_at: ts(item.date),
      ...extra,
    },
    attachments: item.attachments ?? [],
  };
}

const entries = [
  ...news.map((n) => newsRow(n, 'news')),
  ...alumniNews.map((n) => newsRow(n, 'alumniNews')),
  ...(board.noticesUndergrad ?? []).map((x) => boardRow(x, 'noticesUndergrad')),
  ...(board.noticesGraduate ?? []).map((x) => boardRow(x, 'noticesGraduate')),
  ...(board.thesis ?? []).map((x) => boardRow(x, 'thesis')),
  ...(board.career ?? []).map((x) => boardRow(x, 'career')),
  ...(board.resources ?? []).map((x) => boardRow(x, 'resources')),
  ...(board.seminars ?? []).map((x) =>
    boardRow(x, 'seminars', { host_ko: x.host?.ko ?? null, host_en: x.host?.en ?? null }),
  ),
  ...(board.events ?? []).map((x) =>
    boardRow(x, 'events', {
      date_label_ko: x.dateLabel?.ko ?? null, date_label_en: x.dateLabel?.en ?? null,
      event_date: x.date,
    }),
  ),
  ...(board.alumniEvents ?? []).map((x) =>
    boardRow(x, 'alumniEvents', {
      host_ko: x.host?.ko ?? null, host_en: x.host?.en ?? null,
      is_event: x.isEvent === true,
      event_date: x.isEvent ? x.date : null,
    }),
  ),
];

// ── 적재 (첨부는 post id 필요 → 개별 insert) ──
let posts = 0, atts = 0;
for (const e of entries) {
  const { data, error } = await sb.from('posts').insert(e.row).select('id').single();
  if (error) { console.error('insert 실패:', e.row.board, e.row.title_ko, '—', error.message); process.exit(1); }
  posts += 1;
  if (e.attachments.length > 0) {
    const rows = e.attachments.map((a, i) => ({
      post_id: data.id,
      label_ko: a.label?.ko ?? null, label_en: a.label?.en ?? null,
      url: a.href, sort: i,
    }));
    const r = await sb.from('attachments').insert(rows);
    if (r.error) { console.error('첨부 insert 실패:', r.error.message); process.exit(1); }
    atts += rows.length;
  }
}
console.log(`완료: posts ${posts}건, attachments ${atts}건 적재.`);

// 게시판별 요약
const { data: summary } = await sb.from('posts').select('board');
const counts = {};
for (const r of summary ?? []) counts[r.board] = (counts[r.board] ?? 0) + 1;
Object.entries(counts).forEach(([b, c]) => console.log(`  ${b}: ${c}건`));
