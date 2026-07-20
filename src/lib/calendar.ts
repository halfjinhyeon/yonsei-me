/**
 * 행사 기간 라벨 파서 + 캘린더용 순수 날짜 계산 유틸.
 *
 * board.json 의 행사(events)는 대략적인 게시일(date)과, 실제 행사 기간을 사람이 자유
 * 서식으로 적은 문자열(dateLabel, 예: "7/20~7/24", "4/13(월)")을 함께 갖는다. date 와
 * dateLabel 시작일이 어긋나는 실데이터가 존재하므로(게시일 ≠ 행사일), 캘린더는 dateLabel
 * 을 신뢰해 멀티데이 바를 그리되 파싱이 실패하면 date 하루로 폴백한다.
 *
 * 시간대 함정 회피: `new Date("2026-07-01")` 류의 ISO 파싱은 UTC 자정으로 해석돼 음수
 * 오프셋 로케일에서 하루 밀리는 고전 버그가 있다. 이 파일은 Date 파싱/UTC 변환을 일절
 * 쓰지 않고 순수 정수 연산(daysFromCivil)으로만 날짜를 다뤄 그 버그를 원천 차단한다.
 */

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (항상 start 이상)
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** m 은 1-based(1=1월). YYYY-MM-DD 문자열 생성 */
export function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** 해당 연/월(1-based)의 일수 */
export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 30;
}

/** (y, m 1-based, d) 가 실제 존재하는 날짜인지 (2/30, 4/31 등 배제) */
function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > daysInMonth(y, m)) return false;
  return true;
}

/**
 * 1970-01-01 을 0 으로 하는 정수 일련번호(Howard Hinnant days_from_civil).
 * m 은 1-based. Date 객체·타임존을 거치지 않는 순수 산술이다.
 */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + (d - 1);
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** daysFromCivil 의 역함수 — 일련번호 → { y, m(1-based), d } */
export function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: m <= 2 ? y + 1 : y, m, d };
}

/** "YYYY-MM-DD" → 일련번호. 형식/날짜 불량이면 NaN */
export function isoToDays(iso: string): number {
  const parts = iso.split('-');
  if (parts.length !== 3) return NaN;
  const [y, m, d] = parts.map(Number);
  if (!isValidYmd(y, m, d)) return NaN;
  return daysFromCivil(y, m, d);
}

// 시작일이 게시일과 이 정도(대략 6개월) 이상 벌어지면 연도 오배치로 보고
// ±1년 중 게시일에 가장 가까운 연도를 고른다(연초 게시-연말 행사 등 오차 방지).
const SIX_MONTHS_DAYS = 183;

// 기간 구분자: ~ ／～(U+FF5E) –(U+2013) —(U+2014) −(U+2212) - (hyphen). 앞뒤 공백 관용.
const RANGE = /(\d{1,2})[./](\d{1,2})\s*[~～–—−-]\s*(\d{1,2})[./](\d{1,2})/;
// 단일 날짜(뒤에 "(월)" 등 요일 괄호가 붙어도 앞의 M/D 만 취한다)
const SINGLE = /(\d{1,2})[./](\d{1,2})/;

/**
 * 행사 기간 라벨을 [start, end] ISO 범위로 파싱한다.
 *
 * @param baseDate 폴백/연도 기준이 되는 게시일 "YYYY-MM-DD"
 * @param label    사람이 적은 기간 문자열 (예: "7/20~7/24", "7.1 ~ 7.3", "4/13(월)", "")
 *
 * 규칙:
 *  - "M/D ~ M/D"(구분자 / 또는 ., 물결·대시류 허용) → 시작·끝 파싱.
 *    끝이 시작보다 앞서면(예: 12/28~1/3) 끝 연도 +1 로 처리(연말 걸침).
 *  - "M/D"(뒤 요일 괄호 허용) → 하루(start = end).
 *  - 연도는 baseDate 연도 기준. 단 시작이 baseDate 와 6개월 이상 벌어지면 ±1년 중 가장 가까운 연도.
 *  - 실패/빈 문자열/존재하지 않는 날짜 → { start: baseDate, end: baseDate } 폴백.
 *  - end 는 항상 start 이상임을 보장.
 */
