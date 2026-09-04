/**
 * 교수 보강표 자동 축적기 (개발 전용 · 학기마다 1회 — 오케스트레이터 ⑤-b 가 부른다)
 *
 *   node tools/mileage/build-professor-history.mjs --scope curated|all
 *        [--terms 2026-20[,2026-10]] [--out <csv>] [--write] [--help]
 *
 *   · 기본은 **아무 파일도 건드리지 않고** 요약만 찍는다(추가 예정 행 수·과목 수·기존 키 수·충돌).
 *   · `--out` 이 있으면 그 경로에 합본 CSV 를 쓰고 원본은 그대로 둔다(측정·검토용).
 *   · `--write` 가 있어야 원본 tools/mileage/professor-history.csv 를 갱신한다.
 *   · `--terms` 를 주면 그 학기만 훑는다(오케스트레이터가 매 학기 쓰는 모드). 생략하면
 *     raw 에 있는 정규학기 전부.
 *
 * 왜 필요한가
 *   professor-history.csv 가 수기인 근본 원인은 **과거 학기 라인업을 크롤 시점에 기록하지
 *   않았기 때문**이다. 마일리지 DB 의 courses 테이블에는 학기 구분이 없어 "현재 학기" 담당만
 *   남는다. 그런데 체커 파이프라인이 받아 둔 수강편람 raw
 *   (tools/checker/data/raw/courses-<년>-<학기>.json)에는 **그 학기의** 담당 교수 `cgprfNm`
 *   이 들어 있다. 즉 2022-1 이후는 사람이 적을 필요가 없다 — 여기서 재구성한다.
 *   (마일리지 이력은 2015-2 부터지만 raw 는 2022-10 부터다. 그 이전은 여전히 수기 몫이다.)
 *
 * 교수 이름은 **크롤 원본 cgprfNm 을 한 글자도 고치지 않고** 싣는다.
 *   근거: build-db.mjs 가 `courses.professor = str(c.cgprfNm)` 로 그대로 싣고(235행),
 *   precompute·backtest 의 `profAt()` 는 보강표에 없으면 그 courses.professor 로 폴백하며,
 *   predict.ts 는 교수를 `lineupLabel()`·`${code}|${professor}` 키로 **문자열 동일 비교**한다.
 *   실측(2026-20 raw ↔ DB courses 3,151행 전수 비교)에서 두 값은 공동 담당 132건을 포함해
 *   전부 바이트 단위로 같았다. 그러니 공동 담당 `"주원구,김보경"` 을 첫 사람만 남기고 자르면
 *   같은 분반이 학기마다 다른 라인업으로 보여 **없던 교체가 생긴다**.
 *
 * ⚠️ 함정
 *   · CSV 인데 교수 이름에 쉼표가 들어간다 — 읽는 쪽(precompute·backtest 의
 *     loadProfessorHistory)은 앞 4칸만 필드로 끊고 나머지 전부를 이름으로 본다. 이 규약을
 *     깨는 파서를 새로 만들지 마라.
 *   · 계절학기(11·21)는 마일리지 제도 밖이라 넣지 않는다.
 *   · 분반 '00' 은 실습 분반 표기 등 비정상 레코드다(build-db 와 같은 방어).
 *   · **사람이 적은 행이 항상 이긴다.** 같은 키를 raw 값으로 덮지 않고, 값이 다르면
 *     충돌로 세어 목록만 찍는다(수기 오류이거나 크롤 표기 차이 — 판단은 사람 몫).
 *   · 보강표에 **과목이 등재되기만 해도** profAt() 의 폴백이 꺼진다(등재 과목의 미기재
 *     학기는 현재 교수로 메우지 않고 미상 ''). 그래서 `--scope all` 은 단순한 정보 추가가
 *     아니라 **모델 입력을 바꾼다** — 채택 전에 백테스트로 재라.
 *
 * 정본 문서: tools/mileage/README.md · tools/automation-phase3.md 2절 P3-1
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CSV_PATH = join(HERE, 'professor-history.csv');
const RAW_DIR = join(REPO, 'tools/checker/data/raw');

/** 정규학기만 — 11(여름)·21(겨울)은 마일리지 제도 밖이다 */
const REGULAR = new Set(['10', '20']);
/** 자동 축적 블록의 시작을 알리는 표식(재실행 시 이 아래를 통째로 다시 만든다) */
const AUTO_MARK = '# ── 자동 축적 (build-professor-history.mjs';

