'use client';

// 게시판 편집기 — 단일 게시판의 CRUD 를 담당하는 자립 컴포넌트.
// 백엔드 전환 Phase 3: 저장처가 GitHub JSON 커밋 → Supabase(admin API)로 바뀌었다.
// 흐름: 목록 로드(GET) → 편집 → 저장(POST/PUT)/삭제(DELETE)/일괄(POST bulk).
// 쓰기 성공 시 서버가 revalidateTag('posts') 를 호출해 사이트가 재배포 없이 갱신된다.
//
// 4단계(리디자인): 한 가지 표로 14개 게시판을 다 보여주던 목록을 셋으로 나눴다.
// 게시판마다 "무엇을 보고 고르는지"가 다르기 때문이다 —
//   · 공지형(rows)  : 날짜와 제목만 보면 된다 → 촘촘한 행 목록
//   · 뉴스형(cards) : 대표 이미지·요약이 판단 근거다 → 카드 그리드
//   · 인스타(tiles) : 사진 자체가 콘텐츠다 → 정사각 타일
// 판정은 BoardMeta 플래그로만 한다(게시판 키를 하드코딩하지 않는다).
// 저장·삭제·이동의 API 흐름은 그대로 두고 배치와 스타일만 바꿨다.
//
// 이 관리자 도구는 내부 운영용이라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  BOARDS,
  getBoard,
  suggestId,
  today,
  emptyAttachment,
  type BoardKey,
  type BoardMeta,
  type EditRecord,
} from '@/lib/admin/boards';
import type { RepoConfig } from '@/lib/admin/github';
import { clearPostDraft, postDraftKey } from '@/lib/admin/post-draft';
import { uploadAttachment } from '@/lib/admin/storage';
import { CmsModal } from './CmsModal';
import { CmsPanelHead } from './CmsPanelHead';
import { CmsSkeleton } from './CmsSkeleton';
import { CommitBanner } from './CommitBanner';
import { PostForm } from './PostForm';
import { useAdminShell } from './AdminShellContext';

/** admin API 가 돌려주는 레코드 — EditRecord + DB 식별자/slug */
type ApiRecord = EditRecord & { board: string; slug: string | null };

/** 게시판별 목록 항목(공용 표시용) */
interface ListItem {
  /** DB id (일괄 작업·수정·삭제 키) */
  id: string;
  date: string;
  titleKo: string;
  /** 보조 표기 — 뉴스형은 slug, 게시판형은 DB 번호 */
  subId: string;
  /** 카드·행이 함께 읽는 원본 (요약·대표 이미지·주최·첨부 건수) */
  rec: ApiRecord;
}

/** 목록 모양 — BoardMeta 플래그로만 결정한다 */
type ListVariant = 'rows' | 'cards' | 'tiles';

/**
 * 게시판이 사이트 어디에 노출되는지 한 줄 설명.
 * boards.ts 는 스키마 파일이라 UI 문구를 넣지 않기로 했으므로(4단계 지시) 화면 쪽에 둔다.
 */
const BOARD_NOTES: Record<BoardKey, string> = {
  noticesUndergrad: '학부 공지 목록과 홈 ‘공지 & 일정’ 영역에 노출됩니다.',
  noticesGraduate: '대학원 공지 목록에 노출됩니다.',
  noticesExternal: '외부기관 공지 목록에 노출됩니다.',
  noticesScholarship: '장학 안내의 선발공고 목록에 노출됩니다.',
  news: '홈 뉴스 영역과 뉴스 목록에 카드로 노출됩니다. 대표 이미지와 요약이 카드 앞면이 됩니다.',
  seminars: '세미나 목록에 노출되고, 날짜가 잡힌 글은 금주 캘린더에도 표시됩니다.',
  events: '행사 목록과 홈 ‘공지 & 일정’ 캘린더에 노출됩니다.',
  thesis: '학위논문심사 공고 목록에 노출됩니다.',
  resources: '자료실 목록에 노출됩니다. 첨부파일이 본체인 게시판입니다.',
  career: '취업 정보 목록에 노출됩니다.',
  internships: '인턴 모집 목록에 노출됩니다.',
  alumniNews: '동문 뉴스 목록에 카드로 노출됩니다.',
  alumniEvents: '동문 소식·네트워크 목록에 노출되고, ‘행사’로 체크한 글만 캘린더에 표시됩니다.',
  instagram: '홈 하단 인스타그램 그리드의 타일이 됩니다. 본문 없이 사진·캡션·게시물 URL만 씁니다.',
};

