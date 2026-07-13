import { Marked } from 'marked';
import { Link } from '@/i18n/navigation';
import type { Attachment } from '@/lib/content';
import type { Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/utils';

// 게시물 본문 마크다운 — breaks:true 로 단일 개행도 줄바꿈으로 살린다
// (비개발자가 쓰는 게시판 본문 특성). 콘텐츠는 관리자 작성 = 신뢰 소스(Prose 와 동일).
const marked = new Marked({ gfm: true, breaks: true });

export interface PostArticleLabels {
  title: string;
  date: string;
  /** 세 번째 메타 행 라벨 — 뉴스는 "분류", 게시판 글은 "작성자" */
  metaRow: string;
  attachments: string;
  backToList: string;
}

/**
 * 게시판 스타일 게시물 프레젠테이션 (뉴스 상세 / 게시판 글 상세 공용).
 * 에디토리얼 헤더(굵은 네이비 룰 + 큰 제목 + 슬림 메타 라인) → 본문 → 첨부 →
 * 우하단 목록 버튼. 라벨/값 메타는 <dl>로 표현한다(시맨틱상 정의 목록이 자연스럽다).
 * labels.title 은 이전 메타 테이블 레이아웃의 잔재로, 현재는 제목을 헤딩으로 직접
 * 노출하므로 렌더에 쓰지 않는다(호출부 호환을 위해 타입만 유지).
 */
export function PostArticle({
  boardName,
  title,
  date,
  metaValue,
  body,
  bodyFormat = 'markdown',
  attachments,
  attachmentLabels,
  backHref,
  labels,
  locale,
}: {
  /** 게시판명 (h2, TabbedContent h2와 동일 스타일) */
  boardName: string;
  title: string;
  date: string;
  /** 세 번째 메타 행 값 — 카테고리 라벨 또는 작성자 */
  metaValue: string;
  /** 본문 원문 — bodyFormat 에 따라 마크다운 또는 정화된 HTML */
  body: string;
  /** 'markdown'(기본, marked 로 렌더) | 'html'(DB 저장 산출물 — 서버 정화 전제) */
  bodyFormat?: 'markdown' | 'html';
  attachments?: Attachment[];
  /** 각 첨부의 로케일 라벨 (부모에서 pick 처리해 전달) */
  attachmentLabels?: string[];
  backHref: string;
  labels: PostArticleLabels;
  locale: Locale;
}) {
  const hasAttachments = attachments && attachments.length > 0;

  return (
    <article className="anim-panel">
      <h2 className="mb-10 scroll-mt-24 text-display tracking-tight text-content">
        {boardName}
      </h2>

      {/* 에디토리얼 헤더 — 굵은 네이비 룰 + 제목 + 슬림 메타 라인(작성일 · 작성자/분류) */}
      <header className="border-t-2 border-yonsei-navy pt-6">
        <h3 className="max-w-4xl text-2xl font-bold leading-snug tracking-tight text-content sm:text-3xl">
          {title}
        </h3>
        <dl className="mt-5 flex flex-wrap items-baseline gap-x-7 gap-y-1.5 border-b border-surface-border pb-6 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="font-semibold text-content-faint">{labels.date}</dt>
            <dd className="tabular-nums text-content-soft">
              <time dateTime={date}>{formatDate(date, locale)}</time>
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="font-semibold text-content-faint">{labels.metaRow}</dt>
            <dd className="text-content-soft">{metaValue}</dd>
          </div>
        </dl>
      </header>

      {/* 본문 — 사이트 공통 prose 타이포, 가독 줄길이 제한.
          markdown 은 marked 로 렌더, html 은 DB 저장 시 서버에서 정화된 산출물 그대로 */}
      <div
        className="prose-content mt-10 max-w-3xl"
        // 관리자 작성 + (html 인 경우) 서버 정화 콘텐츠 — Prose 와 동일한 신뢰 전제
        dangerouslySetInnerHTML={{
          __html: bodyFormat === 'html' ? body : (marked.parse(body) as string),
        }}
      />

      {/* 첨부 (있을 때만) — 각진 박스 + 파일별 다운로드 아이콘 */}
      {hasAttachments && (
        <div className="mt-12 border border-surface-border bg-surface-soft p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-content-faint">
            {labels.attachments}
          </p>
          <ul className="mt-3 space-y-2">
            {attachments!.map((att, i) => {
              // 외부 스토리지(Blob)·외부 링크는 새 탭에서 — 게시물 읽기 흐름 유지
              const external = /^https?:\/\//.test(att.href);
              return (
                <li key={i}>
                  <a
                    href={att.href}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="group inline-flex items-center gap-2.5 py-0.5 text-[15px] font-medium text-yonsei-blue hover:underline"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      className="h-4 w-4 shrink-0 text-content-faint transition-colors group-hover:text-yonsei-blue"
                    >
                      <path
                        d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {attachmentLabels?.[i] ?? ''}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 하단 우측 목록 버튼 — 게시판 영역의 각진 톤 */}
      <div className="mt-12 flex justify-end">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 border border-surface-border px-5 py-2.5 text-sm font-semibold text-content-soft transition-colors hover:border-yonsei-navy hover:text-yonsei-navy"
        >
          <span aria-hidden="true">←</span>
          {labels.backToList}
        </Link>
      </div>
    </article>
  );
}
