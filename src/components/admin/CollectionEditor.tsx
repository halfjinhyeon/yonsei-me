'use client';

// 스키마 기반 컬렉션 편집기 — resources.ts 의 ResourceDef 를 읽어 목록·검색·
// 순서 변경·폼 편집을 자동 구성한다. 정적 사이트라 서버 DB가 없어 GitHub
// Contents API 로 content/*.json 을 직접 커밋한다("Git이 곧 DB").
//
// 디프 최소화 원칙: 저장 시 전체를 재직렬화하지 않고, 원본 배열(raw)에서
// 수정=해당 인덱스만 교체 / 추가=push / 삭제=splice 만 적용해 나머지 항목의
// 바이트를 그대로 유지한다. (record 포맷은 커밋 직전 arrayToRecord 로 변환.)
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

  // 커밋 후 재로드 (커밋 sha 는 blob sha 가 아니므로 새 sha 확보 필수)
  function finishSave(commitSha: string) {
    setEditing(null);
    setMd(null);
    setOrderedRaw(null);
    setSuccess(savedBanner(config, commitSha));
    void load();
  }

  function handleSaveError(err: unknown, fallback: string) {
    const msg = err instanceof Error ? err.message : fallback;
    setSaveError(msg);
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

  async function handleDelete(index: number) {
    const form = toForm(sourceRaw[index]);
    if (!window.confirm(`정말 삭제할까요?\n\n${resource.summarize(form)}`)) return;
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
      handleSaveError(err, '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  // ---- 순서 변경 (로컬) ----

  function move(index: number, dir: -1 | 1) {
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
      handleSaveError(err, '순서 저장에 실패했습니다.');
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

      {/* 순서 미저장 안내 */}
      {orderDirty && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveOrder}
            disabled={saving}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? '저장 중…' : '순서 저장'}
          </button>
          <button
            type="button"
            onClick={resetOrder}
            disabled={saving}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
          >
            되돌리기
          </button>
          <p className="text-xs text-content-faint">
            순서 변경 중에는 항목 추가·수정·삭제가 잠깁니다. 먼저 저장하거나 되돌리세요.
          </p>
        </div>
      )}

      {/* 카드에서 고친 값 저장 — 여러 카드를 훑으며 고친 뒤 한 번에 커밋한다 */}
      {cardDirty && (
        <div className="sticky top-2 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-yonsei-blue bg-yonsei-blue/[0.06] px-4 py-3">
          <span className="text-sm font-bold text-content">
            {Object.keys(cardEdits).length}명 수정됨
          </span>
          <button
            type="button"
            onClick={() => void saveCardEdits()}
            disabled={saving || orderDirty}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? '저장 중…' : '변경 저장'}
          </button>
          <button
            type="button"
            onClick={resetCardEdits}
            disabled={saving}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
          >
            되돌리기
          </button>
          {orderDirty && (
            <p className="text-xs text-content-faint">순서 변경을 먼저 저장하거나 되돌리세요.</p>
          )}
        </div>
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
          orderable={resource.orderable && search.trim() === ''}
          onEditDetail={(i) => void startEdit(i)}
          onDelete={(i) => void handleDelete(i)}
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
                        onClick={() => handleDelete(index)}
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
    </div>
  );
}
