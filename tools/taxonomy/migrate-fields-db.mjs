/**
 * 6분야 분류 체계 이관 — 프로덕션 Supabase(content_files)의 `field` 값을 신 체계로 바꾼다.
 *
 *   node tools/taxonomy/migrate-fields-db.mjs           # 드라이런(기본)
 *   node tools/taxonomy/migrate-fields-db.mjs --apply   # 실제 기록 (version +1)
 *
 * 왜 따로 도는가
 *   Phase 3 이후 콘텐츠 **원본은 DB**다. 레포의 content/*.json 은 빌드 시점 폴백
 *   스냅샷이라, 레포만 고치면 프로덕션 사이트의 분야는 그대로다.
 *
 * 왜 레포 파일을 그대로 밀어넣지 않는가
 *   DB 쪽이 더 최신일 수 있다(CMS 편집분 — 연구실 사진·인턴 모집 여부 등). 그래서
 *   레포 내용을 덮어쓰지 않고, **DB 에 지금 들어 있는 내용에** 같은 변환만 적용한다.
 *   히어로 슬라이드도 사진 URL 은 DB 값을 그대로 물려준다.
 *
 * 실행 후
 *   CMS 가 저장할 때처럼 캐시 태그를 털어야 즉시 반영된다. 이 스크립트는 DB 만
 *   건드리므로, 반영이 안 보이면 CMS 에서 아무 콘텐츠나 한 번 저장하거나 재배포한다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { migrateLabs, migrateCourses, migrateHeroSlides } from './transform.mjs';
import { reportChanges } from './report.mjs';

// ── .env.local 로더 (dotenv 없이 최소 구현 — scripts/migrate-content.mjs 와 동일) ──
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다 (.env.local 확인).');
  process.exit(1);
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const APPLY = process.argv.includes('--apply');
const TARGETS = [
  { path: 'content/labs-directory.json', run: migrateLabs },
  { path: 'content/courses-graduate.json', run: migrateCourses },
  { path: 'content/courses-undergraduate.json', run: migrateCourses },
  { path: 'content/hero-slides.json', run: migrateHeroSlides },
];

const { data: rows, error } = await sb
  .from('content_files')
  .select('path, body, version')
  .in('path', TARGETS.map((t) => t.path));
if (error) {
  console.error('content_files 조회 실패:', error.message);
  process.exit(1);
}
const byPath = new Map(rows.map((r) => [r.path, r]));

let failed = false;
for (const { path, run } of TARGETS) {
  const row = byPath.get(path);
  if (!row) {
    console.log(`\n── ${path} — DB 행 없음 (건너뜀). 먼저 scripts/migrate-content.mjs 로 시딩할 것.`);
    failed = true;
    continue;
  }
  const { text, changes } = run(row.body);
  if (reportChanges(`${path} (DB v${row.version})`, changes)) failed = true;
  if (text === row.body) continue;
  if (!APPLY) continue;

  const { error: writeErr } = await sb
    .from('content_files')
    .update({ body: text, version: row.version + 1 })
    .eq('path', path);
  if (writeErr) {
    console.error(`   ✗ 기록 실패 ${path}: ${writeErr.message}`);
    failed = true;
  } else {
    console.log(`   ↑ 갱신 v${row.version} → v${row.version + 1}`);
  }
}

console.log(APPLY ? '\nDB 기록 완료 — 사이트에서 실물로 확인할 것.' : '\n드라이런 — 기록하려면 --apply');
if (failed) process.exitCode = 1;
