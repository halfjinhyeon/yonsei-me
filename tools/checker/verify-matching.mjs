#!/usr/bin/env node
/**
 * 졸업요건 체커 매칭 회귀 하네스 (개발 전용)
 *
 *   node tools/checker/verify-matching.mjs             # 실제 repo 파일로 전체 픽스처
 *   node tools/checker/verify-matching.mjs --self-test # 합성 카탈로그로 하네스 자체 검증
 *   node tools/checker/verify-matching.mjs --help
 *
 * 이 repo 에는 테스트 러너가 없다. 매칭(src/lib/checker-match.ts)은 OCR 오탐·누락을 막는
 * 규칙이 겹겹이 쌓인 가장 미묘한 로직이라, 정작 깨지는 계기는 코드가 아니라 **카탈로그
 * 데이터**(content/checker-requirements.json, content/liberal-arts.json,
 * public/data/course-catalog.json)의 이름·별칭 변경이다. 과목이 개명되거나 별칭이 추가되면
 * 조용히 이중 집계·삼킴이 생긴다. 이 스크립트가 그 상시 회귀 자다.
 * 픽스처가 하나라도 FAIL 이면 exit 1.
 *
 * ⚠ 동기화 주의 — 아래 "카탈로그 조립"은 다음 두 곳의 복제다. 원본이 바뀌면 여기도 고친다.
 *   · src/lib/checker.ts  getCheckerData()          (73–144행)
 *   · src/components/GraduationChecker.tsx  병합부   (253–283행)
 *   checker.ts 는 확장자 없는 import('./checker-match')를 써서 Node 로 직접 불러올 수 없다.
 *   checker-match.ts 는 import 문이 하나도 없어(순수 함수 모듈) 그대로 불러 쓴다.
 *   Node 24 의 기본 type stripping 으로 .ts 를 직접 import 한다(선례: tools/mileage/backtest.mjs).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchCourses, normalizeName } from '../../src/lib/checker-match.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf-8'));

// ─────────────────────────────────────────────────────────────────────────────
// 카탈로그 조립 (checker.ts + GraduationChecker.tsx 복제)
// ─────────────────────────────────────────────────────────────────────────────

/** 과목코드에서 단위 추출 — MEU3005 → 3000 (checker.ts levelFromCode) */
function levelFromCode(code) {
  const m = code?.match(/[A-Z]+(\d)/);
  return m ? Number(m[1]) * 1000 : undefined;
}

/**
 * 교양 학점 (checker.ts liberalCredits).
 * 원본은 CSV 에 학점이 없어 휴리스틱을 쓰지만, 곧 행에 credits 필드가 추가될 예정이라
 * 여기서는 `row.credits ?? 휴리스틱` 으로 둔다 — 현재 데이터에는 credits 가 없어 동작 동일.
 */
function liberalCredits(row) {
  if (typeof row.credits === 'number') return row.credits;
  if (row.area === '체육과건강') return 1;
  if (row.category === 'RC교육') return 1;
  return 3;
}

/** checker.ts LIBERAL_ALIASES */
const LIBERAL_ALIASES = {
  '사회참여(SE)': ['사회참여'],
  'YONSEI RC 101': ['YONSEI RC101', 'RC101'],
  스트레스의과학과적응의삶: ['스트레스의 과학과 적응의 삶'],
};

/** checker.ts CATALOG_SUPPLEMENT */
const CATALOG_SUPPLEMENT = [{ name: '리더십워크숍', credits: 3, level: 3000 }];

/** 예약 과목명 규칙 — build-catalog.mjs 의 isReservedName 과 동기화.
 *  채플·RC자기주도활동은 번호 변형(`채플(1)`~`(4)`)이 있어 접두, '사회참여' 는 완전일치
 *  ('사회참여적예술' 같은 정당한 교양을 걸러내지 않기 위해). */
const isReservedName = (norm) =>
  norm.startsWith('채플') || norm.startsWith('rc자기주도활동') || norm === '사회참여';

