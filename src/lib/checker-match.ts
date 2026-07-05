/**
 * 졸업요건 체커 — OCR 텍스트 ↔ 과목 카탈로그 매칭과 요건 평가 (순수 함수).
 * 서버/클라이언트 어디서든 동작 (fs 접근 없음).
 */

export type CourseKind =
  | 'liberal' // 교양 (CSV 카탈로그)
  | 'engineering' // 대학교양 필수(공학기초)
  | 'majorRequired'
  | 'majorElective'
  | 'other'; // 타 학과 전공·기타 과목 (전체 개설과목 CSV) — 일반선택으로 반영

export interface CatalogCourse {
  /** 정규화된 이름을 id로 사용 */
  id: string;
  name: string;
  credits: number;
  kind: CourseKind;
  /** 교양 대분류 (교양기초/대학교양/RC교육/자율선택) */
  category?: string;
  /** 교양 중분류 영역 */
  area?: string;
  /** 과목 단위 (1000/2000/3000/4000) — 3000/4000단위 45학점 요건 집계용. 미상이면 undefined */
  level?: number;
  /** false면 오차허용(fuzzy) 매칭 대상에서 제외 (대용량 타과 카탈로그는 정확 매치만). 기본 true */
  fuzzy?: boolean;
  aliases: string[];
}

export interface CheckerCohort {
  id: string;
  label: string;
  total: number;
  majorRequiredCredits: number;
  majorElectiveCredits: number;
  freeCredits: number;
  includeCreativeDesign: boolean;
  includeSocialEngagement: boolean;
}

export interface CheckerData {
  cohorts: CheckerCohort[];
  electiveAreas: string[];
  engineeringNames: string[];
  majorRequiredNames: string[];
  creativeDesignName: string;
  catalog: CatalogCourse[];
}

/** 비교용 정규화: 공백/중점/괄호 제거 + 소문자화 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s ​·ㆍ・]/g, '')
    .replace(/[()\[\]{}]/g, '')
    .replace(/[Ⅰ]/g, '1')
    .replace(/[Ⅱ]/g, '2');
}

interface Span {
  id: string;
  start: number;
  end: number;
}

function exactMatch(hay: string, catalog: CatalogCourse[]): Span[] {
  const spans: Span[] = [];
  for (const course of catalog) {
    // 대용량 타과 카탈로그(fuzzy:false)의 2글자 이름("AI" 등)은 OCR 잡음에 오탐되므로
    // 최소 3글자 요구. curated(전공·교양)는 2글자도 허용.
    const minLen = course.fuzzy === false ? 3 : 2;
    const needles = [normalizeName(course.name), ...course.aliases.map(normalizeName)].filter(
      (n) => n.length >= minLen,
    );
    for (const needle of needles) {
      let idx = hay.indexOf(needle);
      while (idx !== -1) {
        spans.push({ id: course.id, start: idx, end: idx + needle.length });
        idx = hay.indexOf(needle, idx + 1);
      }
    }
  }
  // 더 긴 매치에 완전히 포함된 매치 제거 (예: "응용고체역학" 매치 시 "고체역학" 오탐 방지)
  return spans.filter(
    (a) =>
      !spans.some(
        (b) => b !== a && b.start <= a.start && b.end >= a.end && b.end - b.start > a.end - a.start,
      ),
  );
}

/** 두 문자열의 편집거리(제한 초과 시 조기 종료) — fuzzy 모호성 판정용 */
function editDistanceAtMost(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > limit) return false;
    prev = cur;
  }
  return prev[b.length] <= limit;
}

/**
 * haystack 안에서 needle과 편집거리(삽입/삭제/치환) <= maxErr 인 부분 문자열의
 * "가장 좋은(오차가 가장 적은) 매치 끝 위치"를 반환한다. 없으면 -1.
 * (부분 문자열 근사 검색 — 1-pass DP, Ukkonen/Ukkonen-Sellers 방식)
 */
