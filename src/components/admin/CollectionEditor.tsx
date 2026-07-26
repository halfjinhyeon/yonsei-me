'use client';

// 스키마 기반 컬렉션 편집기 — resources.ts 의 ResourceDef 를 읽어 목록·검색·
// 순서 변경·폼 편집을 자동 구성한다. 정적 사이트라 서버 DB가 없어 GitHub
// Contents API 로 content/*.json 을 직접 커밋한다("Git이 곧 DB").
//
// 디프 최소화 원칙: 저장 시 전체를 재직렬화하지 않고, 원본 배열(raw)에서
// 수정=해당 인덱스만 교체 / 추가=push / 삭제=splice 만 적용해 나머지 항목의
// 바이트를 그대로 유지한다. (record 포맷은 커밋 직전 arrayToRecord 로 변환.)
//
// 미저장 변경(카드 인라인 편집·순서 변경)의 표시와 되돌리기는 화면 하단의 변경
// 트레이가 맡는다(useRegisterTray). 커밋 자체는 여기 있는 기존 전략을 그대로 쓰고,
// 트레이는 그 위에 얹는 표시 계층일 뿐이다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  commitJson,
  commitText,
  loadJson,
  loadTextOptional,
  savedBanner,
  uploadImageToRepo,
  type RepoConfig,
} from '@/lib/admin/github';
import {
  arrayToRecord,
  cellText,
  defaultFromForm,
  defaultToForm,
  recordToArray,
  type FormRecord,
  type ResourceDef,
} from '@/lib/admin/resources';
import {
  applyInlinePatch,
  applyInlineToForm,
  displayInline,
  findInlineField,
  inlineFieldLabel,
  isInlineUnchanged,
  readInline,
  type InlinePatch,
  type InlineValue,
} from '@/lib/admin/inline';
import {
  calendarChanges,
  calendarPayload,
  itemId as calendarItemId,
  revertCalendarChange,
} from '@/lib/admin/calendar-draft';
import { RecordForm } from './RecordForm';
import { CalendarEditor } from './CalendarEditor';
import { ClubRowsEditor } from './ClubRowsEditor';
import { ExpandRowsEditor } from './ExpandRowsEditor';
import { FacultyCardsEditor } from './FacultyCardsEditor';
import { HistoryTimelineEditor } from './HistoryTimelineEditor';
import { InlineTable } from './InlineTable';
import { MoveButtons } from './InlineFields';
import { LabCardsEditor } from './LabCardsEditor';
import { CmsPanelHead } from './CmsPanelHead';
import { CommitBanner } from './CommitBanner';
import { CmsModal } from './CmsModal';
import { useRegisterTray, type PendingChange } from './ChangeTrayContext';

interface Props {
  config: RepoConfig;
  resource: ResourceDef;
  onDirtyChange?: (dirty: boolean) => void;
}

type RawItem = Record<string, unknown>;

// 편집 상태: index<0 이면 새 항목, 아니면 raw 배열의 원본 인덱스
interface EditState {
  index: number;
  form: FormRecord;
}

// 항목별 연결 마크다운 로드 상태
interface MdState {
  text: string;
  loaded: string; // 로드 시점 원본
  sha: string | undefined; // 기존 파일 sha (없으면 undefined = 신규)
  existed: boolean;
  loading: boolean;
}

function withTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