/** curated 카탈로그 (getCheckerData) — 정규화 이름이 id, 먼저 넣은 쪽 우선 */
function buildCuratedCatalog() {
  const req = readJson('content/checker-requirements.json');
  const liberal = readJson('content/liberal-arts.json');

  const catalog = new Map();
  const add = (course) => {
    if (!catalog.has(course.id)) catalog.set(course.id, course);
  };

  for (const c of req.engineeringRequired) {
    add({
      id: normalizeName(c.name),
      name: c.name,
      credits: c.credits,
      kind: 'engineering',
      level: levelFromCode(c.code) ?? 1000, // 공학기초는 교양(1000단위) 취급
      aliases: c.aliases ?? [],
    });
  }
  for (const c of [req.majorCreativeDesign, ...req.majorRequiredBase]) {
    add({
      id: normalizeName(c.name),
      name: c.name,
      credits: c.credits,
      kind: 'majorRequired',
      level: levelFromCode(c.code),
      aliases: c.aliases ?? [],
    });
  }
  for (const c of req.majorElectivePool) {
    add({
      id: normalizeName(c.name),
      name: c.name,
      credits: c.credits,
      kind: 'majorElective',
      level: levelFromCode(c.code),
      aliases: c.aliases ?? [],
    });
  }
  for (const row of liberal) {
    add({
      id: normalizeName(row.name),
      name: row.name,
      credits: liberalCredits(row),
      kind: 'liberal',
      category: row.category,
      area: row.area,
      level: levelFromCode(row.code),
      aliases: [...(row.aliases ?? []), ...(LIBERAL_ALIASES[row.name] ?? [])],
    });
  }
  for (const s of CATALOG_SUPPLEMENT) {
    add({
      id: normalizeName(s.name),
      name: s.name,
      credits: s.credits,
      kind: 'other',
      level: s.level,
      aliases: [], // fuzzy 미지정 → 오차허용 매칭 대상
    });
  }
  return [...catalog.values()];
}

/** public/data/course-catalog.json → kind:'other' 항목 (GraduationChecker.tsx 253–275행) */
function buildOtherCatalog(rows) {
  return rows.map((r) => ({
    id: normalizeName(r.name),
    name: r.name,
    credits: r.credits,
    kind: 'other',
    level: r.level || undefined,
    fuzzy: false, // 대용량 카탈로그는 정확 매치만
    aliases: r.aliases ?? [], // 현재 파일엔 없으나 곧 추가된다
  }));
}

/** curated 우선 병합 (GraduationChecker.tsx 280–283행) */
function mergeCatalog(curated, other) {
  const ids = new Set(curated.map((c) => c.id));
  return [...curated, ...other.filter((c) => !ids.has(c.id))];
}

// ─────────────────────────────────────────────────────────────────────────────
// 검사기 — 실제 repo 실행과 --self-test 가 같은 함수를 공유한다(하네스 자체 검증의 핵심)
// ─────────────────────────────────────────────────────────────────────────────

const PASS = 'PASS';
const FAIL = 'FAIL';
const SKIP = 'SKIP';

const result = (title, status, lines = []) => ({ title, status, lines });
const verdict = (title, problems, lines) =>
  problems.length ? result(title, FAIL, [...lines, ...problems.map((p) => `✗ ${p}`)]) : result(title, PASS, lines);

/**
 * ① 개명 회귀 — 과목이 "창의제품설계" → "창의제품설계(종합설계)" 처럼 개명될 때,
 *    긴 이름이 curated 짧은 이름을 삼켜(exact 포함관계 제거) 전공필수가 통째로 누락되거나,
 *    두 항목이 각각 잡혀 같은 과목이 두 번 집계되는 사고를 잡는다.
 */
function checkRename(catalog, { text, keepName, banName }) {
  const title = '① 개명 회귀 (전공필수 누락·이중 집계)';
  const keepId = normalizeName(keepName);
  const banId = normalizeName(banName);
  const inCatalog = new Set(catalog.map((c) => c.id));
  const ids = matchCourses([text], catalog);
  const hits = ids.filter((i) => i === keepId).length;
  const lines = [
    `입력   : "${text}"`,
    `기대   : '${keepId}' 정확히 1회, '${banId}' 별개 항목 없음`,
    `매치(${ids.length}) : ${ids.join(', ') || '(없음)'}`,
  ];
  const problems = [];
  if (!inCatalog.has(keepId)) problems.push(`카탈로그에 '${keepId}' 항목 자체가 없다 (요건 데이터 확인)`);
  if (hits !== 1) problems.push(`'${keepId}' 매치 ${hits}회 — 기대 1회`);
  if (ids.includes(banId))
    problems.push(`'${banId}' 가 별개 항목으로 함께 잡혔다 → 같은 과목 이중 집계 위험`);
  return verdict(title, problems, lines);
}

