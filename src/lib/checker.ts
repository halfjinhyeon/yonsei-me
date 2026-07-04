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
      aliases: c.aliases ?? [],
    });
  }
  for (const c of [req.majorCreativeDesign, ...req.majorRequiredBase]) {
    add({
      id: normalizeName(c.name),
      name: c.name,
      credits: c.credits,
      kind: 'majorRequired',
      aliases: c.aliases ?? [],
    });
  }
  for (const c of req.majorElectivePool) {
    add({
      id: normalizeName(c.name),
      name: c.name,
      credits: c.credits,
      kind: 'majorElective',
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
      aliases: LIBERAL_ALIASES[row.name] ?? [],
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
