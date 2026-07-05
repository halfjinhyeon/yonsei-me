import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeName,
  type CatalogCourse,
  type CheckerCohort,
  type CheckerData,
} from './checker-match';

interface LiberalRow {
  category: string;
  area: string;
  name: string;
  code: string;
}

interface ReqCourse {
  name: string;
  credits: number;
  aliases?: string[];
  /** 실제 과목코드 (예: MEU3005) — 3000/4000단위 요건 집계에 사용 */
  code?: string;
}

/** 과목코드에서 단위(1000/2000/3000/4000) 추출 — 예: MEU3005 → 3000, UCB1101 → 1000 */
function levelFromCode(code?: string): number | undefined {
  const m = code?.match(/[A-Z]+(\d)/);
  return m ? Number(m[1]) * 1000 : undefined;
}

interface CheckerRequirements {
  engineeringRequired: ReqCourse[];
  majorRequiredBase: ReqCourse[];
  majorCreativeDesign: ReqCourse;
  majorElectivePool: ReqCourse[];
  electiveAreas: string[];
  cohorts: CheckerCohort[];
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), 'content', name), 'utf-8')) as T;
}

/** 교양 과목 학점 추정 (CSV에 학점 정보가 없어 표준 학점으로 가정) */
function liberalCredits(row: LiberalRow): number {
  if (row.area === '체육과건강') return 1;
  if (row.category === 'RC교육') return 1;
  return 3;
}

/** 에브리타임 표기 대응 별칭 (교양 과목) */
const LIBERAL_ALIASES: Record<string, string[]> = {
  '사회참여(SE)': ['사회참여'],
  'YONSEI RC 101': ['YONSEI RC101', 'RC101'],
  '스트레스의과학과적응의삶': ['스트레스의 과학과 적응의 삶'],
};

/**
 * 대용량 타과 카탈로그(정확 매치 전용)에 있으나, 시간표에서 이름이 줄바꿈되며 특수문자가
 * 오인식/누락돼("리더십워크숍"→"리더십워크샵"/"리더십워크") 정확 매치가 실패하는 과목.
 * curated로 승격해 오차허용(fuzzy) 매칭을 허용한다. (동일 id는 이 항목이 우선)
 * kind는 학점 배분을 위해 'other'로 두되, fuzzy는 켠다(fuzzy 필드 미지정 = 허용).
 */
const CATALOG_SUPPLEMENT: { name: string; credits: number; level: number }[] = [
  { name: '리더십워크숍', credits: 3, level: 3000 }, // LEA3101 (RC 리더십)
];

/**
 * 졸업요건 체커 데이터 조립 (서버 전용).
 * 카탈로그 = 공학기초 + 전공필수 + 전공선택 + 교양(CSV) — 정규화 이름으로 중복 제거,
 * 요건 지정 과목(공학기초 등)이 교양 CSV의 동명 과목보다 우선한다.
 */
export function getCheckerData(): CheckerData {
  const req = readJson<CheckerRequirements>('checker-requirements.json');
  const liberal = readJson<LiberalRow[]>('liberal-arts.json');

  const catalog = new Map<string, CatalogCourse>();

  const add = (course: CatalogCourse) => {
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
      aliases: LIBERAL_ALIASES[row.name] ?? [],
    });
  }
  for (const s of CATALOG_SUPPLEMENT) {
    add({
      id: normalizeName(s.name),
      name: s.name,
      credits: s.credits,
      kind: 'other', // 학점은 일반선택(+3000/4000 단위)에 반영
      level: s.level,
      aliases: [], // fuzzy 미지정 → 오차허용 매칭 대상
    });
  }

  return {
    cohorts: req.cohorts,
    electiveAreas: req.electiveAreas,
    engineeringNames: req.engineeringRequired.map((c) => c.name),
    majorRequiredNames: req.majorRequiredBase.map((c) => c.name),
    creativeDesignName: req.majorCreativeDesign.name,
    catalog: [...catalog.values()],
  };
}