/**
 * ② 삼킴 회귀 — "응용고체역학" 이 잡혔는데 그 안의 "고체역학"(전공필수)까지 함께
 *    이수 처리되는 사고. exactMatch 의 포함관계 제거 + fuzzy 모호성 차단이 지켜지는지 본다.
 */
function checkSwallow(catalog, { text, expectName, forbidName }) {
  const title = '② 삼킴 회귀 (긴 이름 안의 짧은 과목 오탐)';
  const expectId = normalizeName(expectName);
  const forbidId = normalizeName(forbidName);
  const ids = matchCourses([text], catalog);
  const lines = [
    `입력   : "${text}"`,
    `기대   : '${expectId}' 포함, '${forbidId}' 미포함`,
    `매치(${ids.length}) : ${ids.join(', ') || '(없음)'}`,
  ];
  const problems = [];
  if (!ids.includes(expectId)) problems.push(`'${expectId}' 가 매치되지 않았다`);
  if (ids.includes(forbidId)) problems.push(`'${forbidId}' 가 함께 잡혔다 → 이수하지 않은 과목이 이수 처리`);
  return verdict(title, problems, lines);
}

/**
 * ③ needle 전역 유일성 불변식 — 이 하네스의 핵심.
 *    매칭은 "정규화된 이름/별칭 문자열(needle)" 을 텍스트에서 찾는 방식이라,
 *    같은 needle 이 서로 다른 두 항목에 속하면 그 문자열이 나올 때마다 두 과목이
 *    동시에 이수 처리된다. 별칭을 추가하는 순간 사람이 눈치채지 못하고 깨지는 지점.
 */
function checkNeedleUniqueness(catalog) {
  const title = '③ needle 전역 유일성 불변식 (이름·별칭 충돌)';
  const byNeedle = new Map();
  for (const c of catalog) {
    for (const raw of [c.name, ...(c.aliases ?? [])]) {
      const n = normalizeName(raw);
      if (!n) continue;
      if (!byNeedle.has(n)) byNeedle.set(n, new Map());
      // id → 그 id 에서 이 needle 이 유래한 원문(진단용)
      byNeedle.get(n).set(c.id, raw);
    }
  }
  const collisions = [...byNeedle.entries()].filter(([, ids]) => ids.size > 1);
  const lines = [
    `카탈로그 ${catalog.length}개 항목 → 서로 다른 needle ${byNeedle.size}개`,
    `기대   : 2개 이상의 id 에 걸친 needle 0개`,
    `충돌   : ${collisions.length}개`,
  ];
  const problems = collisions.map(
    ([needle, ids]) =>
      `needle '${needle}' 가 ${ids.size}개 id 에 걸침 — ` +
      [...ids.entries()].map(([id, raw]) => `${id} (원문 "${raw}")`).join(' / '),
  );
  return verdict(title, problems, lines);
}

/**
 * ④ 예약 과목명 부재 — 채플·사회참여·RC자기주도활동은 체커가 별도 UI/계산으로 다루는
 *    "예약" 항목이다. 대용량 타 학과 카탈로그(kind:'other')에 같은 이름이 섞여 들어오면
 *    일반선택 학점으로 이중 계상된다. curated 의 '사회참여(SE)'·'YONSEI RC 101' 은
 *    정당한 항목이므로 other 만 검사한다.
 */
function checkReservedNames(catalog, isReserved) {
  const title = '④ 예약 과목명 부재 (other 카탈로그 오염)';
  const others = catalog.filter((c) => c.kind === 'other');
  const bad = others.filter((c) => isReserved(normalizeName(c.name)));
  const lines = [
    `검사 대상 : kind:'other' ${others.length}개`,
    `예약 규칙 : 채플*·rc자기주도활동* 접두 + 사회참여 완전일치`,
    `적발     : ${bad.length}개`,
  ];
  const problems = bad.map((c) => `other 항목 "${c.name}" (id ${c.id}) 이 예약 이름과 충돌`);
  return verdict(title, problems, lines);
}

/**
 * ⑤ 별칭 데이터 주도 회귀 — course-catalog.json 에 별칭이 생기면, 그 별칭 표기가
 *    실제로 해당 과목으로 매치되는지 데이터가 늘어날 때마다 자동으로 검사한다.
 *    (other 항목은 fuzzy:false → 정확 매치 전용이라 최소 3글자 needle 만 유효)
 */
