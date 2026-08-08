/**
 * 수강편람 크롤 JSON(학기별) → 졸업요건 체커용 과목 카탈로그 통합 빌더 (개발 전용)
 *
 *   node tools/checker/build-catalog.mjs [--raw-dir tools/checker/data/raw]
 *                                        [--out-root .] [--help]
 *
 * 하는 일
 *   ① `--raw-dir` 의 `courses-<yyyy>-<smt>.json` 을 학기 시간순으로 읽어 **학정번호(code) 키**로
 *      통합한다. 같은 학기 안의 여러 분반은 1개로 접고, 여러 학기에 걸친 이름 변화는
 *      canonical(최신) + aliases(옛 이름)로 남긴다.
 *   ② 통합 이력 정본을 `tools/checker/data/catalog-history.json` 에 쓴다(과목당 한 줄 — 학기마다
 *      다시 돌렸을 때 diff 가 읽히도록).
 *   ③ 프런트가 받는 `public/data/course-catalog.json` 을 쓴다(기존 `scripts/parse-catalog.mjs`
 *      출력 형식 호환: 압축 JSON 배열, {name, credits, level, aliases?}).
 *   ④ curated 요건 정본(`content/checker-requirements.json`)과 대조해
 *      `tools/checker/reports/rename-report.json` 을 쓰고, **이름이 바뀐 요건 과목이 있으면 exit 1**.
 *
 * ⚠️ 이 빌드의 존재 이유 — needle 전역 유일성
 *    체커 매칭(`src/lib/checker-match.ts`)은 100% 과목명 문자열 기반이다. `exactMatch` 는
 *    "더 긴 매치에 완전히 포함된 짧은 매치"만 지운다(strictly-longer). 즉 **같은 정규화 문자열이
 *    두 항목에 동시에 존재하면 같은 span 에서 둘 다 살아남아 학점이 이중 집계된다.**
 *    클라이언트 병합(`GraduationChecker.tsx`)은 id(=정규화 name)만 dedup 하므로
 *    "curated 별칭 ↔ 크롤 항목 이름" 충돌은 잡지 못한다. 따라서 유일성은 **여기 데이터에서**
 *    강제한다: 크롤 항목의 name·alias 중 curated needle 과 겹치는 것을 전부 걷어낸다.
 *
 * ⚠️ 필드 매핑 (크롤 원본 = 수강편람 API 레코드)
 *    subjtnb        학정번호("MEU3600")            — 통합 키
 *    subjtNm        과목명(부제 포함형)             — `subjtNm2` 는 206건 불일치로 신뢰 금지
 *    subjtSbtlNm    부제("(비대면 영문)"|null)      — subjtNm 의 접미사면 잘라낸다
 *    cdt            학점(0.5 존재)
 *    syy/smtDivCd   학년도/학기, corseDvclsNo 분반
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

// ── 인자 파싱 ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') opt.help = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
  else {
    console.error(`알 수 없는 인자: ${a}`);
    process.exit(1);
  }
}
if (opt.help) {
  console.error(
    `사용법: node tools/checker/build-catalog.mjs \\\n` +
      `         [--raw-dir tools/checker/data/raw]   학기별 courses-<yyyy>-<smt>.json 디렉토리\n` +
      `         [--out-root .]                       세 출력 전부를 이 루트 밑으로 재지정(스모크용)\n` +
      `         [--help]\n\n` +
      `출력\n` +
      `  <out-root>/tools/checker/data/catalog-history.json   통합 이력 정본(과목당 한 줄)\n` +
      `  <out-root>/public/data/course-catalog.json           프런트 카탈로그(압축 JSON)\n` +
      `  <out-root>/tools/checker/reports/rename-report.json  대조 리포트\n\n` +
      `종료 코드: 요건 과목의 이름이 바뀌었는데 별칭이 없으면 1 (모든 출력은 그대로 쓴 뒤 종료)`,
  );
  process.exit(0);
}
const rawDir = resolve(opt['raw-dir'] ?? join(REPO, 'tools/checker/data/raw'));
const outRoot = resolve(opt['out-root'] ?? REPO);
const historyPath = join(outRoot, 'tools/checker/data/catalog-history.json');
const catalogPath = join(outRoot, 'public/data/course-catalog.json');
const reportPath = join(outRoot, 'tools/checker/reports/rename-report.json');

if (!existsSync(rawDir) || !statSync(rawDir).isDirectory()) {
  console.error(`raw 디렉토리가 없다: ${rawDir}`);
  process.exit(1);
}

// ── 기대 학기 (결번 판정용) ────────────────────────────────────
// smtDivCd: 10=1학기, 11=여름, 20=2학기, 21=겨울. 문자열 사전순 = 시간순이라 그대로 정렬한다.
const EXPECTED_TERMS = [
  '2022-10', '2022-11', '2022-20', '2022-21',
  '2023-10', '2023-11', '2023-20', '2023-21',
  '2024-10', '2024-11', '2024-20', '2024-21',
  '2025-10', '2025-11', '2025-20', '2025-21',
  '2026-10', '2026-11', '2026-20',
];

// ── 정규화 (src/lib/checker-match.ts 51-58행과 반드시 동기화) ──
/**
 * 비교용 정규화: 공백/중점/괄호 제거 + 소문자화.
 * 원본은 문자 클래스에 U+00A0·U+200B·U+00B7·U+318D·U+30FB 를 리터럴로 적어 뒀다.
 * (U+00A0 는 `\s` 에 이미 포함되나 원본 그대로 옮긴다.)
 * ⚠️ 이 함수가 checker-match.ts 와 어긋나면 needle 유일성 보증이 통째로 무너진다.
 */
