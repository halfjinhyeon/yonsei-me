// Supabase content_files → 로컬 콘텐츠 파일 되돌리기 스크립트 (migrate-content.mjs 의 역방향).
//
// 실행:
//   node scripts/export-content.mjs                  # 드라이런 — 무엇이 바뀌는지만 출력
//   node scripts/export-content.mjs --write          # 실제로 로컬 파일에 기록
//   node scripts/export-content.mjs --write --force  # 미커밋 변경이 있는 파일까지 덮어쓴다
//   node scripts/export-content.mjs --only=club-     # 경로에 문자열이 포함된 대상만
//
// ■ 왜 필요한가
//   CMS(관리자 콘솔)가 쓰는 곳은 이제 DB 다. 관리자가 편집한 내용은 content_files 에만
//   쌓이고 저장소의 content/*.json 은 빌드 폴백 스냅샷으로 남는다. 그대로 두면 편집 이력이
//   Git 에 한 줄도 남지 않는다. **CMS 편집분을 Git 이력에 남기려면 이 스크립트로 내려받은 뒤
//   사람이 직접 커밋한다** — 스크립트는 파일만 쓰고 절대 커밋하지 않는다.
//   (운용 절차: `node scripts/export-content.mjs` → 차이 확인 → `--write` → `git add <파일>` → 커밋)
//
// ■ 왜 드라이런이 기본인가
//   이 스크립트의 동작은 로컬 파일 덮어쓰기, 즉 되돌릴 수 없는 파괴적 동작이다. 파괴적
//   동작의 기본값은 안전한 쪽이어야 하므로 아무 플래그가 없으면 읽기만 한다.
//
// ■ 왜 미커밋 보호가 필요한가
//   이 저장소의 작업 트리에는 다른 세션의 커밋 금지 WIP 가 상시 섞여 있다
//   (content/board.json, content/labs-directory.json, content/pages/club-*.md 등).
//   그중 일부는 이 스크립트의 관리 대상이라, 아무 확인 없이 덮으면 남의 미커밋 작업이
//   소실된다. 그래서 `git status --porcelain` 으로 수정 여부를 먼저 보고 수정된 파일은
//   건너뛴다. --force 는 그 사실을 아는 사람이 명시적으로 켤 때만 쓴다.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

// ── .env.local 로더 (scripts/migrate-content.mjs 와 동일) ──
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 (.env.local 확인).');
  process.exit(1);
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── 플래그 ──
const args = process.argv.slice(2);
const doWrite = args.includes('--write');
const force = args.includes('--force');
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? '';

// ── 미커밋 여부 판정 ──
// git status --porcelain 을 대상 경로에만 걸어 한 번에 조회한다(-z 라서 경로 따옴표 처리 불필요).
// 반환값이 null 이면 "판정 불가" — 그 경우 안전한 쪽으로, 전부 건너뛴다.
function collectDirty(paths) {
  const r = spawnSync('git', ['status', '--porcelain', '-z', '--untracked-files=all', '--', ...paths], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) return null;
  const records = r.stdout.toString('utf8').split('\0').filter((s) => s !== '');
  const dirty = new Set();
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    const xy = rec.slice(0, 2);
    dirty.add(rec.slice(3));
    // rename/copy 는 새 경로 레코드 뒤에 원본 경로 레코드가 하나 더 붙는다
    if (xy[0] === 'R' || xy[0] === 'C') {
      i += 1;
      if (records[i] !== undefined) dirty.add(records[i]);
    }
  }
  return dirty;
}

// 경로 안전장치 — DB 행의 path 를 그대로 파일 경로로 쓰기 때문에, content/ 밖이나
// 상위 참조가 섞인 경로는 기록하지 않는다(관리 대상은 전부 content/ 아래다).
function isSafePath(path) {
  return path.startsWith('content/') && !path.split('/').includes('..');
}

// ── DB 전 행 조회 ──
const { data, error } = await sb.from('content_files').select('path, body, version, updated_at').order('path');
if (error) {
  console.error('content_files 조회 실패:', error.message);
  process.exit(1);
}
const allRows = data ?? [];
const rows = only ? allRows.filter((r) => r.path.includes(only)) : allRows;

