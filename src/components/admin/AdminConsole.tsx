'use client';

// 전체 콘텐츠 관리 콘솔 셸 (단일 페이지 앱).
// 정적 사이트라 서버 DB가 없어 GitHub Contents API로 content/* 파일을 직접
// 커밋한다("Git이 곧 DB"). 이 셸은 상단 바 + 사이드바 + 라우팅만 담당하고,
// 대시보드는 AdminDashboard, 실제 편집은 항목 종류별 에디터
// (BoardEditor / CollectionEditor / MarkdownEditor)에 위임한다.
//
// 콘솔은 사이트에서 떨어져 나온 별도 앱이 아니라 "관리자용 세부 페이지"다.
// 그래서 사이트 히어로·헤더·푸터를 그대로 두고(page.tsx), 그 아래에 자체 상단
// 바(--cms-bar)와 좌측 사이드바를 얹는다. 편집 화면에서 목록과 메뉴가 동시에
// 보여야 "보면서 그 자리에서 고친다"가 성립하기 때문이다.
//
// ⚠️ 사이트 헤더가 fixed inset-x-0 top-0 (h-16 / lg:h-20) 이라 콘솔의 sticky
// 요소는 전부 "헤더 높이 + --cms-bar" 만큼 아래를 기준선으로 삼는다. 이 오프셋이
// 어긋나면 상단 바가 헤더 뒤로 숨거나 사이드바가 화면 밖으로 밀린다.
//
// 콘텐츠/코드 분리 원칙은 "사이트 콘텐츠"(content/*)에 적용된다.
// 이 관리자 도구는 내부 운영용이라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { type BoardKey } from '@/lib/admin/boards';
import { type RepoConfig } from '@/lib/admin/github';
import { getMarkdownPage, getResource, MENU_GROUPS, type MenuEntry } from '@/lib/admin/resources';
import { AdminDashboard } from './AdminDashboard';
import {
  AdminShellProvider,
  AdminToast,
  type AdminShellValue,
  type DeployState,
} from './AdminShellContext';
import { BoardEditor } from './BoardEditor';
import { CmsModal } from './CmsModal';
import { CollectionEditor } from './CollectionEditor';
import { entryId, entryKind, entryLabel, isEditable, pushRecent } from './entries';
import { MarkdownEditor } from './MarkdownEditor';

interface Props {
  /** GitHub OAuth access token (세션에서 주입) — Contents API 커밋에 사용 */
  token: string;
  /** 로그인한 GitHub 계정명 */
  login: string;
}

