'use client';

// 전체 콘텐츠 관리 콘솔 셸 (단일 페이지 앱).
// 정적 사이트라 서버 DB가 없어 GitHub Contents API로 content/* 파일을 직접
// 커밋한다("Git이 곧 DB"). 이 셸은 사이드바(메뉴 그룹)와 대시보드만 담당하고,
// 실제 편집은 항목 종류별 에디터(BoardEditor / CollectionEditor / MarkdownEditor)에
// 위임한다.
//
// 대시보드 UX 원칙: "작업 공간 우선".
// - 편집 카드 그리드가 최상단(검색 필터 + 최근 편집 바로가기 포함).
// - 온보딩 설명서·관리자 등록 안내는 접이식(details)으로 하단에 — 처음 한 번만
//   필요한 내용이 반복 방문자의 작업 동선을 가리지 않게 한다.
//
// 콘텐츠/코드 분리 원칙은 "사이트 콘텐츠"(content/*)에 적용된다.
// 이 관리자 도구는 내부 운영용이라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/Reveal';
import { getBoard, type BoardKey } from '@/lib/admin/boards';
import { type RepoConfig } from '@/lib/admin/github';
import {
  getMarkdownPage,
  getResource,
  MENU_GROUPS,
  RESOURCES,
  type MenuEntry,
} from '@/lib/admin/resources';
import { BoardEditor } from './BoardEditor';
import { CollectionEditor } from './CollectionEditor';
import { MarkdownEditor } from './MarkdownEditor';

interface Props {
  /** GitHub OAuth access token (세션에서 주입) — Contents API 커밋에 사용 */
  token: string;
  /** 로그인한 GitHub 계정명 */
  login: string;
}

/** 메뉴 항목의 표시 라벨 */
function entryLabel(entry: MenuEntry): string {
  switch (entry.type) {
    case 'board':
      return getBoard(entry.boardKey).label;
    case 'collection':
      return RESOURCES[entry.resourceKey].label;
    case 'markdown':
      return getMarkdownPage(entry.pageKey).label;
    case 'placeholder':
      return entry.label;
  }
}

/** 대시보드 카드 설명 */
function entryDescription(entry: MenuEntry): string {
  switch (entry.type) {
    case 'board':
      return '게시글을 작성·수정·삭제하고 첨부파일을 관리합니다.';
    case 'collection':
      return RESOURCES[entry.resourceKey].description;
    case 'markdown':
      return getMarkdownPage(entry.pageKey).description;
    case 'placeholder':
      return entry.note;
  }
}

/** 메뉴 항목의 고유 식별 문자열 — 사이드바 key·에디터 리마운트 key로 사용 */
function entryId(entry: MenuEntry): string {
  switch (entry.type) {
    case 'board':
      return `board:${entry.boardKey}`;
    case 'collection':
      return `collection:${entry.resourceKey}`;
    case 'markdown':
      return `markdown:${entry.pageKey}`;
    case 'placeholder':
      return `placeholder:${entry.label}`;
  }
}

/** 편집 가능한 항목인지 (placeholder는 비활성) */
function isEditable(entry: MenuEntry): boolean {
  return entry.type !== 'placeholder';
}

/** 카드 우상단 유형 배지 — 무엇을 편집하게 될지 한눈에 */
function entryKind(entry: MenuEntry): { label: string; cls: string } | null {
  switch (entry.type) {
    case 'board':
      return { label: '게시판', cls: 'bg-yonsei-blue/10 text-yonsei-blue' };
    case 'collection':
      return { label: '데이터', cls: 'bg-yonsei-navy/10 text-yonsei-navy dark:bg-yonsei-sky/15 dark:text-yonsei-sky' };
    case 'markdown':
      return { label: '문서', cls: 'bg-yonsei-gold/15 text-[#8a6d2f] dark:text-yonsei-gold' };
    case 'placeholder':
      return null;
  }
}

/** 전체 항목 평면 목록 (id → entry 역조회용) */
const ALL_ENTRIES: MenuEntry[] = MENU_GROUPS.flatMap((g) => g.entries);
function findEntry(id: string): MenuEntry | undefined {
  return ALL_ENTRIES.find((e) => entryId(e) === id);
}

/** 최근 편집 항목 localStorage 키 */
const RECENT_KEY = 'cms-recent-entries';

function readRecents(): MenuEntry[] {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    return ids.map(findEntry).filter((e): e is MenuEntry => !!e && isEditable(e));
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    const next = [id, ...ids.filter((x) => x !== id)].slice(0, 4);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* localStorage 불가 환경은 조용히 무시 */
  }
}

