/**
 * 교수 학술활동 프로필 수집기 — 교원정보시스템에서 받아 **기존 기록에 병합**한다.
 *
 *   node tools/crawl-faculty-profiles.mjs                    # 드라이런 — 신규 행 개수만
 *   node tools/crawl-faculty-profiles.mjs --apply            # 레포 파일에 병합 기록
 *   node tools/crawl-faculty-profiles.mjs --source=db --apply # 프로덕션 DB 에 병합 기록
 *   node tools/crawl-faculty-profiles.mjs --only=강건욱,김대은  # 일부만
 *   node tools/crawl-faculty-profiles.mjs --fail-threshold=0.2 # 전부 실패 비율이 20% 이상이면 exit 2
 *   node tools/crawl-faculty-profiles.mjs --timeout-ms=1       # 요청 타임아웃 강제(실패 경로 재현용)
 *
 * 종료 코드
 *   0 정상 · 1 사용법·환경 오류 · 2 실패 임계 초과(--fail-threshold 를 준 경우에만)
 *
 * 하는 일
 *   ① content/faculty-profiles/*.json 의 `sourceUrl`(암호화 userId)로 대상을 고른다.
 *      프로필이 아직 없는 교수는 faculty-directory 의 moreInfoUrl 로 보완한다.
 *   ② 교수 한 명씩 crawlPerson() 에 넘긴다 — 상세 셸 + 리포트 5종(논문·수상·학술활동·
 *      연구과제·지적재산권) 수집과 병합은 전부 그 안에서 끝난다.
 *   ③ 결과 원문이 달라진 교수만 저장한다.
 *
 * ⚠️ **크롤·파싱·병합 규칙은 여기 없다** — src/lib/faculty-crawl/core.ts 한 곳에 있고,
 *    CMS 의 "실적 불러오기" 버튼(/api/admin/faculty-crawl)도 같은 파일을 쓴다. 규칙이 두
 *    벌로 갈리면 행 키 순서가 어긋나 고치지도 않은 행이 전부 신규로 잡힌다. 이 파일이
 *    맡는 것은 **대상 선별 · 저장처 · 콘솔 출력**뿐이다.
 *    (Node 24 가 .ts 를 그대로 import 한다 — 내장 타입 스트리핑. core.ts 에 의존성이
 *     생기는 순간 이 경로가 깨지므로 그 파일은 순수 모듈로 유지할 것.)
 *
 * ⚠️ 병합인 이유 두 가지
 *   ⓐ 원본 리포트는 분류당 최대 2쪽·200건 하드캡이라, 새 실적이 등록되면 오래된 실적이
 *      창밖으로 밀려난다. 덮어쓰면 우리 쪽 기록까지 같이 사라진다(조형희 학술활동에서 실측).
 *   ⓑ CMS(교수 학술활동 팝업 편집기)에서 손본 행과 AI 연구요약이 지워진다.
 *
 * 언제 도는가
 *   무인 전량 수집은 GitHub Actions 스케줄(.github/workflows/crawl-faculty-profiles.yml)이
 *   맡는다 — 한 바퀴가 몇 분 걸려 서버리스 함수 타임아웃에 맞지 않는다. 담당자가 지금
 *   당장 받아야 할 때는 CMS 교수진 화면의 "실적 불러오기" 버튼을 쓴다(브라우저가 한 명씩
 *   같은 로직을 호출한다).
 *
 * ⚠️ 실패 가시화 (--fail-threshold)
 *   한 명의 요청이 전부 실패해도 이 스크립트는 "전부 실패 — 건너뜀"만 찍고 계속 간다.
 *   원본 마크업 변경·차단(403)·호스트 이전 같은 **구조적 실패**가 나도 워크플로가
 *   초록불이 되던 문제라, 워크플로는 `--fail-threshold=0.2` 를 붙여 부른다. 전부 실패한
 *   교수 비율이 임계 이상이면 요약을 다 찍은 뒤 `::error::` 한 줄과 exit 2 로 끝난다.
 *   부분 실패(분류 일부만 실패)는 세지 않는다 — 병합 전용이라 데이터가 상하지 않고,
 *   원본이 100행 하드캡으로 흔들리는 게 평소 상태다. 플래그가 없으면 동작은 종전과
 *   완전히 같다(CMS·로컬 호출 경로 불변).
 *
 * 의존성: Node 24 내장 fetch. --source=db 일 때만 @supabase/supabase-js 를 쓴다.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTION_KEYS, crawlPerson, serializeProfile } from '../src/lib/faculty-crawl/core.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = join(ROOT, 'content', 'faculty-directory.json');
const OUT_DIR = join(ROOT, 'content', 'faculty-profiles');

// ── 저장소 (레포 파일 / Supabase content_files) ─────────────────
/** 공통 인터페이스: raw(name) → 원문 문자열|null, read(name) → 파싱본|null, write(name, body) */
function openFileStore() {
  const pathOf = (name) => join(OUT_DIR, `${name}.json`);
  const raw = async (name) => {
    try {
      return readFileSync(pathOf(name), 'utf8');
    } catch {
      return null;
    }
  };
  return {
    raw,
    read: async (name) => {
      const t = await raw(name);
      return t ? JSON.parse(t) : null;
    },
    write: async (name, body) => writeFileSync(pathOf(name), body, 'utf8'),
  };
}

