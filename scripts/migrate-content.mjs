// 콘텐츠 파일(JSON·마크다운) → Supabase content_files 이전 스크립트 (백엔드 전환 Stage A).
//
// 실행:
//   node scripts/migrate-content.mjs                    # origin/main 원문을 적재(upsert)
//   node scripts/migrate-content.mjs --verify           # 쓰기 없이 DB↔git 바이트 비교만
//   node scripts/migrate-content.mjs --source=worktree  # 로컬 작업 트리 파일을 소스로
//   node scripts/migrate-content.mjs --enrich-photos    # 교수 사진 경로 채워서 적재
//
// ⚠️ 기본 소스는 `git show origin/main:<path>` 다. 로컬 작업 트리에는 다른 세션의
// 커밋 금지 WIP(content/labs-directory.json, content/board.json 등)가 상시 섞여 있어
// 그대로 적재하면 배포된 사이트에 없는 내용이 DB 에 들어간다. --source=worktree 는
// 그 사실을 아는 사람이 명시적으로 켤 때만 쓴다.
//
// upsert 규칙: 같은 path 행이 있으면 body 를 update 하고 version 을 +1 한다
// (supabase upsert 로는 version+1 같은 산술을 표현할 수 없어 존재 확인 후 분기).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

// ── .env.local 로더 (scripts/migrate-boards.mjs 와 동일) ──
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── 관리 대상 목록 ──
// src/lib/admin/managed-content.ts 가 단일 소스 — 변경 시 함께 갱신.
// (노드 스크립트라 TS 모듈을 직접 import 할 수 없어 여기 중복 선언한다.)
const MANAGED_JSON = [
  'content/history.json',
  'content/faculty-directory.json',
  'content/staff.json',
  'content/courses-undergraduate.json',
  'content/course-descriptions.json',
  'content/courses-graduate.json',
  'content/clubs.json',
  'content/labs-directory.json',
];
const SCHOLARSHIP_MD = 'content/pages/undergraduate-scholarship.md';
const CLUBS_JSON = 'content/clubs.json';
const FACULTY_JSON = 'content/faculty-directory.json';

// ── 플래그 ──
const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');
const enrichPhotos = args.includes('--enrich-photos');
const sourceArg = args.find((a) => a.startsWith('--source='))?.slice('--source='.length) ?? 'origin';
if (sourceArg !== 'origin' && sourceArg !== 'worktree') {
  console.error(`알 수 없는 --source 값: ${sourceArg} (origin | worktree)`);
  process.exit(1);
}
const fromWorktree = sourceArg === 'worktree';

// ── 소스 읽기 ──
/** origin/main 의 파일 원문(바이트 보존). 없는 파일이면 null */
function readFromGit(path) {
  const r = spawnSync('git', ['show', `origin/main:${path}`], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return r.stdout.toString('utf8');
}

function readSource(path) {
  if (fromWorktree) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  }
  return readFromGit(path);
}

// ── 교수 사진 보강 (--enrich-photos) ──
// photo 가 비어 있는 레코드에 public/img/faculty/<이름>.<ext> 실존 파일을 찾아 채운다.
// 사이트는 지금도 이름 매칭으로 같은 결과를 만들지만(lib/faculty.ts 의 photoMap),
// DB 소스로 넘어가면 public/ 을 읽지 못하는 환경도 있어 값 자체를 심어 둘 수 있게 한다.
function enrichFacultyPhotos(text) {
  const records = JSON.parse(text);
  let files = [];
  try {
    files = readdirSync(join('public', 'img', 'faculty'));
  } catch {
    console.warn('  ⚠ public/img/faculty 를 읽을 수 없어 사진 보강을 건너뜁니다.');
    return { text, filled: 0 };
  }
  const byName = new Map();
  for (const f of files) {
    const dot = f.lastIndexOf('.');
    if (dot <= 0) continue;
    byName.set(f.slice(0, dot), `/img/faculty/${f}`);
  }
  let filled = 0;
  for (const r of records) {
    const has = typeof r.photo === 'string' && r.photo.trim() !== '';
    if (has) continue;
    const found = byName.get(r.name);
    if (!found) continue;
    r.photo = found;
    filled += 1;
  }
  // 2칸 들여쓰기 + 끝 개행 — 저장소의 다른 content/*.json 과 같은 직렬화 형식
  return { text: `${JSON.stringify(records, null, 2)}\n`, filled };
}

