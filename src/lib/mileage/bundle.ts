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
    // ── 아래 셋은 만점 포화·미달 모형이 들어오며 추가된 열이다. 구 번들에는 없으므로
    //    선택 요소로 둔다(없으면 0 / null / false 로 본다 = 예전 동작 그대로).
    number?, // 14 piSat   만점 포화 확률 0~1
    (number | null)?, // 15 tieWin  만점 동점 시 승률 0~1
    (0 | 1)?, // 16 underEnrolled 작년 미달 여부
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
      // 만점 포화 혼합·미달 바닥값을 admitProbability 가 소비한다(predict.ts 참고).
      // 이 셋을 빠뜨리면 컷이 만점에 닿은 분반과 미달 분반의 확률이 조용히 틀어진다.
      piSat: r[14] ?? 0,
      tieWin: r[15] ?? null,
      underEnrolled: r[16] === 1,
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

/* ────────────────────────────────────────────────────────────────
 * 분반 상세 — 기본 통계 / 정원·규정 / 과거 이력 (지연 로딩)
 * 본 번들(286KB)과 분리해 두고, 사용자가 상세를 처음 열 때만 받는다(1MB).
 * ──────────────────────────────────────────────────────────────── */

export interface SectionDetail {
  /** ① 기본 통계 — 가장 최근 학기 기준 */
  stats: {
    semester: string;
    capacity: number | null;
    applicants: number | null;
    avg: number | null;
    max: number | null;
  } | null;
  /** ② 정원 & 규정 */
  rules: {
    maxAllowed: number | null;
    /** "30(Y)" 형태 — 앞은 전공자 정원, 괄호는 제한 여부 */
    majorQuota: string | null;
    /** 학년별 정원. 전부 0이면 null(학년 제한 없음) */
    yearQuotas: Record<string, number> | null;
  };
  /**
   * 현재 담당 교수의 이 과목 이력 — 분반을 옮겼어도 전부 따라온다.
   * 학생은 분반 번호가 아니라 담당 교수를 보고 고르므로 화면의 '과거 이력'은 이것이 주가 된다.
   * [학기, 그때의 분반, 컷, 정원, 신청자]
   */
  professorHistory?: [string, string, number, number | null, number | null][];
  /** 학년별 컷(근거 학기) — 학년 정원이 걸린 과목은 학년마다 컷이 다르다.
   *  cut 이 null 이면 그 학년 합격자가 0명이라 컷이 정의되지 않는다(그 학년 전멸). */
  perGrade: Record<string, { cut: number | null; applied: number; won: number }> | null;
  /** 동점(배점=컷) 시 갈린 총이수학점 비율 경계 */
  tieCredit: { winMin: number; loseMax: number | null } | null;
  /**
   * `perGrade`·`tieCredit`(그리고 본 번들 rows 의 `tieWin`)이 근거로 삼은 학기 "YYYY-SS".
   *
   * 보통은 최신 학기라 **없다**. 라인업 일치 학기 오버라이드(precompute 의 `RECENCY_ALIAS`)가
   * 걸린 분반만 값을 갖는다 — 대상 학기의 교수 구성이 직전 학기가 아니라 더 과거 학기와
   * 같을 때, 동점 통계도 그 학기 원장으로 산출한 것이다. 화면은 "작년" 대신 이 학기를 말해야 한다.
   */
  tieBasis?: string;
}

let detailCache: Record<string, SectionDetail> | null = null;
let detailPromise: Promise<Record<string, SectionDetail>> | null = null;

/** 상세 데이터를 한 번만 받아 캐시한다. */
export function fetchDetails(
  url = '/data/mileage-2026-20-detail.json',
): Promise<Record<string, SectionDetail>> {
  if (detailCache) return Promise.resolve(detailCache);
  detailPromise ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`상세 데이터를 불러오지 못했습니다 (${r.status})`);
      return r.json();
    })
    .then((j: { detail: Record<string, SectionDetail> }) => {
      detailCache = j.detail;
      return detailCache;
    })
    .catch((e) => {
      detailPromise = null; // 실패는 캐시하지 않는다 — 다시 열면 재시도
      throw e;
    });
  return detailPromise;
}

/** "30(Y)" → 전공자 정원 숫자. 파싱 실패 시 null */
export function majorQuotaCount(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
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
