'use client';

// 콘솔 대시보드 — "무엇을 수정할까요?"
//
// 구성 순서가 곧 사용 빈도 순서다:
//   안내 한 줄 → 검색(자동완성) → 최근 편집 → 지금 할 일 → 전체 항목 → 안내(접이식)
// 반복 방문자는 검색/최근 편집에서 두 번 안에 목적지에 닿고, 처음 온 사람만
// 아래로 내려가 전체 항목과 안내를 읽는다.
//
// 제목은 페이지 히어로(사이트 공용 <Hero>)가 이미 말했으므로 여기서 h1 을 다시
// 두지 않는다 — 대시보드는 곧바로 "무엇을 할 수 있는지" 한 줄과 검색으로 시작한다.
//
// "지금 할 일"은 콘텐츠를 실제로 읽어 비어 있는 곳을 세어 보여준다. 콘텐츠 파일은
// 기존 loadJson(이제 /api/admin/content), 게시글 수는 게시판 admin API 로 센다.
//
// 내부 운영 도구라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { BOARDS, type BoardMeta } from '@/lib/admin/boards';
import { loadJson } from '@/lib/admin/content-api';
import type { RepoConfig } from '@/lib/admin/github';
import { MENU_GROUPS, RESOURCES, type MenuEntry } from '@/lib/admin/resources';
import {
  ALL_ENTRIES,
  entryGroupLabel,
  entryId,
  entryKind,
  entryLabel,
  entryDescription,
  entryWhere,
  isEditable,
  readRecents,
} from './entries';

interface Props {
  config: RepoConfig;
  onOpen: (entry: MenuEntry) => void;
  /** 이 제목의 접이식 안내를 펼친 채로 연다 — 셸이 배너에서 여기로 보낼 때 쓴다.
   *  안내로 보내 놓고 사용자가 하단의 접힌 목록을 다시 찾게 두면 안내가 아니라 숙제다. */
  openGuide?: string;
}

/** "지금 할 일" 카드 하나 — 숫자 + 제목 + 설명 + 눌렀을 때 열 항목 */
interface TaskCard {
  key: string;
  n: number;
  title: string;
  body: string;
  entry: MenuEntry;
}

export function AdminDashboard({ config, onOpen, openGuide }: Props) {
  return (
    <div className="anim-panel">
      <Intro />
      <SearchAndRecents onOpen={onOpen} />
      <TaskSection config={config} onOpen={onOpen} />
      <AllEntriesSection onOpen={onOpen} />
      <GuideSection openGuide={openGuide} />
    </div>
  );
}

// ---- 1. 인트로 한 줄 ----

/** 편집 흐름(고른다 → 트레이에 모인다 → 한 번에 저장 → 자동 반영)을 한 문단으로.
 *  처음 온 사람이 아래 안내를 펴 보지 않아도 전체 그림을 갖게 하는 문장이다. */
function Intro() {
  return (
    <p className="max-w-[62ch] text-sm leading-[1.8] text-content-soft">
      항목을 고르면 <strong className="font-semibold text-content">목록에서 바로</strong> 고칩니다.
      고친 내용은 아래 <strong className="font-semibold text-content">변경 트레이</strong>에 모이고,
      한 번에 저장하면 수 초 내 사이트에 반영됩니다.
    </p>
  );
}

// ---- 2·3. 검색(자동완성) + 최근 편집 ----

