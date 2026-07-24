/**
 * 마일리지 번들 로딩·조회 헬퍼.
 *
 * 번들(public/data/mileage-2026-20.json)은 3천여 분반을 담느라 키를 없앤 배열로 눕혀
 * 저장돼 있다(286KB). 여기서 객체로 되살리고, 검색·시간충돌·신뢰도 판정을 제공한다.
 */

import type { PredictionBasis, SectionMeta, SectionPrediction } from './types';

/** 번들 원본(압축 형태) */
interface RawBundle {
  v: number;
  meta: {
    year: string;
    semester: string;
    generatedAt: string;
    model: string;
    gradeShift: Record<string, number>;
  };
  rows: [
    string, // 0 code
    string, // 1 division
    string, // 2 name
    string, // 3 professor
    number, // 4 credits
    string, // 5 deptName
    string, // 6 classification
    string, // 7 grade
    string, // 8 timeText
    number, // 9 mu
    number, // 10 sigma
    PredictionBasis, // 11 basis
    number, // 12 samples
    number, // 13 maxMileage
  ][];
}

/** 한 분반 = 메타 + 예측을 합친 런타임 표현 */
export interface Section extends SectionMeta, Omit<SectionPrediction, 'code' | 'division' | 'professor'> {
  /** 고유 키 "CODE-DIV" */
  id: string;
  /** 파싱된 강의 시간 블록 */
  slots: TimeSlot[];
}

export interface TimeSlot {
  /** 0=월 … 6=일 */
  day: number;
  /** 교시 번호 */
  period: number;
}

export interface MileageData {
  year: string;
  semester: string;
  generatedAt: string;
  gradeShift: Record<string, number>;
  sections: Section[];
  byId: Map<string, Section>;
}

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * 강의시간 문자열을 교시 블록으로 파싱한다.
 * 원문 예: "월3,수4" / "화2,화3" / "월5,6" 등 표기가 일정하지 않아 방어적으로 처리한다.
 * 해석 못 한 부분은 조용히 버린다(충돌 경고는 보조 기능이라 오탐이 더 나쁘다).
 */
export function parseTimeSlots(text: string): TimeSlot[] {
  if (!text) return [];
  const out: TimeSlot[] = [];
  let lastDay = -1;
  // 괄호는 실습·분반 시간을 묶는 표기다(예: "(화3,4)", "월3 (수7,8)"). 괄호를 구분자로
  // 바꿔 두지 않으면 "(화3" 토큰이 앵커 정규식에 걸리지 않아 그 과목이 통째로 누락된다
  // (실데이터 3,086건 중 237건이 이 형태였다).
  const cleaned = text.replace(/[()[\]{}]/g, ' ');
  // "월3", "3", "월3-4" 같은 토큰들을 훑는다
  const tokens = cleaned.split(/[,\s/]+/).filter(Boolean);
  for (const tk of tokens) {
    const m = tk.match(/^([월화수목금토일])?\s*(\d+)(?:-(\d+))?/);
    if (!m) continue;
    const day = m[1] ? DAYS.indexOf(m[1]) : lastDay;
    if (day < 0) continue;
    lastDay = day;
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    if (!Number.isFinite(from)) continue;
    for (let p = from; p <= Math.min(to, from + 8); p++) out.push({ day, period: p });
  }
  return out;
}

/** 압축 번들을 런타임 표현으로 되살린다 */
export function decodeBundle(raw: RawBundle): MileageData {
  const sections: Section[] = raw.rows.map((r) => {
    const timeText = r[8] ?? '';
    return {
      id: `${r[0]}-${r[1]}`,
      code: r[0],
      division: r[1],
      name: r[2],
      professor: r[3],
      credits: r[4],
      deptCode: '',
      deptName: r[5],
      classification: r[6],
      grade: r[7],
      timeText,
      capacity: null,
      mu: r[9],
      sigma: r[10],
      basis: r[11],
      samples: r[12],
      maxMileage: r[13],
      slots: parseTimeSlots(timeText),
    };
  });
  return {
    year: raw.meta.year,
    semester: raw.meta.semester,
    generatedAt: raw.meta.generatedAt,
    gradeShift: raw.meta.gradeShift ?? {},
    sections,
    byId: new Map(sections.map((s) => [s.id, s])),
  };
}