export function CollectionEditor({ config, resource, onDirtyChange }: Props) {
  const toForm = useCallback(
    (r: unknown): FormRecord =>
      resource.toForm ? resource.toForm(r) : defaultToForm(resource.fields, r),
    [resource],
  );
  const fromForm = useCallback(
    (f: FormRecord): unknown =>
      resource.fromForm ? resource.fromForm(f) : defaultFromForm(resource.fields, f),
    [resource],
  );

  // imageUpload 필드가 호출: 이미지를 저장소에 커밋(dev 는 로컬 파일)
  const uploadImage = useCallback(
    async (repoPath: string, file: File): Promise<void> => {
      await uploadImageToRepo(config, repoPath, file);
    },
    [config],
  );

  // 원본 배열과 sha 를 그대로 보관 (표시용 FormRecord 는 파생)
  const [raw, setRaw] = useState<RawItem[]>([]);
  const [sha, setSha] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EditState | null>(null);
  /** 삭제 확인 모달의 대상 인덱스 (null = 닫힘) — window.confirm 대체 */
  const [deleting, setDeleting] = useState<number | null>(null);
  const [md, setMd] = useState<MdState | null>(null);

  // 로컬 순서 변경 상태 (미저장). null 이면 순서 변경 없음.
  const [orderedRaw, setOrderedRaw] = useState<RawItem[] | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; url: string } | null>(null);

  /**
   * 목록에서 고친 값 (미저장) — index → { 편집 경로: 값 }. 원본과 다른 것만 담는다.
   * 경로는 'email' 또는 localized 의 한쪽 'role.ko' 다. 값의 타입(문자열/불리언)과
   * 저장 규칙은 lib/admin/inline.ts 가 FieldDef.kind 를 보고 정한다.
   */
  const [inlineEdits, setInlineEdits] = useState<Record<number, InlinePatch>>({});
  const cardDirty = Object.keys(inlineEdits).length > 0;

  // ---- 캘린더 전용 초안 ----
  //
  // 캘린더만 인덱스가 아니라 항목 id 를 키로 삼고, 추가·삭제까지 트레이에 담는다.
  // 달력 화면은 "그 자리에서 만들고 지운다"가 기본 동작이라 삭제마다 커밋이 나가면
  // 흐름이 끊기기 때문이다. 대신 인덱스 기반 편집(inlineEdits/orderedRaw)과 섞지 않고
  // **배열 전체를 새로 직렬화해 커밋**하는 별도 경로를 쓴다 — 자세한 근거는
  // lib/admin/calendar-draft.ts 머리말.
  const isCalendar = resource.listView?.kind === 'calendar';
  const [calDraft, setCalDraft] = useState<FormRecord[] | null>(null);
  const calOriginal = useMemo(
    () => (isCalendar ? raw.map((r) => toForm(r)) : []),
    [isCalendar, raw, toForm],
  );
  const calItems = calDraft ?? calOriginal;
  const calChanges = useMemo(
    () => (isCalendar ? calendarChanges(resource.fields, calOriginal, calItems) : []),
    [isCalendar, resource.fields, calOriginal, calItems],
  );
  // 되돌리기로 원본과 같아지면 초안이 남아 있어도 "변경 없음"이다(더티 판정은 diff 로).
  const calDirty = calChanges.length > 0;
  const calDirtyIds = useMemo(
    () => new Set(calChanges.map((c) => c.id.split(':')[1])),
    [calChanges],
  );

  const orderDirty = orderedRaw !== null;
  const dirty = editing !== null || orderDirty || cardDirty || calDirty;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // 데이터 로드: record 포맷이면 배열화해 보관
  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const file = await loadJson<unknown>(config, resource.file);
      let arr: RawItem[];
      if (resource.format === 'record') {
        arr = recordToArray(file.data as Record<string, RawItem>, resource.idField!);
      } else {
        arr = (file.data as RawItem[]).slice();
      }
      setRaw(arr);
      setSha(file.sha);
    } catch (err) {
      setRaw([]);
      setListError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [config, resource]);

  // 마운트 / resource 전환 시 로드 및 상태 초기화
  useEffect(() => {
    setEditing(null);
    setDeleting(null);
    setMd(null);
    setOrderedRaw(null);
    setCalDraft(null);
    setSearch('');
    setSuccess(null);
    setSaveError(null);
    void load();
  }, [load]);

  // 표시용 배열: 순서 변경 중이면 orderedRaw, 아니면 raw
  const displayRaw = orderedRaw ?? raw;

  /**
   * 표시용 폼 — 원본을 폼으로 편 뒤 대기 중인 인라인 편집을 얹는다.
   * ⚠️ 원본 raw 에 얹지 않는 이유: 편집 경로가 'role.ko' 처럼 중첩 키를 가리킬 수
   * 있어 얕은 병합으로는 표현되지 않고, raw 에 얹으면 빈 값 규칙(null/생략)이 화면
   * 표시에까지 새어 들어와 입력 중인 칸이 사라진 것처럼 보인다.
   */
  const formOf = useCallback(
    (index: number): FormRecord =>
      applyInlineToForm(resource.fields, toForm(displayRaw[index] ?? {}), inlineEdits[index]),
    [displayRaw, inlineEdits, resource.fields, toForm],
  );

  // 원본 인덱스를 유지한 채 폼으로 파생 + 검색 필터
  const rows = useMemo(() => {
    const all = displayRaw.map((_, index) => ({ index, form: formOf(index) }));
    const q = search.trim().toLowerCase();
    if (q === '') return all;
    return all.filter((row) =>
      resource.searchKeys.some((k) => cellText(row.form, k).toLowerCase().includes(q)),
    );
  }, [displayRaw, formOf, search, resource.searchKeys]);

  /** 좌측 파란 막대를 붙일 인덱스 */
  const dirtyIndices = useMemo(
    () => new Set(Object.keys(inlineEdits).map(Number)),
    [inlineEdits],
  );

  // ---- 변경 트레이 연결 ----
  //
  // ⚠️ 카드 편집과 순서 변경은 "같이 대기"시키지 않는다. 둘 다 로드 시점 sha 로
  // 커밋하므로 한 번의 저장에서 두 커밋을 내면 두 번째가 409 로 반드시 실패하고,
  // 하나로 합치려 해도 inlineEdits 의 키가 인덱스라 순서가 바뀌는 순간 어느 항목의
  // 편집인지 특정할 수 없다(다른 사람 값을 덮어쓸 위험). 그래서 기존 locked 규칙을
  // 유지해 애초에 공존하지 못하게 막고(순서 변경 중 카드 편집 잠금 + 카드 편집 중
  // 순서 이동 잠금), 저장은 둘 중 대기 중인 쪽 하나만 실행한다.
  const ORDER_CHANGE_ID = `${resource.key}:__order__`;

  const trayChanges = useMemo<PendingChange[]>(() => {
    // 캘린더는 자기 diff 를 그대로 트레이 줄로 쓴다(영역 라벨만 붙인다)
    if (isCalendar) {
      return calChanges.map((c) => ({ ...c, scopeLabel: resource.label }));
    }
    const list: PendingChange[] = [];
    if (orderedRaw) {
      // 순서는 필드 단위로 쪼갤 수 없어 한 건으로 묶는다
      const moved = orderedRaw.reduce((n, item, i) => (item === raw[i] ? n : n + 1), 0);
      list.push({
        id: ORDER_CHANGE_ID,
        scopeLabel: resource.label,
        itemLabel: '목록 순서',
        fieldLabel: '순서',
        before: '원래 순서',
        after: `${moved}개 이동`,
      });
    }
    for (const [key, patch] of Object.entries(inlineEdits)) {
      const index = Number(key);
      const original = displayRaw[index] as Record<string, unknown> | undefined;
      const itemLabel = resource.summarize(formOf(index)) || `#${index + 1}`;
      for (const [path, value] of Object.entries(patch)) {
        // 트레이 문구는 사람이 읽는 표시값으로 — select 는 옵션 라벨, checkbox 는 예/아니오,
        // localized 는 어느 쪽(한국어/English)을 고쳤는지까지 밝힌다.
        const field = findInlineField(resource.fields, path);
        list.push({
          id: `${resource.key}:${index}:${path}`,
          scopeLabel: resource.label,
          itemLabel,
          fieldLabel: inlineFieldLabel(field, path),
          before: displayInline(field, readInline(resource.fields, original, path)),
          after: displayInline(field, value),
        });
      }
    }
    return list;
  }, [
    ORDER_CHANGE_ID, inlineEdits, orderedRaw, raw, displayRaw, formOf, resource,
    isCalendar, calChanges,
  ]);

  function revertTrayChange(id: string) {
    if (isCalendar) {
      setCalDraft(revertCalendarChange(resource.fields, calOriginal, calItems, id));
      return;
    }
    if (id === ORDER_CHANGE_ID) {
      resetOrder();
      return;
    }
    // id = `${resource.key}:${index}:${path}` — 리소스 키·경로에는 ':' 이 없다
    const parts = id.split(':');
    const index = Number(parts[1]);
    const path = parts.slice(2).join(':');
    setInlineEdits((prev) => {
      const forIndex = prev[index];
      if (!forIndex) return prev;
      const nextForIndex = { ...forIndex };
      delete nextForIndex[path];
      const next = { ...prev };
      // patchInline 과 같은 규칙 — 남은 편집이 없으면 인덱스 자체를 뺀다
      if (Object.keys(nextForIndex).length === 0) delete next[index];
      else next[index] = nextForIndex;
      return next;
    });
  }

  function revertAllTray() {
    setCalDraft(null);
    resetOrder();
    resetInlineEdits();
  }

  /** 트레이의 "저장 (커밋)" — 대기 중인 쪽 하나를 기존 커밋 경로로 그대로 넘긴다 */
  async function saveTray() {
    if (isCalendar) {
      await saveCalendar();
      return;
    }
    if (orderDirty) {
      await saveOrder();
      return;
    }
    await saveInlineEdits();
  }

  /**
   * 캘린더 저장 — 초안 배열 전체를 다시 직렬화해 한 번에 커밋한다.
   * 다른 리소스처럼 "바뀐 인덱스만 교체"하지 않는 이유: 추가·삭제가 섞이면 인덱스가
   * 밀려 어느 항목의 변경인지 잃는다. 항목이 수십 건 규모라 디프 최소화를 포기하고
   * 단순함을 택했다(sha 는 그대로 로드 시점 것을 써서 충돌 방어는 동일하다).
   */
  async function saveCalendar() {
    // 커밋 직전 필수값 검증 — 빈 제목/날짜가 파일에 들어가면 사이트에서 빈 카드가 된다
    const invalid = calItems.find(
      (f) =>
        !((f.title as { ko: string } | undefined)?.ko ?? '').trim() ||
        String(f.start ?? '').trim() === '',
    );
    if (invalid) {
      throw new Error('일정명(한국어)과 시작일은 모두 채워야 저장할 수 있습니다.');
    }
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      const payload = calendarPayload(resource.fields, calItems);
      const added = calChanges.filter((c) => c.id.startsWith('add:')).length;
      const removed = calChanges.filter((c) => c.id.startsWith('del:')).length;
      const edited = new Set(
        calChanges.filter((c) => c.id.startsWith('set:')).map((c) => c.id.split(':')[1]),
      ).size;
      const parts = [
        added > 0 ? `추가 ${added}` : '',
        edited > 0 ? `수정 ${edited}` : '',
        removed > 0 ? `삭제 ${removed}` : '',
      ].filter(Boolean);
      const result = await commitJson(
        config,
        resource.file,
        payload,
        sha,
        `content: ${resource.label} ${parts.join(' · ')}`,
      );
      setCalDraft(null);
      finishSave(result.sha);
    } catch (err) {
      // 오류 문구는 트레이가 띄운다 — 409/422 재로드만 하고 다시 던진다
      handleSaveError(err, '저장에 실패했습니다.', true);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  // 상세 폼을 연 동안에는 트레이를 내린다 — 폼 저장은 로드 시점 raw 로 커밋하므로
  // 트레이의 대기 변경과 sha 를 다투게 되고, 화면에 저장 버튼이 둘이 되어 헷갈린다.
  useRegisterTray(
    editing
      ? null
      : {
          changes: trayChanges,
          revert: revertTrayChange,
          revertAll: revertAllTray,
          save: saveTray,
        },
  );

  // 커밋 후 재로드 (커밋 sha 는 blob sha 가 아니므로 새 sha 확보 필수)
  function finishSave(commitSha: string) {
    setEditing(null);
    setMd(null);
    setOrderedRaw(null);
    setCalDraft(null);
    setSuccess(savedBanner(config, commitSha));
    void load();
  }

  /** silent: 트레이가 자기 자리에 오류를 띄우는 경우 — 같은 문구를 두 번 보여주지 않는다 */
  function handleSaveError(err: unknown, fallback: string, silent = false) {
    const msg = err instanceof Error ? err.message : fallback;
    if (!silent) setSaveError(msg);
    if (msg.includes('409') || msg.includes('422')) {
      void load();
    }
  }

  // ---- 편집 진입 ----

  function startNew() {
    setSuccess(null);
    setSaveError(null);
    setEditing({ index: -1, form: defaultToForm(resource.fields, {}) });
    // 새 항목은 로드 없이 빈 마크다운에서 시작
    if (resource.linkedMarkdown) {
      setMd({ text: '', loaded: '', sha: undefined, existed: false, loading: false });
    } else {
      setMd(null);
    }
  }

  async function startEdit(index: number) {
    setSuccess(null);
    setSaveError(null);
    // 대기 중인 인라인 편집이 얹힌 값으로 폼을 연다 — 목록에서 방금 고친 값이
    // 상세 화면에서 사라져 보이면 같은 값을 두 번 고치게 된다.
    const form = formOf(index);
    setEditing({ index, form });

    if (!resource.linkedMarkdown) {
      setMd(null);
      return;
    }
    // 기존 항목의 연결 마크다운 로드
    setMd({ text: '', loaded: '', sha: undefined, existed: false, loading: true });
    try {
      const path = resource.linkedMarkdown.pathOf(form);
      const file = await loadTextOptional(config, path);
      if (file) {
        setMd({ text: file.data, loaded: file.data, sha: file.sha, existed: true, loading: false });
      } else {
        setMd({ text: '', loaded: '', sha: undefined, existed: false, loading: false });
      }
    } catch {
      // 마크다운 로드 실패 시 신규처럼 빈 값으로 (본문 편집만 막지 않도록)
      setMd({ text: '', loaded: '', sha: undefined, existed: false, loading: false });
    }
  }

  // ---- 저장 (추가/수정) ----

  async function handleSubmit(form: FormRecord) {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);

    const isNew = editing.index < 0;

    // record 포맷 신규: idField 중복 검사
    if (isNew && resource.format === 'record') {
      const idKey = resource.idField!;
      const newId = cellText(form, idKey).trim();
      const dup = raw.some((r) => String(r[idKey] ?? '') === newId);
      if (dup) {
        const idLabel =
          resource.fields.find((f) => f.key === idKey)?.label ?? idKey;
        setSaveError(`이미 존재하는 ${idLabel}입니다.`);
        setSaving(false);
        return;
      }
    }

    try {
      // 로드 시점 배열 + sha 로 커밋한다. 그 사이 원격이 바뀌었으면 sha 불일치
      // (409/422)로 GitHub가 거부하므로, 어긋난 인덱스로 다른 항목을 덮어쓸 일이 없다.
      const record = fromForm(form) as RawItem;
      const next = raw.slice();
      let action: string;
      if (isNew) {
        next.push(record);
        action = '추가';
      } else {
        next[editing.index] = record;
        action = '수정';
      }

      const payload =
        resource.format === 'record' ? arrayToRecord(next, resource.idField!) : next;
      const message = `content: ${resource.label} ${action} — ${resource.summarize(form)}`;
      const result = await commitJson(config, resource.file, payload, sha, message);

      // 연결 마크다운 커밋 (본 파일 커밋 성공 후)
      if (resource.linkedMarkdown && md) {
        const path = resource.linkedMarkdown.pathOf(form);
        const content = md.text.trim();
        if (md.existed) {
          // 기존 md 가 있고 내용이 바뀌었으면 커밋
          if (md.text !== md.loaded) {
            await commitText(
              config,
              path,
              withTrailingNewline(md.text),
              md.sha,
              `content: ${resource.label} 소개 본문 수정 — ${resource.summarize(form)}`,
            );
          }
        } else if (content !== '') {
          // md 가 없었고 내용이 비어있지 않으면 생성 (sha=undefined)
          await commitText(
            config,
            path,
            withTrailingNewline(md.text),
            undefined,
            `content: ${resource.label} 소개 본문 추가 — ${resource.summarize(form)}`,
          );
        }
      }

      finishSave(result.sha);
    } catch (err) {
      handleSaveError(err, '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  // ---- 삭제 ----

  // ⚠️ 삭제는 트레이에 쌓지 않고 확인 즉시 커밋한다. 삭제를 배칭하면 대기 중인
  // 다른 변경의 인덱스가 앞으로 밀려 엉뚱한 항목을 지우거나 덮어쓸 수 있다
  // (inlineEdits 의 키가 배열 인덱스다). 같은 이유로 삭제를 확정할 때는 대기 중인
  // 변경을 먼저 버린다 — 아래 모달이 그 사실을 미리 알린다.
  async function handleDelete(index: number) {
    const form = formOf(index);
    setInlineEdits({});
    setOrderedRaw(null);
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      // 저장과 동일하게 로드 시점 배열 + sha 사용 — 인덱스 어긋남은 sha 충돌로 방어
      const next = raw.slice();
      next.splice(index, 1);
      const payload =
        resource.format === 'record' ? arrayToRecord(next, resource.idField!) : next;
      const result = await commitJson(
        config,
        resource.file,
        payload,
        sha,
        `content: ${resource.label} 삭제 — ${resource.summarize(form)}`,
      );
      finishSave(result.sha);
    } catch (err) {
      handleSaveError(err, '삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  // ---- 목록 인라인 편집 (미저장) ----
  //
  // 목록에서 고친 값은 곧바로 커밋하지 않고 여기 모았다가 "변경 저장"에서 한 번에 올린다.
  // 50명(또는 200과목)을 훑으며 여러 곳을 고치는 흐름이라, 필드마다 커밋하면 커밋이
  // 지저분해지고 느리다.

  /** path = 'email' 또는 localized 의 한쪽 'role.ko'. 값은 문자열 또는 불리언 */
  function patchInline(index: number, path: string, value: InlineValue) {
    setSuccess(null);
    setInlineEdits((prev) => {
      const original = displayRaw[index] as Record<string, unknown> | undefined;
      const nextForIndex: InlinePatch = { ...(prev[index] ?? {}), [path]: value };
      // 원본과 같아졌으면 그 경로는 뺀다 — 안 바뀐 값으로 더티 표시가 남지 않게.
      // 비교는 필드 종류를 아는 readInline 에 맡긴다(null 과 빈 문자열, 불리언의 부재).
      if (isInlineUnchanged(resource.fields, original, path, value)) {
        delete nextForIndex[path];
      }
      const next = { ...prev };
      if (Object.keys(nextForIndex).length === 0) delete next[index];
      else next[index] = nextForIndex;
      return next;
    });
  }

  function resetInlineEdits() {
    setInlineEdits({});
    setSuccess(null);
  }

  /** 목록에서 고친 값들을 한 번에 커밋 */
  async function saveInlineEdits() {
    const indices = Object.keys(inlineEdits).map(Number);
    if (indices.length === 0) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      // 저장 기준은 로드 시점 배열(raw) — 순서 변경과 겹치면 sha 충돌로 방어된다.
      // 직렬화는 전부 applyInlinePatch 가 맡는다(필드 종류별 빈 값 규칙·localized
      // en 폴백·checkbox 키 생략). 여기서 값 모양을 다시 판단하지 않는다.
      const next = raw.slice();
      for (const i of indices) {
        next[i] = applyInlinePatch(
          resource.fields,
          next[i] as Record<string, unknown>,
          inlineEdits[i],
        );
      }
      const payload =
        resource.format === 'record' ? arrayToRecord(next, resource.idField!) : next;
      const names = indices
        .map((i) => resource.summarize(toForm(next[i])) || `#${i + 1}`)
        .slice(0, 3)
        .join(', ');
      const more = indices.length > 3 ? ` 외 ${indices.length - 3}건` : '';
      const result = await commitJson(
        config,
        resource.file,
        payload,
        sha,
        `content: ${resource.label} 수정 — ${names}${more}`,
      );
      setInlineEdits({});
      finishSave(result.sha);
    } catch (err) {
      // 오류 문구는 트레이가 띄운다. 여기서는 409/422 재로드만 하고 다시 던져
      // 트레이가 "실패했으니 변경을 지우지 않는다"를 판단할 수 있게 한다.
      handleSaveError(err, '저장에 실패했습니다.', true);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  // ---- 순서 변경 (로컬) ----

  function move(index: number, dir: -1 | 1) {
    // 값 편집이 대기 중이면 순서를 바꾸지 않는다 — inlineEdits 의 키가 인덱스라
    // 순서가 바뀌면 어느 항목의 편집인지 특정할 수 없게 된다.
    if (cardDirty) return;
    const target = index + dir;
    const cur = orderedRaw ?? raw;
    if (target < 0 || target >= cur.length) return;
    const next = cur.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setSuccess(null);
    setOrderedRaw(next);
  }

  async function saveOrder() {
    if (!orderedRaw) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      const payload =
        resource.format === 'record'
          ? arrayToRecord(orderedRaw, resource.idField!)
          : orderedRaw;
      const result = await commitJson(
        config,
        resource.file,
        payload,
        sha,
        `content: ${resource.label} 순서 변경`,
      );
      finishSave(result.sha);
    } catch (err) {
      handleSaveError(err, '순서 저장에 실패했습니다.', true);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  function resetOrder() {
    setOrderedRaw(null);
  }

  // ---- 렌더 ----

  if (editing) {
    const isNew = editing.index < 0;
    return (
      <div className="anim-panel">
        <CmsPanelHead
          kind="collection"
          file={resource.file}
          title={`${resource.label} · ${isNew ? '새 항목' : '수정'}`}
          description={resource.description}
          actions={
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setMd(null);
                setSaveError(null);
              }}
              className="cms-btn cms-btn-sm"
            >
              ← 목록으로
            </button>
          }
        />
        {saveError && (
          <p role="alert" className="mb-4 border border-[#b42318]/30 bg-[#b42318]/[0.06] px-3.5 py-2.5 text-sm text-[#b42318]">
            {saveError}
          </p>
        )}
        <RecordForm
          fields={resource.fields}
          initial={editing.form}
          isEdit={!isNew}
          busy={saving}
          onSubmit={handleSubmit}
          onUploadImage={uploadImage}
          onCancel={() => {
            setEditing(null);
            setMd(null);
            setSaveError(null);
          }}
          linkedMarkdown={
            resource.linkedMarkdown && md
              ? {
                  label: resource.linkedMarkdown.label,
                  hint: resource.linkedMarkdown.hint,
                  structured: resource.linkedMarkdown.structured,
                  value: md.text,
                  loading: md.loading,
                  onChange: (v) => setMd((prev) => (prev ? { ...prev, text: v } : prev)),
                }
              : null
          }
        />
      </div>
    );
  }

  // 목록 화면 서술자와, 모든 인라인 화면이 공유하는 입력 묶음.
  // 화면 컴포넌트는 "무엇을 보여줄까"만 알고, 편집·저장 규칙은 전부 여기에 있다.
  const view = resource.listView;
  const viewProps = {
    resource,
    rows,
    total: displayRaw.length,
    busy: saving,
    locked: orderDirty,
    orderLocked: cardDirty,
    // 검색 중에는 순서를 옮기지 않는다 — 화면에 안 보이는 이웃과 자리를 바꾸면
    // 무엇이 어디로 갔는지 확인할 방법이 없다.
    orderable: resource.orderable && search.trim() === '',
    dirtyIndices,
    search,
    onSearch: setSearch,
    onEditDetail: (i: number) => void startEdit(i),
    onDelete: (i: number) => setDeleting(i),
    onMove: move,
    onPatch: patchInline,
  };

  return (
    <div className="anim-panel">
      <CmsPanelHead
        kind="collection"
        file={resource.file}
        title={resource.label}
        description={resource.description}
        actions={
          // 캘린더는 "+ 새 항목"을 두지 않는다 — 일정은 날짜가 있어야 의미가 있어
          // 빈 폼이 아니라 달력 칸의 `+ 일정` 이 만들기 동작이다.
          isCalendar ? undefined : (
            <button
              type="button"
              onClick={startNew}
              disabled={loading || saving || orderDirty}
              className="cms-btn cms-btn-primary cms-btn-sm"
            >
              + 새 항목
            </button>
          )
        }
      />

      {success && <CommitBanner message={success.message} url={success.url} />}

      {listError && (
        <p role="alert" className="mb-3 border border-[#b42318]/30 bg-[#b42318]/[0.06] px-3.5 py-2.5 text-sm text-[#b42318]">
          {listError}
        </p>
      )}
      {saveError && !loading && (
        <p role="alert" className="mb-3 border border-[#b42318]/30 bg-[#b42318]/[0.06] px-3.5 py-2.5 text-sm text-[#b42318]">
          {saveError}
        </p>
      )}

      {/* 저장·되돌리기 버튼은 하단 변경 트레이가 맡는다. 여기 남는 것은 트레이가
          대신 말해 줄 수 없는 "제약 안내"뿐이다. */}
      {orderDirty && (
        <p className="mb-4 text-xs text-content-faint">
          순서 변경 중에는 항목 추가·수정·삭제가 잠깁니다. 아래 트레이에서 저장하거나 되돌리세요.
        </p>
      )}
      {cardDirty && (
        <p className="mb-4 text-xs text-content-faint">
          수정한 값은 아래 트레이에 모입니다. 저장 전까지 순서 변경은 잠깁니다.
        </p>
      )}

      {loading && <p className="text-sm text-content-soft">불러오는 중…</p>}

      {/* 캘린더는 항목이 0건이어도 달력 자체를 그려야 한다 — 빈 안내로 대체하면
          새 일정을 만들 `+ 일정` 버튼까지 사라진다 */}
      {!loading && !listError && displayRaw.length === 0 && !isCalendar && (
        <p className="border border-dashed border-surface-border bg-[#fcfdfe] px-6 py-16 text-center text-sm text-content-faint">
          항목이 없습니다. 위 “+ 새 항목”으로 첫 항목을 만드세요.
        </p>
      )}

      {/* 목록 화면 — 어떤 모양으로 보여줄지는 resource.listView 가 정한다.
          rows 가 0이어도(검색 결과 없음) 화면을 그린다 — 검색창까지 사라지면
          입력을 지울 방법이 없어진다. */}
      {!loading && !listError && (displayRaw.length > 0 || isCalendar) && (
        <>
          {view?.kind === 'calendar' && (
            <CalendarEditor
              resource={resource}
              items={calItems}
              dirtyIds={calDirtyIds}
              busy={saving}
              onChange={setCalDraft}
            />
          )}
          {view?.kind === 'cards' && view.variant === 'faculty' && (
            <FacultyCardsEditor
              {...viewProps}
              inlineKeys={view.inlineKeys}
              filterKey={view.filterKey}
              onUploadPhoto={uploadImage}
            />
          )}
          {view?.kind === 'cards' && view.variant === 'labs' && (
            <LabCardsEditor
              {...viewProps}
              inlineKeys={view.inlineKeys}
              filterKey={view.filterKey}
            />
          )}
          {view?.kind === 'cards' && view.variant === 'clubs' && (
            <ClubRowsEditor {...viewProps} />
          )}
          {view?.kind === 'table' && (
            <InlineTable
              {...viewProps}
              inlineKeys={view.inlineKeys}
              filterKeys={view.filterKeys}
            />
          )}
          {view?.kind === 'expandRows' && (
            <ExpandRowsEditor
              {...viewProps}
              summaryKeys={view.summaryKeys}
              expandKeys={view.expandKeys}
            />
          )}
          {view?.kind === 'timeline' && (
            <HistoryTimelineEditor
              {...viewProps}
              dateKey={view.dateKey}
              bodyKey={view.bodyKey}
            />
          )}

          {/* 폴백 — listView 가 없는 리소스는 읽기 전용 표 + 수정/삭제 */}
          {!view && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  aria-label="검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="검색…"
                  disabled={orderDirty}
                  className="cms-input-sm w-full sm:w-[250px]"
                />
                <span className="ml-auto text-xs tabular-nums text-content-faint">
                  {rows.length}개 · 총 {displayRaw.length}개
                </span>
              </div>
              <div className="overflow-x-auto border-t-2 border-yonsei-navy" data-lenis-prevent>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {resource.listColumns.map((c) => (
                        <th
                          key={c.key}
                          scope="col"
                          className="whitespace-nowrap border-b border-surface-border px-2 py-3 text-left text-xs font-bold text-content-faint"
                        >
                          {c.label}
                        </th>
                      ))}
                      <th className="border-b border-surface-border px-2 py-3">
                        <span className="sr-only">동작</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ index, form }) => (
                      <tr key={index} className="align-top transition-colors hover:bg-surface-soft">
                        {resource.listColumns.map((c, col) => {
                          const val = cellText(form, c.key);
                          // 영상 등 URL 셀은 값 유무만 표시
                          const display =
                            c.key === 'video' || c.key === 'url' ? (val ? '✓' : '') : val;
                          return (
                            <td
                              key={c.key}
                              className={cn(
                                'max-w-[16rem] truncate border-b border-[#f1f4f8] px-2 py-2.5',
                                col === 0 ? 'font-semibold text-content' : 'text-content-soft',
                              )}
                            >
                              {display}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap border-b border-[#f1f4f8] px-2 py-2 text-right">
                          {resource.orderable && (
                            <MoveButtons
                              index={index}
                              total={displayRaw.length}
                              disabled={saving || search.trim() !== ''}
                              onMove={move}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => startEdit(index)}
                            disabled={saving || orderDirty}
                            className="px-1.5 text-[11px] font-semibold text-yonsei-blue transition-colors hover:text-yonsei-navy disabled:opacity-40"
                          >
                            자세히
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(index)}
                            disabled={saving || orderDirty}
                            aria-label="삭제"
                            title="삭제"
                            className="px-1 text-xs font-bold text-[#b42318] transition-opacity hover:opacity-70 disabled:opacity-40"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* 삭제 확인 — window.confirm 대신 콘솔 공용 모달(문구를 두 줄 이상 다듬고
          파괴적 동작을 시각적으로 구분하기 위해) */}
      {deleting !== null && (
        <CmsModal
          title={`${resource.label} 항목을 삭제할까요?`}
          tone="danger"
          confirmLabel="삭제"
          cancelLabel="취소"
          body={
            <>
              <p className="font-semibold text-content">
                {resource.summarize(formOf(deleting))}
              </p>
              <p className="mt-2">삭제는 즉시 커밋되며 되돌리려면 저장소에서 복구해야 합니다.</p>
              {trayChanges.length > 0 && (
                <p className="mt-2 text-[#b42318]">
                  저장 대기 중인 변경 {trayChanges.length}건은 함께 사라집니다 — 삭제하면 항목
                  위치가 밀려 그 변경을 그대로 적용할 수 없기 때문입니다.
                </p>
              )}
            </>
          }
          onConfirm={() => {
            const index = deleting;
            setDeleting(null);
            void handleDelete(index);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