// ── 대상 경로 확정 (club-*.md 는 clubs.json 의 slug 에서 동적 생성) ──
const clubsText = readSource(CLUBS_JSON);
if (clubsText === null) {
  console.error(`${CLUBS_JSON} 를 읽을 수 없습니다 (source=${sourceArg}).`);
  process.exit(1);
}
const clubSlugs = JSON.parse(clubsText).map((c) => c.slug);
const targets = [...MANAGED_JSON, SCHOLARSHIP_MD, ...clubSlugs.map((s) => `content/pages/club-${s}.md`)];

console.log(`소스: ${fromWorktree ? '로컬 작업 트리' : 'origin/main'} · 대상 ${targets.length}개 파일`);
if (enrichPhotos) console.log(`사진 보강: ${FACULTY_JSON} 의 빈 photo 를 파일명 매칭으로 채웁니다.`);

// ── 원문 수집 ──
const bodies = new Map();
const missing = [];
let enrichedFilled = 0;
for (const path of targets) {
  let text = readSource(path);
  if (text === null) {
    missing.push(path);
    continue;
  }
  if (enrichPhotos && path === FACULTY_JSON) {
    const out = enrichFacultyPhotos(text);
    text = out.text;
    enrichedFilled = out.filled;
  }
  bodies.set(path, text);
}
for (const p of missing) console.warn(`  ⚠ 없음(건너뜀): ${p}`);

// ── --verify: 쓰기 없이 DB↔소스 바이트 비교 ──
if (verifyOnly) {
  const { data, error } = await sb.from('content_files').select('path, body, version');
  if (error) { console.error('content_files 조회 실패:', error.message); process.exit(1); }
  const rows = new Map((data ?? []).map((r) => [r.path, r]));
  let same = 0, diff = 0, absent = 0;
  for (const [path, text] of bodies) {
    const row = rows.get(path);
    if (!row) {
      console.log(`  · DB 없음   ${path}`);
      absent += 1;
      continue;
    }
    if (row.body === text) {
      console.log(`  ✓ 일치     ${path} (v${row.version})`);
      same += 1;
    } else {
      const note =
        enrichPhotos && path === FACULTY_JSON
          ? ' — 사진 보강(--enrich-photos)으로 원문과 달라진 것이 정상입니다'
          : '';
      console.log(
        `  ✗ 불일치   ${path} (v${row.version}, DB ${row.body.length}자 / 소스 ${text.length}자)${note}`,
      );
      diff += 1;
    }
  }
  const extra = [...rows.keys()].filter((p) => !bodies.has(p));
  for (const p of extra) console.log(`  ? DB 에만  ${p}`);
  console.log(`\n검증: 일치 ${same} · 불일치 ${diff} · DB 없음 ${absent} · DB 에만 ${extra.length}`);
  process.exit(diff > 0 || absent > 0 ? 1 : 0);
}

// ── 적재 (존재 확인 후 update/insert 분기 — version 산술 때문) ──
const { data: existingRows, error: readErr } = await sb.from('content_files').select('path, version');
if (readErr) { console.error('content_files 조회 실패:', readErr.message); process.exit(1); }
const existing = new Map((existingRows ?? []).map((r) => [r.path, r.version]));

let inserted = 0, updated = 0;
for (const [path, body] of bodies) {
  const prev = existing.get(path);
  if (prev === undefined) {
    const { error } = await sb.from('content_files').insert({ path, body });
    if (error) { console.error(`insert 실패: ${path} —`, error.message); process.exit(1); }
    console.log(`  + 신규     ${path} (${body.length}자, v1)`);
    inserted += 1;
  } else {
    const { error } = await sb
      .from('content_files')
      .update({ body, version: prev + 1 })
      .eq('path', path);
    if (error) { console.error(`update 실패: ${path} —`, error.message); process.exit(1); }
    console.log(`  ↑ 갱신     ${path} (${body.length}자, v${prev} → v${prev + 1})`);
    updated += 1;
  }
}

console.log(`\n완료: 신규 ${inserted} · 갱신 ${updated} · 건너뜀 ${missing.length}`);
if (enrichPhotos) console.log(`사진 보강: ${enrichedFilled}개 레코드의 photo 를 채웠습니다.`);