function checkAliasRoundTrip(catalog, rows) {
  const title = '⑤ 별칭 데이터 주도 회귀 (course-catalog.json aliases)';
  const withAlias = rows.filter((r) => Array.isArray(r.aliases) && r.aliases.length > 0);
  if (withAlias.length === 0)
    return result(title, SKIP, [`aliases 필드를 가진 항목 0개 — 검사할 것이 없다 (필드 추가 시 자동 활성)`]);

  const byId = new Map(catalog.map((c) => [c.id, c]));
  const lines = [`aliases 보유 항목 ${withAlias.length}개`];
  const problems = [];
  let tested = 0;
  let skipped = 0;
  for (const r of withAlias) {
    const id = normalizeName(r.name);
    const alias = r.aliases[0];
    const needle = normalizeName(alias);
    if (needle.length < 3) {
      skipped++;
      lines.push(`  - "${r.name}" 별칭 "${alias}" → 정규화 ${needle.length}자 (<3) 이라 skip`);
      continue;
    }
    tested++;
    const ids = matchCourses([alias], catalog);
    if (!ids.includes(id)) {
      const owner = byId.get(id);
      const why = !owner
        ? '해당 id 가 병합 카탈로그에 없다'
        : (owner.aliases ?? []).some((a) => normalizeName(a) === needle)
          ? '항목은 별칭을 갖고 있으나 매치 실패'
          : `id 를 선점한 항목("${owner.name}", kind=${owner.kind})이 이 별칭을 갖고 있지 않다`;
      problems.push(`"${r.name}" 의 별칭 "${alias}" → '${id}' 매치 실패 (${why}). 실제 매치: ${ids.join(', ') || '(없음)'}`);
    }
  }
  lines.push(`검사 ${tested}건 · skip ${skipped}건`);
  return verdict(title, problems, lines);
}

/**
 * ⑥ 알려진 사례(조건부) — 카탈로그에 해당 항목이 있을 때만 검사한다.
 *    번호 붙은 과목명 하나가 여러 항목으로 번지지 않는지 확인.
 */
function checkExactlyOne(catalog, { text, requireName, condition }) {
  const title = '⑥ 알려진 사례 — 번호 과목 단일 매치 (조건부)';
  const requireId = normalizeName(requireName);
  const condId = normalizeName(condition ?? requireName);
  if (!catalog.some((c) => c.id === condId))
    return result(title, SKIP, [`병합 카탈로그에 '${condId}' 항목이 없어 검사 생략`]);
  const ids = matchCourses([text], catalog);
  const lines = [
    `입력   : "${text}"`,
    `기대   : 매치 id 정확히 1개 ('${requireId}')`,
    `매치(${ids.length}) : ${ids.join(', ') || '(없음)'}`,
  ];
  const problems = [];
  if (ids.length !== 1) problems.push(`매치 id ${ids.length}개 — 기대 1개`);
  if (!ids.includes(requireId)) problems.push(`'${requireId}' 가 매치되지 않았다`);
  return verdict(title, problems, lines);
}

// ─────────────────────────────────────────────────────────────────────────────
// 출력
// ─────────────────────────────────────────────────────────────────────────────

const BAR = '─'.repeat(78);