export function parseDateLabelRange(baseDate: string, label: string): DateRange {
  const fallback: DateRange = { start: baseDate, end: baseDate };
  if (!label || !label.trim()) return fallback;

  const baseYear = Number(baseDate.split('-')[0]);
  if (!Number.isInteger(baseYear)) return fallback;
  const baseDays = isoToDays(baseDate);

  let sm: number;
  let sd: number;
  let em: number;
  let ed: number;

  const rangeMatch = label.match(RANGE);
  if (rangeMatch) {
    sm = Number(rangeMatch[1]);
    sd = Number(rangeMatch[2]);
    em = Number(rangeMatch[3]);
    ed = Number(rangeMatch[4]);
  } else {
    const single = label.match(SINGLE);
    if (!single) return fallback;
    sm = Number(single[1]);
    sd = Number(single[2]);
    em = sm;
    ed = sd;
  }

  if (!isValidYmd(baseYear, sm, sd)) return fallback;

  // 시작 연도 결정: 기본은 baseYear, 6개월 이상 벌어지면 ±1년 중 가장 가까운 연도.
  let startYear = baseYear;
  if (Number.isFinite(baseDays)) {
    const naiveDiff = Math.abs(daysFromCivil(baseYear, sm, sd) - baseDays);
    if (naiveDiff >= SIX_MONTHS_DAYS) {
      let bestDiff = Infinity;
      for (const y of [baseYear - 1, baseYear, baseYear + 1]) {
        if (!isValidYmd(y, sm, sd)) continue;
        const diff = Math.abs(daysFromCivil(y, sm, sd) - baseDays);
        if (diff < bestDiff) {
          bestDiff = diff;
          startYear = y;
        }
      }
    }
  }
  if (!isValidYmd(startYear, sm, sd)) return fallback;

  // 끝 연도: 시작과 같되, (끝 월/일)이 (시작 월/일)보다 앞서면 연말 걸침으로 +1.
  let endYear = startYear;
  if (em < sm || (em === sm && ed < sd)) endYear += 1;
  if (!isValidYmd(endYear, em, ed)) return fallback;

  const start = toIso(startYear, sm, sd);
  const end = toIso(endYear, em, ed);
  // 구성상 end >= start 지만 방어적으로 클램프한다.
  return { start, end: end < start ? start : end };
}

// ── 표시용 기간 라벨 생성 (parseDateLabelRange 의 역방향) ───────────────────

// 월(1-based) → 영문 약칭. formatPeriodLabel 의 en 라벨 생성용.
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 요일(0=일 … 6=토) → 한글 약칭. 단일 날짜 ko 라벨의 "(월)" 표기용.
const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 시작일·종료일(ISO)을 사람이 읽는 기간 라벨 { ko, en } 으로 만든다.
 *
 * CMS 가 시작/종료 캘린더 피커로 받은 날짜를 저장할 때 이 함수로 date_label_ko/en 을
 * 자동 생성해 넣는다 — 기존 라벨 소비자(홈 pill·목록 태그)는 그대로 두고, 그동안 실데이터
 * 전부 공백이던 EN 라벨 문제를 해결한다. parseDateLabelRange 와 마찬가지로 Date 객체·타임존을
 * 일절 거치지 않고 순수 산술(isoToDays/civilFromDays)로만 날짜를 다룬다.
 *
 * @param start "YYYY-MM-DD" 시작일
 * @param end   "YYYY-MM-DD" 종료일 — 없거나 빈 값, 불량, 시작 이하이면 "하루"로 축약
 *
 * 규칙:
 *  - 하루: ko `7/20(월)`(요일 병기) · en `Jul 20`
 *  - 기간(같은 달·해): ko `7/20~7/24` · en `Jul 20 – 24`(끝 월 약칭 생략)
 *  - 기간(달/해 넘김): ko `6/30~7/2`·`12/28~1/3` · en `Jun 30 – Jul 2`·`Dec 28 – Jan 3`(양쪽 월 표기)
 *  - 시작일이 실재하지 않는 날짜면 { ko: '', en: '' }.
 *  생성되는 ko 라벨은 parseDateLabelRange 로 다시 파싱하면 동일 범위로 왕복 호환된다
 *  (예: formatPeriodLabel('2026-12-28','2027-01-03').ko === '12/28~1/3' 이고
 *   parseDateLabelRange('2026-12-28','12/28~1/3').end === '2027-01-03').
 */
export function formatPeriodLabel(start: string, end?: string | null): { ko: string; en: string } {
  const startOrd = isoToDays(start);
  if (Number.isNaN(startOrd)) return { ko: '', en: '' };
  const s = civilFromDays(startOrd);

  const endOrd = end ? isoToDays(end) : NaN;
  // 종료일이 없거나 불량이거나 시작 이하이면 하루로 축약("null = 하루" 단일 의미와 일치).
  const isRange = !Number.isNaN(endOrd) && endOrd > startOrd;

  if (!isRange) {
    // 일련번호 0 = 1970-01-01 = 목요일 기준 산술 요일(0=일 … 6=토).
    const dow = (((startOrd + 4) % 7) + 7) % 7;
    return {
      ko: `${s.m}/${s.d}(${KO_WEEKDAYS[dow]})`,
      en: `${EN_MONTHS[s.m - 1]} ${s.d}`,
    };
  }

  const e = civilFromDays(endOrd);
  const ko = `${s.m}/${s.d}~${e.m}/${e.d}`;
  // en: 같은 달·해면 끝의 월 약칭을 생략(`Jul 20 – 24`), 달/해가 넘어가면 양쪽에 월을 붙인다.
  const sameMonth = s.m === e.m && s.y === e.y;
  const en = sameMonth
    ? `${EN_MONTHS[s.m - 1]} ${s.d} – ${e.d}`
    : `${EN_MONTHS[s.m - 1]} ${s.d} – ${EN_MONTHS[e.m - 1]} ${e.d}`;
  return { ko, en };
}