const SITE_URL = 'https://yonsei-me.vercel.app/ko';

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
  // 미저장 상태에서 이동을 시도한 목적지. 확인 모달의 대상이 된다.
  // (목적지가 null=대시보드일 수 있어 "값 없음"과 구분하려 한 겹 감쌌다)
  const [pending, setPending] = useState<{ next: MenuEntry | null } | null>(null);
  // lg 미만에서 사이드바를 드로어로 연다
  const [navOpen, setNavOpen] = useState(false);

  // 셸 컨텍스트 — 배포 상태 칩과 토스트. 실제로 값을 바꾸는 쪽(변경 트레이)은
  // 2단계에서 붙는다. 지금은 자리와 표시만 확정해 둔다.
  const [deploy, setDeploy] = useState<DeployState>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => setToast(msg), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const shell = useMemo<AdminShellValue>(
    () => ({ config, login, deploy, setDeploy, toast, showToast, dismissToast }),
    [config, login, deploy, toast, showToast, dismissToast],
  );

  const go = useCallback((next: MenuEntry | null) => {
    setDirty(false);
    setActive(next);
    setNavOpen(false);
    if (next && isEditable(next)) pushRecent(entryId(next));
  }, []);

  // 이동 가드: 편집 중이면 모달로 확인한 뒤 전환한다.
  const navigate = useCallback(
    (next: MenuEntry | null) => {
      if (dirty) {
        setPending({ next });
        return;
      }
      go(next);
    },
    [dirty, go],
  );

  // 드로어는 Esc 로도 닫는다(모달과 같은 규칙 — 열린 오버레이는 Esc 로 나간다)
  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setNavOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  const activeId = active ? entryId(active) : null;

  return (
    <AdminShellProvider value={shell}>
      <div className="bg-surface text-content">
        <header className="sticky top-16 z-30 flex h-[var(--cms-bar)] items-center justify-between gap-4 border-y border-surface-border bg-surface px-6 lg:top-20 lg:px-10">
          <div className="flex min-w-0 items-center gap-3.5">
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-expanded={navOpen}
              aria-label="콘텐츠 메뉴 열기"
              className="cms-btn cms-btn-sm shrink-0 px-2 lg:hidden"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </button>
            <span className="shrink-0 text-[15px] font-extrabold tracking-tight text-yonsei-navy">
              기계공학부 콘텐츠 관리
            </span>
            <span className="hidden items-center gap-1.5 text-[11px] tabular-nums text-content-faint sm:flex">
              <span>
                {config.owner}/{config.repo}
              </span>
              <span className="bg-surface-soft px-1.5 py-0.5 font-semibold text-content">
                {config.branch}
              </span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <DeployChip state={deploy} />
            {login && (
              <span className="hidden items-center gap-1.5 bg-surface-soft px-2.5 py-1.5 text-[11px] font-semibold text-content-faint sm:flex">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {login}
              </span>
            )}
            <a href="/api/auth/signout" className="cms-btn cms-btn-sm">
              로그아웃
            </a>
          </div>
        </header>

        <div className="grid lg:grid-cols-[248px_minmax(0,1fr)]">
          {/* 데스크톱 사이드바 — 헤더+상단 바 아래에 붙어 화면 끝까지 자체 스크롤.
              data-lenis-prevent 가 없으면 전역 Lenis 부드러운 스크롤이 휠 이벤트를
              가로채 사이드바 안쪽이 스크롤되지 않는다(항목이 화면보다 길다). */}
          <nav
            aria-label="콘텐츠 선택"
            data-lenis-prevent
            className="sticky top-[calc(4rem+var(--cms-bar))] hidden h-[calc(100dvh-4rem-var(--cms-bar))] overflow-y-auto overscroll-contain border-r border-surface-border px-3.5 py-5 pb-12 lg:top-[calc(5rem+var(--cms-bar))] lg:block lg:h-[calc(100dvh-5rem-var(--cms-bar))]"
          >
            <SidebarBody activeId={activeId} onNavigate={navigate} isDashboard={active === null} />
          </nav>

          {/* 모바일 드로어 — 같은 목록을 상단 바 아래에서 덮어 띄운다 */}
          {navOpen && (
            <>
              <button
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => setNavOpen(false)}
                className="fixed inset-0 z-30 bg-black/30 lg:hidden"
              />
              <nav
                aria-label="콘텐츠 선택"
                data-lenis-prevent
                className="fixed bottom-0 left-0 top-[calc(4rem+var(--cms-bar))] z-40 w-[280px] overflow-y-auto overscroll-contain border-r border-surface-border bg-surface px-3.5 py-5 pb-12 lg:hidden"
              >
                <SidebarBody activeId={activeId} onNavigate={navigate} isDashboard={active === null} />
              </nav>
            </>
          )}

          {/* 레이아웃이 이미 <main id="main"> 을 두고 있어 여기서는 div 로 둔다
              (main 중첩은 스크린리더의 랜드마크 탐색을 망가뜨린다).
              아래 pb-36 은 2단계 변경 트레이가 덮을 자리를 미리 비워 둔 것이다. */}
          <div className="min-w-0 px-6 py-8 pb-36 lg:px-10">
            {active === null ? (
              <AdminDashboard config={config} onOpen={navigate} />
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

        <AdminToast />

        {pending && (
          <CmsModal
            title="편집 중인 내용이 저장되지 않았습니다"
            body="지금 이동하면 저장하지 않은 변경은 사라집니다. 그래도 이동할까요?"
            confirmLabel="이동"
            cancelLabel="여기 머무르기"
            tone="danger"
            onConfirm={() => {
              const next = pending.next;
              setPending(null);
              go(next);
            }}
            onCancel={() => setPending(null)}
          />
        )}
      </div>
    </AdminShellProvider>
  );
}