function fuzzyFindEnd(haystack: string, needle: string, maxErr: number): number {
  const n = needle.length;
  if (n === 0) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let bestEnd = -1;
  let bestDist = Infinity;
  for (let i = 1; i <= haystack.length; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = 0; // 시작 위치는 자유 (부분 문자열 검색)
    for (let j = 1; j <= n; j++) {
      const cost = haystack[i - 1] === needle[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    if (cur[n] <= maxErr && cur[n] < bestDist) {
      bestDist = cur[n];
      bestEnd = i;
    }
    prev = cur;
  }
  return bestEnd;
}

function fuzzyTolerance(len: number): number {
  return Math.min(3, Math.max(1, Math.floor(len * 0.22)));
}

/** id 끝의 숫자(예: "학부연구4")를 분리 — (1)(2)(3)(4)처럼 번호만 다른 "패밀리"를 묶기 위함 */
function stemAndDigit(id: string): { stem: string; digit: string | null } {
  const m = id.match(/^(.*?)(\d+)$/);
  return m ? { stem: m[1], digit: m[2] } : { stem: id, digit: null };
}

/**
 * fuzzy 매칭이 금지되는 "모호한" 과목명 집합을 계산한다.
 * 카탈로그 안에 편집거리 <= 허용오차인 다른 과목명이 존재하면(예: 고체역학 ↔
 * 유체역학 ↔ 생체역학, 서로 거리 1) 그 과목명의 fuzzy 매치는 어떤 것을 찾은
 * 것인지 구분할 수 없으므로 정확 매치만 허용한다.
 */
function ambiguousNeedles(catalog: CatalogCourse[]): Set<string> {
  // fuzzy 대상(curated) 과목끼리만 모호성 판정 — 대용량 타과 카탈로그(fuzzy:false)를
  // 포함하면 O(n²) 편집거리 계산이 폭발하고 fuzzy도 안 쓰므로 제외한다.
  const names = catalog.filter((c) => c.fuzzy !== false).map((c) => normalizeName(c.name));
  const ambiguous = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    const tol = fuzzyTolerance(names[i].length);
    for (let j = 0; j < names.length; j++) {
      if (i === j) continue;
      if (editDistanceAtMost(names[i], names[j], tol)) {
        ambiguous.add(names[i]);
        break;
      }
    }
  }
  return ambiguous;
}

/**
 * OCR 오인식(예: "험"→"8", "물"→"블")을 보정하는 오차 허용 매치. 오탐 방지 3중 장치:
 * 1) 공학수학(1)~(4)처럼 끝자리 숫자만 다른 "패밀리"는 어간(stem)만 fuzzy로 찾고
 *    뒤따르는 숫자는 정확히 일치해야 확정 — (2) 하나로 (1)(3)(4)가 채워지는 사고 방지.
 * 2) 카탈로그 안에 허용오차 이내의 다른 과목명이 있으면(고체역학↔유체역학↔생체역학)
 *    fuzzy 자체를 금지 — 실제로 있던 과목의 이웃 과목까지 이수 처리되는 사고 방지.
 * 3) fuzzy 매치 위치가 정확 매치 구간과 겹치면 무시 — 이미 확정된 텍스트의 재해석 방지.
 */
function fuzzyMatch(
  hay: string,
  catalog: CatalogCourse[],
  exclude: Set<string>,
  exactSpans: Span[],
  ambiguous: Set<string>,
): Set<string> {
  const families = new Map<string, { id: string; digit: string | null }[]>();
  for (const c of catalog) {
    if (c.fuzzy === false) continue; // 대용량 타과 카탈로그는 정확 매치만
    const { stem, digit } = stemAndDigit(c.id);
    if (!families.has(stem)) families.set(stem, []);
    families.get(stem)!.push({ id: c.id, digit });
  }

  // fuzzy 매치가 "이미 정확 매치로 소비된 텍스트"를 재해석하는 것만 차단한다.
  // 매치의 끝 위치가 정확 매치 구간 내부에 있으면 그 구간을 다시 읽은 것 → 차단.
  // (start=end-len 방식은 삭제 편집이 섞이면 부정확해 인접 과목까지 잘못 겹침 판정하므로
  //  끝 위치만 본다. 예: "열역학리더십워크샵"에서 리더십워크숍 fuzzy가 열역학에 걸리던 버그)
  const endInsideExact = (end: number) =>
    exactSpans.some((s) => end > s.start && end <= s.end);

  const found = new Set<string>();
  for (const [stem, members] of families) {
    if (members.every((m) => exclude.has(m.id))) continue;

    if (members.length === 1 && members[0].digit === null) {
      const course = catalog.find((c) => c.id === members[0].id)!;
      const needle = normalizeName(course.name);
      if (needle.length < 4 || exclude.has(course.id) || ambiguous.has(needle)) continue;
      const end = fuzzyFindEnd(hay, needle, fuzzyTolerance(needle.length));
      if (end !== -1 && !endInsideExact(end)) found.add(course.id);
      continue;
    }

    if (stem.length < 4 || ambiguous.has(stem)) continue;
    const end = fuzzyFindEnd(hay, stem, fuzzyTolerance(stem.length));
    if (end === -1 || endInsideExact(end)) continue;
    for (const m of members) {
      if (exclude.has(m.id) || m.digit === null) continue;
      if (hay.slice(end, end + m.digit.length) === m.digit) found.add(m.id);
    }
  }
  return found;
}

/**
 * "실험" 번호 계열(공학화학및실험·공학물리학및실험·기계공학실험)은 셀 폭에 따라
 * 이름이 "공학화학및실"⏎"험(N)" 또는 "공학화학및"⏎"실험(N)" 등 임의 위치에서 줄바꿈되고,
 * SPARSE OCR이 그 사이에 옆 셀 텍스트를 끼워 넣어 스템이 끊긴다 → 일반 매칭 전부 실패.
 * 보완 규칙: ① 계열별 "명시적 앵커"(줄바꿈 위치와 무관하게 한 줄에 통째로 남는, 그
 * 계열에만 나오는 접두어)가 텍스트에 정확히 있고 ② 이미지 전체에서 "험/혐/실험" 뒤
 * 숫자가 정확히 한 종류이면, 앵커가 발견된 모든 계열을 그 번호로 확정한다.
 * (한 학기 시간표에서 실험 과목들은 같은 번호로 수강하는 게 일반적이라 안전.
 *  기계공학실험의 앵커는 "기계공학실" — "기계공학부/기계공학창의설계" 등 다른
 *  기계공학* 텍스트와의 오인을 막기 위해 "실"까지 요구한다.)
 */
const LAB_ANCHORS: Record<string, string> = {
  공학화학및실험: '공학화학',
  공학물리학및실험: '공학물리학',
  기계공학실험: '기계공학실',
};

function labFamilyFallback(
  normTexts: string[],
  catalog: CatalogCourse[],
  exclude: Set<string>,
): Set<string> {
  const found = new Set<string>();
  const joined = normTexts.join(' ');

  const digits = new Set<string>();
  for (const m of joined.matchAll(/[험혐](\d)/g)) digits.add(m[1]);
  for (const m of joined.matchAll(/실험(\d)/g)) digits.add(m[1]);
  if (digits.size !== 1) return found; // 숫자가 없거나 여러 종류면 애매 → 보류
  const digit = [...digits][0];

  const families = new Map<string, { id: string; digit: string | null }[]>();
  for (const c of catalog) {
    if (c.fuzzy === false) continue;
    const { stem, digit: d } = stemAndDigit(c.id);
    if (!(stem in LAB_ANCHORS)) continue;
    if (!families.has(stem)) families.set(stem, []);
    families.get(stem)!.push({ id: c.id, digit: d });
  }

  for (const [stem, members] of families) {
    // 앵커는 OCR이 안정적으로 읽는 부분이라 "정확히" 포함될 때만 인정 (오탐 방지) —
    // fuzzy로 풀면 다른 과목명 조각이 앵커로 오인돼 없는 과목이 잡힌다.
    if (!joined.includes(LAB_ANCHORS[stem])) continue;
    const member = members.find((m) => m.digit === digit);
    if (member && !exclude.has(member.id)) found.add(member.id);
  }
  return found;
}

/**
 * OCR 텍스트(들)에서 카탈로그 과목을 찾는다. 이미지 1장당 전처리(임계값)를 달리해
 * 여러 번 인식한 텍스트를 배열로 넘기면 결과를 합집합으로 반환한다.
 * 1) 정확 부분 문자열 매치 → 2) 실패 과목만 오차 허용(fuzzy) → 3) 실험 계열 특화 보완.
 */
export function matchCourses(texts: string | string[], catalog: CatalogCourse[]): string[] {
  const all = (Array.isArray(texts) ? texts : [texts]).map(normalizeName).filter(Boolean);
  if (all.length === 0) return [];

  const spansPerText = all.map((hay) => exactMatch(hay, catalog));
  const exact = new Set<string>();
  for (const spans of spansPerText) for (const s of spans) exact.add(s.id);

  const ambiguous = ambiguousNeedles(catalog);
  const fuzzy = new Set<string>();
  for (let i = 0; i < all.length; i++) {
    for (const id of fuzzyMatch(all[i], catalog, exact, spansPerText[i], ambiguous)) fuzzy.add(id);
  }

  const matched = new Set([...exact, ...fuzzy]);
  for (const id of labFamilyFallback(all, catalog, matched)) matched.add(id);

  return [...matched];
}

/** 검색 자동완성: 카탈로그에서 질의어를 포함하는 과목 나열 */
export function searchCatalog(query: string, catalog: CatalogCourse[], limit = 8): CatalogCourse[] {
  const q = normalizeName(query);
  if (q.length < 1) return [];
  return catalog.filter((c) => normalizeName(c.name).includes(q)).slice(0, limit);
}

// ---- 요건 평가 ----

export interface ItemStatus {
  name: string;
  credits: number;
  done: boolean;
}

export interface SectionResult {
  id: string;
  title: string;
  /** 요구 학점 */
  required: number;
  /** 이수(추정) 학점 — required 초과 시 required로 캡 */
  earned: number;
  /** 개별 필수 과목 상태 (있는 경우) */
  items?: ItemStatus[];
  /** 영역 커버리지 (대학교양 선택) */
  areas?: { name: string; done: boolean }[];
  note?: string;
  /** true면 다른 섹션과 겹쳐 집계되는 "추가 요건" — 총 이수학점 합산에서 제외 */
  overlay?: boolean;
}

export interface EvaluationResult {
  sections: SectionResult[];
  totalRequired: number;
  totalEarned: number;
  /** 남은 필수 과목명 (전 섹션 합산) */
  remainingRequired: string[];
}

export interface ExtraCredits {
  /** RC자기주도활동 이수 학기 수 (0~2). 각 0.5학점, P/NP → 일반선택 학점에 반영 */
  selfDirectedCount: number;
}

export function evaluate(
  data: CheckerData,
  cohort: CheckerCohort,
  takenIds: Set<string>,
  chapelCount: number,
  extra: ExtraCredits = { selfDirectedCount: 0 },
): EvaluationResult {
  const byId = new Map(data.catalog.map((c) => [c.id, c]));
  const taken = [...takenIds].map((id) => byId.get(id)).filter(Boolean) as CatalogCourse[];

  const hasArea = (area: string) => taken.some((c) => c.kind === 'liberal' && c.area === area);
  const has = (name: string) => takenIds.has(normalizeName(name));

  const sections: SectionResult[] = [];

  // 1. 교양기초 (8): 채플 2(4학기) + 글쓰기 3 + 기독교의이해 3
  {
    const writing = hasArea('글쓰기');
    const christian = hasArea('기독교의이해');
    const chapelDone = chapelCount >= 4;
    const earned = (writing ? 3 : 0) + (christian ? 3 : 0) + chapelCount * 0.5;
    sections.push({
      id: 'basic',
      title: '교양기초',
      required: 8,
      earned: Math.min(8, earned),
      items: [
        { name: `채플 (${Math.min(chapelCount, 4)}/4학기)`, credits: 2, done: chapelDone },
        { name: '글쓰기', credits: 3, done: writing },
        { name: '기독교의이해 영역', credits: 3, done: christian },
      ],
    });
  }

  // 2. 대학교양 필수 — 공학기초 (27)
  {
    const items = data.engineeringNames.map((name) => {
      const c = byId.get(normalizeName(name))!;
      return { name: c.name, credits: c.credits, done: takenIds.has(c.id) };
    });
    sections.push({
      id: 'engineering',
      title: '대학교양 필수 (공학기초)',
      required: 27,
      earned: items.reduce((s, i) => s + (i.done ? i.credits : 0), 0),
      items,
      note: "'논리와수리·자연과우주·생명과환경·정보와기술' 영역 이수 처리",
    });
  }

  // 3. 대학교양 선택 (12) — 6개 영역 중 4개 영역
  {
    const areas = data.electiveAreas.map((a) => ({ name: a, done: hasArea(a) }));
    const earned = taken
      .filter((c) => c.kind === 'liberal' && c.area && data.electiveAreas.includes(c.area))
      .reduce((s, c) => s + c.credits, 0);
    sections.push({
      id: 'electiveAreas',
      title: '대학교양 선택',
      required: 12,
      earned: Math.min(12, earned),
      areas,
      note: `6개 영역 중 4개 영역 이수 (현재 ${areas.filter((a) => a.done).length}개 영역)`,
    });
  }

  // 4. 기초교육 (RC)
  {
    const rcRequired = cohort.includeSocialEngagement ? 2 : 1;
    const rc101 = has('YONSEI RC 101');
    const se = has('사회참여(SE)');
    const items: ItemStatus[] = [{ name: 'YONSEI RC 101', credits: 1, done: rc101 }];
    if (cohort.includeSocialEngagement) items.push({ name: '사회참여(SE)', credits: 1, done: se });
    sections.push({
      id: 'rc',
      title: '기초교육 (RC)',
      required: rcRequired,
      earned: items.reduce((s, i) => s + (i.done ? i.credits : 0), 0),
      items,
      note: cohort.includeSocialEngagement ? undefined : '22학번은 사회참여 이수 의무 없음',
    });
  }

  // 5. 전공필수
  {
    const names = cohort.includeCreativeDesign
      ? [data.creativeDesignName, ...data.majorRequiredNames]
      : data.majorRequiredNames;
    const items = names.map((name) => {
      const c = byId.get(normalizeName(name))!;
      return { name: c.name, credits: c.credits, done: takenIds.has(c.id) };
    });
    sections.push({
      id: 'majorRequired',
      title: '전공필수',
      required: cohort.majorRequiredCredits,
      earned: items.reduce((s, i) => s + (i.done ? i.credits : 0), 0),
      items,
    });
  }

  // 6. 전공선택
  {
    const earned = taken
      .filter((c) => c.kind === 'majorElective')
      .reduce((s, c) => s + c.credits, 0);
    sections.push({
      id: 'majorElective',
      title: '전공선택',
      required: cohort.majorElectiveCredits,
      earned: Math.min(cohort.majorElectiveCredits, earned),
      note: '전공선택 지정 과목 목록 기준',
    });
  }

  // 7. 일반선택 — 위 어느 요건에도 배정되지 않은 이수 학점
  //    RC자기주도활동(1)/(2) 이수분(각 0.5학점, P/NP)도 여기에 더한다.
  {
    const assignedLiberal = new Set(['글쓰기', '기독교의이해', ...data.electiveAreas]);
    const selfDirected = Math.min(2, Math.max(0, extra.selfDirectedCount)) * 0.5;
    const free =
      taken
        .filter(
          (c) =>
            // 교양 중 특정 영역/RC로 배정되지 않은 것 + 타 학과·기타 과목(other)
            (c.kind === 'liberal' &&
              !(c.area && assignedLiberal.has(c.area)) &&
              c.category !== 'RC교육') ||
            c.kind === 'other',
        )
        .reduce((s, c) => s + c.credits, 0) + selfDirected;
    sections.push({
      id: 'free',
      title: '일반선택',
      required: cohort.freeCredits,
      earned: Math.min(cohort.freeCredits, free),
      note:
        selfDirected > 0
          ? `요건 외 이수 과목 + RC자기주도활동 ${selfDirected}학점 포함`
          : '요건 외 이수 과목(자율선택·RC자기주도활동 등) 학점',
    });
  }

  // 8. 3000/4000 단위 45학점 (03학번 이후 공통).
  //    이 과목들은 전공·일반선택으로 이미 130학점에 포함돼 있고, 본 섹션은 같은
  //    과목에 대한 별도 "수준" 조건일 뿐이므로 총 이수학점에 다시 더하지 않는다(overlay).
  {
    const upper = taken
      .filter((c) => (c.level ?? 0) >= 3000)
      .reduce((s, c) => s + c.credits, 0);
    sections.push({
      id: 'upperLevel',
      title: '3000·4000 단위 과목',
      required: 45,
      earned: Math.min(45, upper),
      overlay: true,
      note: '03학번 이후 공통: 3000/4000 단위 과목을 45학점 이상 이수해야 합니다. 이 과목들은 전공·일반선택으로 총 130학점에 이미 포함되며, 본 항목은 그중 수준 요건을 충족했는지 별도로 확인하는 지표입니다.',
    });
  }

  const totalEarned = sections
    .filter((sec) => !sec.overlay)
    .reduce((s, sec) => s + sec.earned, 0);
  const remainingRequired = sections.flatMap(
    (sec) => sec.items?.filter((i) => !i.done).map((i) => i.name) ?? [],
  );

  return {
    sections,
    totalRequired: cohort.total,
    totalEarned: Math.round(totalEarned * 10) / 10,
    remainingRequired,
  };
}