export function AdminConsole({ token, login }: Props) {
  // 저장소 설정은 세션 토큰으로 자동 구성한다(PAT 수동 입력 제거).
  const config = useMemo<RepoConfig>(
    () => ({ token, owner: 'halfjinhyeon', repo: 'yonsei-me', branch: 'main' }),
    [token],
  );

  // active: null이면 대시보드, 아니면 선택된 편집 항목
  const [active, setActive] = useState<MenuEntry | null>(null);
  // dirty: 현재 에디터에 저장되지 않은 편집이 있는지
  const [dirty, setDirty] = useState(false);

  // 이동 가드: 편집 중이면 확인 후 전환. 전환 시 dirty를 리셋한다.
  function navigate(next: MenuEntry | null) {
    if (dirty && !window.confirm('편집 중인 내용이 저장되지 않았습니다. 이동할까요?')) {
      return;
    }
    setDirty(false);
    setActive(next);
    if (next && isEditable(next)) pushRecent(entryId(next));
  }

  const activeId = active ? entryId(active) : null;

  return (
    <div>
      {/* 메타 바 — 계정·저장소 정보와 로그아웃 (제목은 Hero가 담당) */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-surface-border pb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {login && (
            <span className="inline-flex items-center gap-1.5 bg-surface-soft px-2.5 py-1 font-semibold text-content-soft">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {login}
            </span>
          )}
          <span className="tabular-nums text-content-faint">
            {config.owner}/{config.repo}
          </span>
          <span className="bg-surface-soft px-1.5 py-0.5 font-medium text-content-soft">{config.branch}</span>
        </div>
        <a href="/api/auth/signout" className="btn-secondary px-4 py-2 text-xs">
          로그아웃
        </a>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[240px_1fr] lg:gap-12">
        {/* 콘텐츠 선택 사이드바 */}
        {/* 사이드바 — 사이트 목차(TabbedContent) 톤: 카테고리별로 제목 + 세로
            그라디언트 막대 + 헤어라인 구분 리스트로 묶는다.
            데스크톱에선 상단 고정(sticky)하되, 목록이 화면보다 길 때 하위 카테고리가
            잘리지 않도록 사이드바 자체에 스크롤(max-h + overflow)을 준다. */}
        <nav
          aria-label="콘텐츠 선택"
          className="lg:sticky lg:top-24 lg:max-h-[calc(100vh_-_7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
        >
          {/* 대시보드 — 카테고리 밖 독립 항목 */}
          <button
            type="button"
            onClick={() => navigate(null)}
            aria-current={active === null ? 'page' : undefined}
            className={cn(
              'mb-6 flex w-full items-center justify-between gap-3 border-b border-surface-border pb-4 text-left text-sm transition-colors',
              active === null
                ? 'font-bold text-yonsei-navy'
                : 'font-semibold text-content-soft hover:text-yonsei-navy',
            )}
          >
            <span>대시보드</span>
            <span
              aria-hidden="true"
              className={cn('text-xs', active === null ? 'text-yonsei-blue' : 'text-content-faint')}
            >
              →
            </span>
          </button>

          {MENU_GROUPS.map((group) => (
            <div key={group.label} className="mb-7 last:mb-0">
              <p className="mb-3 text-sm font-bold text-content">{group.label}</p>
              <div className="relative pl-5">
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-[3px] rounded-full bg-gradient-to-b from-yonsei-navy via-yonsei-blue to-yonsei-gold"
                />
                <ul>
                  {group.entries.map((entry, i) => {
                    const id = entryId(entry);
                    const selected = id === activeId;
                    const editable = isEditable(entry);
                    return (
                      <li
                        key={id}
                        className="anim-nav-item border-b border-surface-border last:border-b-0"
                        style={{ animationDelay: `${i * 60}ms` }}
                      >
                        <button
                          type="button"
                          onClick={() => editable && navigate(entry)}
                          disabled={!editable}
                          aria-current={selected ? 'page' : undefined}
                          title={entry.type === 'placeholder' ? entry.note : undefined}
                          className={cn(
                            'group flex w-full items-center justify-between gap-3 py-3 text-left text-sm transition-colors',
                            selected
                              ? 'font-bold text-yonsei-navy'
                              : editable
                                ? 'font-medium text-content-soft hover:text-yonsei-navy'
                                : 'cursor-not-allowed font-medium text-content-faint',
                          )}
                        >
                          <span>{entryLabel(entry)}</span>
                          {editable ? (
                            <span
                              aria-hidden="true"
                              className={cn(
                                'text-xs transition-transform',
                                selected
                                  ? 'text-yonsei-blue'
                                  : 'text-content-faint group-hover:translate-x-0.5 group-hover:text-yonsei-blue',
                              )}
                            >
                              →
                            </span>
                          ) : (
                            <span className="bg-surface-soft px-1.5 py-0.5 text-[10px] text-content-faint">
                              준비 중
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </nav>

        {/* 메인 패널 */}
        <div className="min-w-0">
          {active === null ? (
            <Dashboard onOpen={navigate} />
          ) : active.type === 'board' ? (
            <BoardEditor
              key={activeId ?? undefined}
              config={config}
              boardKey={active.boardKey as BoardKey}
              onDirtyChange={setDirty}
            />
          ) : active.type === 'collection' ? (
            <CollectionEditor
              key={activeId ?? undefined}
              config={config}
              resource={getResource(active.resourceKey)}
              onDirtyChange={setDirty}
            />
          ) : active.type === 'markdown' ? (
            <MarkdownEditor
              key={activeId ?? undefined}
              config={config}
              page={getMarkdownPage(active.pageKey)}
              onDirtyChange={setDirty}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 대시보드 — 작업 공간 우선: 검색 + 최근 편집 + 편집 카드 그리드,
 *  온보딩·관리자 안내는 접이식으로 하단에. */
function Dashboard({ onOpen }: { onOpen: (entry: MenuEntry) => void }) {
  // 검색 필터 — 라벨·설명 부분일치로 그룹 안 항목을 걸러낸다.
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filteredGroups = MENU_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter(
      (e) =>
        !q ||
        entryLabel(e).toLowerCase().includes(q) ||
        entryDescription(e).toLowerCase().includes(q),
    ),
  })).filter((g) => g.entries.length > 0);

  // 최근 편집 — localStorage. SSR 불일치를 피하려 마운트 후 로드.
  const [recents, setRecents] = useState<MenuEntry[]>([]);
  useEffect(() => {
    setRecents(readRecents());
  }, []);

  return (
    <div className="space-y-12">
      {/* 헤더 + 검색 — 바로 작업을 시작하는 진입점 */}
      <section className="relative isolate overflow-hidden">
        {/* 장식용 독수리 워터마크 — eagle.png(흰 라인아트)를 마스크로 써서
            브랜드 그라디언트로 아주 옅게 틴트. 텍스트 뒤(-z-10)에 배치. */}
        <span
          aria-hidden="true"
          className="eagle-mask pointer-events-none absolute -right-16 -top-16 -z-10 h-64 w-64 bg-gradient-to-br from-yonsei-navy to-yonsei-blue opacity-[0.06] sm:-right-10 sm:h-80 sm:w-80"
        />
        <p className="eyebrow">콘텐츠 관리</p>
        <h2 className="mt-3 text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-[1.1] tracking-tight text-content">
          무엇을 수정할까요?
        </h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-content-soft sm:text-base">
          항목을 고르면 바로 편집할 수 있습니다. 저장하면 GitHub에 커밋되고 1~2분 내 사이트에
          자동 반영됩니다.
        </p>

        {/* 검색 — 반복 방문자의 최단 동선 */}
        <div className="relative mt-6 max-w-md">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-content-faint"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="편집할 항목 검색 (예: 세미나, 교수진, 장학금)"
            aria-label="편집할 항목 검색"
            className="w-full border border-surface-border bg-surface py-2.5 pl-10 pr-4 text-sm text-content outline-none transition-colors focus:border-yonsei-blue"
          />
        </div>

        {/* 최근 편집 — 이어서 작업 (검색 중에는 숨겨 목록에 집중) */}
        {recents.length > 0 && !q && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-content-faint">
              최근 편집
            </span>
            {recents.map((entry) => (
              <button
                key={entryId(entry)}
                type="button"
                onClick={() => onOpen(entry)}
                className="inline-flex items-center gap-1.5 border border-surface-border bg-surface-soft px-3 py-1.5 text-xs font-semibold text-content-soft transition-colors hover:border-yonsei-blue hover:text-yonsei-blue"
              >
                {entryLabel(entry)}
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 편집 카드 그리드 — 대시보드의 본체 */}
      {filteredGroups.length === 0 ? (
        <p className="border-t border-surface-border pt-8 text-sm text-content-faint">
          &lsquo;{query}&rsquo; 에 해당하는 항목이 없습니다. 다른 검색어를 시도해 보세요.
        </p>
      ) : (
        filteredGroups.map((group, gi) => (
          <Reveal key={group.label} delay={Math.min(gi, 3) * 80}>
            <section>
              <div className="mb-5 flex items-center justify-between border-b-2 border-yonsei-navy pb-2">
                <h3 className="text-lg font-bold text-content">{group.label}</h3>
                <span className="text-xs tabular-nums text-content-faint">{group.entries.length}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.entries.map((entry) => {
                  const editable = isEditable(entry);
                  const kind = entryKind(entry);
                  if (!editable) {
                    return (
                      <div
                        key={entryId(entry)}
                        className="flex h-full flex-col rounded-card border border-dashed border-surface-border bg-surface-soft/60 p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold text-content-soft">{entryLabel(entry)}</p>
                          <span className="shrink-0 bg-surface px-1.5 py-0.5 text-[10px] font-medium text-content-faint">
                            준비 중
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-content-faint">
                          {entryDescription(entry)}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={entryId(entry)}
                      type="button"
                      onClick={() => onOpen(entry)}
                      className="group flex h-full flex-col rounded-card border border-surface-border bg-surface p-5 text-left shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-1 hover:border-yonsei-blue/40 hover:shadow-card-hover"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-content transition-colors group-hover:text-yonsei-blue">
                          {entryLabel(entry)}
                        </p>
                        {kind && (
                          <span
                            className={cn(
                              'shrink-0 px-1.5 py-0.5 text-[10px] font-bold tracking-wide',
                              kind.cls,
                            )}
                          >
                            {kind.label}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-content-soft">
                        {entryDescription(entry)}
                      </p>
                      <span
                        aria-hidden="true"
                        className="mt-auto pt-3 text-xs font-semibold text-content-faint transition-colors group-hover:text-yonsei-blue"
                      >
                        편집하기 →
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </Reveal>
        ))
      )}

      {/* 참고 안내 — 접이식. 처음 한 번만 필요한 내용이라 작업 공간을 가리지 않는다. */}
      <section className="space-y-0 border-t border-surface-border">
        <details className="group border-b border-surface-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-5 text-base font-bold text-content transition-colors hover:text-yonsei-blue [&::-webkit-details-marker]:hidden">
            <span>
              처음이신가요? <span className="font-medium text-content-soft">— 사용 방법 4단계</span>
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
          <ol className="grid gap-8 pb-8 pt-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: '콘텐츠 선택', b: '왼쪽 메뉴나 위 카드에서 편집할 항목(게시판·연혁·교수진·교과목 등)을 고릅니다.' },
              { t: '내용 편집', b: '한국어와 English를 입력합니다. “한→영 번역” 버튼으로 영문 초안을 채우고, 사진은 파일을 올리면 됩니다.' },
              { t: '저장 = 커밋', b: '“저장” 버튼을 누르면 변경 내용이 GitHub 저장소에 바로 커밋됩니다.' },
              { t: '자동 반영', b: 'Vercel이 1~2분 내 사이트에 자동 배포해 실제 페이지에 나타납니다.' },
            ].map((step, i) => (
              <li key={i} className="border-t border-surface-border pt-4">
                <span className="block text-3xl font-light tabular-nums text-yonsei-blue/40">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h4 className="mt-3 text-base font-bold text-content">{step.t}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-content-soft">{step.b}</p>
              </li>
            ))}
          </ol>
        </details>

        <details className="group border-b border-surface-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-5 text-base font-bold text-content transition-colors hover:text-yonsei-blue [&::-webkit-details-marker]:hidden">
            <span>
              새 관리자 등록 <span className="font-medium text-content-soft">— GitHub 계정 허용 절차</span>
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
          <div className="pb-8 pt-2">
            <p className="max-w-prose text-sm leading-relaxed text-content-soft">
              이 콘솔은 GitHub 로그인으로 접근합니다. 새 담당자를 추가하려면 아래 세 가지가
              필요합니다 (Vercel·GitHub 설정 권한이 있는 사람이 진행하세요).
            </p>
            <ol className="mt-8 grid gap-8 md:grid-cols-3">
              {[
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
              ].map((step, i) => (
                <li key={i} className="border-t border-surface-border pt-4">
                  <span className="block text-3xl font-light tabular-nums text-yonsei-blue/40">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h4 className="mt-3 text-base font-bold text-content">{step.t}</h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-content-soft">{step.b}</p>
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-prose text-xs leading-relaxed text-content-faint">
              계정명은 이메일·실명이 아니라 GitHub username 입니다. 관리자를 제거하려면
              ALLOWED_GITHUB_LOGINS 에서 계정명을 지우고 다시 배포하세요. (저장소 소유자 계정은
              코드에 항상 허용되어 있습니다.)
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
