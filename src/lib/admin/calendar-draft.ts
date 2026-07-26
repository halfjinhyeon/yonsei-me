// 캘린더 초안(draft) 계산 — 화면에서 만들고 고치고 지운 일정 목록을,
// 커밋 payload 와 변경 트레이 목록으로 바꾸는 순수 함수들.
//
// 왜 다른 리소스와 다른 경로인가.
// CollectionEditor 의 인라인 편집은 "배열 인덱스"를 키로 대기 변경을 모은다. 그래서
// 추가·삭제를 함께 대기시키면 인덱스가 밀려 엉뚱한 항목을 덮어쓸 수 있고, 실제로
// 삭제만은 즉시 커밋하는 예외를 두고 있다(CollectionEditor.handleDelete 주석).
// 그러나 캘린더는 "달을 보며 그 자리에서 만들고 지운다"가 기본 동작이라, 일정 하나를
// 지울 때마다 커밋이 나가면 흐름이 끊긴다. 그래서 캘린더만 인덱스가 아니라 항목의
// id 를 키로 삼고, 커밋 때 **배열 전체를 새로 직렬화**한다. 항목이 수십 건 규모라
// 디프 최소화보다 "추가·수정·삭제가 한 번에 나간다"는 단순함이 낫다고 봤다.
// (id 가 키라 순서가 바뀌어도 어느 항목의 변경인지 잃지 않는다.)
//
// 화면 상태를 raw JSON 이 아니라 FormRecord 로 들고 있는 이유: 저장용 직렬화
// (defaultFromForm)는 title.en 이 비면 ko 를 복사하고 end/href 빈 값은 키를 지운다.
// 타자를 칠 때마다 그 규칙이 적용되면 English 칸에 한국어가 들어차는 것처럼 보인다.
// 규칙은 커밋 직전 한 번만 통과시킨다.

import { displayInline, formInlineValue, type InlineValue } from '@/lib/admin/inline';
import {
  cellText,
  defaultFromForm,
  type FieldDef,
  type FormRecord,
  type LocalizedPair,
} from '@/lib/admin/resources';

/** 트레이 한 줄에 필요한 만큼만 — scopeLabel 은 부르는 쪽(에디터)이 붙인다 */
export interface CalendarChange {
  id: string;
  itemLabel: string;
  fieldLabel: string;
  before: string;
  after: string;
}

/** 항목 식별자 (모든 계산의 키) */
export function itemId(form: FormRecord): string {
  return String(form.id ?? '');
}

/**
 * 새 일정 한 건. 그 날짜로 시작하는 하루짜리 학사일정에서 출발한다
 * (관리자가 가장 자주 만드는 모양이고, 아니면 아래 편집 패널에서 바로 바꾼다).
 *
 * id 는 `cal-{시작일}-{6자리}`. 같은 날 여러 건을 만들어도 겹치지 않게 이미 쓰인
 * id 를 피해 다시 뽑는다 — id 가 곧 대기 변경의 키라 중복되면 두 일정이 한 항목으로
 * 보인다.
 */
export function newCalendarItem(startIso: string, taken: Iterable<string>): FormRecord {
  const used = new Set(taken);
  let id = '';
  do {
    const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    id = `cal-${startIso}-${rand}`;
  } while (used.has(id));
  return {
    id,
    title: { ko: '', en: '' } as LocalizedPair,
    start: startIso,
    end: '',
    category: 'academic',
    href: '',
  };
}

/**
 * 커밋 payload — 폼 값 배열을 content/calendar.json 에 그대로 쓸 배열로.
 * 빈 값 규칙(end/href 키 생략)과 title.en 폴백은 전부 defaultFromForm 이 맡는다
 * (다른 리소스의 저장 결과와 같은 모양이 나오게 하기 위해 여기서 다시 판단하지 않는다).
 * 파일 안 순서는 시작일 오름차순 — 사람이 저장소에서 열어 볼 때 달력 순서와 같도록.
 */
export function calendarPayload(
  fields: FieldDef[],
  items: FormRecord[],
): Record<string, unknown>[] {
  return items
    .slice()
    .sort((a, b) => {
      const sa = String(a.start ?? '');
      const sb = String(b.start ?? '');
      if (sa !== sb) return sa < sb ? -1 : 1;
      // 같은 날은 id 로 안정 정렬 — 저장할 때마다 순서가 흔들리면 디프가 지저분해진다
      return itemId(a) < itemId(b) ? -1 : itemId(a) > itemId(b) ? 1 : 0;
    })
    .map((form) => defaultFromForm(fields, form));
}

