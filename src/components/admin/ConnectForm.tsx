'use client';

// 관리자 연결 설정 화면. GitHub 토큰/저장소를 입력받아 검증하고,
// 성공 시 상위로 RepoConfig를 넘긴다. 토큰은 sessionStorage에만 저장된다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useState } from 'react';
import { verifyConnection, type RepoConfig } from '@/lib/admin/github';

interface Props {
  initial: RepoConfig;
  onConnected: (cfg: RepoConfig) => void;
}

export function ConnectForm({ initial, onConnected }: Props) {
  const [token, setToken] = useState(initial.token);
  const [owner, setOwner] = useState(initial.owner || 'halfjinhyeon');
  const [repo, setRepo] = useState(initial.repo || 'yonsei-me');
  const [branch, setBranch] = useState(initial.branch || 'main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (token.trim() === '') {
      setError('토큰을 입력하세요.');
      return;
    }
    const cfg: RepoConfig = {
      token: token.trim(),
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || 'main',
    };
    setBusy(true);
    try {
      await verifyConnection(cfg);
      onConnected(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-card border border-surface-border bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-bold text-content">게시판 관리자 콘솔</h1>
        <p className="mt-2 text-sm leading-relaxed text-content-soft">
          이 도구는 GitHub에 직접 커밋해 게시판 콘텐츠를 관리합니다. 커밋 후 Vercel이 자동으로 재배포합니다.
        </p>

        <form onSubmit={handleConnect} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="ym-token" className="block text-sm font-semibold text-content">
              GitHub Personal Access Token
            </label>
            <input
              id="ym-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_..."
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
            />
            <p className="mt-1 text-xs leading-relaxed text-content-faint">
              토큰은 이 탭의 sessionStorage에만 저장되며, 탭을 닫으면 사라집니다. 저장소에는 어떤 형태로도 저장되지 않습니다.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="ym-owner" className="block text-sm font-semibold text-content">
                Owner
              </label>
              <input
                id="ym-owner"
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
              />
            </div>
            <div>
              <label htmlFor="ym-repo" className="block text-sm font-semibold text-content">
                Repo
              </label>
              <input
                id="ym-repo"
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
              />
            </div>
            <div>
              <label htmlFor="ym-branch" className="block text-sm font-semibold text-content">
                Branch
              </label>
              <input
                id="ym-branch"
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy ? '연결 확인 중…' : '연결'}
          </button>
        </form>

        <details className="mt-6 text-sm text-content-soft">
          <summary className="cursor-pointer font-semibold text-content">토큰 발급 방법</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-content-faint">
            <li>github.com/settings/personal-access-tokens 접속</li>
            <li>Fine-grained token 생성, 대상은 이 저장소만 선택</li>
            <li>Repository permissions → Contents: Read and write 부여</li>
            <li>발급된 토큰을 위 입력란에 붙여넣기</li>
          </ol>
        </details>
      </div>
    </div>
  );
}
