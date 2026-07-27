/**
 * 조건부 className 병합 (경량 clsx 대체).
 * 문자열/불린/객체를 받아 truthy 클래스만 공백으로 join.
 */
type ClassValue = string | number | null | false | undefined | Record<string, boolean>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string' || typeof input === 'number') {
      out.push(String(input));
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) out.push(key);
      }
    }
  }
  return out.join(' ');
}

/** 학부 대표 국번 — 내선만 적힌 값을 완전한 번호로 되살릴 때 붙인다.
 *  교수진 디렉터리의 번호가 모두 이 국번이라 근거가 있다(내선 5건을 대조해 확인). */
const DEPT_PREFIX = '02)2123-';

/** 번호 한 개를 `02)2123-4567` 꼴로 맞춘다. 판단이 안 서면 원문 그대로 둔다. */
function normalizeOnePhone(raw: string): string {
  const v = raw.replace(/\s+/g, '');
  if (!v) return raw.trim();
  // +82-2-2123-4567 → 국내 표기로
  const intl = /^\+82-?0?(\d{1,2})-?(\d{3,4})-?(\d{4})$/.exec(v);
  if (intl) return `0${intl[1]})${intl[2]}-${intl[3]}`;
  // 이미 `02)2123-4567` · `032)749-3122` 꼴이면 그대로
  if (/^\d{2,3}\)\d{3,4}-\d{4}$/.test(v)) return v;
  // 02-2123-4567 → 02)2123-4567
  const dashed = /^(\d{2,3})-(\d{3,4})-(\d{4})$/.exec(v);
  if (dashed) return `${dashed[1]})${dashed[2]}-${dashed[3]}`;
  // 지역번호 없는 2123-4567 → 대표 지역번호 보강
  const local = /^(\d{3,4})-(\d{4})$/.exec(v);
  if (local) return `02)${local[1]}-${local[2]}`;
  // 내선 4자리만 (2819 등) → 대표 국번 + 내선
  if (/^\d{4}$/.test(v)) return `${DEPT_PREFIX}${v}`;
  return raw.trim();
}

/**
 * 전화번호 표기 통일 — 교수진 목록(`02)2123-4567`)과 같은 꼴로 맞춘다.
 *
 * 교원정보 시스템에서 긁어온 값은 표기가 제각각이다: 내선만(`2819`), 국제 표기
 * (`+82-2-2123-2825`), 하이픈(`02-2123-2820`), 지역번호 누락(`2123-5822`),
 * 복수 번호(`02)2123-2846, 6131`, `02)2123-2828/6548`). 그대로 두면 상세 페이지에
 * "2819" 처럼 번호로 보이지 않는 값이 노출된다.
 *
 * 복수 번호는 버리지 않고 각각 정규화해 `, ` 로 잇는다 — 둘째가 다른 기관 번호인
 * 경우(예: 032 국번)가 있어 임의로 떨어뜨리면 정보가 사라진다.
 */
export function formatPhone(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  return s
    .split(/\s*[/,]\s*/)
    .filter(Boolean)
    .map(normalizeOnePhone)
    .join(', ');
}

/** 로케일에 맞춰 날짜 포맷 (예: 2026. 6. 20. / Jun 20, 2026) */
export function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: locale === 'ko' ? 'numeric' : 'short',
    day: 'numeric',
  }).format(date);
}