const USAGE = `사용법: node tools/mileage/build-professor-history.mjs --scope curated|all
                 [--terms 2026-20[,2026-10]] [--out <csv>] [--write]

  --scope curated   기존 표에 이미 등장하는 과목 코드만 (기본)
  --scope all       raw 에 있는 전 과목 (모델 입력이 바뀐다 — 백테스트 필수)
  --terms <목록>    쉼표로 구분한 학기(예: 2026-20). 생략하면 raw 의 정규학기 전부
  --out <경로>      합본 CSV 를 그 경로에 쓴다 (원본은 그대로)
  --write           원본 professor-history.csv 를 갱신한다
  --help            이 도움말`;

// ── 인자 ───────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = { scope: 'curated', terms: null, out: null, write: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const eq = a.indexOf('=');
  const [flag, inline] = eq > 2 && a.startsWith('--') ? [a.slice(0, eq), a.slice(eq + 1)] : [a, null];
  const value = () => inline ?? argv[++i];
  if (flag === '--help' || flag === '-h') {
    console.log(USAGE);
    process.exit(0);
  } else if (flag === '--scope') opt.scope = value();
  else if (flag === '--terms') opt.terms = value();
  else if (flag === '--out') opt.out = value();
  else if (flag === '--write') opt.write = true;
  else {
    console.error(`알 수 없는 인자: ${a}\n`);
    console.error(USAGE);
    process.exit(1);
  }
}
if (opt.scope !== 'curated' && opt.scope !== 'all') {
  console.error(`--scope 는 curated 또는 all 이다: ${opt.scope}`);
  process.exit(1);
}

const rel = (p) => {
  const r = p.startsWith(REPO) ? p.slice(REPO.length + 1) : p;
  return r.replaceAll('\\', '/');
};

// ── 기존 CSV 해체 ──────────────────────────────────────────────
/**
 * 파일을 세 덩이로 가른다.
 *   head   머리말 주석 + `year,...` 헤더 (그대로 보존)
 *   human  자동 축적 표식 **앞**의 데이터 행 = 사람이 적은 것 (항상 우선)
 *   auto   표식 **뒤**의 데이터 행 = 지난 실행이 만든 것 (다시 만든다)
 * 표식이 없으면 전부 human 이다 — 첫 실행에서 수기 116행이 그대로 살아남는다.
 */
function splitCsv(path) {
  const head = [];
  const human = new Map(); // key -> {year, semester, code, division, professor, text}
  const auto = new Map();
  if (!existsSync(path)) return { head, human, auto, seenHeader: false };
  let inAuto = false;
  let seenHeader = false;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith(AUTO_MARK)) {
      inAuto = true;
      continue;
    }
    if (!t) continue;
    if (t.startsWith('#')) {
      if (!inAuto) head.push(line.replace(/\s+$/, ''));
      continue; // 자동 블록 안의 주석은 매번 새로 쓴다
    }
    if (t.startsWith('year,')) {
      if (!seenHeader) head.push(t);
      seenHeader = true;
      continue;
    }
    const row = parseRow(t);
    if (!row) continue;
    (inAuto ? auto : human).set(row.key, row);
  }
  return { head, human, auto, seenHeader };
}

/** 읽는 쪽(loadProfessorHistory)과 **같은 규약**: 앞 4칸만 필드, 나머지 전부가 교수 이름 */
function parseRow(text) {
  const cells = text.split(',');
  const [year, semester, code, division] = cells.slice(0, 4).map((x) => (x ?? '').trim());
  const professor = cells.slice(4).join(',').trim();
  if (!year || !semester || !code || !division || !professor) return null;
  const div = division.padStart(2, '0');
  // text 는 원문 그대로 — 사람이 적은 행은 재직렬화하지 않고 이 문자열로 다시 쓴다.
  return { year, semester, code, division: div, professor, text, key: `${code}|${div}|${year}|${semester}` };
}

const { head, human, auto: prevAuto, seenHeader } = splitCsv(CSV_PATH);