/** 뉴스형 카드의 분류 배지 문구 */
const CATEGORY_LABELS: Record<string, string> = {
  notice: '공지',
  seminar: '세미나',
  achievement: '성과',
};

function blankRecord(key: BoardKey, suggestedId: string): EditRecord {
  const meta = getBoard(key);
  return {
    id: suggestedId,
    date: today(),
    titleKo: '',
    titleEn: '',
    bodyKo: '',
    bodyEn: '',
    ...(meta.hasHost ? { hostKo: '', hostEn: '' } : {}),
    ...(meta.hasDateLabel ? { dateLabelKo: '', dateLabelEn: '' } : {}),
    ...(meta.hasDateRange ? { endDate: '' } : {}),
    ...(meta.hasLink ? { linkUrl: '' } : {}),
    ...(meta.hasEventFlag ? { isEvent: false } : {}),
    ...(meta.isNews ? { category: 'notice' as const, excerptKo: '', excerptEn: '', image: '' } : {}),
    attachments: [emptyAttachment()],
  };
}

/** admin API 호출 공통기 — 실패 시 서버 error 메시지를 던진다 */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `요청 실패 (HTTP ${res.status})`);
  return data as T;
}

/** HTML 본문에서 미리보기용 한 줄 텍스트 뽑기 (행 목록의 보조 설명) */
function plainText(html: string, max = 90): string {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

interface Props {
  /** 저장소 설정 — 첨부 업로드의 dev 폴백 판별에만 쓰인다(글 저장은 admin API) */
  config: RepoConfig;
  /** 편집할 게시판 키 */
  boardKey: BoardKey;
  /** 편집 폼이 열려 있는 동안 true — 셸의 이동 가드용 */
  onDirtyChange?: (dirty: boolean) => void;
}

export function BoardEditor({ config, boardKey, onDirtyChange }: Props) {
  // 저장 완료는 화면 안 배너(CommitBanner)만으로는 눈에 잘 띄지 않는다 — 목록 상단은
  // 방금 누른 버튼에서 멀다. 다른 화면과 같은 상단 토스트로도 한 번 말한다.
  const { showToast, setWriteDenied } = useAdminShell();

  const meta = useMemo(() => getBoard(boardKey), [boardKey]);
  const variant: ListVariant = meta.isNews ? 'cards' : meta.hasLink && meta.noBody ? 'tiles' : 'rows';

  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // 다중선택 상태: 선택된 DB id 집합. 리로드·액션 성공 시 초기화한다.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<BoardKey | ''>('');
  const selectAllRef = useRef<HTMLInputElement>(null);

  // 편집 상태: null 이면 목록, 아니면 폼. dbId 는 수정(PUT) 대상 식별자.
  const [editing, setEditing] = useState<{
    record: EditRecord;
    isEdit: boolean;
    dbId?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /** 확인 모달 (window.confirm 대체) — 확정 시 실행할 동작을 함께 들고 있는다 */
  const [confirm, setConfirm] = useState<{
    title: string;
    body: React.ReactNode;
    confirmLabel: string;
    tone?: 'default' | 'danger';
    run: () => void;
  } | null>(null);

  // 편집 폼이 열려 있으면 dirty — 셸이 다른 항목으로 이동할 때 확인창을 띄운다.
  useEffect(() => {
    onDirtyChange?.(editing !== null);
  }, [editing, onDirtyChange]);

  const loadEntries = useCallback(async (key: BoardKey) => {
    setLoading(true);
    setListError(null);
    setSelected(new Set());
    setMoveTarget('');
    try {
      const { items } = await api<{ items: ApiRecord[] }>(`/api/admin/posts?board=${key}`);
      setRecords(items);
    } catch (err) {
      setRecords([]);
      setListError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 마운트 시 로드 (셸이 boardKey 변경 시 key prop 으로 리마운트한다)
  useEffect(() => {
    void loadEntries(boardKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allItems: ListItem[] = useMemo(
    () =>
      records.map((r) => ({
        id: r.id,
        date: r.date,
        titleKo: r.titleKo || '(제목 없음)',
        subId: meta.isNews ? (r.slug ?? r.id) : r.id,
        rec: r,
      })),
    [records, meta.isNews],
  );

  // 검색 — 제목(한/영)·날짜·slug·주최를 한 번에 훑는다(운영자가 기억하는 단서가 제각각이다)
  const listItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return allItems;
    return allItems.filter((i) =>
      [i.titleKo, i.rec.titleEn, i.date, i.subId, i.rec.hostKo ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [allItems, search]);

  // 새 글 id 제안 — 뉴스형은 slug 컨벤션(날짜 기반). 게시판형은 DB 가 자동 부여.
  const existingIds = useMemo(
    () => records.map((r) => (meta.isNews ? (r.slug ?? '') : r.id)),
    [records, meta.isNews],
  );

  const allSelected = listItems.length > 0 && listItems.every((i) => selected.has(i.id));
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && !allSelected;
    }
  }, [selected, allSelected]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    // 검색 중이면 "보이는 것"만 전체 선택한다 — 화면 밖의 글이 조용히 지워지면 안 된다.
    setSelected(allSelected ? new Set() : new Set(listItems.map((i) => i.id)));
  }
  function selectionSummary(ids: string[]): string {
    const titles = ids.map((id) => allItems.find((i) => i.id === id)?.titleKo ?? id);
    const shown = titles.slice(0, 5).join('\n');
    return titles.length > 5 ? `${shown}\n외 ${titles.length - 5}건` : shown;
  }

  function startNew() {
    setSuccess(null);
    setSaveError(null);
    setEditing({
      record: blankRecord(boardKey, meta.isNews ? suggestId(meta, existingIds) : '(자동 부여)'),
      isEdit: false,
    });
  }

  function startEdit(dbId: string) {
    const r = records.find((x) => x.id === dbId);
    if (!r) return;
    setSuccess(null);
    setSaveError(null);
    // 뉴스형은 폼의 '번호' 칸에 slug 를 노출(URL 이 되는 값), 게시판형은 DB 번호(참고용)
    setEditing({
      record: { ...r, id: meta.isNews ? (r.slug ?? r.id) : r.id },
      isEdit: true,
      dbId,
    });
  }

  /** 편집 레코드 → admin API 페이로드 */
  function toPayload(rec: EditRecord) {
    return {
      board: boardKey,
      slug: meta.isNews ? rec.id.trim() : undefined,
      date: rec.date,
      titleKo: rec.titleKo,
      titleEn: rec.titleEn,
      bodyKo: rec.bodyKo,
      bodyEn: rec.bodyEn,
      excerptKo: rec.excerptKo,
      excerptEn: rec.excerptEn,
      category: rec.category,
      hostKo: rec.hostKo,
      hostEn: rec.hostEn,
      // 기간 라벨은 서버가 시작/종료일로 자동 생성 — 수동 라벨은 더 이상 보내지 않는다
      endDate: rec.endDate || undefined,
      linkUrl: rec.linkUrl || undefined,
      isEvent: rec.isEvent,
      image: rec.image,
      attachments: rec.attachments.filter((a) => a.href.trim() !== '' || a.labelKo.trim() !== ''),
    };
  }

  async function handleSave(rec: EditRecord) {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing?.isEdit && editing.dbId) {
        await api(`/api/admin/posts/${editing.dbId}`, {
          method: 'PUT',
          body: JSON.stringify(toPayload(rec)),
        });
        // 실제 게시가 끝났으니 이 글의 초안은 더 이상 의미가 없다.
        clearPostDraft(postDraftKey(boardKey, editing.record.id));
        finishSave('수정되었습니다');
      } else {
        await api('/api/admin/posts', { method: 'POST', body: JSON.stringify(toPayload(rec)) });
        clearPostDraft(postDraftKey(boardKey, 'new'));
        finishSave('등록되었습니다');
      }
    } catch (err) {
      failSave(err, '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  // 확인은 콘솔 공용 모달로 받는다. window.confirm 은 사이트 시각 언어와 동떨어지고
  // 파괴적 동작(삭제)과 단순 이동을 구분해 보여줄 수 없다.
  function handleDelete(dbId: string) {
    const item = allItems.find((i) => i.id === dbId);
    setConfirm({
      title: '이 글을 삭제할까요?',
      tone: 'danger',
      confirmLabel: '삭제',
      body: <span className="font-semibold text-content">{item?.titleKo ?? dbId}</span>,
      run: () => void doDelete(dbId),
    });
  }

  async function doDelete(dbId: string) {
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      await api(`/api/admin/posts/${dbId}`, { method: 'DELETE' });
      finishSave('삭제되었습니다');
    } catch (err) {
      failSave(err, '삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  function handleBulkDelete() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    setConfirm({
      title: `${ids.length}건을 삭제할까요?`,
      tone: 'danger',
      confirmLabel: `${ids.length}건 삭제`,
      body: (
        <span className="whitespace-pre-line font-semibold text-content">
          {selectionSummary(ids)}
        </span>
      ),
      run: () => void doBulkDelete(ids),
    });
  }

  async function doBulkDelete(ids: string[]) {
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      await api('/api/admin/posts/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', ids }),
      });
      finishSave(`${ids.length}건 삭제되었습니다`);
    } catch (err) {
      failSave(err, '삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  function handleBulkMove() {
    if (selected.size === 0 || moveTarget === '') return;
    const target = getBoard(moveTarget);
    const ids = Array.from(selected);
    setConfirm({
      title: `${ids.length}건을 '${target.label}'(으)로 이동할까요?`,
      confirmLabel: '이동',
      body: '대상 게시판에 없는 항목(주최·분류 등)은 그 게시판에서 표시되지 않습니다.',
      run: () => void doBulkMove(moveTarget, ids),
    });
  }

  async function doBulkMove(targetKey: BoardKey, ids: string[]) {
    const target = getBoard(targetKey);
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      await api('/api/admin/posts/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'move', ids, targetBoard: targetKey }),
      });
      finishSave(`${ids.length}건을 '${target.label}'(으)로 이동했습니다`);
    } catch (err) {
      failSave(err, '이동에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  function finishSave(message: string) {
    setEditing(null);
    const full = `${message} — 사이트에 수 초 내 반영됩니다.`;
    setSuccess(full);
    showToast(full);
    // 쓰기가 통했으니 권한 배너를 내린다 (권한은 나중에 부여될 수 있다)
    setWriteDenied(false);
    // ⚠️ 여기서 setDeploy('deploying') 를 부르지 않는다. 게시판 글은 Supabase 에
    // 들어가고 서버가 revalidateTag('posts') 를 호출해 **재배포 없이** 즉시 반영된다.
    // 배포 칩은 "배포 중 · 1~2분"이라고 말하므로, 이미 반영이 끝난 변경을 두고
    // 1~2분을 더 기다리라는 거짓 안내가 된다. 배포 칩은 content/*.json 을 커밋하는
    // CollectionEditor 쪽 저장에만 붙는다.
    void loadEntries(boardKey);
  }

  /**
   * 쓰기 실패 문구 처리 — 문구를 화면에 띄우고, 권한 부족이면 셸에 신호만 올린다.
   * 권한 판정 자체는 서버(admin API)와 github.ts 가 한다. 여기서 다시 판단하지 않고
   * 이미 만들어진 문구를 읽기만 한다.
   */
  function failSave(err: unknown, fallback: string) {
    const msg = err instanceof Error ? err.message : fallback;
    setSaveError(msg);
    if (msg.includes('403') || msg.includes('권한이 부족합니다') || msg.includes('권한이 없습니다')) {
      setWriteDenied(true);
    }
  }

  /** 확인 모달 — 목록과 글쓰기 화면 양쪽에서 같은 모양으로 뜬다 */
  function renderConfirm() {
    if (!confirm) return null;
    return (
      <CmsModal
        title={confirm.title}
        body={confirm.body}
        confirmLabel={confirm.confirmLabel}
        tone={confirm.tone}
        onConfirm={() => {
          const run = confirm.run;
          setConfirm(null);
          run();
        }}
        onCancel={() => setConfirm(null)}
      />
    );
  }

  // ── 글쓰기 화면: 전체화면 단일 컬럼(셸의 사이드바·상단 바는 폼이 내린다) ──
  if (editing) {
    return (
      <>
        <PostForm
          meta={meta}
          initial={editing.record}
          isEdit={editing.isEdit}
          busy={saving}
          submitError={saveError}
          onCancel={() => setEditing(null)}
          onSubmit={handleSave}
          onUploadFile={(file, onProgress, signal) =>
            uploadAttachment(config, boardKey, file, onProgress, signal).then((r) => r.url)
          }
        />
        {renderConfirm()}
      </>
    );
  }

  const busy = saving || loading;
  const searching = search.trim() !== '';

  return (
    <div className="min-w-0">
      <CmsPanelHead
        kind="board"
        // 백엔드가 Supabase 로 옮겨간 뒤라 "파일 경로" 자리에 실제 저장처(테이블·구분값)를 적는다.
        // 문제가 생겼을 때 담당자가 같은 레코드를 찾아갈 수 있어야 한다는 목적은 같다.
        file={`Supabase · posts (board=${boardKey})`}
        title={meta.label}
        description={`${BOARD_NOTES[boardKey]} 같은 유형의 게시판은 이 화면과 동일한 목록·편집기를 씁니다.`}
        actions={
          <button type="button" onClick={startNew} disabled={busy} className="cms-btn-primary">
            + 새 글 쓰기
          </button>
        }
      />

      {success && <CommitBanner message={success} url="" />}

      {listError && (
        <p role="alert" className="mb-4 border border-[#b42318]/30 bg-[#b42318]/[0.06] px-3.5 py-2.5 text-[13px] text-[#b42318]">
          {listError}
        </p>
      )}
      {saveError && !loading && (
        <p role="alert" className="mb-4 border border-[#b42318]/30 bg-[#b42318]/[0.06] px-3.5 py-2.5 text-[13px] text-[#b42318]">
          {saveError}
        </p>
      )}

      {/* 불러오는 동안에도 화면 제목(CmsPanelHead)은 그대로 둔다 — 어느 게시판을 여는
          중인지는 방금 눌러서 이미 알고 있다. 흔들려야 하는 것은 목록뿐이다.
          뼈대 모양은 목록 모양(variant)과 같아야 데이터 도착 시 높이가 튀지 않는다. */}
      {loading && <CmsSkeleton shape={variant} />}

      {/* ── 빈 게시판 ── */}
      {!loading && !listError && allItems.length === 0 && (
        <div className="anim-panel border border-dashed border-surface-border bg-[#fcfdfe] px-6 py-24 text-center">
          <p className="text-[19px] font-bold tracking-tight text-content">아직 글이 없습니다</p>
          <p className="mx-auto mt-3 max-w-[46ch] text-[13px] leading-[1.8] text-content-faint">
            첫 글을 올리면 {BOARD_NOTES[boardKey]} 글이 없는 동안 사이트에서는 이 게시판 영역이 자동으로
            숨겨집니다.
          </p>
          <button type="button" onClick={startNew} className="cms-btn-primary mt-5">
            + 첫 글 쓰기
          </button>
        </div>
      )}

      {!loading && allItems.length > 0 && (
        <>
          {/* 검색 + 건수 */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="글 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·날짜·번호로 검색"
              className="cms-input-sm w-full sm:w-[250px]"
            />
            <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-content-faint">
              {listItems.length}건 · 총 {allItems.length}건
            </span>
          </div>

          {/* 선택 헤더 — 부분 선택은 indeterminate(ref)로 표시 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-surface-border pb-2.5">
            <label className="flex items-center gap-2.5 text-xs text-content-faint">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                disabled={busy}
                aria-label="전체 선택"
                className="h-4 w-4 accent-yonsei-navy"
              />
              <span>{selected.size > 0 ? `${selected.size}개 선택` : '전체 선택'}</span>
            </label>

            {/* 선택 액션 — 1개 이상 선택했을 때만 (선택 삭제 + 다른 게시판으로 이동) */}
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleBulkDelete} disabled={saving} className="cms-btn-danger cms-btn-sm">
                  선택 삭제
                </button>
                <select
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value as BoardKey | '')}
                  disabled={saving}
                  aria-label="이동할 게시판"
                  className="cms-input-sm w-auto cursor-pointer"
                >
                  <option value="">이동할 게시판…</option>
                  {BOARDS.filter((b) => b.key !== boardKey).map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleBulkMove}
                  disabled={saving || moveTarget === ''}
                  className="cms-btn cms-btn-sm"
                >
                  이동
                </button>
              </div>
            )}
          </div>

          {/* ── 검색 결과 없음 ── */}
          {listItems.length === 0 ? (
            <div className="anim-panel border border-dashed border-surface-border bg-[#fcfdfe] px-6 py-20 text-center">
              <p className="text-[15px] font-bold text-content">
                ‘{search.trim()}’ 에 해당하는 글이 없습니다
              </p>
              <button type="button" onClick={() => setSearch('')} className="cms-btn cms-btn-sm mt-4">
                검색 초기화
              </button>
            </div>
          ) : variant === 'cards' ? (
            <NewsCards
              items={listItems}
              selected={selected}
              busy={busy}
              saving={saving}
              onToggle={toggleSelect}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          ) : variant === 'tiles' ? (
            <InstaTiles
              items={listItems}
              selected={selected}
              busy={busy}
              saving={saving}
              onToggle={toggleSelect}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          ) : (
            <NoticeRows
              items={listItems}
              meta={meta}
              selected={selected}
              busy={busy}
              saving={saving}
              onToggle={toggleSelect}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          )}

          {searching && listItems.length > 0 && (
            <p className="mt-4 text-[11px] text-content-faint">
              검색 중입니다 — 전체 {allItems.length}건 중 {listItems.length}건만 보입니다.
            </p>
          )}
        </>
      )}

      {renderConfirm()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 목록 세 가지
// ─────────────────────────────────────────────────────────────

interface ListProps {
  items: ListItem[];
  selected: Set<string>;
  busy: boolean;
  saving: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/** 공지형 — 날짜 + 제목이 전부인 게시판. 표가 아니라 촘촘한 행 목록으로 읽는다 */
function NoticeRows({
  items,
  meta,
  selected,
  busy,
  saving,
  onToggle,
  onEdit,
  onDelete,
}: ListProps & { meta: BoardMeta }) {
  return (
    <div className="anim-panel">
      {/* 헤더 위 네이비 2px 룰 — 사이트 본문 표와 같은 문법 */}
      <div className="flex items-center gap-4 border-t-2 border-yonsei-navy px-1.5 py-2.5 text-[11px] font-bold text-content-faint">
        <span className="w-4 shrink-0" aria-hidden="true" />
        <span className="w-[92px] shrink-0">게시일</span>
        <span className="min-w-0 flex-1">제목</span>
        <span className="hidden w-[120px] shrink-0 text-right sm:block">관리</span>
      </div>

      <ul>
        {items.map((item) => {
          const { rec } = item;
          const attCount = (rec.attachments ?? []).filter((a) => a.href.trim() !== '').length;
          const sub = meta.noBody ? (rec.linkUrl ?? '') : plainText(rec.bodyKo ?? '');
          const host = (rec.hostKo ?? '').trim();
          return (
            <li
              key={item.id}
              className={cn(
                'flex items-center gap-4 border-b border-surface-border px-1.5 py-3.5 transition-colors',
                selected.has(item.id) ? 'bg-yonsei-blue/[0.04]' : 'hover:bg-surface-soft',
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => onToggle(item.id)}
                disabled={busy}
                aria-label={`${item.titleKo} 선택`}
                className="h-4 w-4 shrink-0 accent-yonsei-navy"
              />
              <span className="w-[92px] shrink-0 text-[11px] tabular-nums text-content-faint">
                {item.date}
              </span>
              <button
                type="button"
                onClick={() => onEdit(item.id)}
                disabled={saving}
                className="min-w-0 flex-1 text-left disabled:opacity-50"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-semibold text-content">{item.titleKo}</span>
                  {/* 배지는 BoardMeta 로 알 수 있는 것만 — 없는 정보를 지어내지 않는다 */}
                  {meta.hasHost && host !== '' && (
                    <span className="cms-badge bg-yonsei-navy/10 text-yonsei-navy">{host}</span>
                  )}
                  {(meta.dateIsEvent || (meta.hasEventFlag && rec.isEvent)) && (
                    <span className="cms-badge bg-yonsei-blue/10 text-yonsei-blue">행사</span>
                  )}
                  {meta.hasDateRange && (rec.endDate ?? '') !== '' && (
                    <span className="cms-badge bg-surface-soft text-content-faint">
                      ~{rec.endDate}
                    </span>
                  )}
                  {attCount > 0 && (
                    <span className="cms-badge bg-surface-soft text-content-faint">
                      첨부 {attCount}
                    </span>
                  )}
                </span>
                {sub !== '' && (
                  <span className="mt-1 block truncate text-[11px] text-content-faint">{sub}</span>
                )}
              </button>
              <span className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => onEdit(item.id)}
                  disabled={saving}
                  className="text-xs font-semibold text-yonsei-blue transition-colors hover:text-yonsei-navy disabled:opacity-40"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  disabled={saving}
                  className="text-xs font-semibold text-[#b42318] transition-colors hover:underline disabled:opacity-40"
                >
                  삭제
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 뉴스형 — 대표 이미지와 요약이 판단 근거라 카드로 편다 */
function NewsCards({ items, selected, busy, saving, onToggle, onEdit, onDelete }: ListProps) {
  return (
    <div className="anim-panel mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const { rec } = item;
        const image = (rec.image ?? '').trim();
        const excerpt = (rec.excerptKo ?? '').trim();
        return (
          <div
            key={item.id}
            className={cn(
              'flex flex-col border bg-surface transition-colors duration-200 ease-out-expo',
              selected.has(item.id) ? 'border-yonsei-blue' : 'border-surface-border hover:border-yonsei-blue',
            )}
          >
            <button
              type="button"
              onClick={() => onEdit(item.id)}
              disabled={saving}
              className="relative block aspect-[16/9] w-full overflow-hidden bg-[#eef1f5]"
              aria-label={`${item.titleKo} 편집`}
            >
              {image !== '' ? (
                /* 사진 비율이 제각각이라 틀에 가둬야 카드 높이가 들쭉날쭉하지 않다.
                   aspect-ratio 로 잡은 높이는 자식의 height:100% 를 확정해 주지
                   못해(실측 197 vs 235) 절대배치로 채운다. */
                /* eslint-disable-next-line @next/next/no-img-element -- 관리자 목록 썸네일(임의 외부 URL) */
                <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-[#a8b0ba]">
                  대표 이미지 없음
                </span>
              )}
              <span className="absolute right-0 top-0 bg-yonsei-navy/85 px-2 py-1 text-[10px] font-extrabold tracking-wide text-white">
                {CATEGORY_LABELS[rec.category ?? 'notice'] ?? '공지'}
              </span>
            </button>

            <div className="flex-1 px-4 pb-3 pt-3.5">
              <span className="text-[11px] tabular-nums text-content-faint">{item.date}</span>
              <p className="mt-1.5 text-[15px] font-bold leading-snug tracking-tight text-content">
                {item.titleKo}
              </p>
              {excerpt !== '' && (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-content-faint">
                  {excerpt}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[#f1f4f8] bg-[#fcfdfe] px-3.5 py-2.5">
              <label className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => onToggle(item.id)}
                  disabled={busy}
                  aria-label={`${item.titleKo} 선택`}
                  className="h-4 w-4 shrink-0 accent-yonsei-navy"
                />
                <span className="truncate text-[11px] text-content-faint">/{item.subId}</span>
              </label>
              <span className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => onEdit(item.id)}
                  disabled={saving}
                  className="text-xs font-bold text-yonsei-blue transition-colors hover:text-yonsei-navy disabled:opacity-40"
                >
                  수정 →
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  disabled={saving}
                  className="text-xs font-semibold text-[#b42318] transition-colors hover:underline disabled:opacity-40"
                >
                  삭제
                </button>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 인스타그램 — 사진 자체가 콘텐츠라 정사각 타일로 본다(홈 그리드와 같은 순서) */
function InstaTiles({ items, selected, busy, saving, onToggle, onEdit, onDelete }: ListProps) {
  return (
    <div className="anim-panel mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {items.map((item, i) => {
        const { rec } = item;
        const image = (rec.image ?? '').trim();
        return (
          <div
            key={item.id}
            className={cn(
              'border bg-surface transition-colors duration-200 ease-out-expo',
              selected.has(item.id) ? 'border-yonsei-blue' : 'border-surface-border hover:border-yonsei-blue',
            )}
          >
            <button
              type="button"
              onClick={() => onEdit(item.id)}
              disabled={saving}
              className="relative block aspect-square w-full overflow-hidden bg-[#eef1f5]"
              aria-label={`${item.titleKo} 편집`}
            >
              {image !== '' ? (
                /* 정사각 타일 — 위 뉴스 카드와 같은 이유로 절대배치로 틀을 채운다. */
                /* eslint-disable-next-line @next/next/no-img-element -- 관리자 목록 썸네일(임의 외부 URL) */
                <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-[#a8b0ba]">
                  게시물 이미지 없음
                </span>
              )}
              {/* 순서 배지 — 홈 그리드에 놓이는 차례 */}
              <span className="absolute left-2 top-2 bg-yonsei-navy/85 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                {i + 1}
              </span>
            </button>

            <div className="px-3 pb-2.5 pt-2.5">
              <p className="truncate text-[13px] font-semibold text-content">{item.titleKo}</p>
              <p className="mt-0.5 truncate text-[11px] text-content-faint">
                {(rec.linkUrl ?? '').trim() || '게시물 URL 없음'}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#f1f4f8] pt-2">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => onToggle(item.id)}
                  disabled={busy}
                  aria-label={`${item.titleKo} 선택`}
                  className="h-4 w-4 shrink-0 accent-yonsei-navy"
                />
                <span className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(item.id)}
                    disabled={saving}
                    className="text-xs font-bold text-yonsei-blue transition-colors hover:text-yonsei-navy disabled:opacity-40"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    disabled={saving}
                    className="text-xs font-semibold text-[#b42318] transition-colors hover:underline disabled:opacity-40"
                  >
                    삭제
                  </button>
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
