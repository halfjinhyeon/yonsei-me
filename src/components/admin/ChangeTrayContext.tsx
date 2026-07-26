'use client';

// 변경 트레이 — "여러 곳을 훑으며 고친 뒤 한 번에 커밋한다".
//
// 지금까지는 값 하나를 고칠 때마다 화면 안의 별도 저장 버튼을 눌러야 했고(교수진
// 카드), 다른 리소스는 폼을 열었다 닫는 왕복이 필요했다. 그래서 "무엇을 고쳤는지"가
// 화면 곳곳에 흩어지고 되돌릴 방법도 없었다. 트레이는 그 목록을 화면 하단 한 곳에
// 모아 놓고, 항목별 되돌리기와 일괄 커밋만 담당한다.
//
// 설계 원칙: 트레이는 저장 로직을 갖지 않는다. 실제 커밋은 각 에디터가 이미 가진
// 커밋 전략(디프 최소화·로드 시점 sha·409 재로드)을 그대로 쓰고, 트레이는 그 위에
// 얹는 표시·조작 계층이다. 그래서 에디터가 TraySource 를 등록하는 구조로 둔다.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** 저장 대기 중인 변경 한 건 */
export interface PendingChange {
  /** 안정적 고유 키 — 되돌리기 대상 지정에 쓴다 */
  id: string;
  /** 영역 (리소스 라벨) — '교수진' */
  scopeLabel: string;
  /** 항목 — '홍길동' */
  itemLabel: string;
  /** 필드 — '이메일' */
  fieldLabel: string;
  /** 이전 값 (빈 값이면 '없음' 으로 표시) */
  before: string;
  /** 이후 값 */
  after: string;
}

/** 현재 화면(에디터)이 트레이에 등록하는 소스 */
export interface TraySource {
  /**
   * ⚠️ 이 배열은 에디터 쪽에서 useMemo 로 안정화해야 한다. 등록 훅이 이 배열의
   * 참조를 의존성으로 삼기 때문에, 매 렌더 새 배열을 넘기면 등록 → 리렌더 →
   * 등록이 반복돼 무한 루프가 된다.
   */
  changes: PendingChange[];
  revert: (id: string) => void;
  revertAll: () => void;
  /** 실제 커밋. 성공하면 resolve, 실패하면 Error 를 throw 한다 */
  save: () => Promise<void>;
  /** 저장 버튼 라벨 접미사 등에 쓸 수 있는 요약 (선택) */
  saveLabel?: string;
  /**
   * 지금 저장하면 안 되는 이유 (필수값 누락 등). 있으면 트레이가 저장 버튼을 잠근다.
   * 셸이 아는 잠금 사유(오프라인·권한)와 달리 이건 화면 안의 데이터를 봐야만 알 수
   * 있어 에디터가 올려보낸다. 문자열은 그대로 사용자에게 보이므로 "무엇이 왜
   * 잘못됐는지"를 담아야 한다("입력 오류" 같은 말은 도움이 되지 않는다).
   */
  blockReason?: string | null;
}

interface ChangeTrayValue {
  /** 등록된 소스 — 없으면 트레이를 그리지 않는다 */
  source: TraySource | null;
  saving: boolean;
  error: string | null;
  /** 커밋 실행. 성공 여부를 돌려준다(성공 시에만 토스트·배포 상태를 건드리도록) */
  runSave: () => Promise<boolean>;
  /** 트레이를 비운다 — 화면 이동을 확정했을 때 셸이 호출 */
  clearTray: () => void;
  /** 에디터 등록용 (useRegisterTray 전용) */
  register: (source: TraySource | null) => void;
}

const ChangeTrayContext = createContext<ChangeTrayValue | null>(null);

export function ChangeTrayProvider({ children }: { children: React.ReactNode }) {
  const [source, setSource] = useState<TraySource | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 저장 중 콜백이 옛 소스를 붙잡지 않도록 ref 로도 들고 있는다
  const sourceRef = useRef<TraySource | null>(null);
  sourceRef.current = source;

  const register = useCallback((next: TraySource | null) => {
    setSource(next);
    // 다른 화면(또는 다른 변경 묶음)으로 넘어가면 이전 오류 문구는 의미가 없다
    setError(null);
  }, []);

  const clearTray = useCallback(() => {
    setSource(null);
    setError(null);
  }, []);

  const runSave = useCallback(async (): Promise<boolean> => {
    const cur = sourceRef.current;
    if (!cur) return false;
    setSaving(true);
    setError(null);
    try {
      await cur.save();
      return true;
    } catch (err) {
      // 실패해도 변경은 지우지 않는다 — 사용자가 다시 시도하거나 되돌릴 수 있어야 한다
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const value = useMemo<ChangeTrayValue>(
    () => ({ source, saving, error, runSave, clearTray, register }),
    [source, saving, error, runSave, clearTray, register],
  );

  return <ChangeTrayContext.Provider value={value}>{children}</ChangeTrayContext.Provider>;
}

export function useChangeTray(): ChangeTrayValue {
  const ctx = useContext(ChangeTrayContext);
  if (!ctx) throw new Error('useChangeTray 는 ChangeTrayProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}

/**
 * 에디터가 자기 변경 목록을 트레이에 등록한다.
 *
 * source 는 매 렌더 새로 만들어지기 쉬우므로 객체 자체를 의존성으로 쓰지 않는다.
 * 대신 (1) 최신 source 를 ref 에 담아 콜백은 항상 최신 클로저를 타게 하고,
 * (2) 재등록 판정은 changes 배열의 참조로만 한다(에디터가 useMemo 로 안정화).
 * 언마운트하거나 null 을 넘기면 자동으로 해제된다 — 다른 화면으로 갔는데 이전
 * 화면의 변경이 트레이에 남아 엉뚱한 파일을 커밋하는 사고를 막는다.
 */
export function useRegisterTray(source: TraySource | null): void {
  const { register } = useChangeTray();
  const latest = useRef<TraySource | null>(source);
  latest.current = source;

  const changes = source?.changes;
  const saveLabel = source?.saveLabel;
  // blockReason 도 의존성에 넣는다 — 필수값을 채워 잠금이 풀렸는데 changes 참조가
  // 그대로면 트레이는 옛 사유를 계속 들고 저장 버튼을 잠근 채로 남는다.
  // 값 타입(문자열)이라 매 렌더 새 참조가 생기지 않아 무한 루프를 만들지 않는다.
  const blockReason = source?.blockReason ?? null;

  useEffect(() => {
    if (!changes || changes.length === 0) {
      register(null);
      return;
    }
    register({
      changes,
      saveLabel,
      blockReason,
      revert: (id) => latest.current?.revert(id),
      revertAll: () => latest.current?.revertAll(),
      save: () => latest.current?.save() ?? Promise.resolve(),
    });
  }, [changes, saveLabel, blockReason, register]);

  // 언마운트 해제는 별도 effect 로 — 위 effect 의 클린업으로 두면 changes 가 바뀔
  // 때마다 null 등록이 한 번 끼어들어 트레이가 깜빡인다.
  useEffect(() => () => register(null), [register]);
}
