// 인라인 편집 파이프라인 — 목록에서 "그 자리에서 고친 값"을 원본 JSON 에 되돌려 쓴다.
//
// 왜 별도 모듈인가.
// 이전 구현(CollectionEditor.patchCard)은 인라인 값을 무조건 문자열로 보고 빈 값이면
// null 로 썼다. 교수진(전부 text + emptyAs:'null')에서만 맞는 규칙이라, 한·영 쌍
// (localized)이나 불리언(checkbox)을 같은 규칙으로 저장하면 데이터가 조용히 깨진다.
// 그래서 "값을 적용하는 곳"을 여기 한 곳으로 모으고, 반드시 FieldDef.kind 를 보고
// 직렬화한다. 폼 저장(defaultFromForm)과 결과가 어긋나면 같은 파일이 저장 경로에
// 따라 다른 모양이 되므로, 아래 규칙은 defaultFromForm 과 짝을 맞춘 것이다.
//
// 디프 최소화: 항목 전체를 fromForm 으로 재직렬화하지 않는다. 그러면 키 순서가
// 바뀌고, 스키마에 없는 키(스크랩 원본에만 남아 있는 값)가 통째로 날아간다.
// 원본 객체를 복사해 "건드린 키만" 바꾼다.

import {
  localizedValue,
  type FieldDef,
  type FormRecord,
  type LocalizedPair,
} from '@/lib/admin/resources';

/** 인라인 편집 값 — 문자열(text/select/month/…) 또는 불리언(checkbox) */
export type InlineValue = string | boolean;

/** 편집 경로: 'email' 또는 localized 필드의 한쪽 'role.ko' / 'role.en' */
export type InlinePatch = Record<string, InlineValue>;

/**
 * 체크박스를 끄면 함께 지워야 하는 종속 필드.
 * 연구실의 "모집 인원"은 "학부 인턴 모집 중"이 꺼지면 의미가 없어 labs.fromForm 이
 * 이미 지우고 있다. 인라인에서 토글만 껐을 때도 같은 결과가 나와야 JSON 이 저장
 * 경로에 따라 달라지지 않는다. (필드 key 기준 — 리소스 간 중복되지 않는다.)
 */
const CHECKBOX_DEPENDENTS: Record<string, string[]> = {
  internRecruiting: ['internCount'],
};

/** 'role.ko' → { key:'role', sub:'ko' } */
export function splitInlinePath(path: string): { key: string; sub?: 'ko' | 'en' } {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return { key: path };
  const sub = path.slice(dot + 1);
  if (sub !== 'ko' && sub !== 'en') return { key: path };
  return { key: path.slice(0, dot), sub };
}

export function findInlineField(fields: FieldDef[], path: string): FieldDef | undefined {
  const { key } = splitInlinePath(path);
  return fields.find((f) => f.key === key);
}

/** 원본 raw 항목에서 이 경로의 현재 값 (편집 전 값) */
export function readInline(
  fields: FieldDef[],
  item: Record<string, unknown> | undefined,
  path: string,
): InlineValue {
  const { key, sub } = splitInlinePath(path);
  const field = fields.find((f) => f.key === key);
  const v = item?.[key];
  if (field?.kind === 'checkbox') return v === true;
  if (field?.kind === 'localized') {
    const pair = (v ?? {}) as Partial<LocalizedPair>;
    return (sub === 'en' ? pair.en : pair.ko) ?? '';
  }
  return v == null ? '' : String(v);
}

/** 트레이·화면에 보여줄 사람이 읽는 값 (select 는 옵션 라벨, checkbox 는 예/아니오) */
export function displayInline(field: FieldDef | undefined, value: InlineValue): string {
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  if (field?.kind === 'checkbox') return value === 'true' ? '예' : '아니오';
  if (field?.kind === 'select') {
    if (value === '') return field.emptyOptionLabel ?? '';
    return field.options.find((o) => o.value === value)?.label ?? value;
  }
  return value;
}

/** 트레이의 필드 라벨 — localized 는 어느 쪽을 고쳤는지까지 밝힌다 */
export function inlineFieldLabel(field: FieldDef | undefined, path: string): string {
  const { key, sub } = splitInlinePath(path);
  const base = field?.label ?? key;
  if (field?.kind !== 'localized' || !sub) return base;
  return `${base}${sub === 'en' ? ' (English)' : ' (한국어)'}`;
}