/** 배포 상태 칩 — 저장(커밋) 후 Vercel 재배포가 도는 동안을 알린다.
 *  값을 'deploying' 으로 바꾸는 쪽은 2단계의 변경 트레이다. */
function DeployChip({ state }: { state: DeployState }) {
  const deploying = state === 'deploying';
  return (
    <span className="flex items-center gap-1.5 border border-surface-border px-2.5 py-1.5 text-[11px] font-semibold text-content">
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          deploying ? 'animate-pulse bg-yonsei-blue' : 'bg-[#c3cbd6]',
        )}
      />
      <span className={cn(!deploying && 'hidden sm:inline')}>
        {deploying ? '배포 중 · 1~2분' : '배포 대기 없음'}
      </span>
    </span>
  );
}

/** 사이드바 본문 — 데스크톱 고정 열과 모바일 드로어가 같은 내용을 쓴다 */
function SidebarBody({
  activeId,
  isDashboard,
  onNavigate,
}: {
  activeId: string | null;
  isDashboard: boolean;
  onNavigate: (entry: MenuEntry | null) => void;
}) {
  return (
    <>
      {/* 대시보드 — 카테고리 밖 독립 항목 */}
      <button
        type="button"
        onClick={() => onNavigate(null)}
        aria-current={isDashboard ? 'page' : undefined}
        className={cn(
          'mb-[18px] flex w-full items-center justify-between gap-3 border-b border-surface-border px-1.5 pb-3.5 text-left text-sm transition-colors',
          isDashboard ? 'font-bold text-yonsei-navy' : 'font-semibold text-content hover:text-yonsei-navy',
        )}
      >
        <span>대시보드</span>
        <span aria-hidden="true" className="text-xs text-yonsei-blue">
          →
        </span>
      </button>

      {MENU_GROUPS.map((group) => (
        <div key={group.label} className="mb-6">
          <p className="mb-2.5 text-[13px] font-extrabold text-content">{group.label}</p>
          <div className="relative pl-[18px]">
            {/* 그룹 막대 — 사이트 목차(TabbedContent)와 같은 문법.
                꼬리 색은 금색 금지 규칙에 따라 sky 로 둔다. */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-yonsei-navy via-yonsei-blue to-[#2E86D6]"
            />
            <ul>
              {group.entries.map((entry) => {
                const id = entryId(entry);
                const selected = id === activeId;
                const editable = isEditable(entry);
                const kind = entryKind(entry);
                return (
                  <li key={id} className="relative border-b border-surface-border last:border-b-0">
                    {selected && (
                      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-yonsei-navy" />
                    )}
                    <button
                      type="button"
                      onClick={() => editable && onNavigate(entry)}
                      disabled={!editable}
                      aria-current={selected ? 'page' : undefined}
                      title={entry.type === 'placeholder' ? entry.note : undefined}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 py-2.5 pl-2 pr-1 text-left text-[13px] transition-colors',
                        selected
                          ? 'font-bold text-yonsei-navy'
                          : editable
                            ? 'font-medium text-content hover:text-yonsei-blue'
                            : 'cursor-not-allowed font-medium text-content-faint',
                      )}
                    >
                      <span className="min-w-0 truncate">{entryLabel(entry)}</span>
                      {kind && <span className={cn('cms-badge shrink-0', kind.cls)}>{kind.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ))}

      <a
        href={SITE_URL}
        target="_blank"
        rel="noreferrer"
        className="block border-t border-surface-border px-1.5 pt-3 text-[11px] font-bold text-content-faint transition-colors hover:text-yonsei-blue"
      >
        사이트 열기 ↗
      </a>
    </>
  );
}
