// 인라인 편집의 필수값 검증 — "저장을 눌러야 알 수 있던 실패"를 미리 말해 준다.
//
// 폼 편집에는 이미 resources.ts 의 validateForm 이 있지만, 목록에서 셀을 그 자리에서
// 고치는 화면에는 검증이 하나도 없었다. 필수 칸을 비우고 트레이의 "저장 (커밋)"을
// 누르면 빈 값이 그대로 커밋돼 사이트에 빈 카드가 뜬다. 그래서 같은 규칙을
// 인라인 경로('email' / 'role.ko')에도 적용하되, **커밋을 막는 방식**이 아니라
// 저장 버튼을 미리 잠그고 이유를 말하는 방식으로 쓴다.
//
// React 의존이 없는 순수 모듈이다 — 화면은 이 결과를 어떻게 보여줄지만 정한다.

import {
  findInlineField,
  inlineFieldLabel,
  splitInlinePath,
  type InlinePatch,
  type InlineValue,
} from '@/lib/admin/inline';
import type { FieldDef } from '@/lib/admin/resources';

/** 이유 한 줄에 나열할 필드 라벨 최대 개수 — 그 이상은 "외 n종"으로 접는다 */
const MAX_LABELS = 3;

/**
 * 인라인 편집에서 비워 버린 필수 칸을 찾는다.
 *
 * ⚠️ **사용자가 실제로 건드린 항목(edits 에 키가 있는 인덱스)만** 검사한다.
 *    원본 데이터에 이미 비어 있던 필수값까지 잡으면, 남이 만든 빈칸 때문에 내가
 *    고친 다른 값을 저장할 수 없게 된다(그 데이터는 이 화면의 책임이 아니다).
 *    같은 이유로 "고쳤다가 원래 값으로 되돌린" 경로는 patch 에서 이미 빠져 있어
 *    (CollectionEditor.patchInline 의 isInlineUnchanged 규칙) 여기 오지 않는다.
 *
 * @returns 'index:path' 형태의 집합 (예: '3:name', '7:role.ko')
 */
export function invalidInlinePaths(
  fields: FieldDef[],
  edits: Record<number, InlinePatch>,
): Set<string> {
  const out = new Set<string>();
  for (const [index, patch] of Object.entries(edits)) {
    for (const [path, value] of Object.entries(patch)) {
      if (isBlankRequired(fields, path, value)) out.add(`${index}:${path}`);
    }
  }
  return out;
}

/** 사용자에게 보여줄 이유 한 줄. 막을 것이 없으면 null */
export function invalidReason(fields: FieldDef[], invalid: Set<string>): string | null {
  if (invalid.size === 0) return null;

  // 라벨은 종류별로 한 번씩만 — 같은 필드를 열 곳 비웠다고 "이름, 이름, 이름…"이
  // 되면 정작 어느 종류가 빠졌는지가 안 읽힌다. 몇 곳인지는 앞의 숫자가 말한다.
  const labels: string[] = [];
  for (const key of invalid) {
    const path = key.slice(key.indexOf(':') + 1);
    const label = inlineFieldLabel(findInlineField(fields, path), path);
    if (!labels.includes(label)) labels.push(label);
  }

  const shown = labels.slice(0, MAX_LABELS).join(', ');
  const more = labels.length > MAX_LABELS ? ` 외 ${labels.length - MAX_LABELS}종` : '';
  return `필수 항목 ${invalid.size}곳이 비어 있습니다 — ${shown}${more}. 채워야 저장할 수 있습니다.`;
}

/** 이 경로가 "필수인데 공백뿐"인가 */
function isBlankRequired(fields: FieldDef[], path: string, value: InlineValue): boolean {
  const field = findInlineField(fields, path);
  if (!field?.required) return false;

  // checkbox·imageList 는 "비었다"를 정의할 수 없다 — 끄기도 0장도 정상 값이고,
  // 저장 규칙(키 생략/빈 배열)도 빈 문자열과 전혀 다르다.
  if (field.kind === 'checkbox' || field.kind === 'imageList') return false;

  // localized 는 한국어만 필수 — resources.ts 의 validateForm 과 같은 규칙이다.
  // en 이 비면 localizedValue 가 ko 를 복사하므로 영문 칸은 비어도 사이트가 깨지지 않는다.
  const { sub } = splitInlinePath(path);
  if (field.kind === 'localized' && sub === 'en') return false;

  return typeof value !== 'boolean' && value.trim() === '';
}