/** 고친 값이 원본과 같아졌는가 — 같으면 대기 목록에서 빼야 더티 표시가 남지 않는다 */
export function isInlineUnchanged(
  fields: FieldDef[],
  item: Record<string, unknown> | undefined,
  path: string,
  value: InlineValue,
): boolean {
  return readInline(fields, item, path) === value;
}

/**
 * 원본 raw 항목에 인라인 패치를 적용해 새 항목을 만든다 (커밋 직전에 부른다).
 * 건드리지 않은 키는 값·순서 그대로 남는다.
 */
export function applyInlinePatch(
  fields: FieldDef[],
  item: Record<string, unknown>,
  patch: InlinePatch,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...item };

  // localized 는 ko/en 이 따로 들어오므로 먼저 쌍으로 모은다.
  // 한쪽만 고쳐도 localizedValue 를 통과시켜야 en 빈 값 → ko 복사 규칙이 유지된다
  // (pick 의 en 폴백이 `??` 라 빈 문자열은 폴백되지 않는다).
  const pairs = new Map<string, LocalizedPair>();

  for (const [path, value] of Object.entries(patch)) {
    const { key, sub } = splitInlinePath(path);
    const field = fields.find((f) => f.key === key);
    if (!field) continue;

    if (field.kind === 'localized') {
      const cur =
        pairs.get(key) ??
        ({
          ko: String(readInline(fields, item, `${key}.ko`)),
          en: String(readInline(fields, item, `${key}.en`)),
        } as LocalizedPair);
      pairs.set(key, { ...cur, [sub ?? 'ko']: String(value) });
      continue;
    }

    if (field.kind === 'checkbox') {
      if (value === true) {
        out[key] = true;
      } else {
        // 끄면 키 자체를 생략한다 (JSON 최소화 — 없으면 false. labs.fromForm 과 동일)
        delete out[key];
        for (const dep of CHECKBOX_DEPENDENTS[key] ?? []) delete out[dep];
      }
      continue;
    }

    // 그 외 문자열 계열 — 빈 값 처리는 FieldDef.emptyAs 를 따른다
    const s = String(value).trim();
    if (s === '') {
      if (field.emptyAs === 'null') out[key] = null;
      else if (field.emptyAs === 'omit') delete out[key];
      else out[key] = '';
    } else {
      out[key] = s;
    }
  }

  for (const [key, pair] of pairs) out[key] = localizedValue(pair.ko, pair.en);
  return out;
}

/**
 * 표시용 폼 값에 패치를 얹는다 — 목록·상세 폼이 "고치는 중인 값"을 보게 한다.
 * (저장용 applyInlinePatch 와 달리 빈 값 규칙을 적용하지 않는다. 입력 도중 빈
 *  문자열이 null 로 바뀌면 커서가 있는 칸의 값이 사라진 것처럼 보인다.)
 */
export function applyInlineToForm(
  fields: FieldDef[],
  form: FormRecord,
  patch: InlinePatch | undefined,
): FormRecord {
  if (!patch) return form;
  const next: FormRecord = { ...form };
  for (const [path, value] of Object.entries(patch)) {
    const { key, sub } = splitInlinePath(path);
    const field = fields.find((f) => f.key === key);
    if (!field) continue;
    if (field.kind === 'localized') {
      const cur = (next[key] ?? { ko: '', en: '' }) as LocalizedPair;
      next[key] = { ...cur, [sub ?? 'ko']: String(value) };
    } else if (field.kind === 'checkbox') {
      next[key] = value === true;
    } else {
      next[key] = String(value);
    }
  }
  return next;
}

/** 폼 값에서 인라인 경로의 표시 값을 꺼낸다 (입력 컨트롤의 value) */
export function formInlineValue(
  fields: FieldDef[],
  form: FormRecord,
  path: string,
): InlineValue {
  const { key, sub } = splitInlinePath(path);
  const field = fields.find((f) => f.key === key);
  const v = form[key];
  if (field?.kind === 'checkbox') return v === true;
  if (field?.kind === 'localized') {
    const pair = (v ?? { ko: '', en: '' }) as LocalizedPair;
    return (sub === 'en' ? pair.en : pair.ko) ?? '';
  }
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return '';
  return v.ko ?? '';
}
