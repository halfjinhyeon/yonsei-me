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
import { RecordForm } from './RecordForm';
import { FacultyCardsEditor } from './FacultyCardsEditor';
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

  /** 카드에서 고친 값 (미저장) — index → { 필드: 값 }. 원본과 다른 것만 담는다. */
  const [cardEdits, setCardEdits] = useState<Record<number, Record<string, string>>>({});
  const cardDirty = Object.keys(cardEdits).length > 0;

  const orderDirty = orderedRaw !== null;
  const dirty = editing !== null || orderDirty || cardDirty;

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
    setSearch('');
    setSuccess(null);
    setSaveError(null);
    void load();
  }, [load]);

  // 표시용 배열: 순서 변경 중이면 orderedRaw, 아니면 raw
  const displayRaw = orderedRaw ?? raw;

  // 카드에서 고친 값을 얹은 표시용 배열 — 목록·폼 진입 모두 이 값을 본다
  const sourceRaw = useMemo(
    () => (cardDirty ? displayRaw.map((item, i) => (cardEdits[i] ? { ...item, ...cardEdits[i] } : item)) : displayRaw),
    [displayRaw, cardEdits, cardDirty],
  );

  // 원본 인덱스를 유지한 채 폼으로 파생 + 검색 필터
  const rows = useMemo(() => {
    const all = sourceRaw.map((r, index) => ({ index, form: toForm(r) }));
    const q = search.trim().toLowerCase();
    if (q === '') return all;
    return all.filter((row) =>
      resource.searchKeys.some((k) => cellText(row.form, k).toLowerCase().includes(q)),
    );
  }, [sourceRaw, search, toForm, resource.searchKeys]);

  // ---- 변경 트레이 연결 ----
  //
  // ⚠️ 카드 편집과 순서 변경은 "같이 대기"시키지 않는다. 둘 다 로드 시점 sha 로
  // 커밋하므로 한 번의 저장에서 두 커밋을 내면 두 번째가 409 로 반드시 실패하고,
  // 하나로 합치려 해도 cardEdits 의 키가 인덱스라 순서가 바뀌는 순간 어느 항목의
  // 편집인지 특정할 수 없다(다른 사람 값을 덮어쓸 위험). 그래서 기존 locked 규칙을
  // 유지해 애초에 공존하지 못하게 막고(순서 변경 중 카드 편집 잠금 + 카드 편집 중
  // 순서 이동 잠금), 저장은 둘 중 대기 중인 쪽 하나만 실행한다.
  const ORDER_CHANGE_ID = `${resource.key}:__order__`;

  const trayChanges = useMemo<PendingChange[]>(() => {
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
    for (const [key, patch] of Object.entries(cardEdits)) {
      const index = Number(key);
      const original = displayRaw[index] as Record<string, unknown> | undefined;
      const itemLabel = resource.summarize(toForm(sourceRaw[index] ?? {})) || `#${index + 1}`;
      for (const [fieldKey, value] of Object.entries(patch)) {
        list.push({
          id: `${resource.key}:${index}:${fieldKey}`,
          scopeLabel: resource.label,
          itemLabel,
          fieldLabel: resource.fields.find((f) => f.key === fieldKey)?.label ?? fieldKey,
          before: String(original?.[fieldKey] ?? ''),
          after: value,
        });
      }
    }
    return list;
  }, [ORDER_CHANGE_ID, cardEdits, orderedRaw, raw, displayRaw, sourceRaw, resource, toForm]);

  function revertTrayChange(id: string) {
    if (id === ORDER_CHANGE_ID) {
      resetOrder();
      return;
    }
    // id = `${resource.key}:${index}:${fieldKey}` — 리소스 키에는 ':' 이 없다
    const parts = id.split(':');
    const index = Number(parts[1]);
    const fieldKey = parts.slice(2).join(':');
    setCardEdits((prev) => {
      const forIndex = prev[index];
      if (!forIndex) return prev;
      const nextForIndex = { ...forIndex };
      delete nextForIndex[fieldKey];
      const next = { ...prev };
      // patchCard 와 같은 규칙 — 남은 편집이 없으면 인덱스 자체를 뺀다
      if (Object.keys(nextForIndex).length === 0) delete next[index];
      else next[index] = nextForIndex;
      return next;
    });
  }

  function revertAllTray() {
    resetOrder();
    resetCardEdits();
  }

  /** 트레이의 "저장 (커밋)" — 대기 중인 쪽 하나를 기존 커밋 경로로 그대로 넘긴다 */
  async function saveTray() {
    if (orderDirty) {
      await saveOrder();
      return;
    }
    await saveCardEdits();
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
    const form = toForm(sourceRaw[index]);
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
  // (cardEdits 의 키가 배열 인덱스다). 같은 이유로 삭제를 확정할 때는 대기 중인
  // 변경을 먼저 버린다 — 아래 모달이 그 사실을 미리 알린다.
  async function handleDelete(index: number) {
    const form = toForm(sourceRaw[index]);
    setCardEdits({});
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

  // ---- 카드 인라인 편집 (미저장) ----
  //
  // 카드에서 고친 값은 곧바로 커밋하지 않고 여기 모았다가 "변경 저장"에서 한 번에 올린다.
  // 50명을 훑으며 여러 곳을 고치는 흐름이라, 필드마다 커밋하면 커밋이 지저분해지고 느리다.



  function patchCard(index: number, key: string, value: string) {
    setSuccess(null);
    setCardEdits((prev) => {
      const original = displayRaw[index] as Record<string, unknown>;
      const nextForIndex = { ...(prev[index] ?? {}), [key]: value };
      // 원본과 같아졌으면 그 키는 뺀다 — 안 바뀐 값으로 더티 표시가 남지 않게
      const originalVal = original?.[key];
      if ((originalVal ?? '') === value || (originalVal === null && value === '')) {
        delete nextForIndex[key];
      }
      const next = { ...prev };
      if (Object.keys(nextForIndex).length === 0) delete next[index];
      else next[index] = nextForIndex;
      return next;
    });
  }

  function resetCardEdits() {
    setCardEdits({});
    setSuccess(null);
  }

  /** 카드에서 고친 값들을 한 번에 커밋 */
  async function saveCardEdits() {
    const indices = Object.keys(cardEdits).map(Number);
    if (indices.length === 0) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      // 저장 기준은 로드 시점 배열(raw) — 순서 변경과 겹치면 sha 충돌로 방어된다
      const next = raw.slice();
      for (const i of indices) {
        const patch = cardEdits[i];
        const cur = { ...(next[i] as Record<string, unknown>) };
        for (const [k, v] of Object.entries(patch)) {
          // 빈 문자열은 null 로 — 이 리소스의 선택 필드는 null 이 "없음"이다
          cur[k] = v.trim() === '' ? null : v;
        }
        next[i] = cur;
      }
      const payload =
        resource.format === 'record' ? arrayToRecord(next, resource.idField!) : next;
      const names = indices
        .map((i) => cellText(toForm(next[i]), 'name') || `#${i + 1}`)
        .slice(0, 3)
        .join(', ');
      const more = indices.length > 3 ? ` 외 ${indices.length - 3}명` : '';
      const result = await commitJson(
        config,
        resource.file,
        payload,
        sha,
        `content: ${resource.label} 수정 — ${names}${more}`,
      );
      setCardEdits({});
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
    // 값 편집이 대기 중이면 순서를 바꾸지 않는다 — cardEdits 의 키가 인덱스라
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
      <div className="rounded-card border border-surface-border bg-surface p-5 shadow-card sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-content">
          {resource.label} · {isNew ? '새 항목' : '수정'}
        </h2>
        {saveError && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
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

  return (
    <div className="rounded-card border border-surface-border bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-content">{resource.label}</h2>
        <p className="mt-1 text-sm text-content-soft">{resource.description}</p>
        <p className="mt-0.5 text-xs text-content-faint">{resource.file}</p>
      </div>

      {success && <CommitBanner message={success.message} url={success.url} />}

      {listError && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {listError}
        </p>
      )}
      {saveError && !loading && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {saveError}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          aria-label="검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="검색…"
          disabled={orderDirty}
          className="w-full max-w-xs rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue disabled:opacity-60 sm:w-64"
        />
        <button
          type="button"
          onClick={startNew}
          disabled={loading || saving || orderDirty}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          새 항목
        </button>
      </div>

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

      {!loading && !listError && displayRaw.length === 0 && (
        <p className="text-sm text-content-faint">항목이 없습니다.</p>
      )}

      {!loading && !listError && displayRaw.length > 0 && rows.length === 0 && (
        <p className="text-sm text-content-faint">검색 결과가 없습니다.</p>
      )}

      {/* 카드 모드 — 사진이 있는 리소스(교수진)는 실제 카드 모양으로 보면서 그 자리에서 고친다 */}
      {!loading && rows.length > 0 && resource.cardList && (
        <FacultyCardsEditor
          resource={resource}
          rows={rows}
          total={sourceRaw.length}
          busy={saving}
          locked={orderDirty}
          orderLocked={cardDirty}
          orderable={resource.orderable && search.trim() === ''}
          onEditDetail={(i) => void startEdit(i)}
          onDelete={(i) => setDeleting(i)}
          onMove={move}
          onPatch={patchCard}
          onUploadPhoto={uploadImage}
        />
      )}

      {!loading && rows.length > 0 && !resource.cardList && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left">
                {resource.listColumns.map((c) => (
                  <th
                    key={c.key}
                    className="whitespace-nowrap px-3 py-2 text-xs font-bold uppercase tracking-wide text-content-faint"
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ index, form }) => (
                <tr
                  key={index}
                  className="border-b border-surface-border align-top transition-colors hover:bg-surface-soft"
                >
                  {resource.listColumns.map((c) => {
                    const val = cellText(form, c.key);
                    // 영상 등 URL 셀은 값 유무만 표시
                    const display =
                      c.key === 'video' || c.key === 'url' ? (val ? '✓' : '') : val;
                    return (
                      <td key={c.key} className="max-w-[16rem] truncate px-3 py-2.5 text-content-soft">
                        {display}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {resource.orderable && (
                        <>
                          <button
                            type="button"
                            aria-label="위로"
                            onClick={() => move(index, -1)}
                            disabled={saving || search.trim() !== '' || index === 0}
                            className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            aria-label="아래로"
                            onClick={() => move(index, 1)}
                            disabled={
                              saving ||
                              search.trim() !== '' ||
                              index === displayRaw.length - 1
                            }
                            className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                          >
                            ▼
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(index)}
                        disabled={saving || orderDirty}
                        className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(index)}
                        disabled={saving || orderDirty}
                        className="btn-secondary px-3 py-1.5 text-xs text-red-600 hover:border-red-400 hover:text-red-600 disabled:opacity-60"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                {resource.summarize(toForm(sourceRaw[deleting] ?? {}))}
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
