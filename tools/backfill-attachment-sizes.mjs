// attachments.size_bytes 백필 — 1회성 유지보수 스크립트.
//
// 실행:
//   node tools/backfill-attachment-sizes.mjs            # 기본값 = dry-run (아무것도 쓰지 않음)
//   node tools/backfill-attachment-sizes.mjs --dry-run  # 위와 동일, 의도를 명시할 때
//   node tools/backfill-attachment-sizes.mjs --write    # 실제로 DB 에 기록
//
// 언제 돌리나: attachments 테이블에 size_bytes 컬럼이 생기기 전에 등록된 행은 크기가
// 비어 있다("PDF · 1.2MB" 표기가 그 행만 빠진다). 이 스크립트를 한 번 돌려 채우면 끝이다.
// 그 이후 CMS 로 올리는 첨부는 업로드 시점에 File.size 를 함께 저장하므로 재실행이 필요 없다.
// 레거시 첨부를 대량으로 다시 임포트했을 때만 다시 돌리면 된다.
//
// ⚠️ 크기 판별이 왜 이렇게 복잡한가: 레거시 학과 사이트
//    (me.yonsei.ac.kr/me/community/information.do?mode=download&…) 는 HEAD 요청에
//    403 을 준다. 실측해 보면 같은 URL 의 GET 은 200 + 정확한 content-length 를 준다.
//    그래서 HEAD 를 먼저 시도하되(가벼우므로) content-length 를 못 얻으면 GET 으로
//    폴백하고, GET 도 헤더가 없으면 마지막 수단으로 본문을 받아 바이트를 센다.
//
// 상대 서버 부하를 생각해 순차 처리 + 요청 간 200ms 간격을 둔다.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAP_MS = 200; // 요청 사이 간격
const HTTP_TIMEOUT_MS = 30_000;

// ── .env.local 로더 (이 저장소는 dotenv 의존성이 없다) ────────────────
// 실행 위치가 달라도 되도록 저장소 루트와 현재 작업 디렉터리를 모두 본다.
for (const candidate of [resolve(REPO_ROOT, '.env.local'), resolve(process.cwd(), '.env.local')]) {
  if (!existsSync(candidate)) continue;
  for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    // 따옴표로 감싼 값은 벗겨 준다
    const value = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
  break;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  console.error('저장소 루트의 .env.local 에 두 값을 넣고 다시 실행하세요.');
  process.exit(1);
}

const write = process.argv.includes('--write');
// 기본값을 dry-run 으로 둔다 — 실수로 운영 DB 를 건드리지 않게 하려는 것이다.
if (!write) {
  console.log('※ dry-run 모드입니다. 실제로 기록하려면 --write 를 붙이세요.\n');
}

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 사람이 읽는 크기 표기 */
function human(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * URL 하나의 바이트 크기를 알아낸다. 못 알아내면 null.
 * HEAD → GET(헤더) → GET(본문 계수) 순으로 물러난다.
 */
async function probeSize(url) {
  // 1) HEAD — 성공하면 가장 싸다
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const len = Number(res.headers.get('content-length'));
    if (res.ok && Number.isFinite(len) && len > 0) return { size: len, how: 'HEAD' };
  } catch {
    // 레거시 서버는 HEAD 에 403/연결 종료로 답한다 — 곧바로 GET 으로 넘어간다
  }

  // 2) GET — 레거시 다운로드 엔드포인트는 여기서 정확한 content-length 를 준다
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (err) {
    return { size: null, how: `요청 실패(${err?.message ?? err})` };
  }
  if (!res.ok) return { size: null, how: `HTTP ${res.status}` };

  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > 0) {
    // 본문을 읽지 않고 끊어 트래픽을 아낀다
    try {
      await res.body?.cancel();
    } catch {
      /* 이미 닫혔으면 무시 */
    }
    return { size: len, how: 'GET(header)' };
  }

  // 3) 마지막 수단 — 청크 전송이라 헤더에 길이가 없는 경우. 실제로 받아서 센다.
  try {
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return { size: null, how: '빈 응답' };
    return { size: buf.byteLength, how: 'GET(body)' };
  } catch (err) {
    return { size: null, how: `본문 수신 실패(${err?.message ?? err})` };
  }
}

// ── 대상 조회 ────────────────────────────────────────────────────────
const listUrl =
  `${SUPABASE_URL.replace(/\/$/, '')}` +
  `/rest/v1/attachments?size_bytes=is.null&select=id,url,label_ko&order=id.asc`;

const listRes = await fetch(listUrl, { headers: restHeaders });
if (!listRes.ok) {
  console.error(`attachments 조회 실패: HTTP ${listRes.status} ${await listRes.text()}`);
  process.exit(1);
}
const rows = await listRes.json();

if (rows.length === 0) {
  console.log('size_bytes 가 비어 있는 첨부가 없습니다. 할 일 없음.');
  process.exit(0);
}
console.log(`대상 ${rows.length}건\n`);

// ── 순차 처리 ────────────────────────────────────────────────────────
let done = 0;
let failed = 0;

for (const [i, row] of rows.entries()) {
  const label = row.label_ko || '(라벨 없음)';
  const prefix = `[${i + 1}/${rows.length}] #${row.id} ${label}`;

  if (!/^https?:\/\//i.test(row.url ?? '')) {
    // 상대 경로는 어느 호스트 기준인지 알 수 없다 — 사람이 확인할 몫으로 남긴다
    console.log(`${prefix} — 건너뜀 (http(s) 주소 아님: ${row.url})`);
    failed++;
    continue;
  }

  const { size, how } = await probeSize(row.url);
  if (!size) {
    console.log(`${prefix} — 실패 (${how})`);
    failed++;
    await sleep(GAP_MS);
    continue;
  }

  if (!write) {
    console.log(`${prefix} — ${human(size)} (${how}) [dry-run, 기록 안 함]`);
    done++;
    await sleep(GAP_MS);
    continue;
  }

  // ⚠ 이 PATCH 가 try 밖에 있으면 일시적 연결 리셋(ECONNRESET 등) 한 건에 실행
  //   전체가 죽는다(2026-08-31 실측 — 두 번 연속 중단). 한 번 재시도하고, 그래도
  //   안 되면 그 행만 실패로 세고 계속 간다.
  let patchRes = null;
  for (let attempt = 0; attempt < 2 && !patchRes; attempt++) {
    try {
      patchRes = await fetch(
        `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/attachments?id=eq.${row.id}`,
        {
          method: 'PATCH',
          headers: { ...restHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ size_bytes: size }),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        },
      );
    } catch (err) {
      if (attempt === 0) { await sleep(1000); continue; }
      console.log(`${prefix} — 기록 실패 (요청 오류: ${err?.message ?? err})`);
    }
  }
  if (!patchRes) {
    failed++;
    await sleep(GAP_MS);
    continue;
  }
  if (!patchRes.ok) {
    console.log(`${prefix} — 기록 실패 (HTTP ${patchRes.status} ${await patchRes.text()})`);
    failed++;
  } else {
    console.log(`${prefix} — ${human(size)} (${how}) 기록 완료`);
    done++;
  }
  await sleep(GAP_MS);
}

console.log(`\n완료: 성공 ${done}건, 실패 ${failed}건${write ? '' : ' (dry-run — DB 변경 없음)'}`);
if (!write && done > 0) {
  console.log('실제로 채우려면: node tools/backfill-attachment-sizes.mjs --write');
}