function normalizeName(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\s ​·ㆍ・]/g, '')
    .replace(/[()\[\]{}]/g, '')
    .replace(/[Ⅰ]/g, '1')
    .replace(/[Ⅱ]/g, '2');
}

/** 학정번호(예: LEA3101)에서 단위 추출 — 알파벳 뒤 첫 숫자 × 1000. 실패 시 0. */
function levelFromCode(code) {
  const m = String(code ?? '').match(/[A-Za-z]+(\d)/);
  return m ? Number(m[1]) * 1000 : 0;
}

// ── 교양 휴리스틱 (src/lib/checker.ts 45-66행과 반드시 동기화) ─
/** 교양 과목 학점 — 실측(credits 필드)이 있으면 그 값, 없으면 표준 학점 추정 */
function liberalCredits(row) {
  if (typeof row.credits === 'number') return row.credits;
  if (row.area === '체육과건강') return 1;
  if (row.category === 'RC교육') return 1;
  return 3;
}
/** 에브리타임 표기 대응 별칭 (교양 과목) */
const LIBERAL_ALIASES = {
  '사회참여(SE)': ['사회참여'],
  'YONSEI RC 101': ['YONSEI RC101', 'RC101'],
  '스트레스의과학과적응의삶': ['스트레스의 과학과 적응의 삶'],
};
/** curated 로 승격된 타과 과목 (OCR 오인식 대응 — checker.ts 의 CATALOG_SUPPLEMENT) */
const CATALOG_SUPPLEMENT_NAMES = ['리더십워크숍'];

/**
 * 별도 처리(채플 카운터·사회참여 SE·RC자기주도활동)되는 예약 과목명은 공개 카탈로그에서
 * 제외한다 — 그대로 두면 시간표의 "채플"/"사회참여"가 이중 집계된다.
 * 채플·RC자기주도활동은 `채플(1)`~`(4)` 같은 번호 변형이 있어 **접두사** 기준,
 * '사회참여' 는 **완전일치** — '사회참여적예술' 같은 정당한 교양까지 걷어내지 않기 위해.
 * (긴 이름은 exactMatch 의 포함관계 제거가 curated 별칭 '사회참여'를 정상적으로 이긴다.)
 * ⚠ verify-matching.mjs 의 isReservedName 과 동기화.
 */
const isReservedName = (norm) =>
  norm.startsWith('채플') || norm.startsWith('rc자기주도활동') || norm === '사회참여';

/** 부제 churn(스페셜토픽류) 판정 문턱 — 역대 상이한 정규화 이름이 이 개수 이상이면 별칭 포기 */
const CHURN_THRESHOLD = 4;

// ── ① 학기별 파일 읽기 ────────────────────────────────────────
const files = readdirSync(rawDir)
  .map((f) => ({ file: f, m: /^courses-(\d{4})-(\d{2})\.json$/.exec(f) }))
  .filter((x) => x.m)
  .map((x) => ({ file: x.file, term: `${x.m[1]}-${x.m[2]}` }))
  .sort((a, b) => (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));