async function openDbStore() {
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
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const pathOf = (name) => `content/faculty-profiles/${name}.json`;
  const cache = new Map(); // name → { body, version } | null
  const load = async (name) => {
    if (cache.has(name)) return cache.get(name);
    const { data, error } = await sb
      .from('content_files')
      .select('body, version')
      .eq('path', pathOf(name))
      .maybeSingle();
    if (error) throw new Error(`content_files 조회 실패 (${name}): ${error.message}`);
    cache.set(name, data ?? null);
    return data ?? null;
  };
  return {
    raw: async (name) => (await load(name))?.body ?? null,
    read: async (name) => {
      const row = await load(name);
      return row ? JSON.parse(row.body) : null;
    },
    write: async (name, body) => {
      const row = await load(name);
      const { error } = row
        ? await sb
            .from('content_files')
            .update({ body, version: row.version + 1 })
            .eq('path', pathOf(name))
        : await sb.from('content_files').insert({ path: pathOf(name), body });
      if (error) throw new Error(`content_files 기록 실패 (${name}): ${error.message}`);
      cache.set(name, { body, version: (row?.version ?? 0) + 1 });
    },
  };
}

// ── 대상 선별 ──────────────────────────────────────────────────
// 기준은 **각 프로필 파일의 sourceUrl** 이다(암호화된 userId 가 들어 있다).
// 과거엔 faculty-directory 의 moreInfoUrl 을 썼는데, 레거시 링크 청산(2026-08) 때
// 그 값이 전부 null 이 되면서 대상이 0명이 돼 크롤러가 통째로 멈춰 있었다.
// 프로필이 아직 없는 교수는 디렉터리의 moreInfoUrl 로 보완한다(수동으로 채운 경우).
function listTargets() {
  const seen = new Map(); // 이름 → viewUrl
  let names = [];
  try {
    names = readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    /* 첫 실행 — 디렉터리 없음 */
  }
  for (const file of names) {
    try {
      const p = JSON.parse(readFileSync(join(OUT_DIR, file), 'utf8'));
      if (typeof p.sourceUrl === 'string' && p.sourceUrl.includes('mode=view')) {
        seen.set(file.replace(/\.json$/, ''), p.sourceUrl);
      }
    } catch {
      /* 깨진 파일은 건너뛴다 — 실패 목록에 남길 만한 값이 없다 */
    }
  }
  for (const person of JSON.parse(readFileSync(DIRECTORY, 'utf8'))) {
    if (seen.has(person.name)) continue;
    const url = person.moreInfoUrl;
    if (typeof url === 'string' && url.includes('mode=view')) seen.set(person.name, url);
  }
  return [...seen].map(([name, viewUrl]) => ({ name, viewUrl }));
}