console.log(
  `모드: ${doWrite ? (force ? '기록(--write --force)' : '기록(--write)') : '드라이런 — 아무것도 쓰지 않습니다'}` +
    ` · DB ${allRows.length}행` +
    (only ? ` · --only=${only} 로 ${rows.length}행 선택` : ''),
);
if (rows.length === 0) {
  console.log('대상이 없습니다.');
  process.exit(0);
}

const dirty = collectDirty(rows.map((r) => r.path));
if (dirty === null) {
  console.warn('  ⚠ git status 를 실행할 수 없어 미커밋 여부를 판정하지 못했습니다 — 모든 기록을 건너뜁니다.');
}

// ── 상태 분류 + (선택적) 기록 ──
let same = 0;
let changed = 0;
let added = 0;
let skipped = 0;
let written = 0;
let unsafe = 0;

for (const row of rows) {
  const { path, body, version } = row;
  const dbBuf = Buffer.from(body, 'utf8');
  const exists = existsSync(path);
  const localBuf = exists ? readFileSync(path) : null;
  const identical = exists && Buffer.compare(localBuf, dbBuf) === 0;

  if (identical) {
    console.log(`  = 동일     ${path} (v${version}, ${dbBuf.length}B)`);
    same += 1;
    continue;
  }

  if (exists) {
    const delta = dbBuf.length - localBuf.length;
    const sign = delta >= 0 ? `+${delta}` : `${delta}`;
    console.log(
      `  ~ 변경     ${path} (v${version}, DB ${dbBuf.length}B / 로컬 ${localBuf.length}B, ${sign}B)`,
    );
    changed += 1;
  } else {
    console.log(`  + 신규     ${path} (v${version}, DB ${dbBuf.length}B — 로컬에 파일 없음)`);
    added += 1;
  }

  // 기록 대상만 안전 검사 → 미커밋 보호 → 실제 기록
  if (!isSafePath(path)) {
    console.log('            ⚠ content/ 밖이거나 상위 참조가 섞인 경로라 기록하지 않습니다.');
    unsafe += 1;
    continue;
  }
  const isDirty = dirty === null || dirty.has(path);
  if (isDirty && !force) {
    console.log(
      '            · 건너뜀(미커밋): 로컬에 커밋되지 않은 변경이 있습니다 — 다른 세션의 WIP 일 수 있어' +
        ' 덮어쓰지 않습니다. 확인 후 덮어쓰려면 --force',
    );
    skipped += 1;
    continue;
  }
  if (!doWrite) continue;
  if (isDirty && force) console.log('            ! --force: 미커밋 변경을 덮어씁니다.');
  mkdirSync(dirname(path), { recursive: true });
  // 가공 없이 원문 그대로 — 개행 추가·JSON 재직렬화 금지(바이트 보존이 이 설계의 전제다)
  writeFileSync(path, dbBuf);
  console.log('            → 기록함');
  written += 1;
}

// ── 요약 ──
console.log(
  `\n요약: 동일 ${same} · 변경 ${changed} · 신규 ${added} · 건너뜀(미커밋) ${skipped}` +
    (unsafe > 0 ? ` · 경로 거부 ${unsafe}` : ''),
);
console.log('(건너뜀은 변경·신규 중 로컬에 미커밋 수정이 있어 보호된 건수입니다.)');

if (doWrite) {
  console.log(`기록: ${written}개 파일. 커밋은 사람이 합니다 — git status 로 확인 후 필요한 파일만 스테이징하세요.`);
} else if (changed + added - skipped > 0) {
  console.log(`드라이런입니다. 실제로 내리려면 --write 를 붙여 다시 실행하세요.`);
} else if (changed + added > 0) {
  console.log('기록할 대상이 전부 미커밋 보호에 걸렸습니다. 로컬 변경을 정리하거나 --force 를 검토하세요.');
} else {
  console.log('DB 와 로컬이 같습니다 — 내릴 것이 없습니다.');
}
