'use client';

import { useState } from 'react';
import { Prose } from './Prose';
import { cn } from '@/lib/utils';

export interface AccordionItem {
  label: string;
  markdown: string;
}

/**
 * 학번별 졸업요건처럼 항목 수가 많은 표를 그룹별로 접어두는 아코디언.
 * 라벨 클릭 시 표/텍스트가 부드럽게 펼쳐진다 (한 번에 하나만 열림).
 */
export function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div>
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={item.label} className="border-b-2 border-content">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 py-5 text-left"
              aria-expanded={isOpen}
            >
              <span
                className={cn(
                  'text-lg font-semibold transition-colors sm:text-xl',
                  isOpen ? 'text-yonsei-navy' : 'text-yonsei-blue'
                )}
              >
                {item.label}
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={cn(
                  'h-5 w-5 shrink-0 text-yonsei-blue transition-transform duration-300',
                  isOpen && 'rotate-180'
                )}
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div
              className={cn(
                'grid transition-all duration-300 ease-out-expo',
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              )}
            >
              <div className="overflow-hidden">
                <div className="pb-8">
                  <Prose markdown={item.markdown} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
