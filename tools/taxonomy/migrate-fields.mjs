/**
 * 6분야 분류 체계 이관 — 레포의 content/*.json 을 신 체계로 바꾼다.
 *
 *   node tools/taxonomy/migrate-fields.mjs            # 드라이런(기본) — 변경 요약만
 *   node tools/taxonomy/migrate-fields.mjs --apply    # 실제 기록
 *
 * 프로덕션은 콘텐츠 원본이 Supabase 라 이 스크립트만으로는 사이트가 바뀌지 않는다.
 * DB 쪽은 tools/taxonomy/migrate-fields-db.mjs 를 함께 돌린다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateLabs, migrateCourses, migrateHeroSlides } from './transform.mjs';
import { reportChanges } from './report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPLY = process.argv.includes('--apply');

export const TARGETS = [
  { path: 'content/labs-directory.json', run: migrateLabs },
  { path: 'content/courses-graduate.json', run: migrateCourses },
  { path: 'content/courses-undergraduate.json', run: migrateCourses },
  { path: 'content/hero-slides.json', run: migrateHeroSlides },
];

let failed = false;
for (const { path, run } of TARGETS) {
  const file = join(ROOT, path);
  const before = readFileSync(file, 'utf8');
  const { text, changes } = run(before);
  if (reportChanges(path, changes)) failed = true;

  // 줄바꿈 보존 — labs-directory 는 CRLF 로 저장돼 있다. 치환한 줄만 LF 가 되면
  // 한 파일 안에 두 종류가 섞여 다음 편집자의 diff 가 파일 전체로 번진다.
  const crlf = before.includes('\r\n');
  const next = crlf ? text.replace(/\r?\n/g, '\r\n') : text;
  if (APPLY && next !== before) writeFileSync(file, next);
}

console.log(APPLY ? '\n기록 완료.' : '\n드라이런 — 기록하려면 --apply');
if (failed) {
  console.log('⚠️ 매핑이 없는 항목이 있어 그 행은 건드리지 않았다. field-map.mjs 를 보완할 것.');
  process.exitCode = 1;
}
