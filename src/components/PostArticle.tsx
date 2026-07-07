import { Link } from '@/i18n/navigation';
import type { Attachment } from '@/lib/content';
import type { Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/utils';

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
 * 상단 굵은 네이비 라인의 메타 테이블 → 본문 → 첨부 → 우하단 목록 버튼.
 * 메타는 라벨/값 쌍이므로 <dl>로 표현한다(테이블이 아닌 정의 목록이 시맨틱상 자연스럽다).
 */
export function PostArticle({
  boardName,
  title,
  date,
  metaValue,
  paragraphs,
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
  paragraphs: string[];
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

      {/* 메타 테이블: 상단 굵은 네이비 라인, 라벨 셀은 연회색 배경 */}
      <dl className="grid grid-cols-[8rem_1fr] border-t-2 border-yonsei-navy text-sm sm:text-base">
        <dt className="border-b border-surface-border bg-surface-soft px-4 py-3 font-semibold text-content-soft">
          {labels.title}
        </dt>
        <dd className="border-b border-surface-border px-4 py-3 font-semibold text-content">
          {title}
        </dd>

        <dt className="border-b border-surface-border bg-surface-soft px-4 py-3 font-semibold text-content-soft">
          {labels.date}
        </dt>
        <dd className="border-b border-surface-border px-4 py-3 text-content">
          <time dateTime={date}>{formatDate(date, locale)}</time>
        </dd>

        <dt className="border-b border-surface-border bg-surface-soft px-4 py-3 font-semibold text-content-soft">
          {labels.metaRow}
        </dt>
        <dd className="border-b border-surface-border px-4 py-3 text-content">
          {metaValue}
        </dd>
      </dl>

      {/* 본문 */}
      <div className="mt-8 space-y-5">
        {paragraphs.map((para, i) => (
          <p
            key={i}
            className="whitespace-pre-line text-lg leading-relaxed text-content-soft"
          >
            {para}
          </p>
        ))}
      </div>

      {/* 첨부 (있을 때만) */}
      {hasAttachments && (
        <div className="mt-10 rounded-card border border-surface-border bg-surface-soft px-4 py-3">
          <div className="grid grid-cols-[8rem_1fr] items-baseline gap-y-1">
            <span className="font-semibold text-content-soft">
              {labels.attachments}
            </span>
            <ul className="space-y-1">
              {attachments!.map((att, i) => (
                <li key={i}>
                  <a
                    href={att.href}
                    className="text-yonsei-blue hover:underline"
                  >
                    ↓ {attachmentLabels?.[i] ?? ''}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 하단 우측 목록 버튼 */}
      <div className="mt-12 flex justify-end">
        <Link href={backHref} className="btn-secondary">
          {labels.backToList}
        </Link>
      </div>
    </article>
  );
}