// ── raw 학기 목록 ──────────────────────────────────────────────
/** raw 디렉터리에서 정규학기 파일만 골라 시간순으로 (year, semester) 를 돌려준다 */
function rawTerms() {
  if (!existsSync(RAW_DIR)) {
    console.error(`수강편람 raw 디렉터리가 없다: ${rel(RAW_DIR)}`);
    console.error('  → tools/checker/README.md 의 크롤 절차를 먼저 돌려라.');
    process.exit(1);
  }
  const out = [];
  for (const f of readdirSync(RAW_DIR)) {
    const m = /^courses-(\d{4})-(\d{2})\.json$/.exec(f);
    if (!m || !REGULAR.has(m[2])) continue;
    out.push({ year: m[1], semester: m[2], file: join(RAW_DIR, f) });
  }
  return out.sort((a, b) => `${a.year}${a.semester}`.localeCompare(`${b.year}${b.semester}`));
}

let terms = rawTerms();
if (opt.terms) {
  const want = new Set(opt.terms.split(',').map((s) => s.trim()).filter(Boolean));
  const bad = [...want].filter((t) => !/^\d{4}-\d{2}$/.test(t));
  if (bad.length) {
    console.error(`--terms 형식이 잘못됐다: ${bad.join(', ')} (예: 2026-20)`);
    process.exit(1);
  }
  const seasonal = [...want].filter((t) => !REGULAR.has(t.slice(5)));
  terms = terms.filter((t) => want.has(`${t.year}-${t.semester}`));
  const missing = [...want].filter(
    (t) => REGULAR.has(t.slice(5)) && !terms.some((x) => `${x.year}-${x.semester}` === t),
  );
  for (const t of seasonal) console.log(`  건너뜀 — ${t} 은 계절학기라 마일리지 제도 밖이다.`);
  for (const t of missing) console.log(`  건너뜀 — ${t} 의 raw 파일이 없다 (${rel(RAW_DIR)}).`);
}

// ── raw → 행 ──────────────────────────────────────────────────
const curatedCodes = new Set([...human.keys(), ...prevAuto.keys()].map((k) => k.split('|')[0]));

/** 이번에 훑어 만든 (키 → 행). 뒤 학기가 앞 학기를 덮을 일은 없다(키에 학기가 들어간다). */
const fromRaw = new Map();
let scanned = 0;
let skippedScope = 0;
let skippedShape = 0;
for (const t of terms) {
  const arr = JSON.parse(readFileSync(t.file, 'utf8'));
  for (const c of arr) {
    scanned++;
    const code = String(c.subjtnb ?? '').trim();
    const division = String(c.corseDvclsNo ?? '').trim().padStart(2, '0');
    // ⚠️ cgprfNm 은 손대지 않는다 — courses.professor 와 문자열이 같아야 매칭된다(머리말).
    const professor = String(c.cgprfNm ?? '').trim();
    if (!code || division === '00' || !professor) {
      skippedShape++;
      continue;
    }
    if (opt.scope === 'curated' && !curatedCodes.has(code)) {
      skippedScope++;
      continue;
    }
    const key = `${code}|${division}|${t.year}|${t.semester}`;
    const text = `${t.year},${t.semester},${code},${division},${professor}`;
    fromRaw.set(key, { year: t.year, semester: t.semester, code, division, professor, text, key });
  }
}

// ── 병합 ──────────────────────────────────────────────────────
// 규칙: ① 사람이 적은 행이 항상 이긴다 ② 그 밖에는 방금 훑은 raw 가 지난 자동 블록을 덮는다.
const added = [];      // 표에 없던 새 행
const refreshed = [];  // 지난 자동 블록과 값이 달라진 행 (재크롤 반영)
const conflicts = [];  // 사람 행과 값이 다른 raw — 덮지 않고 보고만 한다
let alreadySame = 0;   // 사람 행·자동 행과 값이 같아 손댈 것이 없는 raw

const merged = new Map(prevAuto); // 지난 자동 블록을 바탕으로 시작 (--terms 로 일부만 훑어도 보존)
for (const row of fromRaw.values()) {
  const mine = human.get(row.key);
  if (mine) {
    if (mine.professor !== row.professor) conflicts.push({ key: row.key, human: mine.professor, raw: row.professor });
    else alreadySame++;
    continue; // 사람 행이 이긴다 — 자동 블록에도 넣지 않는다(중복 키 금지)
  }
  const old = merged.get(row.key);
  if (!old) added.push(row);
  else if (old.professor !== row.professor) refreshed.push({ key: row.key, before: old.professor, after: row.professor });
  else alreadySame++;
  merged.set(row.key, row);
}
// 사람이 나중에 손으로 적어 넣은 키가 자동 블록에도 있으면 자동 쪽을 버린다(중복 키 방지).
for (const k of human.keys()) merged.delete(k);

