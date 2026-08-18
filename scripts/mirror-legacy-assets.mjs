// 구 서버(me.yonsei.ac.kr) 자산 미러링 — 도메인 컷오버 전 필수 1회성 작업.
//
// 왜: DNS 가 me.yonsei.ac.kr 을 Vercel 로 돌리는 순간, 구 서버의 이미지·첨부는
// 그 주소로 더는 접근할 수 없다. DB 에 절대경로로 박힌 me.yonsei.ac.kr 자산 URL 을
// 전부 R2 로 내려받아 올리고, DB 의 URL 을 R2 공개 주소로 치환한다.
// devcms.yonsei.ac.kr(구 CMS 원 서버, _res/editor_image/… 이미지)도 함께 미러링한다 —
// DNS 컷오버 자체와는 무관하게 살아 있지만, 학교가 me 테넌트를 정리하는 순간 죽는다.
// (www·engineering 등 다른 교내 서브도메인은 컷오버와 무관하므로 건드리지 않는다.)
//
// 실행: node scripts/mirror-legacy-assets.mjs [--apply] [--limit=N]
//   기본은 드라이런 — DB 를 읽어 대상 URL 만 집계하고 아무것도 쓰지 않는다.
//   --apply: ① 각 URL 을 순차 다운로드(300ms 간격) → R2 업로드(내용 해시 키,
//   HeadObject 로 중복 생략) ② 영향 행 스냅숏 저장 ③ DB 치환 ④ 재스캔 검증.
//   --limit=N: 다운로드 대상을 앞 N 개로 자른다(파이프라인 검증용).
//
// 설계 메모
//  - source_url 은 치환하지 않는다 — 게시물의 멱등 키이자 "원문" 표기이지 자산이 아니다.
//  - body_html 안의 URL 은 sanitize-html 직렬화 때문에 &amp; 로 인코딩돼 있다.
//    매치 문자열(M)과 실제 요청 URL(M 의 &amp;→&)을 분리해서 다루고, 치환은 M 그대로 한다.
//  - 다운로드 실패(404 등)는 그 URL 만 원문대로 두고 목록으로 보고한다 — 이미 죽은
//    링크를 지어내서 고칠 수는 없다.
//  - DB 쓰기는 전 다운로드가 끝난 뒤 한 번에 한다. 중간에 죽으면 DB 는 무변경이고,
//    재실행 시 R2 업로드는 해시 키 덕에 전부 생략된다(멱등).
//  - 롤백: scripts/../tools/legacy-mirror-snapshot-<날짜>.json 에 영향 행의 이전 값을
//    통째로 남긴다(gitignore 대상 아님·커밋 금지 — 로컬 보관용).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// ── .env.local 로더 (scripts/import-boards.mjs 와 동일) ──
{
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of ['.env.local', join(here, '..', '.env.local')]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    }
    break;
  }
}

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.slice(8)) : Infinity;

const DELAY_MS = 300;
const TIMEOUT_MS = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 치환 대상 텍스트 컬럼 (source_url 제외 — 위 설계 메모)
const POST_COLS = [
  'body_html_ko', 'body_html_en', 'body_md_ko', 'body_md_en',
  'excerpt_ko', 'excerpt_en', 'thumbnail_url',
];