// ── 실행 ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const sourceArg = args.find((a) => a.startsWith('--source='))?.slice('--source='.length) ?? 'file';
if (sourceArg !== 'file' && sourceArg !== 'db') {
  console.error(`알 수 없는 --source 값: ${sourceArg} (file | db)`);
  process.exit(1);
}
const useDb = sourceArg === 'db';
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);

// 전부 실패한 교수 비율의 임계(0~1). 없으면 종전대로 항상 exit 0.
const thresholdArg = args.find((a) => a.startsWith('--fail-threshold='))?.slice('--fail-threshold='.length);
let failThreshold = null;
if (thresholdArg !== undefined) {
  failThreshold = Number(thresholdArg);
  if (!Number.isFinite(failThreshold) || failThreshold < 0 || failThreshold > 1) {
    console.error(`--fail-threshold 는 0~1 사이의 수여야 한다: ${thresholdArg}`);
    process.exit(1);
  }
}

// 요청 타임아웃(ms). 실패 경로를 실제로 재현하는 검증용이다(1이면 전 요청 타임아웃).
const timeoutArg = args.find((a) => a.startsWith('--timeout-ms='))?.slice('--timeout-ms='.length);
let timeoutMs = null;
if (timeoutArg !== undefined) {
  timeoutMs = Number(timeoutArg);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    console.error(`--timeout-ms 는 양수여야 한다: ${timeoutArg}`);
    process.exit(1);
  }
}

const store = useDb ? await openDbStore() : openFileStore();

let targets = listTargets();
if (only) targets = targets.filter((t) => only.includes(t.name));
if (targets.length === 0) {
  console.error('대상 0명 — content/faculty-profiles 가 비었고 디렉터리에도 mode=view 링크가 없다.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const failures = []; // { name, what, reason }
let written = 0;
let totalAdded = 0;
let allFailed = 0; // 요청이 전부 실패해 병합 결과가 없는 교수 수

console.log(
  `대상 ${targets.length}명 · 소스 ${useDb ? 'DB(content_files)' : '레포 파일'} · ` +
    `${APPLY ? '기록' : '드라이런'}\n`,
);

for (const person of targets) {
  const result = await crawlPerson(person, await store.read(person.name), {
    today,
    ...(timeoutMs === null ? {} : { timeoutMs }),
  });
  failures.push(...result.failures);

  if (!result.merged) {
    allFailed += 1;
    console.log(`${person.name} … 전부 실패 — 건너뜀`);
    continue;
  }

  const counts = SECTION_KEYS.map((key) => {
    if (result.missing.includes(key)) return `${key} ✗`;
    const added = result.addedByKey[key] ?? 0;
    return `${key} ${result.totalByKey[key]}${added ? ` (+${added})` : ''}`;
  });
  totalAdded += result.added;

  const body = serializeProfile(result.merged);
  const changed = body !== (await store.raw(person.name));
  if (APPLY && changed) {
    await store.write(person.name, body);
    written += 1;
  }
  console.log(`${person.name} … ${counts.join(' · ')}${changed ? '' : '  (변경 없음)'}`);
}

console.log(
  `\n신규 행 ${totalAdded}건` +
    (APPLY ? ` · ${written}명 저장 → ${useDb ? 'content_files(DB)' : 'content/faculty-profiles/'}` : ' · 드라이런(기록 안 함) — 기록하려면 --apply'),
);
if (failures.length) {
  console.log(`\n실패한 요청 ${failures.length}건:`);
  for (const f of failures) console.log(`  - ${f.name} / ${f.what} : ${f.reason}`);
} else {
  console.log('실패한 요청 없음.');
}

// 임계 판정은 요약을 전부 찍은 뒤에 한다 — 로그(tee crawl.log)에 원인이 남아야 이슈 본문이
// 쓸모 있다. 임계를 안 주면 여기서 아무 일도 하지 않는다(종전 동작).
if (failThreshold !== null) {
  const ratio = allFailed / targets.length;
  const pct = (n) => `${Math.round(n * 100)}%`;
  if (ratio >= failThreshold) {
    console.error(
      `::error::전부 실패 ${allFailed}/${targets.length}명 (${pct(ratio)}) ≥ 임계 ${pct(failThreshold)} — 구조적 실패 의심`,
    );
    process.exit(2);
  }
}
