// 편집 화면 공통 머리말.
//
// 에디터마다 "지금 무엇을, 어느 파일을 고치고 있는지"를 제각각 다른 크기·순서로
// 적으면 화면을 옮길 때마다 눈이 기준점을 새로 찾아야 한다. 그래서 유형 배지 ·
// 파일 경로 · 제목 · 설명 · 사이트 링크의 자리와 위계를 여기서 한 번만 정한다.
//
// 파일 경로를 굳이 드러내는 이유: 이 콘솔의 저장은 곧 GitHub 커밋이라, 문제가
// 생겼을 때 담당자가 저장소에서 같은 파일을 직접 확인할 수 있어야 한다.
//
// 라벨·설명은 호출하는 쪽이 resources.ts / boards.ts 정의에서 넘긴다
// (여기서 문구를 새로 하드코딩하지 않는다 — 정의는 한 곳에만).

import { cn } from '@/lib/utils';

export interface CmsPanelHeadProps {
  /** 유형 배지 — 사이드바 배지와 같은 색·같은 말을 쓴다 */
  kind: 'board' | 'collection' | 'markdown';
  /** 편집 대상 파일 경로 (예: 'content/faculty-directory.json') */
  file: string;
  title: string;
  description: string;
  /** 있으면 "사이트에서 보기" 링크를 단다 — 고친 결과를 학생 화면에서 확인하는 경로 */
  siteUrl?: string;
  /** 우측 상단 동작 버튼들 (저장·새 글 등). 배치만 여기서 맡고 내용은 에디터가 정한다 */
  actions?: React.ReactNode;
}

/** 유형별 배지 문구와 색. entries.ts 의 entryKind 와 같은 규칙을 쓴다
 *  (문서는 금색 금지 규칙에 따라 sky 계열 + AA 대비를 위해 한 단계 어두운 글자색). */
const KIND: Record<CmsPanelHeadProps['kind'], { label: string; cls: string }> = {
  board: { label: '게시판', cls: 'bg-yonsei-blue/10 text-yonsei-blue' },
  collection: { label: '데이터', cls: 'bg-yonsei-navy/10 text-yonsei-navy' },
  markdown: { label: '문서', cls: 'bg-[#2E86D6]/15 text-[#1b5e9e]' },
};

export function CmsPanelHead({
  kind,
  file,
  title,
  description,
  siteUrl,
  actions,
}: CmsPanelHeadProps) {
  const badge = KIND[kind];
  return (
    <header className="cms-rule mb-7 pb-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3.5">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5">
            <span className={cn('cms-badge', badge.cls)}>{badge.label}</span>
            <span className="truncate text-[11px] font-semibold text-content-faint">{file}</span>
          </p>
          <h2 className="mt-2.5 text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold leading-[1.15] tracking-tight text-content">
            {title}
          </h2>
        </div>
        {/* 동작 버튼은 제목과 같은 줄 오른쪽 끝 — 좁은 화면에서는 아래로 흘러간다 */}
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <p className="mt-3.5 max-w-[76ch] text-[13px] leading-[1.8] text-content-soft">
        {description}
      </p>

      {siteUrl && (
        <a
          href={siteUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-[11px] font-bold text-yonsei-blue transition-colors duration-200 ease-out-expo hover:text-yonsei-navy"
        >
          사이트에서 보기 ↗
        </a>
      )}
    </header>
  );
}