if (files.length === 0) {
  console.error(`raw 디렉토리에 courses-<yyyy>-<smt>.json 이 하나도 없다: ${rawDir}`);
  process.exit(1);
}

const stats = {
  rawRecords: 0,
  skippedNoCode: 0,
  skippedNoName: 0,
  termRecordMismatch: 0, // 파일명 학기 ≠ 레코드 syy/smtDivCd
};
const divisionNameConflicts = [];

/** term → Map<code, {name, credits}> */
const perTerm = new Map();

for (const { file, term } of files) {
  const rows = JSON.parse(readFileSync(join(rawDir, file), 'utf-8'));
  if (!Array.isArray(rows)) {
    console.error(`배열이 아니다: ${file}`);
    process.exit(1);
  }
  /** code → Map<name, {count, credits, firstSeen}> */
  const byCode = new Map();
  for (const r of rows) {
    stats.rawRecords++;
    const code = String(r?.subjtnb ?? '').trim();
    if (!code) {
      stats.skippedNoCode++;
      continue;
    }
    const rawName = String(r?.subjtNm ?? '').trim();
    if (!rawName) {
      stats.skippedNoName++;
      continue;
    }
    if (r?.syy && r?.smtDivCd && `${r.syy}-${r.smtDivCd}` !== term) stats.termRecordMismatch++;

    // 부제 strip: subjtSbtlNm 이 비어있지 않고 subjtNm 이 그것으로 끝나면 잘라낸다.
    const sbtl = String(r?.subjtSbtlNm ?? '').trim();
    let name = rawName;
    if (sbtl && name.endsWith(sbtl)) name = name.slice(0, name.length - sbtl.length).trim();
    if (!name) name = rawName; // 부제가 곧 이름 전부인 병리적 경우 원본 유지

    const credits = Number(r?.cdt);
    if (!byCode.has(code)) byCode.set(code, new Map());
    const names = byCode.get(code);
    const cur = names.get(name);
    if (cur) cur.count++;
    else names.set(name, { count: 1, credits: Number.isFinite(credits) ? credits : 0, order: names.size });
  }

  // 같은 학기 내 같은 code 의 여러 분반 → 1개. 이름이 분반 간 다르면 최빈값 채택(동률은 선착순).
  const flat = new Map();
  for (const [code, names] of byCode) {
    const entries = [...names.entries()];
    entries.sort((a, b) => b[1].count - a[1].count || a[1].order - b[1].order);
    const [name, info] = entries[0];
    if (entries.length > 1) {
      divisionNameConflicts.push({
        term,
        code,
        chosen: name,
        variants: entries.map(([n, v]) => ({ name: n, sections: v.count })),
      });
    }
    flat.set(code, { name, credits: info.credits });
  }
  perTerm.set(term, flat);
}

const terms = files.map((f) => f.term);
const missingTerms = EXPECTED_TERMS.filter((t) => !terms.includes(t));

// ── ② 코드 키 통합 (학기 시간순) ──────────────────────────────
/**
 * code → {
 *   name, credits, level, lastOffered,
 *   terms: [term...],
 *   history: [{since, name, credits}...]   // 이름·학점이 바뀐 지점만 (전 학기 재구성 가능)
 *   variants: Map<normalized, {display, term}>  // 역대 이름 변형(표시형 = 그 변형의 최신 원문)
 * }
 */
const courses = new Map();
for (const term of terms) {
  for (const [code, { name, credits }] of perTerm.get(term)) {
    let c = courses.get(code);
    if (!c) {
      c = { code, name, credits, level: levelFromCode(code), lastOffered: term, terms: [], history: [], variants: new Map() };
      courses.set(code, c);
    }
    const prev = c.history[c.history.length - 1];
    if (!prev || prev.name !== name || prev.credits !== credits) c.history.push({ since: term, name, credits });
    c.terms.push(term);
    // canonical 은 **마지막 개설 학기** 기준
    c.name = name;
    c.credits = credits;
    c.lastOffered = term;
    c.variants.set(normalizeName(name), { display: name, term });
  }
}

