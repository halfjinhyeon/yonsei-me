'use client';

// 비어 있는 화면 — "항목 없음"과 "검색 결과 없음"을 한 컴포넌트로 통일한다.
//
// 두 상태는 겉모습이 비슷하지만 사용자가 해야 할 일이 정반대다.
//  - empty  : 아직 아무것도 없다 → 다음 동작은 "만들기". 화면 전체를 써서 크게 말한다.
//  - search : 데이터는 있는데 지금 조건에 걸린 게 없다 → 다음 동작은 "조건 지우기".
//             목록 툴바 바로 아래에 조용히 끼어들어야 하므로 글자와 여백을 줄인다.
//
// ⚠️ 문구 규칙: 검색 결과 없음은 사용자가 방금 친 검색어를 그대로 되돌려줘야 한다.
// 자기가 무엇을 쳤는지(오타·이전 검색어의 잔상) 화면에서 확인해야 지울 수 있기
// 때문이다. "결과가 없습니다" 한 줄만 남기면 사용자는 검색창을 다시 읽어야 한다.
//
// 그래서 리소스마다 제각각 쓰던 "데이터가 없습니다" 문구를 여기로 모은다 — 화면마다
// 다른 말로 같은 상태를 설명하면 사용자는 매번 새로 해석해야 한다.
//
// 내부 운영 도구라 한국어 UI 문자열은 쓰는 쪽 컴포넌트가 직접 넘긴다.

import { cn } from '@/lib/utils';

export function CmsEmptyState({
  variant = 'empty',
  title,
  body,
  actionLabel,
  onAction,
  compact,
}: {
  /** 'empty' = 항목이 하나도 없음 / 'search' = 검색·필터 결과 없음 */
  variant?: 'empty' | 'search';
  title: string;
  /** 안내 문장. 검색어를 <strong> 로 강조해 넘길 수 있어 ReactNode 로 받는다 */
  body?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** 목록 안쪽(툴바 아래)에 놓을 때 세로 여백을 줄인다 */
  compact?: boolean;
}): React.ReactElement {
  const isSearch = variant === 'search';

  return (
    // 점선 테두리 — 실선은 "여기에 내용이 있다"로 읽힌다. 빈 상태는 아직 채워지지
    // 않은 자리라는 뜻이므로 경계선만 점선으로 낮춘다(각진 엣지는 그대로).
    <div
      className={cn(
        'anim-panel border border-dashed border-surface-border bg-[#fcfdfe] px-6 text-center',
        compact ? 'py-14' : 'py-20',
      )}
    >
      <p
        className={cn(
          isSearch
            ? 'text-[15px] font-bold text-content'
            : 'text-[19px] font-bold tracking-tight text-content',
        )}
      >
        {title}
      </p>

      {body && (
        <p className="mx-auto mt-3 max-w-[46ch] text-[13px] leading-[1.8] text-content-faint">
          {body}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          // 빈 상태의 동작은 이 화면의 유일한 다음 걸음이라 주 버튼(네이비)으로,
          // 검색 결과 없음의 동작("검색어 지우기")은 되돌리기에 가까우므로
          // 작은 보조 버튼으로 둔다.
          className={isSearch ? 'cms-btn cms-btn-sm mt-4' : 'cms-btn-primary mt-5'}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
