/**
 * 체커 파이프라인의 **학기 목록 단일 출처** (개발 전용)
 *
 *   import { DEFAULT_LAST_TERM, termsThrough } from './terms.mjs';
 *   termsThrough();            // 2022-10 … DEFAULT_LAST_TERM
 *   termsThrough('2026-21');   // 2022-10 … 2026-21
 *
 * 하는 일
 *   `crawl-terms.mjs`(크롤 대상)와 `build-catalog.mjs`(결번 판정용 기대 학기)가 쓰던 학기
 *   목록을 한 곳으로 모은다. 예전에는 양쪽에 따로 박혀 있어 새 학기마다 **두 곳을 손으로**
 *   고쳐야 했고(체커 README 2단계), 한쪽만 고치면 "크롤은 했는데 카탈로그가 결번으로 본다"
 *   같은 어긋남이 났다.
 *
 * 학기 코드
 *   10=1학기 · 11=여름계절 · 20=2학기 · 21=겨울계절. 연도 안의 시간순은 10→11→20→21 이고,
 *   `'10' < '11' < '20' < '21'` 이라 **문자열 사전순이 곧 시간순**이다 — 비교·정렬을 그냥
 *   문자열로 한다.
 *
 * ⚠️ 함정
 *   · 새 학기를 추가하는 정식 방법은 두 가지다 — 스크립트에 `--through <YYYY-SS>` 를 주거나,
 *     상시로 올릴 거면 아래 `DEFAULT_LAST_TERM` 을 고친다. **다른 곳에 학기를 또 적지 마라.**
 *   · 목록은 "있어야 할 학기"지 "받아 둔 학기"가 아니다. 실제 수집 여부는
 *     `crawl-terms.mjs --list`, 결번은 `build-catalog.mjs` 의 커버리지 출력이 본다.
 *   · 2022-1 이전은 크롤 범위 밖이다(그 시기 옛 이름은 curated aliases 로 수동 보강).
 */

/** 크롤 범위의 시작 학기 — 이보다 앞은 수강편람 크롤 대상이 아니다. */
export const FIRST_TERM = '2022-10';

/** `--through` 를 주지 않았을 때의 마지막 학기. 새 학기가 상시화되면 여기를 올린다. */
export const DEFAULT_LAST_TERM = '2026-20';

/** 유효한 학기 문자열 형식 — `YYYY-{10|11|20|21}` */
export const TERM_PATTERN = /^\d{4}-(10|11|20|21)$/;

/** 연도 안의 학기 코드 (시간순) */
const CODES = ['10', '11', '20', '21'];

/**
 * `FIRST_TERM` 부터 `last` 까지의 학기 문자열 배열(시간순 = 사전순).
 *
 * @param {string} [last] 마지막 학기 `YYYY-SS` (기본 `DEFAULT_LAST_TERM`)
 * @returns {string[]}
 * @throws {Error} 형식이 틀렸거나 `FIRST_TERM` 보다 앞선 학기일 때
 */
export function termsThrough(last = DEFAULT_LAST_TERM) {
  if (typeof last !== 'string' || !TERM_PATTERN.test(last)) {
    throw new Error(`학기 형식이 아니다: ${last} (예: 2026-20 — 코드는 10|11|20|21)`);
  }
  if (last < FIRST_TERM) {
    throw new Error(`마지막 학기가 시작 학기(${FIRST_TERM})보다 앞선다: ${last}`);
  }
  const firstYear = Number(FIRST_TERM.slice(0, 4));
  const lastYear = Number(last.slice(0, 4));
  const terms = [];
  for (let y = firstYear; y <= lastYear; y++) {
    for (const code of CODES) {
      const term = `${y}-${code}`;
      if (term < FIRST_TERM || term > last) continue;
      terms.push(term);
    }
  }
  return terms;
}
