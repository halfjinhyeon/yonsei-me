'use client';

// 콘솔 대시보드 — "무엇을 수정할까요?"
//
// 구성 순서가 곧 사용 빈도 순서다:
//   인사말 → 최근 편집 → 지금 할 일 → 전체 항목 → 안내(접이식)
// 반복 방문자는 최근 편집 카드에서 한 번에 목적지에 닿고, 처음 온 사람만
// 아래로 내려가 전체 항목과 안내를 읽는다.
//
// 검색은 사이드바로 옮겼다 — 어느 화면에서나 같은 자리에 있어야 하는 기능이라
// 대시보드에만 두면 편집 화면에서는 쓸 수 없다. 여기에는 검색 UI 가 없다.
//
// 첫 줄은 인사말 h1 하나다. 편집 흐름 설명은 하단 접이식 안내가 맡는다 —
// 매번 오는 사람에게 같은 문단을 매번 읽히지 않는다.
//
// "지금 할 일"은 콘텐츠를 실제로 읽어 비어 있는 곳을 세어 보여준다. 콘텐츠 파일은
// 기존 loadJson(이제 /api/admin/content), 게시글 수는 게시판 admin API 로 센다.
//
// 내부 운영 도구라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { BOARDS, type BoardMeta } from '@/lib/admin/boards';
import { loadJson, type RepoConfig } from '@/lib/admin/content-api';
import { MENU_GROUPS, RESOURCES, type MenuEntry } from '@/lib/admin/resources';
import { useAdminShell } from './AdminShellContext';
import { entryIcon, IcoArrowRight, IcoChevronRight } from './cms-icons';
import {
  ALL_ENTRIES,
  entryGroupLabel,
  entryId,
  entryKind,
  entryLabel,
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
  // 로그인명은 셸이 이미 알고 있다 — 화면마다 다시 조회하지 않는다.
  const { login } = useAdminShell();

  return (
    // 좌우 여백은 셸이 준다. 여기서는 최대 폭과 섹션 사이 간격만 정한다.
    <div className="anim-panel mx-auto flex max-w-[1024px] flex-col gap-7">
      <h1 className="font-hero text-2xl font-bold tracking-[-0.01em] text-content">
        안녕하세요, {login || '관리자'} 님
      </h1>
      <RecentSection onOpen={onOpen} />
      <TaskSection config={config} onOpen={onOpen} />
      <AllEntriesSection onOpen={onOpen} />
      <GuideSection openGuide={openGuide} />
    </div>
  );
}

// ---- 1. 최근 편집 ----

/** 아이콘 타일 + 항목명 + 그룹 라벨의 카드 3장.
 *  기록이 없으면(첫 방문) 섹션째 사라진다 — 빈 자리를 설명하지 않는다. */