function printResult(r, index) {
  console.log(`[${r.status}] ${index}. ${r.title}`);
  for (const l of r.lines) console.log(`        ${l}`);
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// 실행 모드 ① — 실제 repo 파일
// ─────────────────────────────────────────────────────────────────────────────

function runRepo() {
  const curated = buildCuratedCatalog();
  const rows = readJson('public/data/course-catalog.json');
  const other = buildOtherCatalog(rows);
  const catalog = mergeCatalog(curated, other);

  console.log('졸업요건 체커 매칭 회귀 하네스');
  console.log(BAR);
  console.log(
    `카탈로그 : curated ${curated.length} + 타 학과 ${other.length} → 병합 ${catalog.length}개 ` +
      `(id 충돌로 제외 ${curated.length + other.length - catalog.length}개)`,
  );
  console.log(BAR);
  console.log('');

  const results = [
    checkRename(catalog, {
      text: '월3 창의제품설계(종합설계) 제4공학관 B101',
      keepName: '창의제품설계',
      banName: '창의제품설계(종합설계)',
    }),
    checkSwallow(catalog, {
      text: '화5 응용고체역학 공A555',
      expectName: '응용고체역학',
      forbidName: '고체역학',
    }),
    checkNeedleUniqueness(catalog),
    checkReservedNames(catalog, isReservedName),
    checkAliasRoundTrip(catalog, rows),
    checkExactlyOne(catalog, { text: '기계공학세미나(1)', requireName: '기계공학세미나(1)' }),
  ];

  results.forEach((r, i) => printResult(r, i + 1));
  return summarize(results);
}

// ─────────────────────────────────────────────────────────────────────────────
// 실행 모드 ② — --self-test (하네스 로직 자체 검증)
//   repo 데이터와 무관한 소형 합성 카탈로그로, 검사기가 정상 카탈로그를 통과시키고
//   고장난 카탈로그를 **실제로 잡아내는지**(탐지 방향) 양쪽을 모두 확인한다.
//   실제 repo 픽스처가 FAIL 일 때 "하네스가 틀린 것"인지 "데이터가 틀린 것"인지 가른다.
// ─────────────────────────────────────────────────────────────────────────────

function synth(name, extra = {}) {
  return { id: normalizeName(name), name, credits: 3, kind: 'majorElective', aliases: [], ...extra };
}

function selfTest() {
  // 정상(수정 완료 상태) 합성 카탈로그
  //  · 알파설계        : 개명된 표기를 별칭으로 흡수 → 별개 항목이 생기지 않는다
  //  · 가온/나온/다온역학 : 서로 편집거리 1 (실제 고체·유체·생체역학의 축소판)
  //  · 응용가온역학     : 짧은 이름을 삼키는 긴 이름
  //  · 카파세미나(1)    : 번호 붙은 other 항목 + 번호 없는 curated 어간
  const GOOD = [
    synth('알파설계', { kind: 'majorRequired', level: 4000, aliases: ['알파설계(종합)'] }),
    synth('가온역학', { kind: 'majorRequired', level: 2000 }),
    synth('나온역학', { kind: 'majorRequired', level: 2000 }),
    synth('다온역학', { kind: 'majorRequired', level: 2000 }),
    synth('응용가온역학', { level: 3000 }),
    synth('카파세미나', { level: 4000 }),
    synth('카파세미나(1)', { kind: 'other', fuzzy: false, level: 4000 }),
    synth('마루기계설계학', { kind: 'other', fuzzy: false, level: 3000, aliases: ['마루기계설계'] }),
  ];
  const GOOD_ROWS = [
    { name: '카파세미나(1)', credits: 3, level: 4000 },
    { name: '마루기계설계학', credits: 3, level: 3000, aliases: ['마루기계설계'] },
  ];

  // 고장 카탈로그들 — 각 검사기가 반드시 FAIL 을 내야 한다
  const BAD_RENAME = [
    ...GOOD.filter((c) => c.id !== '알파설계'),
    synth('알파설계', { kind: 'majorRequired', level: 4000 }), // 별칭 없음
    synth('알파설계(종합)', { kind: 'other', fuzzy: false, level: 4000 }), // 개명분이 별개 항목으로
  ];
  const BAD_SWALLOW = GOOD.filter((c) => c.id !== '응용가온역학'); // 긴 이름이 사라져 짧은 이름이 오탐
  const BAD_UNIQUE = [
    ...GOOD,
    synth('라온역학', { kind: 'other', fuzzy: false, aliases: ['가온역학'] }), // 남의 이름을 별칭으로
  ];
  const BAD_RESERVED = [...GOOD, synth('채플(1)', { kind: 'other', fuzzy: false, level: 1000 })];
  const BAD_ALIAS = GOOD.map((c) => ({ ...c, aliases: [] })); // 별칭이 카탈로그로 전달되지 않은 상태

  const renameArgs = {
    text: '월3 알파설계(종합) 제4공학관 B101',
    keepName: '알파설계',
    banName: '알파설계(종합)',
  };
  const swallowArgs = { text: '화5 응용가온역학 공A555', expectName: '응용가온역학', forbidName: '가온역학' };
  const reserved = isReservedName;

  const cases = [
    ['①-정상  개명 검사기가 정상 카탈로그를 통과시킨다', () => checkRename(GOOD, renameArgs), PASS],
    ['①-탐지  개명 검사기가 이중 항목을 잡아낸다', () => checkRename(BAD_RENAME, renameArgs), FAIL],
    ['②-정상  삼킴 검사기가 정상 카탈로그를 통과시킨다', () => checkSwallow(GOOD, swallowArgs), PASS],
    ['②-탐지  삼킴 검사기가 짧은 이름 오탐을 잡아낸다', () => checkSwallow(BAD_SWALLOW, swallowArgs), FAIL],
    ['③-정상  유일성 검사기가 충돌 없는 카탈로그를 통과시킨다', () => checkNeedleUniqueness(GOOD), PASS],
    ['③-탐지  유일성 검사기가 별칭↔이름 충돌을 잡아낸다', () => checkNeedleUniqueness(BAD_UNIQUE), FAIL],
    ['④-정상  예약명 검사기가 깨끗한 other 를 통과시킨다', () => checkReservedNames(GOOD, reserved), PASS],
    ['④-탐지  예약명 검사기가 채플 오염을 잡아낸다', () => checkReservedNames(BAD_RESERVED, reserved), FAIL],
    ['⑤-정상  별칭 왕복 검사기가 살아있는 별칭을 통과시킨다', () => checkAliasRoundTrip(GOOD, GOOD_ROWS), PASS],
    ['⑤-탐지  별칭 왕복 검사기가 유실된 별칭을 잡아낸다', () => checkAliasRoundTrip(BAD_ALIAS, GOOD_ROWS), FAIL],
    ['⑤-생략  별칭이 없으면 SKIP 으로 빠진다', () => checkAliasRoundTrip(GOOD, [{ name: '카파세미나(1)' }]), SKIP],
    [
      '⑥-정상  단일 매치 검사기가 번호 과목을 1개로 잡는다',
      () => checkExactlyOne(GOOD, { text: '카파세미나(1)', requireName: '카파세미나(1)' }),
      PASS,
    ],
    [
      '⑥-탐지  단일 매치 검사기가 2개 매치를 잡아낸다',
      () => checkExactlyOne(GOOD, { text: '카파세미나(1) 나온역학', requireName: '카파세미나(1)' }),
      FAIL,
    ],
    [
      '⑥-생략  대상 항목이 없으면 SKIP 으로 빠진다',
      () => checkExactlyOne(BAD_SWALLOW, { text: '오메가세미나(1)', requireName: '오메가세미나(1)' }),
      SKIP,
    ],
  ];

  console.log('졸업요건 체커 매칭 회귀 하네스 — 자체 검증(--self-test)');
  console.log(BAR);
  console.log('repo 데이터와 무관한 합성 카탈로그로 검사기의 통과/탐지 양방향을 확인한다.');
  console.log(BAR);
  console.log('');

  const results = cases.map(([label, run, expect]) => {
    const r = run();
    const ok = r.status === expect;
    return result(label, ok ? PASS : FAIL, [
      `기대 상태 ${expect} · 실제 상태 ${r.status}`,
      ...(ok ? [] : ['✗ 검사기가 기대와 다르게 동작했다 — 아래는 검사기 원본 출력', ...r.lines.map((l) => `  | ${l}`)]),
    ]);
  });

  results.forEach((r, i) => printResult(r, i + 1));
  return summarize(results);
}

function summarize(results) {
  const n = (s) => results.filter((r) => r.status === s).length;
  console.log(BAR);
  console.log(`합계 : PASS ${n(PASS)} · FAIL ${n(FAIL)} · SKIP ${n(SKIP)} (총 ${results.length})`);
  if (n(FAIL) > 0) {
    console.log('');
    console.log('실패 항목:');
    for (const r of results) if (r.status === FAIL) console.log(`  · ${r.title}`);
  }
  console.log(BAR);
  return n(FAIL) === 0 ? 0 : 1;
}

// ─────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`졸업요건 체커 매칭 회귀 하네스

사용법
  node tools/checker/verify-matching.mjs              실제 repo 파일(content/*.json,
                                                      public/data/course-catalog.json)로
                                                      전체 픽스처 실행
  node tools/checker/verify-matching.mjs --self-test   합성 카탈로그로 하네스 로직 자체 검증
  node tools/checker/verify-matching.mjs --help        이 도움말

픽스처
  ① 개명 회귀            과목 개명 시 전공필수 누락·이중 집계
  ② 삼킴 회귀            긴 이름 안의 짧은 과목 오탐
  ③ needle 전역 유일성   같은 이름/별칭이 두 항목에 걸침 (핵심 불변식)
  ④ 예약 과목명 부재     채플·사회참여·RC자기주도활동이 other 로 유입
  ⑤ 별칭 왕복            course-catalog.json 의 aliases 가 실제로 매치되는지
  ⑥ 번호 과목 단일 매치  조건부(대상 항목이 있을 때만)

종료코드 : FAIL 이 하나라도 있으면 1, 아니면 0`);
  process.exit(0);
}

const code = argv.includes('--self-test') ? selfTest() : runRepo();
process.exit(code);
