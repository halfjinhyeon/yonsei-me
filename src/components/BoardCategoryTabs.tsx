'use client';

import { useTranslations } from 'next-intl';
import { UnderlineTabs } from '@/components/UnderlineTabs';

/** 탭 하나 — 라벨 옆에 붙는 건수는 호출부가 계산해서 넘긴다(검색과 무관한 전체 기준) */
export interface BoardTabCategory {
  id: string;
  label: string;
  count: number;
}

/**
 * 게시판 분류 탭 — 목록 위에 놓이는 '전체 + 각 분류' 언더라인 탭 줄.
 * FilterableBoardList 에서 뽑아낸 공용 조각으로, 자료실(ResourceLibrary)처럼
 * 목록 구현이 달라도 헤더 문법(탭 줄 + 그 아래 검색 바)은 같게 유지하기 위한 것이다.
 * '전체' 탭은 여기서 직접 그리므로 호출부는 실제 분류만 넘기면 된다.
 */
export function BoardCategoryTabs({
  active,
  onChange,
  ariaLabel,
  categories,
}: {
  active: string;
  onChange: (id: string) => void;
  /** 탭 그룹의 스크린리더 이름 (게시판마다 다르다 — "공지 구분", "자료 분류" 등) */
  ariaLabel: string;
  categories: BoardTabCategory[];
}) {
  const t = useTranslations('news');

  return (
    <div className="mb-5 overflow-x-auto">
      <UnderlineTabs
        active={active}
        onChange={onChange}
        ariaLabel={ariaLabel}
        tabs={[
          { id: 'all', label: <span className="whitespace-nowrap">{t('filter.all')}</span> },
          ...categories.map((c) => ({
            id: c.id,
            label: (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {c.label}
                <span
                  className={cnCount(active === c.id)}
                >
                  {c.count}
                </span>
              </span>
            ),
          })),
        ]}
      />
    </div>
  );
}

/** 카테고리 탭 건수 배지 클래스 (활성/비활성) */
function cnCount(active: boolean): string {
  return active
    ? 'text-xs font-medium tabular-nums text-yonsei-blue'
    : 'text-xs font-medium tabular-nums text-content-faint';
}