const churn = [];
for (const c of courses.values()) {
  const canonicalNorm = normalizeName(c.name);
  c.canonicalNorm = canonicalNorm;
  if (c.variants.size >= CHURN_THRESHOLD) {
    // 부제 churn(스페셜토픽류) — 옛 이름 전부가 사실상 다른 강의라 별칭으로 쓸 수 없다.
    c.aliases = [];
    c.churn = true;
    churn.push({
      code: c.code,
      name: c.name,
      distinctNames: c.variants.size,
      variants: [...c.variants.values()].map((v) => v.display),
    });
  } else {
    c.aliases = [...c.variants.entries()]
      .filter(([norm]) => norm !== canonicalNorm)
      .map(([, v]) => v.display);
  }
}

// ── curated needle 집합 ───────────────────────────────────────
const readContent = (name) => JSON.parse(readFileSync(join(REPO, 'content', name), 'utf-8'));
const req = readContent('checker-requirements.json');
const liberal = readContent('liberal-arts.json');

/** normalized needle → [{source, name, code|null}] */
const curatedNeedles = new Map();
/** 코드 대조 게이트 대상: code 를 가진 curated 항목 */
const curatedWithCode = [];

function addCurated(source, name, aliases, code) {
  const all = [name, ...(aliases ?? [])];
  for (const n of all) {
    const norm = normalizeName(n);
    if (!norm) continue;
    if (!curatedNeedles.has(norm)) curatedNeedles.set(norm, []);
    const bucket = curatedNeedles.get(norm);
    // 이름과 별칭이 같은 정규화로 접히는 항목("공학수학(2)"·"공학수학2")이 흔하다 —
    // 같은 curated 항목을 두 번 담으면 리포트가 중복으로 부풀어 오른다.
    if (bucket.some((h) => h.source === source && h.name === name && h.code === (code ?? null))) continue;
    bucket.push({ source, name, code: code ?? null });
  }
  if (code) {
    curatedWithCode.push({
      source,
      code,
      name,
      accepted: new Set(all.map(normalizeName).filter(Boolean)),
    });
  }
}

for (const c of req.engineeringRequired ?? []) addCurated('engineeringRequired', c.name, c.aliases, c.code);
for (const c of req.majorRequiredBase ?? []) addCurated('majorRequiredBase', c.name, c.aliases, c.code);
if (req.majorCreativeDesign) {
  const c = req.majorCreativeDesign;
  addCurated('majorCreativeDesign', c.name, c.aliases, c.code);
}
for (const c of req.majorElectivePool ?? []) addCurated('majorElectivePool', c.name, c.aliases, c.code);
for (const row of liberal)
  addCurated('liberalArts', row.name, [...(row.aliases ?? []), ...(LIBERAL_ALIASES[row.name] ?? [])], row.code);
// LIBERAL_ALIASES 의 값들은 위 루프에서 해당 행이 있을 때만 들어간다 — 행이 없어도 needle 이므로 보강.
for (const [key, vals] of Object.entries(LIBERAL_ALIASES)) {
  for (const v of vals) {
    const norm = normalizeName(v);
    if (!norm || curatedNeedles.has(norm)) continue;
    curatedNeedles.set(norm, [{ source: 'LIBERAL_ALIASES', name: key, code: null }]);
  }
}
for (const n of CATALOG_SUPPLEMENT_NAMES) addCurated('CATALOG_SUPPLEMENT', n, [], null);

// ── ③ 공개 카탈로그 필터 (history 에는 전부 보존) ─────────────
const excluded = []; // 예약 과목명(채플/사회참여/RC자기주도활동)
let excludedZeroCredits = 0;
const zeroCreditCodes = [];

let pool = [];
for (const c of courses.values()) {
  if (isReservedName(c.canonicalNorm)) {
    // 과잉 제외 검토용으로 전량 기록한다(채플(1)~(4) 같은 번호형 대응).
    excluded.push({ code: c.code, name: c.name, lastOffered: c.lastOffered });
    continue;
  }
  if (!(c.credits > 0)) {
    excludedZeroCredits++;
    zeroCreditCodes.push(c.code);
    continue;
  }
  pool.push(c);
}

// ── ④ needle 전역 유일성 강제 ─────────────────────────────────
const codeChangeCandidates = [];
let excludedCuratedOverlap = 0;
const curatedOverlapList = [];