function RecentSection({ onOpen }: { onOpen: (entry: MenuEntry) => void }) {
  // 최근 편집 — localStorage. SSR 불일치를 피하려 마운트 후 로드.
  const [recents, setRecents] = useState<MenuEntry[]>([]);
  useEffect(() => {
    setRecents(readRecents());
  }, []);

  if (recents.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2.5 text-[11px] font-bold tracking-[0.18em] text-yonsei-blue">최근 편집</h2>
      {/* 한 줄에 최대 3장. 그 이상은 "최근"이 아니라 목록이 된다. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {recents.slice(0, 3).map((entry) => {
          const group = entryGroupLabel(entry);
          const Icon = entryIcon(entry, group);
          return (
            <button
              key={entryId(entry)}
              type="button"
              onClick={() => onOpen(entry)}
              className="flex items-center gap-3 border border-surface-border bg-surface p-3.5 text-left transition-colors duration-200 ease-out-expo hover:border-yonsei-blue"
            >
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center bg-yonsei-navy text-white">
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-semibold text-content">
                  {entryLabel(entry)}
                </span>
                <span className="mt-px block truncate text-[12.5px] text-content-faint">
                  {group}
                </span>
              </span>
              <IcoArrowRight size={16} className="ml-auto shrink-0 text-content-faint" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---- 2. 지금 할 일 ----

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
    // 상단 네이비 2px — 대시보드에서 유일하게 "지금 처리할 것"인 카드라 여기만 강조한다.
    <section className="border border-surface-border border-t-2 border-t-yonsei-navy bg-surface">
      <div className="px-5 pb-2 pt-[18px]">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold tracking-[-0.01em] text-content">지금 할 일</h2>
          {/* 건수 필은 셀 수 있을 때만 — 로딩 중 0건, 빈 상태 0건은 말이 안 된다 */}
          {tasks !== null && tasks.length > 0 && (
            <span className="bg-yonsei-navy px-2 py-0.5 text-[12.5px] font-semibold tabular-nums text-white">
              {tasks.length}건
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-content-faint">자동 점검으로 찾은 빈 곳</p>
      </div>

      {tasks === null ? (
        <div className="flex flex-col gap-1.5 px-3 pb-3 pt-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[52px] animate-pulse bg-[#eef1f5]" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-content-faint">지금 채워야 할 빈 곳이 없습니다.</p>
      ) : (
        <div className="flex flex-col px-2 pb-2.5 pt-1.5">
          {tasks.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onOpen(t.entry)}
              className="flex items-start gap-3.5 p-3 text-left transition-colors duration-200 ease-out-expo hover:bg-surface-soft"
            >
              <span className="flex h-[26px] min-w-[32px] shrink-0 items-center justify-center bg-yonsei-navy px-2 text-[13.5px] font-bold tabular-nums text-white">
                {t.n}
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-content">{t.title}</span>
                <span className="mt-0.5 block text-[13.5px] leading-[1.6] text-content">
                  {t.body}
                </span>
              </span>
              <IcoChevronRight size={16} className="ml-auto self-center shrink-0 text-[#a8b0ba]" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ---- 3. 전체 항목 ----

/** 유형 점의 색 — 사이드바 배지와 같은 세 갈래(게시판·데이터·문서)를 점 하나로 줄였다.
 *  entryKind 가 라벨을 단일 출처로 들고 있으므로 여기서는 라벨로만 분기한다. */
const KIND_DOTS = [
  { label: '게시판', dot: 'bg-yonsei-navy' },
  { label: '데이터', dot: 'bg-[#2E86D6]' },
  { label: '문서', dot: 'bg-[#6E6E6E]' },
];

function kindDot(entry: MenuEntry): string {
  const label = entryKind(entry)?.label ?? '';
  // 준비 중(placeholder)은 유형이 없다 — 회색 테두리 색으로 눕혀 둔다.
  return KIND_DOTS.find((k) => k.label === label)?.dot ?? 'bg-surface-border';
}

function AllEntriesSection({ onOpen }: { onOpen: (entry: MenuEntry) => void }) {
  // '일정'은 사이드바 상단 평면 항목이 담당하므로 카드에서 뺀다 — 항목 1개짜리
  // 그룹이 카드 한 칸을 통째로 차지하면 그 아래가 통으로 빈다.
  const groups = MENU_GROUPS.filter((g) => g.label !== '일정');

  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="text-[11px] font-bold tracking-[0.18em] text-yonsei-blue">전체 항목</h2>
        <span className="text-[12.5px] tabular-nums text-content-faint">{ALL_ENTRIES.length}</span>
        <span className="ml-auto flex gap-3.5 text-[12.5px] text-content">
          {KIND_DOTS.map((k) => (
            <span key={k.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('h-[7px] w-[7px]', k.dot)} />
              {k.label}
            </span>
          ))}
        </span>
      </div>

      {/* 항목이 11개인 '뉴스·공지'만 두 행을 쓰게 두면 나머지 카드가 옆으로 흘러
          짧은 카드 아래가 비지 않는다(그룹마다 길이가 크게 다르다). */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <div
            key={group.label}
            className={cn(
              'border border-surface-border border-t-2 border-t-yonsei-navy bg-surface p-2',
              group.label === '뉴스·공지' && 'md:row-span-2 xl:row-span-2',
            )}
          >
            <p className="px-2.5 pb-1 pt-2 text-xs font-semibold tracking-[0.02em] text-content-faint">
              {group.label}
            </p>
            {group.entries.map((entry) => (
              <button
                key={entryId(entry)}
                type="button"
                disabled={!isEditable(entry)}
                onClick={() => onOpen(entry)}
                className="flex w-full items-center gap-2.5 px-2.5 py-[7px] text-left text-[13.5px] text-content transition-colors duration-200 ease-out-expo hover:bg-surface-soft hover:text-yonsei-navy disabled:cursor-not-allowed disabled:text-content-faint"
              >
                <span aria-hidden="true" className={cn('h-[7px] w-[7px] shrink-0', kindDot(entry))} />
                {entryLabel(entry)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- 4. 접이식 안내 ----

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
    b: 'GitHub 저장소 yonsei-mech/yonsei-me → Settings → Collaborators 에서 그 계정을 Write 권한으로 초대합니다(저장 = 커밋에 필요).',
  },
  {
    t: '재배포',
    b: '환경변수는 새 배포부터 적용됩니다. Vercel 에서 최신 배포를 Redeploy 하면 그 사람이 로그인할 수 있습니다.',
  },
];

/** 처음 한 번만 필요한 내용이라 접이식으로 하단에 — 반복 방문자의 동선을 가리지 않는다 */
function GuideSection({ openGuide }: { openGuide?: string }) {
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <GuideDetails
        title="처음이신가요?"
        note="사용 방법 4단계"
        defaultOpen={openGuide === '처음이신가요?'}
      >
        <ol className="grid gap-4">
          {FIRST_TIME_STEPS.map((step, i) => (
            <NumberedStep key={step.t} i={i} title={step.t} body={step.b} />
          ))}
        </ol>
      </GuideDetails>

      <GuideDetails
        title="새 관리자 등록"
        note="GitHub 계정 허용 절차"
        defaultOpen={openGuide === '새 관리자 등록'}
      >
        <p className="text-[13px] leading-[1.8] text-content-soft">
          이 콘솔은 GitHub 로그인으로 접근합니다. 새 담당자를 추가하려면 아래 세 가지가
          필요합니다 (Vercel·GitHub 설정 권한이 있는 사람이 진행하세요).
        </p>
        <ol className="mt-4 grid gap-4">
          {NEW_ADMIN_STEPS.map((step, i) => (
            <NumberedStep key={step.t} i={i} title={step.t} body={step.b} />
          ))}
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-content-faint">
          계정명은 이메일·실명이 아니라 GitHub username 입니다. 관리자를 제거하려면
          ALLOWED_GITHUB_LOGINS 에서 계정명을 지우고 다시 배포하세요. (저장소 소유자 계정은
          코드에 항상 허용되어 있습니다.)
        </p>
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
    // 두 카드가 나란한 그리드라 self-start 가 필요하다 — 없으면 한쪽만 펼쳐도
    // 접힌 카드가 같은 행 높이로 늘어나 빈 상자가 된다.
    <details ref={ref} className="group w-full self-start border border-surface-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-[18px] py-[15px] transition-colors duration-200 ease-out-expo hover:bg-surface-soft [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-content">{title}</span>
          <span className="mt-px block text-[13px] text-content-faint">{note}</span>
        </span>
        <IcoChevronRight
          size={16}
          className="ml-auto shrink-0 text-content-faint transition-transform duration-200 group-open:rotate-90"
        />
      </summary>
      <div className="border-t border-surface-border px-[18px] py-4">{children}</div>
    </details>
  );
}

/** 안내 한 단계 — 번호 타일 + 제목 + 설명. 카드가 좁아 한 열로 쌓는다. */
function NumberedStep({ i, title, body }: { i: number; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[2px] flex h-[22px] w-[22px] shrink-0 items-center justify-center border border-surface-border text-[12px] font-bold tabular-nums text-yonsei-blue">
        {i + 1}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-content">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-[1.7] text-content-soft">{body}</span>
      </span>
    </li>
  );
}