const termOrd = (r) => Number(r.year) * 10 + (r.semester === '10' ? 0 : 1);
const autoRows = [...merged.values()].sort(
  (a, b) => termOrd(a) - termOrd(b) || a.code.localeCompare(b.code) || a.division.localeCompare(b.division),
);

// ── 파일 만들기 ────────────────────────────────────────────────
const today = new Date();
const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const termLabel = terms.length ? `${terms[0].year}-${terms[0].semester} ~ ${terms.at(-1).year}-${terms.at(-1).semester}` : '(없음)';

function render() {
  const out = [...head];
  if (!seenHeader) out.push('year,semester,code,division,professor');
  for (const row of human.values()) out.push(row.text);
  if (autoRows.length) {
    out.push('');
    out.push(`${AUTO_MARK}, ${stamp}) ──`);
    out.push('# 수강편람 raw(tools/checker/data/raw/courses-<년>-<학기>.json)의 cgprfNm 을 그대로 옮긴 것이다.');
    out.push('# 이 아래는 매 실행마다 통째로 다시 만들어진다 — 고칠 것이 있으면 위쪽(사람 구역)에 적어라.');
    out.push('# 같은 (과목·분반·학기)가 위아래에 있으면 위쪽이 이긴다.');
    // 블록 전체가 덮는 학기 범위를 적는다 — 이번 실행이 --terms 로 한 학기만 훑었어도
    // 지난 실행이 쌓아 둔 학기가 그대로 남아 있으므로, 마지막 실행 범위만 적으면 거짓말이 된다.
    const span = `${autoRows[0].year}-${autoRows[0].semester} ~ ${autoRows.at(-1).year}-${autoRows.at(-1).semester}`;
    out.push(`# 범위: --scope ${opt.scope} · 학기 ${span} · 마지막 실행 ${stamp} (${termLabel})`);
    for (const row of autoRows) out.push(row.text);
  }
  return `${out.join('\n')}\n`;
}

// ── 요약 ──────────────────────────────────────────────────────
const addedCodes = new Set(added.map((r) => r.code));
console.log(`\n교수 보강표 자동 축적 — --scope ${opt.scope}`);
console.log(`  훑은 학기 ${terms.length}개 (${termLabel}) · raw 레코드 ${scanned.toLocaleString()}건`);
console.log(`  대상 행 ${fromRaw.size.toLocaleString()}건 (범위 밖 ${skippedScope.toLocaleString()} · 비정상/무기재 ${skippedShape.toLocaleString()} 제외)`);
console.log(`  기존 표: 사람 ${human.size}행 · 지난 자동 ${prevAuto.size}행`);
console.log(`  추가 예정 ${added.length}행 (과목 ${addedCodes.size}개) · 이미 있던 키 ${alreadySame}건 · 자동 갱신 ${refreshed.length}건`);
console.log(`  → 결과 파일은 사람 ${human.size}행 + 자동 ${autoRows.length}행`);

if (refreshed.length) {
  console.log(`\n  재크롤로 값이 바뀐 자동 행 ${refreshed.length}건 (raw 를 정본으로 덮는다):`);
  for (const c of refreshed.slice(0, 20)) console.log(`    ${c.key}  ${c.before} → ${c.after}`);
  if (refreshed.length > 20) console.log(`    … 외 ${refreshed.length - 20}건`);
}

if (conflicts.length) {
  console.log(`\n  ⚠️ 사람 행과 raw 가 다른 키 ${conflicts.length}건 — **덮지 않았다**. 수기 오류이거나 크롤 표기 차이다:`);
  for (const c of conflicts) console.log(`    ${c.key}  사람=${c.human}  raw=${c.raw}`);
} else {
  console.log('\n  사람 행과 raw 가 어긋나는 키: 없음.');
}

// ── 쓰기 ──────────────────────────────────────────────────────
const targets = [];
if (opt.out) targets.push(resolve(opt.out));
if (opt.write) targets.push(CSV_PATH);
if (!targets.length) {
  console.log(`\n  (아무 파일도 쓰지 않았다 — 반영하려면 --write, 사본만 보려면 --out <경로>.)`);
} else {
  const body = render();
  for (const t of targets) {
    writeFileSync(t, body, 'utf8');
    console.log(`\n  기록 → ${rel(t)} (${body.split('\n').length - 1}줄)`);
  }
}
