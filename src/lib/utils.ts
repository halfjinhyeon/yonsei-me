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

/** 로케일에 맞춰 날짜 포맷 (예: 2026. 6. 20. / Jun 20, 2026) */
export function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: locale === 'ko' ? 'numeric' : 'short',
    day: 'numeric',
  }).format(date);
}
