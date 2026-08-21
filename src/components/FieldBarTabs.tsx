'use client';

import { cn } from '@/lib/utils';

export interface FieldBarTabItem {
  id: string;
  label: string;
  count: number;
}

/**
 * 분야 필터 탭 — 레퍼런스 디자인 이식: 활성 항목의 위·아래에 굵은 바가 붙는
 * 텍스트 탭(구 UnderlineTabs 대체). 좁은 화면은 가로 스크롤.
 *
 * 연구실 목록(LabList)과 연구실 소개 영상 갤러리(LabVideoGallery)가 같은 6분야
 * 탭을 쓰므로 공용 컴포넌트로 뺐다. id 는 호출부의 필터 키(문자열)를 그대로 쓴다.
 */
export function FieldBarTabs({
  active,
  onChange,
  tabs,
  ariaLabel,
}: {
  active: string;
  onChange: (id: string) => void;
  tabs: FieldBarTabItem[];
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex items-stretch gap-5 overflow-x-auto sm:gap-9">
      {tabs.map((tab) => {
        const on = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={on}
            className={cn(
              'relative whitespace-nowrap py-3.5 text-base font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue sm:text-lg',
              on ? 'text-yonsei-blue' : 'text-content-soft hover:text-content',
            )}
          >
            {/* 활성 표시 — 텍스트 위·아래의 굵은 바(레퍼런스 문법) */}
            <span
              aria-hidden="true"
              className={cn('absolute inset-x-0 top-0 h-[3px] bg-yonsei-blue transition-opacity', on ? 'opacity-100' : 'opacity-0')}
            />
            <span
              aria-hidden="true"
              className={cn('absolute inset-x-0 bottom-0 h-[3px] bg-yonsei-blue transition-opacity', on ? 'opacity-100' : 'opacity-0')}
            />
            {tab.label}
            <span
              className={cn(
                'ml-1.5 align-middle text-xs font-medium tabular-nums',
                on ? 'text-yonsei-blue/70' : 'text-content-faint',
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
