/**
 * 히어로 슬라이드 사진 URL 을 레포 → DB 로 맞춘다 (분야 키 기준, 사진 필드만).
 *
 *   node tools/taxonomy/sync-hero-images.mjs           # 드라이런
 *   node tools/taxonomy/sync-hero-images.mjs --apply
 *
 * 왜 필요한가
 *   분야 개편으로 슬라이드 구성이 바뀌면(계산·해석 폐지 → 마이크로·나노 신설) 새 분야가
 *   물려받은 임시 사진을 제 사진으로 갈아야 한다. CMS 히어로 편집기로도 되지만, R2 에
 *   올려 둔 파일을 코드에서 지정할 때는 이쪽이 확실하다.
 *
 * 무엇을 건드리지 않는가
 *   분야 키·순서·라벨은 손대지 않는다. `image` / `imageMobile` 두 값만 덮어쓴다.
 *   레포와 DB 의 분야 구성이 다르면(순서·개수) 아무것도 하지 않고 알린다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PATH = 'content/hero-slides.json';
const APPLY = process.argv.includes('--apply');

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

const repo = JSON.parse(readFileSync(join(ROOT, PATH), 'utf8'));
const { data: row, error } = await sb
  .from('content_files')
  .select('body, version')
  .eq('path', PATH)
  .maybeSingle();
if (error) { console.error('조회 실패:', error.message); process.exit(1); }
if (!row) { console.error(`${PATH} DB 행이 없다.`); process.exit(1); }

const db = JSON.parse(row.body);
const repoKeys = repo.map((s) => s.field).join(',');
const dbKeys = db.map((s) => s.field).join(',');
if (repoKeys !== dbKeys) {
  console.error('분야 구성이 다르다 — 먼저 migrate-fields-db.mjs 를 돌릴 것.');
  console.error(`  레포: ${repoKeys}\n  DB  : ${dbKeys}`);
  process.exit(1);
}

let changed = 0;
for (const [i, slide] of db.entries()) {
  for (const key of ['image', 'imageMobile']) {
    if (slide[key] === repo[i][key]) continue;
    console.log(`${slide.field} · ${key}`);
    console.log(`   DB   ${slide[key]}`);
    console.log(`   레포 ${repo[i][key]}`);
    slide[key] = repo[i][key];
    changed += 1;
  }
}
// 성공 경로에서는 process.exit 를 부르지 않는다 — supabase-js 가 아직 들고 있는 핸들과
// 겹치면 Windows 에서 libuv assertion 으로 죽으며 종료 코드가 엉뚱해진다(실측).
if (changed === 0) {
  console.log('차이 없음.');
} else if (!APPLY) {
  console.log(`\n${changed}건 차이 — 기록하려면 --apply`);
} else {
  const body = JSON.stringify(db, null, 2) + '\n';
  const { error: writeErr } = await sb
    .from('content_files')
    .update({ body, version: row.version + 1 })
    .eq('path', PATH);
  if (writeErr) {
    console.error('기록 실패:', writeErr.message);
    process.exitCode = 1;
  } else {
    console.log(`\n${changed}건 갱신 · v${row.version} → v${row.version + 1}`);
  }
}
