'use client';

// 사용자·권한 화면 — CMS에 들어올 수 있는 사람의 명단이자 그 자체가 접근 제어다.
//
// 다른 편집 화면과 달리 변경 트레이(모아서 커밋)를 쓰지 않고 즉시 저장한다.
// 권한 회수는 "나중에 저장 버튼을 누르면 적용" 되어서는 안 되는 종류의 일이라,
// 켜고 끄는 즉시 서버에 반영하고 실패하면 되돌린다.
//
// 내부 운영 도구라 한국어 UI 문자열을 컴포넌트에 직접 둔다.

import { useCallback, useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { CmsModal } from './CmsModal';

type Role = 'admin' | 'editor';

interface CmsUser {
  id: string;
  name: string;
  role: Role;
  email?: string | null;
  githubLogin?: string | null;
  kakaoLinked: boolean;
  createdAt?: string;
}

const ROLE_LABEL: Record<Role, string> = { admin: '관리자', editor: '편집자' };

export function UsersEditor() {
  const [users, setUsers] = useState<CmsUser[]>([]);
  const [loading, setLoading] = useState(true);
  // 상단 오류 배너 — 목록 조회 실패와 저장 거절(마지막 관리자 보호 등)이 같은 자리에서 말한다
  const [error, setError] = useState<string | null>(null);
  // 행 단위 잠금 — 응답을 기다리는 동안 같은 행을 또 건드리지 못하게 한다
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CmsUser | null>(null);

  // 추가 폼
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGithub, setNewGithub] = useState('');
  const [newRole, setNewRole] = useState<Role>('editor');
  const [adding, setAdding] = useState(false);

  const fieldId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data: { users?: CmsUser[]; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 서버가 주는 힌트(예: cms_users 테이블 없음)를 그대로 보여 준다 —
        // 여기서 문구를 갈아 끼우면 설정이 덜 된 것인지 권한 문제인지 구분이 사라진다.
        setError(data.error ?? '사용자 목록을 불러오지 못했습니다.');
        return;
      }
      setError(null);
      setUsers(data.users ?? []);
    } catch {
      setError('네트워크 오류로 사용자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return;
    const name = newName.trim();
    const email = newEmail.trim();
    const githubLogin = newGithub.trim();
    if (!name) {
      setError('이름을 입력해 주세요.');
      return;
    }
    // 로그인 수단이 하나도 없는 행은 만들어 봐야 아무도 그 계정으로 들어올 수 없다
    if (!email && !githubLogin) {
      setError('이메일 또는 GitHub 아이디 중 하나는 있어야 합니다.');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          role: newRole,
          ...(email ? { email } : {}),
          ...(githubLogin ? { githubLogin } : {}),
        }),
      });
      const data: { user?: CmsUser; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? '사용자를 추가하지 못했습니다.');
        return;
      }
      setError(null);
      setNewName('');
      setNewEmail('');
      setNewGithub('');
      setNewRole('editor');
      if (data.user) setUsers((list) => [...list, data.user as CmsUser]);
      else await load();
    } catch {
      setError('네트워크 오류로 사용자를 추가하지 못했습니다.');
    } finally {
      setAdding(false);
    }
  }

  async function patch(user: CmsUser, body: Record<string, unknown>) {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: { user?: CmsUser; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 400(마지막 관리자 보호)이 대표적 — 화면 값은 서버 상태 그대로 되돌린다
        setError(data.error ?? '변경하지 못했습니다.');
        await load();
        return;
      }
      setError(null);
      if (data.user) {
        const updated = data.user;
        setUsers((list) => list.map((u) => (u.id === user.id ? updated : u)));
      } else {
        await load();
      }
    } catch {
      setError('네트워크 오류로 변경하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(user: CmsUser) {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? '삭제하지 못했습니다.');
        return;
      }
      setError(null);
      setUsers((list) => list.filter((u) => u.id !== user.id));
    } catch {
      setError('네트워크 오류로 삭제하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="cms-rule mb-7 pb-[18px]">
        <h2 className="text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold leading-[1.15] tracking-tight text-content">
          사용자·권한
        </h2>
        <p className="mt-3.5 max-w-[76ch] text-[13px] leading-[1.8] text-content-soft">
          여기 등록된 사람만 CMS에 로그인할 수 있습니다. 변경은 즉시 저장됩니다.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-5 border border-[#f3c9c4] bg-[#fdf3f2] px-3.5 py-3 text-[13px] leading-[1.7] text-[#b42318]"
        >
          {error}
        </p>
      )}

      {/* 추가 폼 — 목록 위에 인라인으로 둔다. 새 창·모달을 거치면 "한 명 더 넣기"가
          화면 전환 두 번이 되는데, 필드가 넷뿐이라 그럴 만한 무게가 아니다. */}
      <form
        onSubmit={onAdd}
        className="mb-6 border border-surface-border bg-surface-soft p-4 lg:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1fr_auto_auto] lg:items-end">
          <Field id={`${fieldId}-name`} label="이름">
            <input
              id={`${fieldId}-name`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="cms-input-sm"
            />
          </Field>
          <Field id={`${fieldId}-email`} label="이메일">
            <input
              id={`${fieldId}-email`}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="cms-input-sm"
            />
          </Field>
          <Field id={`${fieldId}-github`} label="GitHub 아이디">
            <input
              id={`${fieldId}-github`}
              autoComplete="off"
              value={newGithub}
              onChange={(e) => setNewGithub(e.target.value)}
              className="cms-input-sm"
            />
          </Field>
          <Field id={`${fieldId}-role`} label="역할">
            <select
              id={`${fieldId}-role`}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="cms-input-sm"
            >
              <option value="editor">편집자</option>
              <option value="admin">관리자</option>
            </select>
          </Field>
          <button type="submit" disabled={adding} className="cms-btn-primary h-[38px]">
            {adding ? '추가 중…' : '추가'}
          </button>
        </div>
        <p className="mt-3 text-[12px] text-content-faint">
          이메일 또는 GitHub 아이디 중 하나는 반드시 필요합니다 · 카카오는 본인이 직접 연결합니다.
        </p>
      </form>

      {loading ? (
        <p className="py-10 text-[13px] text-content-faint">불러오는 중…</p>
      ) : users.length === 0 ? (
        <p className="py-10 text-[13px] text-content-faint">등록된 사용자가 없습니다.</p>
      ) : (
        // 열이 여섯이라 좁은 화면에서는 표가 넘친다 — 잘리는 대신 가로로 민다
        <div className="overflow-x-auto border-t-2 border-yonsei-navy" data-lenis-prevent-horizontal>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {['이름', '역할', '이메일', 'GitHub', '카카오'].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="whitespace-nowrap border-b border-surface-border px-2 py-3 text-left text-xs font-bold text-content-faint"
                  >
                    {label}
                  </th>
                ))}
                <th className="border-b border-surface-border px-2 py-3">
                  <span className="sr-only">동작</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const busy = busyId === u.id;
                return (
                  <tr key={u.id} className="align-middle transition-colors hover:bg-surface-soft">
                    <td className="border-b border-[#f1f4f8] px-2 py-2.5 font-semibold text-content">
                      {u.name}
                    </td>
                    <td className="border-b border-[#f1f4f8] px-2 py-2">
                      <select
                        value={u.role}
                        disabled={busy}
                        aria-label={`${u.name} 역할`}
                        onChange={(e) => void patch(u, { role: e.target.value as Role })}
                        className="cms-cell w-auto"
                      >
                        <option value="editor">{ROLE_LABEL.editor}</option>
                        <option value="admin">{ROLE_LABEL.admin}</option>
                      </select>
                    </td>
                    <td className="border-b border-[#f1f4f8] px-2 py-2.5 text-content-soft">
                      {u.email || '—'}
                    </td>
                    <td className="border-b border-[#f1f4f8] px-2 py-2.5 text-content-soft">
                      {u.githubLogin || '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-[#f1f4f8] px-2 py-2.5 text-content-soft">
                      {u.kakaoLinked ? (
                        <>
                          연결됨
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patch(u, { unlinkKakao: true })}
                            className="ml-2 text-[11px] font-semibold text-yonsei-blue transition-colors hover:text-yonsei-navy disabled:opacity-40"
                          >
                            해제
                          </button>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b border-[#f1f4f8] px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDeleting(u)}
                        aria-label={`${u.name} 삭제`}
                        title="삭제"
                        className={cn(
                          'px-1 text-xs font-bold text-[#b42318] transition-opacity hover:opacity-70 disabled:opacity-40',
                        )}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <CmsModal
          title="이 사용자를 삭제할까요?"
          body={`${deleting.name} 님은 더 이상 CMS에 로그인할 수 없게 됩니다. 이 동작은 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          tone="danger"
          onConfirm={() => {
            const target = deleting;
            setDeleting(null);
            void remove(target);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/** 추가 폼 필드 — 라벨을 placeholder 로 대체하지 않기 위해 자리와 크기를 한 번만 정한다 */
function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[11px] font-bold text-content-faint">
        {label}
      </label>
      {children}
    </div>
  );
}
