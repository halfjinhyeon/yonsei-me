// 편집 화면 공통 머리말.
//
// 에디터마다 "지금 무엇을 고치고 있는지"를 제각각 다른 크기·순서로 적으면 화면을
// 옮길 때마다 눈이 기준점을 새로 찾아야 한다. 그래서 유형 배지 · 제목 · 설명 ·
// 사이트 링크의 자리와 위계를 여기서 한 번만 정한다.
//
// ⚠️ 저장처(파일 경로 · 'Supabase · posts (board=…)')는 더 이상 표시하지 않는다.
// GitHub 커밋 시절에는 담당자가 저장소에서 같은 파일을 찾아가라는 뜻이었지만,
// 이 콘솔을 쓰는 사람은 개발자가 아니라 학과 실무자다 — 읽어도 할 수 있는 일이
// 없는 내부 구현 정보라, 제목 바로 옆 가장 눈에 띄는 자리를 내줄 이유가 없다.
//
// 라벨·설명은 호출하는 쪽이 resources.ts / boards.ts 정의에서 넘긴다
// (여기서 문구를 새로 하드코딩하지 않는다 — 정의는 한 곳에만).

import { cn } from '@/lib/utils';

export interface CmsPanelHeadProps {
  /** 유형 배지 — 사이드바 배지와 같은 색·같은 말을 쓴다 */
  kind: 'board' | 'collection' | 'markdown';
  title: string;
  description: string;
  /** 있으면 "사이트에서 보기" 링크를 단다 — 고친 결과를 학생 화면에서 확인하는 경로 */
  siteUrl?: string;
  /** 우측 상단 동작 버튼들 (저장·새 글 등). 배치만 여기서 맡고 내용은 에디터가 정한다 */
  actions?: React.ReactNode;
  /** 0~1 이면 제목 아래 룰이 그만큼 찬 진행 바가 된다. null/undefined = 평소의 룰 */
  progress?: number | null;
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
  title,
  description,
  siteUrl,
  actions,
  progress,
}: CmsPanelHeadProps) {
  const badge = KIND[kind];
  return (
    <header className={cn('cms-rule mb-7 pb-[18px]', progress != null && 'relative')}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3.5">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5">
            <span className={cn('cms-badge', badge.cls)}>{badge.label}</span>
          </p>
          {/* 제목 서체 = 사이트 탭 큰 제목(TabPageShell)과 같은 Paperlogy SemiBold.
              --font-subhead 는 600·700 두 파일을 함께 물고 있어 font-semibold(600)가
              SemiBold 파일을 고른다(가짜 볼드 합성 없음). 히어로의 지마켓 산스가
              아니다 — 콘솔에는 히어로가 없고, 이 제목은 사이트 본문 페이지 제목에
              대응한다. 굵기까지 그쪽 600 에 맞춘다. */}
          <h2 className="mt-2.5 font-subhead text-[clamp(1.6rem,3.2vw,2.4rem)] font-semibold leading-[1.15] tracking-tight text-content">
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

      {/* 오래 걸리는 작업(교수 실적 수집)이 도는 동안, 제목 아래 룰이 진행 바를 겸한다.
          패널을 닫고 다른 것을 하다 돌아와도 "아직 돌고 있다"가 이 자리에 남는다. */}
      {progress != null && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-border" aria-hidden="true">
          <div
            className="h-0.5 bg-yonsei-navy transition-[width] duration-500 ease-out-expo"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </header>
  );
}