// (a) 크롤 canonical 이 curated needle 이면 항목 자체를 버린다 — curated 가 대표다.
pool = pool.filter((c) => {
  const hits = curatedNeedles.get(c.canonicalNorm);
  if (!hits) return true;
  excludedCuratedOverlap++;
  curatedOverlapList.push({ code: c.code, name: c.name, curated: hits.map((h) => `${h.source}:${h.name}`) });
  for (const h of hits) {
    // curated 쪽 code 가 없거나 다르면 개번(MEU2001→MEU2900)·후보 채움(확률통계) 신호다.
    if (h.code !== c.code) {
      codeChangeCandidates.push({
        curatedName: h.name,
        curatedSource: h.source,
        curatedCode: h.code,
        // curated code 가 지금도 개설 중이면 개번이 아니라 **동명이과**일 가능성이 크다
        // (예: 전공 유체역학 MEU2640 이 살아 있는데 대기과학 ATM4102 도 "유체역학").
        // 사람이 리포트를 훑을 때 잡음을 먼저 걷어낼 수 있게 표시해 둔다.
        curatedCodeOffered: h.code ? courses.has(h.code) : null,
        crawlCode: c.code,
        crawlName: c.name,
        lastOffered: c.lastOffered,
      });
    }
  }
  return false;
});

const aliasDrops = { ownCanonical: 0, curated: 0, outputCanonical: 0, collision: 0 };

// (b) 자기 canonical 과 같은 별칭 / curated needle 인 별칭 제거
for (const c of pool) {
  const kept = [];
  const seen = new Set();
  for (const a of c.aliases) {
    const norm = normalizeName(a);
    if (!norm || seen.has(norm)) continue;
    if (norm === c.canonicalNorm) {
      aliasDrops.ownCanonical++;
      continue;
    }
    if (curatedNeedles.has(norm)) {
      aliasDrops.curated++;
      continue;
    }
    seen.add(norm);
    kept.push(a);
  }
  c.aliases = kept;
}

// (c) 출력 항목 간 canonical 충돌 — level 높은 쪽 > lastOffered 최신 쪽 > code 사전순
//     (기존 scripts/parse-catalog.mjs 57-69행 관례 승계: 이름당 1개만 남긴다)
const canonicalCollisions = [];
const byCanonical = new Map();
for (const c of pool) {
  const prev = byCanonical.get(c.canonicalNorm);
  if (!prev) {
    byCanonical.set(c.canonicalNorm, c);
    continue;
  }
  const win =
    c.level !== prev.level
      ? c.level > prev.level
      : c.lastOffered !== prev.lastOffered
        ? c.lastOffered > prev.lastOffered
        : c.code < prev.code;
  const [keep, drop] = win ? [c, prev] : [prev, c];
  byCanonical.set(c.canonicalNorm, keep);
  canonicalCollisions.push({
    name: keep.name,
    normalized: c.canonicalNorm,
    kept: { code: keep.code, level: keep.level, lastOffered: keep.lastOffered },
    dropped: { code: drop.code, name: drop.name, level: drop.level, lastOffered: drop.lastOffered },
  });
}
const excludedCanonicalCollision = pool.length - byCanonical.size;
pool = [...byCanonical.values()];

// (d) 다른 출력 항목의 canonical 과 같은 별칭 제거
const outputCanonicals = new Set(pool.map((c) => c.canonicalNorm));
for (const c of pool) {
  const kept = c.aliases.filter((a) => {
    if (outputCanonicals.has(normalizeName(a))) {
      aliasDrops.outputCanonical++;
      return false;
    }
    return true;
  });
  c.aliases = kept;
}

// (e) 별칭끼리 충돌(서로 다른 코드가 같은 옛 이름을 주장) → 모호한 옛 이름이므로 양쪽 다 제거
const aliasOwners = new Map();
for (const c of pool) for (const a of c.aliases) {
  const norm = normalizeName(a);
  if (!aliasOwners.has(norm)) aliasOwners.set(norm, []);
  aliasOwners.get(norm).push(c);
}
const aliasCollisions = [];
const ambiguousAliases = new Set();
for (const [norm, owners] of aliasOwners) {
  if (owners.length < 2) continue;
  ambiguousAliases.add(norm);
  aliasCollisions.push({
    normalized: norm,
    claimants: owners.map((c) => ({ code: c.code, name: c.name, lastOffered: c.lastOffered })),
  });
}
for (const c of pool) {
  const kept = c.aliases.filter((a) => {
    if (ambiguousAliases.has(normalizeName(a))) {
      aliasDrops.collision++;
      return false;
    }
    return true;
  });
  c.aliases = kept;
}

