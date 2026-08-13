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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { type BoardKey } from '@/lib/admin/boards';
import { type RepoConfig } from '@/lib/admin/content-api';
import { getMarkdownPage, getResource, MENU_GROUPS, type MenuEntry } from '@/lib/admin/resources';
import { AdminDashboard } from './AdminDashboard';
import {
  AdminShellProvider,
  AdminToast,
  type AdminShellValue,
  type DeployState,
} from './AdminShellContext';
import { BoardEditor } from './BoardEditor';
import { ChangeTray } from './ChangeTray';
import { ChangeTrayProvider, useChangeTray } from './ChangeTrayContext';
import { CmsBanner, type CmsBannerData } from './CmsBanner';
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

// 트레이 컨텍스트를 셸 자신도 읽어야 해서(이동 가드가 대기 변경을 봐야 한다)
// Provider 와 본문을 한 겹 나눈다 — Provider 를 렌더하는 컴포넌트는 그 컨텍스트를
// 구독할 수 없기 때문이다.
export function AdminConsole(props: Props) {
  return (
    <ChangeTrayProvider>
      <AdminConsoleBody {...props} />
    </ChangeTrayProvider>
  );
}

function AdminConsoleBody({ token, login }: Props) {
  // 저장소 설정은 세션 토큰으로 자동 구성한다(PAT 수동 입력 제거).
  const config = useMemo<RepoConfig>(
    () => ({ token, owner: 'yonsei-mech', repo: 'yonsei-me', branch: 'main' }),
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

  // 셸 컨텍스트 — 배포 상태 칩과 토스트. 값을 바꾸는 쪽은 변경 트레이다.
  const [deploy, setDeploy] = useState<DeployState>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => setToast(msg), []);
  const dismissToast = useCallback(() => setToast(null), []);

  // 집중 모드 — 글쓰기 화면(PostForm)이 마운트되는 동안만 참. 켜지면 사이드바와
  // 콘솔 상단 바를 내려 본문을 전체화면 단일 컬럼으로 비운다. 값을 올리고 내리는
  // 쪽은 폼 자신이라 여기서는 상태만 들고 있는다.
  const [focusMode, setFocusMode] = useState(false);

  // ---- 운영 상태: 오프라인 / 쓰기 권한 없음 / 임시 배너 ----
  // 셋 다 "지금 보고 있는 화면과 무관하게 참인 조건"이라 셸이 들고 상단 한 자리에서
  // 말한다. 에디터마다 따로 감지하면 화면을 옮길 때마다 상태가 초기화된다.

  // ⚠️ navigator.onLine 은 서버에 없다. 초기값을 그걸로 두면 SSR 이 터지거나
  // 하이드레이션이 어긋나므로 항상 true 로 시작하고 마운트 뒤에 실제 값을 읽는다.
  const [online, setOnline] = useState(true);
  // 저장소 쓰기 권한 없음(403) — 커밋을 실제로 시도한 에디터가 실패 응답을 보고 켠다.
  const [writeDenied, setWriteDenied] = useState(false);
  // 화면 쪽이 올려보내는 임시 배너 (오프라인·권한 배너는 아래에서 셸이 직접 만든다)
  const [banner, setBanner] = useState<CmsBannerData | null>(null);
  // 대시보드에서 자동으로 펼쳐 둘 안내 제목 — 권한 배너의 "권한 안내 보기"가 쓴다.
  // 안내로 보내 놓고 사용자가 그 긴 목록에서 항목을 다시 찾게 두면 안내가 무의미하다.
  const [openGuide, setOpenGuide] = useState<string | undefined>(undefined);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // 연결 복구 알림 — 끊긴 동안 저장을 포기하고 기다리던 사용자에게 "이제 된다"를
  // 말해 준다. 첫 마운트에서는 뜨면 안 되므로 "이전에 끊겼던 적이 있는지"를 ref 로
  // 기억한다. (오프라인으로 마운트한 경우에도 online 초기값이 true 라 첫 패스에는
  // 토스트가 뜨지 않고, 실제 값이 반영된 다음 패스에서 비로소 ref 가 선다.)
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    showToast('인터넷 연결이 돌아왔습니다 — 이제 저장할 수 있습니다.');
  }, [online, showToast]);

  // 저장 잠금 사유 — 트레이가 이 문자열을 그대로 사용자에게 보여준다.
  // 우선순위는 배너와 같다(연결이 없으면 권한 여부는 확인조차 할 수 없다).
  const saveBlock = !online
    ? '인터넷 연결이 끊겨 저장할 수 없습니다.'
    : writeDenied
      ? '이 계정은 저장소에 쓸 권한이 없습니다.'
      : null;

  // 트레이의 대기 변경도 "저장 안 된 편집"이다 — 에디터가 onDirtyChange 를 주지
  // 않더라도 트레이에 쌓인 게 있으면 그냥 넘어가면 안 된다.
  const { source: traySource, saving: traySaving, clearTray } = useChangeTray();
  const pendingCount = traySource?.changes.length ?? 0;

  // 커밋이 도는 동안 배포 중 칩을 띄웠다가 스스로 내린다. Vercel 빌드가 대략
  // 1~2분이라 90초를 근사치로 잡았다(성공 여부를 폴링할 경로가 없다).
  // 타이머를 셸에 두는 이유: 저장이 끝나면 트레이가 곧바로 언마운트돼 트레이 안에
  // 타이머를 두면 즉시 정리돼 버린다.
  useEffect(() => {
    if (deploy !== 'deploying') return;
    const t = window.setTimeout(() => setDeploy('idle'), 90_000);
    return () => window.clearTimeout(t);
  }, [deploy]);

  const go = useCallback(
    (next: MenuEntry | null) => {
      setDirty(false);
      clearTray();
      setActive(next);
      setNavOpen(false);
      // 대시보드를 떠나면 "자동으로 펼쳐 둘 안내"는 소임을 다한 것이라 지운다.
      // 목적지가 대시보드(null)일 때는 지우지 않는다 — 그 이동이 바로 안내를
      // 펼치러 가는 길이기 때문이다.
      if (next !== null) setOpenGuide(undefined);
      if (next && isEditable(next)) pushRecent(entryId(next));
    },
    [clearTray],
  );

  // 이동 가드: 편집 중이거나 트레이에 대기 변경이 있으면 모달로 확인한 뒤 전환한다.
  const navigate = useCallback(
    (next: MenuEntry | null) => {
      // 커밋 도중 에디터가 언마운트되면 결과를 알 수 없다 — 저장 중에는 붙잡는다.
      if (traySaving) {
        showToast('저장 중입니다. 잠시 후 이동해 주세요.');
        return;
      }
      if (dirty || pendingCount > 0) {
        setPending({ next });
        return;
      }
      go(next);
    },
    [dirty, pendingCount, traySaving, showToast, go],
  );

  // 지금 띄울 배너 하나 — 오프라인 > 권한 없음 > 화면이 올려보낸 배너 순.
  // 여러 개를 쌓지 않는 이유: 배너가 두 줄 세 줄로 늘면 본문을 그만큼 밀어내
  // "잠깐 뜬 알림"이 아니라 레이아웃 변화가 되고, 정작 가장 급한 조건이 묻힌다.
  const activeBanner = useMemo<CmsBannerData | null>(() => {
    if (!online) {
      return {
        id: 'offline',
        tone: 'danger',
        title: '인터넷 연결이 끊겼습니다',
        body: '저장은 연결이 돌아온 뒤에 됩니다.',
        // 연결 상태는 스스로 사라지는 조건이라 닫기를 주지 않는다. 닫아 놓고
        // 저장이 왜 안 되는지 모르게 되는 편이 더 나쁘다.
        dismissible: false,
      };
    }
    if (writeDenied) {
      return {
        id: 'forbidden',
        tone: 'danger',
        title: '이 계정은 저장소에 쓸 권한이 없습니다',
        body: '관리자에게 Write 권한을 요청하세요.',
        dismissible: true,
        action: {
          label: '권한 안내 보기',
          onClick: () => {
            // 안내 항목을 먼저 지정하고 대시보드로 보낸다. 순서가 반대면 이동
            // 가드가 확인 모달을 띄우는 경우 지정이 뒤늦게 씻겨 나간다.
            setOpenGuide('새 관리자 등록');
            navigate(null);
          },
        },
      };
    }
    return banner;
  }, [online, writeDenied, banner, navigate]);

  // 닫기 — 배너를 지우는 게 아니라 그 배너를 띄운 상태를 끈다(오프라인은 닫을 수 없다)
  const dismissBanner = useCallback(() => {
    if (writeDenied) {
      setWriteDenied(false);
      return;
    }
    setBanner(null);
  }, [writeDenied]);

  // 셸 컨텍스트 — 배포 상태 칩·토스트·집중 모드, 화면 안 이동(openEntry),
  // 그리고 운영 상태(온라인·권한·배너·저장 잠금).
  // navigate 를 참조하므로 그 선언 뒤에 둔다(이동 가드를 그대로 물려받기 위함).
  const shell = useMemo<AdminShellValue>(
    () => ({
      config, login, deploy, setDeploy, toast, showToast, dismissToast,
      focusMode, setFocusMode, openEntry: navigate,
      online, writeDenied, setWriteDenied, banner, setBanner, saveBlock,
    }),
    [
      config, login, deploy, toast, showToast, dismissToast, focusMode, navigate,
      online, writeDenied, banner, saveBlock,
    ],
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
        {/* 콘솔 상단 바 — 집중 모드(글쓰기)에서는 폼 자신의 고정 바가 그 자리를
            대신하므로 렌더하지 않는다. 사이트 헤더·히어로·푸터는 그대로 둔다. */}
        {!focusMode && (
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
        )}

        {/* 운영 상태 배너 — 상단 바 바로 아래 한 자리에 sticky 로 붙는다.
            집중 모드(글쓰기)에서도 렌더한다: 긴 글을 쓰는 동안 연결이 끊긴 걸
            모르고 있다가 저장에서 처음 알게 되는 상황이 가장 나쁘다. 다만 그때는
            콘솔 상단 바가 없으므로 --cms-bar 만큼 기준선을 올린다.
            z-[31] 은 사이드바(sticky)보다 위, 드로어 오버레이(z-30/40)와 겹치지 않는 값. */}
        {activeBanner && (
          <div
            className={cn(
              'sticky z-[31]',
              focusMode
                ? 'top-16 lg:top-20'
                : 'top-[calc(4rem+var(--cms-bar))] lg:top-[calc(5rem+var(--cms-bar))]',
            )}
          >
            <CmsBanner banner={activeBanner} onDismiss={dismissBanner} />
          </div>
        )}

        <div className={cn(!focusMode && 'grid lg:grid-cols-[248px_minmax(0,1fr)]')}>
          {/* 데스크톱 사이드바 — 헤더+상단 바 아래에 붙어 화면 끝까지 자체 스크롤.
              data-lenis-prevent 가 없으면 전역 Lenis 부드러운 스크롤이 휠 이벤트를
              가로채 사이드바 안쪽이 스크롤되지 않는다(항목이 화면보다 길다). */}
          {!focusMode && (
          <nav
            aria-label="콘텐츠 선택"
            data-lenis-prevent
            className="sticky top-[calc(4rem+var(--cms-bar))] hidden h-[calc(100dvh-4rem-var(--cms-bar))] overflow-y-auto overscroll-contain border-r border-surface-border px-3.5 py-5 pb-12 lg:top-[calc(5rem+var(--cms-bar))] lg:block lg:h-[calc(100dvh-5rem-var(--cms-bar))]"
          >
            <SidebarBody activeId={activeId} onNavigate={navigate} isDashboard={active === null} />
          </nav>
          )}

          {/* 모바일 드로어 — 같은 목록을 상단 바 아래에서 덮어 띄운다 */}
          {navOpen && !focusMode && (
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
              아래 pb-36 은 하단 고정 변경 트레이가 덮는 자리다 — 이걸 줄이면
              대기 변경이 있을 때 목록 마지막 항목이 트레이에 가린다.
              집중 모드에서는 트레이가 뜨지 않고 폼이 자기 여백을 직접 잡으므로
              래퍼의 여백을 모두 걷어 전체화면 단일 컬럼으로 둔다. */}
          <div className={cn('min-w-0', !focusMode && 'px-6 py-8 pb-36 lg:px-10')}>
            {active === null ? (
              <AdminDashboard config={config} onOpen={navigate} openGuide={openGuide} />
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
        <ChangeTray />

        {pending && (
          <CmsModal
            title="편집 중인 내용이 저장되지 않았습니다"
            body={
              pendingCount > 0
                ? `지금 이동하면 저장하지 않은 변경 ${pendingCount}건이 사라집니다. 그래도 이동할까요?`
                : '지금 이동하면 저장하지 않은 변경은 사라집니다. 그래도 이동할까요?'
            }
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
 *  값을 'deploying' 으로 올리는 쪽은 변경 트레이, 90초 뒤 내리는 쪽은 셸이다. */
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
          {/* 장식용 그룹 그라디언트 막대는 뒀다가 뺐다. 선택 항목을 알리는 막대와 둘 다
              왼쪽 끝 세로선이라 겹쳐 보였고, 겹치는 순간 "지금 어디에 있는지"라는 정보가
              장식에 묻힌다. 정보 쪽을 남기고 장식을 지운다. */}
          <ul>
            {group.entries.map((entry) => {
              const id = entryId(entry);
              const selected = id === activeId;
              const editable = isEditable(entry);
              const kind = entryKind(entry);
              return (
                <li key={id} className="border-b border-surface-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => editable && onNavigate(entry)}
                    disabled={!editable}
                    aria-current={selected ? 'page' : undefined}
                    title={entry.type === 'placeholder' ? entry.note : undefined}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-2.5 py-2.5 text-left text-[13px] transition-colors',
                      // 선택은 2px 막대 대신 네이비 면으로 — 목록 옆 얇은 선은 스크롤 중에
                      // 놓치기 쉽다. 각진 채움은 콘솔의 필터 칩(FilterChip) 활성 상태와
                      // 같은 문법이라 화면끼리 어휘가 어긋나지 않는다.
                      selected
                        ? 'bg-yonsei-navy font-bold text-white'
                        : editable
                          ? 'font-medium text-content hover:bg-surface-soft hover:text-yonsei-blue'
                          : 'cursor-not-allowed font-medium text-content-faint',
                    )}
                  >
                    <span className="min-w-0 truncate">{entryLabel(entry)}</span>
                    {kind && (
                      <span
                        className={cn(
                          'cms-badge shrink-0',
                          // 네이비 면 위에서는 원래 배지 색이 묻힌다 — 반투명 흰색으로 뒤집는다
                          selected ? 'bg-white/20 text-white' : kind.cls,
                        )}
                      >
                        {kind.label}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
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
