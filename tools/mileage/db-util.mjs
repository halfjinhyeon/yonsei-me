/**
 * 마일리지 이력 DB 열기 헬퍼 (개발 전용).
 *
 * 저장소에는 **gzip 본만** 둔다(`tools/mileage/data/mileage-history.db.gz`, 약 6MB).
 * 원본 SQLite 는 28MB 가 넘어 매 학기 커밋하면 저장소가 금방 무거워지고, 어차피 gz 하나로
 * 완전 복원되므로 `.db` 는 `data/.gitignore` 로 무시한다. 그래서 스크립트들은 DB 경로가
 * 생략되면 이 순서로 찾는다:
 *
 *   ① tools/mileage/data/mileage-history.db      (있으면 그대로)
 *   ② tools/mileage/data/mileage-history.db.gz   (해제해 ①에 캐시한 뒤 사용)
 *
 * precompute.mjs·backtest.mjs·build-db.mjs 가 공유한다 — 세 곳이 각자 다른 기본 경로를
 * 갖게 되면 "어느 DB로 만든 번들인지" 를 잃는다.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/** 저장소 기준 상대 경로 — 사용법 안내 문구에도 그대로 쓴다 */
export const DEFAULT_DB_PATH = 'tools/mileage/data/mileage-history.db';

/**
 * DB 파일 경로를 확정한다. `.gz` 가 주어지면(또는 기본 경로의 `.gz` 만 있으면) 해제해
 * 나란한 `.db` 로 캐시하고 그 경로를 돌려준다. gz 가 더 새 파일이면 다시 해제한다.
 */
export function resolveDbPath(explicit) {
  const target = explicit ? resolve(explicit) : resolve(REPO, DEFAULT_DB_PATH);
  const plain = target.endsWith('.gz') ? target.slice(0, -3) : target;
  const gz = plain + '.gz';
  const fresh = existsSync(plain) && (!existsSync(gz) || statSync(plain).mtimeMs >= statSync(gz).mtimeMs);
  if (fresh) return plain;
  if (existsSync(gz)) {
    process.stderr.write(`  (gz 해제: ${gz} → ${plain})\n`);
    writeFileSync(plain, gunzipSync(readFileSync(gz)));
    return plain;
  }
  if (existsSync(plain)) return plain;
  throw new Error(
    `마일리지 이력 DB를 찾을 수 없다: ${plain} (또는 ${gz})\n` +
      `  → tools/mileage/README.md 의 갱신 절차 참고. build-db.mjs 로 생성한다.`,
  );
}

/** resolveDbPath + DatabaseSync. `readOnly` 로 원본을 건드리지 않고 열 수 있다. */
export function openHistoryDb(explicit, options = {}) {
  return new DatabaseSync(resolveDbPath(explicit), options);
}