// ── ⑤ curated code 대조 게이트 ────────────────────────────────
const curatedNotOffered = [];
const curatedRenameRequired = [];
for (const cur of curatedWithCode) {
  const hit = courses.get(cur.code); // 공개 필터 이전의 통합 전체와 대조한다
  if (!hit) {
    // 폐강·미개설 pool 항목은 정상이다(정보성).
    curatedNotOffered.push({ code: cur.code, curatedName: cur.name, source: cur.source });
    continue;
  }
  if (!cur.accepted.has(normalizeName(hit.name))) {
    curatedRenameRequired.push({
      code: cur.code,
      curatedName: cur.name,
      curatedSource: cur.source,
      crawlLatestName: hit.name,
      lastOffered: hit.lastOffered,
    });
  }
}

// ── ⑥ 교양 학점 실측 대조 ────────────────────────────────────
const liberalCreditsDiff = [];
let liberalCodeNotFound = 0;
for (const row of liberal) {
  const hit = courses.get(row.code);
  if (!hit) {
    liberalCodeNotFound++;
    continue;
  }
  const heuristic = liberalCredits(row);
  if (hit.credits !== heuristic) {
    liberalCreditsDiff.push({
      name: row.name,
      code: row.code,
      heuristic,
      actual: hit.credits,
      lastOffered: hit.lastOffered,
    });
  }
}

// ── 출력 ① 통합 이력 정본 (과목당 한 줄) ─────────────────────
mkdirSync(dirname(historyPath), { recursive: true });
const historyLines = [
  '{',
  `  "terms": ${JSON.stringify(terms)},`,
  `  "missingTerms": ${JSON.stringify(missingTerms)},`,
  '  "courses": {',
];
const sortedCodes = [...courses.keys()].sort();
sortedCodes.forEach((code, i) => {
  const c = courses.get(code);
  const rec = {
    name: c.name,
    credits: c.credits,
    level: c.level,
    lastOffered: c.lastOffered,
    aliases: c.aliases,
    ...(c.churn ? { churn: true } : {}),
    terms: c.terms,
    // history: 이름·학점이 바뀐 지점만 기록한다(terms 와 합치면 전 학기 재구성 가능).
    history: c.history,
  };
  historyLines.push(`    ${JSON.stringify(code)}: ${JSON.stringify(rec)}${i < sortedCodes.length - 1 ? ',' : ''}`);
});
historyLines.push('  }', '}');
const historyText = historyLines.join('\n') + '\n';
const historyBytes = Buffer.byteLength(historyText, 'utf-8');
let historyWritten = historyPath;
if (historyBytes > 5 * 1024 * 1024) {
  historyWritten = historyPath + '.gz';
  writeFileSync(historyWritten, gzipSync(Buffer.from(historyText, 'utf-8')));
} else {
  writeFileSync(historyPath, historyText, 'utf-8');
}

// ── 출력 ② 프런트 카탈로그 ───────────────────────────────────
// 이름 정렬(코드포인트 — 로케일 의존 없이 재현 가능). 형식은 parse-catalog.mjs 출력과 호환.
mkdirSync(dirname(catalogPath), { recursive: true });
const catalog = pool
  .slice()
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.code < b.code ? -1 : 1))
  .map((c) => ({
    name: c.name,
    credits: c.credits,
    level: c.level,
    ...(c.aliases.length ? { aliases: c.aliases } : {}),
  }));
writeFileSync(catalogPath, JSON.stringify(catalog) + '\n', 'utf-8');
const aliasCount = catalog.reduce((n, c) => n + (c.aliases?.length ?? 0), 0);