/** 편집 경로 목록 — localized 는 한/영 두 줄로 편다 */
function editPaths(fields: FieldDef[]): string[] {
  return fields
    .filter((f) => f.key !== 'id')
    .flatMap((f) => (f.kind === 'localized' ? [`${f.key}.ko`, `${f.key}.en`] : [f.key]));
}

function pathLabel(fields: FieldDef[], path: string): string {
  const [key, sub] = path.split('.');
  const field = fields.find((f) => f.key === key);
  const base = field?.label ?? key;
  if (!sub) return base;
  return `${base}${sub === 'en' ? ' (English)' : ' (한국어)'}`;
}

function show(fields: FieldDef[], path: string, value: InlineValue): string {
  const field = fields.find((f) => f.key === path.split('.')[0]);
  const text = displayInline(field, value);
  return text.trim() === '' ? '없음' : text;
}

/** 목록 표시 이름 — 제목이 아직 비었으면 날짜라도 보여 준다 */
function label(form: FormRecord): string {
  const title = cellText(form, 'title').trim();
  const start = cellText(form, 'start').trim();
  return title ? `${start} ${title}` : `${start} (제목 없음)`;
}

/**
 * 원본과 초안을 id 로 맞대어 대기 변경 목록을 만든다.
 * 순서는 초안 배열 순서(= 화면 순서) → 그다음 삭제분. 화면에서 눈에 띄는 순서와
 * 트레이 순서가 같아야 "무엇을 고쳤더라"를 되짚을 수 있다.
 */
export function calendarChanges(
  fields: FieldDef[],
  original: FormRecord[],
  draft: FormRecord[],
): CalendarChange[] {
  const byId = new Map(original.map((f) => [itemId(f), f]));
  const paths = editPaths(fields);
  const list: CalendarChange[] = [];

  for (const item of draft) {
    const id = itemId(item);
    const before = byId.get(id);
    if (!before) {
      list.push({
        id: `add:${id}`,
        itemLabel: label(item),
        fieldLabel: '새 일정',
        before: '없음',
        after: label(item),
      });
      continue;
    }
    for (const path of paths) {
      const a = formInlineValue(fields, before, path);
      const b = formInlineValue(fields, item, path);
      if (a === b) continue;
      list.push({
        id: `set:${id}:${path}`,
        itemLabel: label(item),
        fieldLabel: pathLabel(fields, path),
        before: show(fields, path, a),
        after: show(fields, path, b),
      });
    }
  }

  const draftIds = new Set(draft.map(itemId));
  for (const item of original) {
    const id = itemId(item);
    if (draftIds.has(id)) continue;
    list.push({
      id: `del:${id}`,
      itemLabel: label(item),
      fieldLabel: '일정 삭제',
      before: label(item),
      after: '삭제됨',
    });
  }
  return list;
}

/**
 * 트레이의 항목별 되돌리기 — 변경 하나만 원래 값으로 돌린 초안을 돌려준다.
 * 삭제 되돌리기는 원본에서의 위치가 아니라 시작일 순서로 다시 끼워 넣는다
 * (화면은 달력이라 배열 위치가 눈에 보이지 않는다).
 */
export function revertCalendarChange(
  fields: FieldDef[],
  original: FormRecord[],
  draft: FormRecord[],
  changeId: string,
): FormRecord[] {
  const [kind, id, ...rest] = changeId.split(':');
  const path = rest.join(':');
  const source = original.find((f) => itemId(f) === id);

  if (kind === 'add') return draft.filter((f) => itemId(f) !== id);

  if (kind === 'del') {
    if (!source) return draft;
    const next = [...draft, source];
    next.sort((a, b) => (String(a.start ?? '') < String(b.start ?? '') ? -1 : 1));
    return next;
  }

  if (kind === 'set' && source) {
    const [key, sub] = path.split('.');
    return draft.map((f) => {
      if (itemId(f) !== id) return f;
      if (sub) {
        const cur = (f[key] ?? { ko: '', en: '' }) as LocalizedPair;
        const src = (source[key] ?? { ko: '', en: '' }) as LocalizedPair;
        return { ...f, [key]: { ...cur, [sub]: sub === 'en' ? src.en : src.ko } };
      }
      return { ...f, [key]: source[key] ?? '' };
    });
  }
  return draft;
}
