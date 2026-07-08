'use client';

// 전체 콘텐츠 관리 콘솔 셸 (단일 페이지 앱).
// 정적 사이트라 서버 DB가 없어 GitHub Contents API로 content/* 파일을 직접
// 커밋한다("Git이 곧 DB"). 이 셸은 사이드바(메뉴 그룹)와 대시보드만 담당하고,
// 실제 편집은 항목 종류별 에디터(BoardEditor / CollectionEditor / MarkdownEditor)에
// 위임한다.
//
// 디자인은 사이트 본편과 통일한다: Hero(page.tsx)로 진입 헤더를 두고, 사이드바는
// TabbedContent 목차 톤(스태거 진입·화살표 호버), 대시보드 카드는 사이트 공통
// 시그니처 카드(hover:-translate-y-1 + shadow-card-hover)와 Reveal 스크롤 진입을 쓴다.
//
// 콘텐츠/코드 분리 원칙은 "사이트 콘텐츠"(content/*)에 적용된다.
// 이 관리자 도구는 내부 운영용이라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useMemo, useState } from 'react';
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
  }

  const activeId = active ? entryId(active) : null;

  return (
    <div>
      {/* 메타 바 — 저장소·계정 정보와 로그아웃 (제목은 Hero가 담당) */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-surface-border pb-4">
        <p className="text-xs text-content-faint">
          {login && <span className="font-semibold text-content-soft">{login}님으로 로그인됨</span>}
          {login && ' · '}
          <span className="tabular-nums">
            {config.owner}/{config.repo}
          </span>{' '}
          · <span className="rounded bg-surface-soft px-1.5 py-0.5 font-medium text-content-soft">{config.branch}</span>
        </p>
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
                            <span className="rounded bg-surface-soft px-1.5 py-0.5 text-[10px] text-content-faint">
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

/** 대시보드 — 안내 콜아웃 + 그룹별 편집 항목 카드 그리드 */
function Dashboard({ onOpen }: { onOpen: (entry: MenuEntry) => void }) {
  return (
    <div className="space-y-12">
      {/* 안내 콜아웃 — 브랜드 그라디언트 액센트 바 */}
      <Reveal>
        <div className="relative overflow-hidden rounded-card border border-surface-border bg-surface-soft p-6 shadow-card sm:p-7">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-yonsei-navy via-yonsei-blue to-yonsei-gold"
          />
          <p className="eyebrow">시작하기</p>
          <h2 className="mt-2 text-headline font-bold text-content">무엇을 수정할까요?</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-content-soft sm:text-base">
            이곳에서 저장하면 GitHub 저장소에 바로 커밋되고, Vercel이 1~2분 내 사이트에 자동
            반영합니다. 왼쪽 메뉴 또는 아래 카드에서 편집할 콘텐츠를 선택하세요.
          </p>
        </div>
      </Reveal>

      {MENU_GROUPS.map((group, gi) => (
        <Reveal key={group.label} delay={Math.min(gi, 3) * 80}>
          <section>
            <div className="mb-5 flex items-center justify-between border-b-2 border-yonsei-navy pb-2">
              <h3 className="text-lg font-bold text-content">{group.label}</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.entries.map((entry) => {
                const editable = isEditable(entry);
                if (!editable) {
                  return (
                    <div
                      key={entryId(entry)}
                      className="flex h-full flex-col rounded-card border border-dashed border-surface-border bg-surface-soft/60 p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-content-soft">{entryLabel(entry)}</p>
                        <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-content-faint">
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
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-content-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-yonsei-blue"
                      >
                        →
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-content-soft">
                      {entryDescription(entry)}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        </Reveal>
      ))}
    </div>
  );
}