// ── 출력 ③ 리포트 ────────────────────────────────────────────
const gatePass = curatedRenameRequired.length === 0;
const report = {
  generatedAt: new Date().toISOString(),
  rawDir,
  outRoot,
  coverage: { present: terms, missing: missingTerms },
  summary: {
    rawRecords: stats.rawRecords,
    skippedNoCode: stats.skippedNoCode,
    skippedNoName: stats.skippedNoName,
    termRecordMismatch: stats.termRecordMismatch,
    divisionNameConflicts: divisionNameConflicts.length,
    integratedCourses: courses.size,
    churn: churn.length,
    excludedReservedNames: excluded.length,
    excludedZeroCredits,
    excludedCuratedOverlap,
    excludedCanonicalCollision,
    outputCourses: catalog.length,
    outputAliases: aliasCount,
    aliasesDropped: aliasDrops,
    aliasCollisions: aliasCollisions.length,
    codeChangeCandidates: codeChangeCandidates.length,
    curatedWithCode: curatedWithCode.length,
    curatedNotOffered: curatedNotOffered.length,
    curatedRenameRequired: curatedRenameRequired.length,
    liberalRows: liberal.length,
    liberalCodeNotFound,
    liberalCreditsDiff: liberalCreditsDiff.length,
    gate: gatePass ? 'pass' : 'fail',
  },
  curatedRenameRequired,
  curatedNotOffered,
  codeChangeCandidates,
  churn,
  excluded,
  zeroCreditCodes,
  canonicalCollisions,
  aliasCollisions,
  curatedOverlap: curatedOverlapList,
  divisionNameConflicts,
  liberalCreditsDiff,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

// ── 콘솔 요약 ────────────────────────────────────────────────
console.log(`raw 디렉토리: ${rawDir}`);
console.log(`커버리지: ${terms.length}/${EXPECTED_TERMS.length} 학기 — 수집 ${terms.join(', ')}`);
if (missingTerms.length) console.log(`  결번 학기: ${missingTerms.join(', ')}`);
console.log(
  `레코드 ${stats.rawRecords}건 → 통합 과목 ${courses.size}개` +
    (stats.skippedNoCode || stats.skippedNoName
      ? ` (skip: 학정번호 없음 ${stats.skippedNoCode} · 과목명 없음 ${stats.skippedNoName})`
      : ''),
);
if (divisionNameConflicts.length) console.log(`  분반 간 이름 불일치: ${divisionNameConflicts.length}건 (최빈값 채택)`);
if (stats.termRecordMismatch) console.log(`  ⚠️ 파일명 학기와 레코드 학기가 다른 행: ${stats.termRecordMismatch}건`);
console.log(
  `제외: 예약 과목명 ${excluded.length} · 0학점 ${excludedZeroCredits} · ` +
    `curated 중복 ${excludedCuratedOverlap} · 이름 충돌 ${excludedCanonicalCollision}`,
);
console.log(
  `별칭: 출력 ${aliasCount}개 (버림 — 자기이름 ${aliasDrops.ownCanonical} · curated ${aliasDrops.curated} · ` +
    `타항목이름 ${aliasDrops.outputCanonical} · 별칭충돌 ${aliasDrops.collision}) · churn 과목 ${churn.length}개`,
);
console.log(`공개 카탈로그: ${catalog.length}개 과목 → ${catalogPath}`);
console.log(
  `  (${(Buffer.byteLength(JSON.stringify(catalog), 'utf-8') / 1024).toFixed(0)} KB)`,
);
if (historyWritten.endsWith('.gz')) {
  console.log(`이력 정본이 5MB 를 넘어 gzip 으로 썼다: ${historyWritten} (원본 ${(historyBytes / 1048576).toFixed(1)} MB)`);
} else {
  console.log(`이력 정본: ${historyWritten} (${(historyBytes / 1024).toFixed(0)} KB)`);
}
console.log(`리포트: ${reportPath}`);
console.log(
  `curated 대조: code 보유 ${curatedWithCode.length}개 — 미개설 ${curatedNotOffered.length} · ` +
    `개번 후보 ${codeChangeCandidates.length} · 교양 학점 불일치 ${liberalCreditsDiff.length}` +
    (liberalCodeNotFound ? ` (교양 코드 미발견 ${liberalCodeNotFound}행)` : ''),
);

if (!gatePass) {
  console.error(`\n❌ 게이트 실패: 요건 과목 ${curatedRenameRequired.length}개의 이름이 바뀌었는데 별칭이 없다.`);
  for (const r of curatedRenameRequired.slice(0, 20)) {
    console.error(`   ${r.code}  "${r.curatedName}" → "${r.crawlLatestName}"  (${r.lastOffered}, ${r.curatedSource})`);
  }
  if (curatedRenameRequired.length > 20) console.error(`   … 외 ${curatedRenameRequired.length - 20}건 (리포트 참고)`);
  console.error(`   content/checker-requirements.json 의 aliases 에 옛 이름을 추가한 뒤 다시 돌려라.`);
  process.exit(1);
}
console.log('\n✅ 게이트 통과 — 요건 과목 이름이 전부 일치한다.');