const HOST_RE = /https?:\/\/(?:me|devcms)\.yonsei\.ac\.kr\/[^\s"'<>]*/g;
const OTHER_YONSEI_RE = /https?:\/\/((?!me\.|devcms\.)[a-z0-9-]+)\.yonsei\.ac\.kr\//g;

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');

// ── 전량 조회 (1,000행 페이지) ──────────────────────────────────
async function fetchAll(table, columns, orderCol = 'id') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(columns).order(orderCol).range(from, from + 999);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

// 매치 문자열 끝의 명백한 부스러기(닫는 따옴표 엔티티)만 떼어낸다.
function trimMatch(m) {
  return m.replace(/(&quot;|&#39;|&amp;)+$/, '').replace(/[.,;:)]+$/, '');
}

function extractMatches(text) {
  if (!text) return [];
  return [...String(text).matchAll(HOST_RE)].map((m) => trimMatch(m[0])).filter(Boolean);
}

const decodeAmp = (s) => s.replaceAll('&amp;', '&');

// ── 스캔 ────────────────────────────────────────────────────────
const posts = await fetchAll('posts', ['id', 'board', 'title_ko', 'source_url', ...POST_COLS].join(','));
const atts = await fetchAll('attachments', 'id,post_id,url,label_ko');
const contentFiles = await fetchAll('content_files', 'path,body', 'path');

/** matchStr → { fetchUrl, where:[{table,id,col}] } */
const targets = new Map();
function addMatch(m, table, id, col) {
  if (!targets.has(m)) targets.set(m, { fetchUrl: decodeAmp(m), where: [] });
  targets.get(m).where.push({ table, id, col });
}

const otherHosts = new Map(); // 정보용 — 컷오버와 무관한 교내 서브도메인 집계
function countOther(text) {
  for (const m of String(text ?? '').matchAll(OTHER_YONSEI_RE)) {
    otherHosts.set(m[1], (otherHosts.get(m[1]) ?? 0) + 1);
  }
}

for (const p of posts) {
  for (const col of POST_COLS) {
    for (const m of extractMatches(p[col])) addMatch(m, 'posts', p.id, col);
    countOther(p[col]);
  }
}
for (const a of atts) {
  for (const m of extractMatches(a.url)) addMatch(m, 'attachments', a.id, 'url');
  countOther(a.url);
}
const contentHits = [];
for (const f of contentFiles) {
  const ms = extractMatches(f.body);
  if (ms.length) contentHits.push({ path: f.path, count: ms.length, samples: ms.slice(0, 3) });
}

// 같은 자원의 &amp;/& 표기 변형 → fetchUrl 기준으로 유니크 다운로드 수를 센다
const uniqueFetch = new Map(); // fetchUrl → [matchStr...]
for (const [m, t] of targets) {
  if (!uniqueFetch.has(t.fetchUrl)) uniqueFetch.set(t.fetchUrl, []);
  uniqueFetch.get(t.fetchUrl).push(m);
}

const attSizeSum = atts
  .filter((a) => /(?:me|devcms)\.yonsei\.ac\.kr/.test(String(a.url ?? '')))
  .length;

console.log('── 스캔 결과 ─────────────────────────────');
console.log(`  posts ${posts.length}행 · attachments ${atts.length}행 · content_files ${contentFiles.length}행 검사`);
console.log(`  me/devcms.yonsei.ac.kr 매치 문자열 ${targets.size}개 → 유니크 자원 ${uniqueFetch.size}개`);
const byTable = { posts: 0, attachments: 0 };
for (const t of targets.values()) for (const w of t.where) byTable[w.table] += 1;
console.log(`  발생 위치: posts 컬럼 ${byTable.posts}곳 · attachments.url ${byTable.attachments}곳 (첨부 행 기준 ${attSizeSum}건)`);
if (contentHits.length) {
  console.log(`  ⚠ content_files 에도 매치 ${contentHits.length}파일 — 별도 처리 필요:`);
  for (const c of contentHits) console.log(`     ${c.path} (${c.count}) 예: ${c.samples[0]}`);
} else {
  console.log('  content_files 매치 없음');
}
if (otherHosts.size) {
  const info = [...otherHosts.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}(${n})`).join(' ');
  console.log(`  (정보) 다른 교내 호스트 참조 — 컷오버와 무관, 미치환: ${info}`);
}

if (!APPLY) {
  const sample = [...uniqueFetch.keys()].slice(0, 8);
  console.log('\n  예시:');
  for (const s of sample) console.log(`   ${s.slice(0, 110)}`);
  console.log('\n  ※ 실제 미러링은 --apply 를 붙이세요. (드라이런 — 아무것도 쓰지 않았습니다)');
  process.exit(0);
}

// ── 다운로드 → R2 업로드 ───────────────────────────────────────
const EXT_BY_TYPE = new Map(Object.entries({
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'application/pdf': '.pdf', 'application/zip': '.zip', 'application/x-zip-compressed': '.zip',
  'application/haansofthwp': '.hwp', 'application/x-hwp': '.hwp', 'application/vnd.hancom.hwp': '.hwp',
  'application/vnd.hancom.hwpx': '.hwpx', 'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
}));

/** Content-Disposition 에서 파일명 추출 (filename*=UTF-8''… 우선, filename="…" 폴백) */
function filenameFromCD(cd) {
  if (!cd) return null;
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) { try { return decodeURIComponent(star[1].trim()); } catch { /* 무시 */ } }
  const plain = cd.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}

async function headExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

const urlMap = new Map(); // matchStr → 새 R2 URL
const failures = [];
let uploaded = 0, skipped = 0, bytesTotal = 0;
const fetchList = [...uniqueFetch.entries()].slice(0, LIMIT);

console.log(`\n── 다운로드 ${fetchList.length}개 (요청 간 ${DELAY_MS}ms) ──────────────`);
let i = 0;
for (const [fetchUrl, matchStrs] of fetchList) {
  i += 1;
  await sleep(DELAY_MS);
  let res;
  try {
    res = await fetch(fetchUrl, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    failures.push({ url: fetchUrl, reason: e.message });
    continue;
  }
  if (!res.ok) {
    failures.push({ url: fetchUrl, reason: `HTTP ${res.status}` });
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    failures.push({ url: fetchUrl, reason: '빈 응답' });
    continue;
  }
  const ctype = (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim();
  // HTML 이 오면 자산이 아니라 오류/로그인 페이지다 — 미러링하면 안 된다
  if (ctype === 'text/html') {
    failures.push({ url: fetchUrl, reason: 'HTML 응답(자산 아님)' });
    continue;
  }
  const cdName = filenameFromCD(res.headers.get('content-disposition'));
  const pathName = decodeURIComponent(new URL(fetchUrl).pathname.split('/').pop() ?? '');
  const name = cdName || (pathName.includes('.') ? pathName : '');
  const extFromName = name.match(/(\.[A-Za-z0-9]{2,5})$/)?.[1]?.toLowerCase() ?? '';
  const ext = extFromName || EXT_BY_TYPE.get(ctype) || '';
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  const key = `uploads/legacy/${hash}${ext}`;

  if (await headExists(key)) {
    skipped += 1;
  } else {
    const disp = name
      ? `${ctype.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`
      : undefined;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: buf, ContentType: ctype,
      ...(disp ? { ContentDisposition: disp } : {}),
    }));
    uploaded += 1;
    bytesTotal += buf.length;
  }
  const newUrl = `${PUBLIC_BASE}/${key}`;
  for (const m of matchStrs) urlMap.set(m, newUrl);
  if (i % 25 === 0 || i === fetchList.length) {
    console.log(`  ${i}/${fetchList.length} · 업로드 ${uploaded} · 기존재 ${skipped} · 실패 ${failures.length} · ${(bytesTotal / 1048576).toFixed(1)}MB`);
  }
}

// ── 스냅숏 → DB 치환 ───────────────────────────────────────────
function rewrite(text) {
  let out = String(text);
  let changed = false;
  for (const [m, nu] of urlMap) {
    if (out.includes(m)) {
      out = out.split(m).join(nu);
      changed = true;
    }
  }
  return changed ? out : null;
}

const postPatches = [];
for (const p of posts) {
  const patch = {};
  let hit = false;
  for (const col of POST_COLS) {
    const nv = p[col] ? rewrite(p[col]) : null;
    if (nv !== null) { patch[col] = nv; hit = true; }
  }
  if (hit) postPatches.push({ id: p.id, patch }); // 이전 값은 스냅숏 파일이 원문 전체로 보관한다
}
const attPatches = [];
for (const a of atts) {
  const nv = a.url ? rewrite(a.url) : null;
  if (nv !== null) attPatches.push({ id: a.id, before: a.url, url: nv });
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapPath = join(ROOT, 'tools', `legacy-mirror-snapshot-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(snapPath, JSON.stringify({
  createdAt: new Date().toISOString(),
  posts: posts.filter((p) => postPatches.some((x) => x.id === p.id)),
  attachments: atts.filter((a) => attPatches.some((x) => x.id === a.id)),
}, null, 1), 'utf8');
console.log(`\n스냅숏 저장: ${snapPath} (posts ${postPatches.length}행 · attachments ${attPatches.length}행)`);

let postOk = 0, attOk = 0;
for (const { id, patch } of postPatches) {
  const { error } = await sb.from('posts').update(patch).eq('id', id);
  if (error) { failures.push({ url: `posts#${id}`, reason: `UPDATE 실패: ${error.message}` }); continue; }
  postOk += 1;
}
for (const { id, url } of attPatches) {
  const { error } = await sb.from('attachments').update({ url }).eq('id', id);
  if (error) { failures.push({ url: `attachments#${id}`, reason: `UPDATE 실패: ${error.message}` }); continue; }
  attOk += 1;
}

// ── 재스캔 검증 ────────────────────────────────────────────────
const postsAfter = await fetchAll('posts', ['id', ...POST_COLS].join(','));
const attsAfter = await fetchAll('attachments', 'id,url');
let remain = 0;
for (const p of postsAfter) for (const col of POST_COLS) remain += extractMatches(p[col]).length;
for (const a of attsAfter) remain += extractMatches(a.url).length;

console.log('\n── 적용 완료 ─────────────────────────────');
console.log(`  R2 업로드 ${uploaded}개(${(bytesTotal / 1048576).toFixed(1)}MB) · 이미 있어 생략 ${skipped}개`);
console.log(`  DB 치환: posts ${postOk}/${postPatches.length}행 · attachments ${attOk}/${attPatches.length}행`);
console.log(`  재스캔 잔여 me/devcms.yonsei URL: ${remain}개 (실패분 ${failures.length}개와 대조)`);
if (failures.length) {
  console.log('\n  실패 목록:');
  for (const f of failures.slice(0, 30)) console.log(`   ${f.reason}  ${f.url.slice(0, 100)}`);
  if (failures.length > 30) console.log(`   … 외 ${failures.length - 30}건`);
}
console.log('\n  ※ 사이트 반영은 ISR 만료(최대 10분) 또는 revalidateTag(\'posts\') 로.');