/** 번들을 받아온다(클라이언트 전용). 실패 시 예외를 던진다. */
export async function fetchBundle(url = '/data/mileage-2026-20.json'): Promise<MileageData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`마일리지 데이터를 불러오지 못했습니다 (${res.status})`);
  return decodeBundle((await res.json()) as RawBundle);
}

/**
 * 예측 신뢰도 — 데이터가 부족한 과목을 경고로 알리기 위한 판정(사용자 지시).
 *   high   : 이 분반 자체의 이력이 2학기 이상
 *   medium : 이 분반 이력이 1학기
 *   low    : 분반 이력이 없어 상위 계층(교수/과목/학과)이나 기본값으로 추정
 */
export type Confidence = 'high' | 'medium' | 'low';

export function confidenceOf(s: Pick<Section, 'basis' | 'samples'>): Confidence {
  if (s.basis === 'section') return s.samples >= 2 ? 'high' : 'medium';
  return 'low';
}

/** 신뢰도가 낮을 때 사용자에게 보여줄 사유 문구 */
export function confidenceReason(s: Pick<Section, 'basis' | 'samples'>, ko = true): string | null {
  const c = confidenceOf(s);
  if (c === 'high') return null;
  if (c === 'medium') {
    return ko ? '과거 기록 1개학기뿐' : 'only 1 past semester';
  }
  switch (s.basis) {
    case 'professor':
      return ko ? '이 분반 기록 없음 · 같은 교수 기록으로 추정' : 'estimated from same professor';
    case 'course':
      return ko ? '이 분반 기록 없음 · 같은 과목 기록으로 추정' : 'estimated from same course';
    case 'group':
      return ko ? '기록 없음 · 유사 과목군으로 추정' : 'estimated from similar courses';
    default:
      return ko ? '과거 기록 없음 · 참고용 기본값' : 'no history · default estimate';
  }
}

/** 검색 — 과목명·학정번호·교수명으로 찾는다. 전 학과가 대상(교양·타전공 포함). */
export function searchSections(data: MileageData, query: string, limit = 30): Section[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const scored: { s: Section; score: number }[] = [];
  for (const s of data.sections) {
    const name = s.name.toLowerCase();
    const code = s.code.toLowerCase();
    const prof = s.professor.toLowerCase();
    let score = -1;
    if (code.startsWith(q)) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q)) score = 2;
    else if (prof.includes(q)) score = 3;
    else if (code.includes(q)) score = 4;
    if (score >= 0) scored.push({ s, score });
    if (scored.length > 400) break;
  }
  scored.sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name));
  return scored.slice(0, limit).map((x) => x.s);
}

/** 같은 과목의 다른 분반(= 다른 교수) — 교수 선택 드롭다운에 쓴다(사용자 지시 2) */
export function siblingSections(data: MileageData, code: string): Section[] {
  return data.sections
    .filter((s) => s.code === code)
    .sort((a, b) => a.division.localeCompare(b.division));
}

/** 두 분반의 시간이 겹치는지 */
export function conflictsWith(a: Section, b: Section): boolean {
  if (a.slots.length === 0 || b.slots.length === 0) return false;
  return a.slots.some((x) => b.slots.some((y) => x.day === y.day && x.period === y.period));
}

/** 담은 과목들 중 서로 충돌하는 상대를 찾는다 */
export function findConflicts(sections: Section[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (conflictsWith(sections[i], sections[j])) {
        push(out, sections[i].id, sections[j].name);
        push(out, sections[j].id, sections[i].name);
      }
    }
  }
  return out;
}

function push(m: Map<string, string[]>, k: string, v: string) {
  const cur = m.get(k);
  if (cur) cur.push(v);
  else m.set(k, [v]);
}