function SearchAndRecents({ onOpen }: { onOpen: (entry: MenuEntry) => void }) {
  const [query, setQuery] = useState('');
  // 키보드 하이라이트 위치. -1 이면 아직 아무것도 고르지 않은 상태.
  const [cursor, setCursor] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return ALL_ENTRIES.filter(
      (e) =>
        isEditable(e) &&
        (entryLabel(e).toLowerCase().includes(q) || entryDescription(e).toLowerCase().includes(q)),
    ).slice(0, 8);
  }, [q]);

  // 최근 편집 — localStorage. SSR 불일치를 피하려 마운트 후 로드.
  const [recents, setRecents] = useState<MenuEntry[]>([]);
  useEffect(() => {
    setRecents(readRecents());
  }, []);

  // 바깥 클릭 시 자동완성을 닫는다(입력값은 유지 — 다시 포커스하면 되살아난다).
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function choose(entry: MenuEntry) {
    setQuery('');
    setCursor(-1);
    setOpen(false);
    onOpen(entry);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setQuery('');
      setCursor(-1);
      return;
    }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c <= 0 ? results.length - 1 : c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[cursor >= 0 ? cursor : 0]);
    }
  }

  const showDropdown = open && q.length > 0;

  return (
    <>
      <div ref={boxRef} className="relative mt-8 max-w-[520px]">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="편집할 항목 검색 (예: 세미나, 교수진, 장학금)"
          aria-label="편집할 항목 검색"
          className="cms-input"
        />
        {showDropdown && (
          <div className="absolute inset-x-0 top-full z-20 border border-t-0 border-yonsei-blue bg-surface shadow-[0_6px_18px_-12px_rgba(0,40,94,.3)]">
            {results.length === 0 ? (
              <p className="px-4 py-3.5 text-xs text-content-faint">검색 결과가 없습니다.</p>
            ) : (
              results.map((entry, i) => (
                <button
                  key={entryId(entry)}
                  type="button"
                  onClick={() => choose(entry)}
                  onMouseEnter={() => setCursor(i)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2.5 border-b border-[#f1f4f8] px-4 py-[11px] text-left text-[13px] transition-colors last:border-b-0',
                    i === cursor ? 'bg-surface-soft' : 'bg-surface',
                  )}
                >
                  <span className="font-bold text-content">{entryLabel(entry)}</span>
                  <span className="shrink-0 text-[11px] text-content-faint">
                    {entryGroupLabel(entry)}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* 최근 편집 — 검색 중에는 숨겨 결과 목록에 집중시킨다 */}
      {recents.length > 0 && !q && (
        <div className="mt-[18px] flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold tracking-[0.06em] text-content-faint">
            최근 편집
          </span>
          {recents.map((entry) => (
            <button
              key={entryId(entry)}
              type="button"
              onClick={() => onOpen(entry)}
              className="border border-surface-border bg-surface-soft px-3.5 py-1.5 text-xs font-semibold text-content transition-colors duration-200 ease-out-expo hover:border-yonsei-blue hover:text-yonsei-blue"
            >
              {entryLabel(entry)} <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ---- 4. 지금 할 일 ----

/** 집계에 쓰는 최소 형태만 선언한다 (스키마 전체를 다시 적지 않는다) */
interface FacultyRow {
  email?: string | null;
  yearRange?: string | null;
}
interface LabRow {
  nameEn?: string | null;
}
interface CourseRow {
  code?: string;
}

/**
 * 글이 한 건도 없는 게시판. 게시글은 Supabase 에 살므로 게시판 admin API 로 센다
 * (예전에는 레거시 content/board.json 을 읽어 세었고, 그 파일은 이미 낡은 데이터라
 * 실제와 어긋났다). 대상은 종전과 같은 board.json 계열 — 뉴스형 2종은 원래 집계
 * 대상이 아니었다.
 *
 * ⚠️ 게시판마다 목록을 한 번 받아 길이만 센다(카운트 전용 엔드포인트가 없다).
 * 대상이 13종이라 요청이 적지 않으므로 대시보드 진입 때만 부른다 — 카운트 API 가
 * 생기면 한 번으로 줄일 자리다.
 *
 * 실패하면 null(=판단 근거 없음)을 돌려주고 카드를 내린다. 이 집계 하나가 실패해
 * 나머지 카드까지 사라지면 안 된다(dev 에 Supabase 설정이 없는 경우가 그렇다).
 */
async function findEmptyBoards(): Promise<BoardMeta[] | null> {
  const targets = BOARDS.filter((b) => b.file === 'board.json');
  try {
    const counts = await Promise.all(
      targets.map(async (b) => {
        const res = await fetch(`/api/admin/posts?board=${encodeURIComponent(b.key)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`게시판 조회 실패 (${b.key})`);
        const body = (await res.json()) as { items?: unknown[] };
        return (body.items ?? []).length;
      }),
    );
    return targets.filter((_, i) => counts[i] === 0);
  } catch {
    return null;
  }
}

function TaskSection({ config, onOpen }: Props) {
  // null = 로딩 중, [] = 빈 곳 없음, undefined = 불러오기 실패(섹션 자체를 숨김)
  const [tasks, setTasks] = useState<TaskCard[] | null | undefined>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const [emptyBoards, faculty, labs, courses, descs] = await Promise.all([
          findEmptyBoards(),
          loadJson<FacultyRow[]>(config, RESOURCES.facultyDirectory.file),
          loadJson<LabRow[]>(config, RESOURCES.labs.file),
          loadJson<CourseRow[]>(config, RESOURCES.coursesUndergraduate.file),
          loadJson<Record<string, { desc?: string }>>(config, RESOURCES.courseDescriptions.file),
        ]);
        if (cancelled) return;

        const next: TaskCard[] = [];

        // (1) 글이 한 건도 없는 게시판 (findEmptyBoards — 실패 시 null 이라 카드를 낸다)
        if (emptyBoards && emptyBoards.length > 0) {
          next.push({
            key: 'emptyBoards',
            n: emptyBoards.length,
            title: '글이 없는 게시판',
            body: `${emptyBoards.map((b) => b.label).join(' · ')} — 첫 글을 올리면 사이트 목록에 나타납니다.`,
            entry: { type: 'board', boardKey: emptyBoards[0].key },
          });
        }

        // (2) 체계도에서 클릭해도 설명이 뜨지 않는 학부 교과목.
        const missingDesc = courses.data.filter((c) => {
          const code = String(c.code ?? '').trim();
          if (!code) return false;
          return !String(descs.data[code]?.desc ?? '').trim();
        });
        if (missingDesc.length > 0) {
          next.push({
            key: 'missingDesc',
            n: missingDesc.length,
            title: '설명 없는 교과목',
            body: '교과목 체계도에서 과목을 눌러도 설명이 비어 있습니다.',
            entry: { type: 'collection', resourceKey: 'courseDescriptions' },
          });
        }

        // (3) 영문 페이지에서 한국어 이름이 그대로 노출되는 연구실.
        const labsNoEn = labs.data.filter((l) => !String(l.nameEn ?? '').trim());
        if (labsNoEn.length > 0) {
          next.push({
            key: 'labsNoEn',
            n: labsNoEn.length,
            title: '영문명 없는 연구실',
            body: '영문 사이트에서 연구실명이 한국어로 표시됩니다.',
            entry: { type: 'collection', resourceKey: 'labs' },
          });
        }

        // (4) 이메일 없는 교수. 재직 기간(yearRange)이 있으면 퇴임 교원이라
        //     이메일이 없는 것이 정상이므로 제외한다.
        const facultyNoEmail = faculty.data.filter(
          (f) => !String(f.yearRange ?? '').trim() && !String(f.email ?? '').trim(),
        );
        if (facultyNoEmail.length > 0) {
          next.push({
            key: 'facultyNoEmail',
            n: facultyNoEmail.length,
            title: '이메일 없는 교수',
            body: '교수진 카드에 연락처가 비어 있어 학생이 문의할 수 없습니다.',
            entry: { type: 'collection', resourceKey: 'facultyDirectory' },
          });
        }

        setTasks(next);
      } catch {
        // 권한 없음·네트워크 오류 등 — 대시보드 본체를 깨뜨리지 않고 조용히 숨긴다.
        if (!cancelled) setTasks(undefined);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [config]);

  if (tasks === undefined) return null;

  return (
    <section className="mt-14">
      <SectionHead title="지금 할 일" caption="콘텐츠를 훑어 자동으로 찾은 빈 곳" />
      {tasks === null ? (
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[150px] animate-pulse border border-surface-border bg-[#eef1f5]" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-[13px] text-content-faint">지금 채워야 할 빈 곳이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
          {tasks.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onOpen(t.entry)}
              className="flex flex-col items-start gap-2 border border-surface-border bg-surface p-5 text-left transition-colors duration-200 ease-out-expo hover:border-yonsei-blue hover:bg-surface-soft"
            >
              <span className="text-[34px] font-light leading-none tabular-nums text-yonsei-blue/55">
                {t.n}
              </span>
              <span className="text-sm font-bold text-content">{t.title}</span>
              <span className="text-xs leading-[1.65] text-content-faint">{t.body}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ---- 5. 전체 항목 ----

function AllEntriesSection({ onOpen }: { onOpen: (entry: MenuEntry) => void }) {
  return (
    <section className="mt-14">
      <SectionHead title="전체 항목" caption={`${ALL_ENTRIES.length}개 · 사이트 메뉴 순서`} />
      {/* 그리드가 아니라 CSS 다단(columns) 이다. 그리드는 그룹 하나가 한 칸을 통째로
          차지해, 항목이 1개인 '일정'과 11개인 '뉴스·공지'가 같은 행에 놓이면 짧은 쪽
          아래로 화면 절반이 빈다. 다단은 그룹이 열을 따라 흘러 내려가 그 구멍이 없다.
          (break-inside-avoid 는 다단에서만 실제로 동작한다 — 그리드에서는 무시된다.) */}
      <div className="columns-1 [column-gap:2.75rem] md:columns-2 xl:columns-3">
        {MENU_GROUPS.map((group) => (
          <div key={group.label} className="mb-8 break-inside-avoid">
            <p className="mb-1 text-xs font-bold tracking-[0.1em] text-yonsei-blue">
              {group.label}
            </p>
            {group.entries.map((entry) => {
              const editable = isEditable(entry);
              const where = entryWhere(entry);
              const kind = entryKind(entry);
              return (
                <button
                  key={entryId(entry)}
                  type="button"
                  disabled={!editable}
                  onClick={() => editable && onOpen(entry)}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 border-b border-surface-border px-1 py-3 text-left transition-colors',
                    editable ? 'hover:bg-surface-soft' : 'cursor-not-allowed',
                  )}
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-sm font-semibold',
                        editable ? 'text-content' : 'text-content-faint',
                      )}
                    >
                      {entryLabel(entry)}
                    </span>
                    {/* 노출 위치는 제목 아래 한 줄로 — 오른쪽에 두면 항목마다 길이가
                        달라 줄 끝이 들쭉날쭉하고, 잘린 문장이 말줄임으로 남는다. */}
                    {where !== '' && (
                      <span
                        title={where}
                        className="mt-0.5 line-clamp-1 text-[11px] text-content-faint"
                      >
                        {where}
                      </span>
                    )}
                  </span>
                  {/* 오른쪽은 유형 배지로 통일 — 사이드바와 같은 표기라 두 화면이 같은
                      어휘를 쓰고, 모든 행의 오른쪽 끝이 한 줄로 정렬된다. */}
                  {editable && kind ? (
                    <span className={cn('cms-badge mt-0.5 shrink-0', kind.cls)}>{kind.label}</span>
                  ) : (
                    <span className="mt-0.5 shrink-0 bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold text-content-faint">
                      준비 중
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

/** 섹션 제목 + 우측 캡션 + 네이비 2px 룰 */
function SectionHead({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="cms-rule mb-5 flex items-baseline justify-between gap-4 pb-2.5">
      <h2 className="text-lg font-bold text-content">{title}</h2>
      <span className="shrink-0 text-[11px] text-content-faint">{caption}</span>
    </div>
  );
}

// ---- 6. 접이식 안내 ----

const FIRST_TIME_STEPS = [
  { t: '콘텐츠 선택', b: '왼쪽 메뉴나 위 목록에서 편집할 항목(게시판·연혁·교수진·교과목 등)을 고릅니다.' },
  { t: '내용 편집', b: '한국어와 English를 입력합니다. “한→영 번역” 버튼으로 영문 초안을 채우고, 사진은 파일을 올리면 됩니다.' },
  { t: '저장', b: '“저장” 버튼을 누르면 변경 내용이 사이트 데이터베이스에 바로 기록됩니다.' },
  { t: '자동 반영', b: '재배포를 기다릴 필요 없이 수 초 내 실제 페이지에 나타납니다.' },
];

const NEW_ADMIN_STEPS = [
  {
    t: '로그인 허용',
    b: 'Vercel → Settings → Environment Variables 의 ALLOWED_GITHUB_LOGINS 에 그 사람의 GitHub 계정명을 추가합니다(여러 명은 쉼표로 구분).',
  },
  {
    t: '저장소 권한',
    b: 'GitHub 저장소 halfjinhyeon/yonsei-me → Settings → Collaborators 에서 그 계정을 Write 권한으로 초대합니다(저장 = 커밋에 필요).',
  },
  {
    t: '재배포',
    b: '환경변수는 새 배포부터 적용됩니다. Vercel 에서 최신 배포를 Redeploy 하면 그 사람이 로그인할 수 있습니다.',
  },
];

/** 처음 한 번만 필요한 내용이라 접이식으로 하단에 — 반복 방문자의 동선을 가리지 않는다 */
function GuideSection({ openGuide }: { openGuide?: string }) {
  return (
    <section className="mt-14 border-t border-surface-border">
      <GuideDetails
        title="처음이신가요?"
        note="— 사용 방법 4단계"
        defaultOpen={openGuide === '처음이신가요?'}
      >
        <ol className="grid gap-8 pb-8 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          {FIRST_TIME_STEPS.map((step, i) => (
            <NumberedStep key={step.t} i={i} title={step.t} body={step.b} />
          ))}
        </ol>
      </GuideDetails>

      <GuideDetails
        title="새 관리자 등록"
        note="— GitHub 계정 허용 절차"
        defaultOpen={openGuide === '새 관리자 등록'}
      >
        <div className="pb-8 pt-2">
          <p className="max-w-prose text-[13px] leading-[1.8] text-content-soft">
            이 콘솔은 GitHub 로그인으로 접근합니다. 새 담당자를 추가하려면 아래 세 가지가
            필요합니다 (Vercel·GitHub 설정 권한이 있는 사람이 진행하세요).
          </p>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {NEW_ADMIN_STEPS.map((step, i) => (
              <NumberedStep key={step.t} i={i} title={step.t} body={step.b} />
            ))}
          </ol>
          <p className="mt-6 max-w-prose text-xs leading-relaxed text-content-faint">
            계정명은 이메일·실명이 아니라 GitHub username 입니다. 관리자를 제거하려면
            ALLOWED_GITHUB_LOGINS 에서 계정명을 지우고 다시 배포하세요. (저장소 소유자 계정은
            코드에 항상 허용되어 있습니다.)
          </p>
        </div>
      </GuideDetails>
    </section>
  );
}

function GuideDetails({
  title,
  note,
  defaultOpen,
  children,
}: {
  title: string;
  note: string;
  /** 처음 한 번 펼친 채로 연다(그 뒤 접고 펴는 건 온전히 사용자 몫) */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  // <details open={...}> 로 제어하면 React 가 매 렌더 열림 상태를 되돌려 놓아
  // 사용자가 직접 접을 수 없게 된다. 그래서 비제어로 두고 DOM 속성만 한 번 켠다.
  // 이어서 화면 가운데로 스크롤 — 안내는 페이지 맨 아래라 펴 놓기만 하면
  // 사용자는 자기가 어디로 보내졌는지 알지 못한다.
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!defaultOpen || !ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView({ block: 'center' });
  }, [defaultOpen]);

  return (
    <details ref={ref} className="group border-b border-surface-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-5 text-base font-bold text-content transition-colors hover:text-yonsei-blue [&::-webkit-details-marker]:hidden">
        <span>
          {title} <span className="font-medium text-content-soft">{note}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4 shrink-0 text-content-faint transition-transform group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      {children}
    </details>
  );
}

function NumberedStep({ i, title, body }: { i: number; title: string; body: string }) {
  return (
    <li className="border-t border-surface-border pt-4">
      <span className="block text-3xl font-light tabular-nums text-yonsei-blue/40">
        {String(i + 1).padStart(2, '0')}
      </span>
      <h4 className="mt-3 text-base font-bold text-content">{title}</h4>
      <p className="mt-1.5 text-sm leading-relaxed text-content-soft">{body}</p>
    </li>
  );
}
