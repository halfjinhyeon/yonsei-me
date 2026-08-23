import { Marked } from 'marked';
import { Link } from '@/i18n/navigation';
import { AttachmentsZipButton } from '@/components/AttachmentsZipButton';
import { PostShareActions } from '@/components/PostShareActions';
import type { Attachment } from '@/lib/content';
import type { Locale } from '@/i18n/routing';
import { formatBytes } from '@/lib/files';
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
  /** 첨부 전체 ZIP 버튼 문구 3종 — 셋이 모두 오고 첨부가 2개 이상일 때만 버튼이 뜬다.
   *  (선택적으로 둔 이유: 뉴스 상세·CMS 미리보기처럼 postId 로 API 를 부를 수 없는
   *   호출부는 아무것도 넘기지 않는 것만으로 버튼이 사라진다.) */
  attachmentsZip?: string;
  zipPreparing?: string;
  zipFailed?: string;
  /** 서버가 Content-Disposition 을 안 줬을 때 쓸 zip 파일명 (로케일별) */
  zipFileName?: string;
  /** 헤더 우측 공유 버튼 문구 (Web Share 가 없는 브라우저에서는 URL 복사로 동작) */
  share: string;
  /** 헤더 우측 URL 복사 버튼 문구 */
  copyUrl: string;
  /** 복사 성공 직후 2초간 보이는 문구 */
  copied: string;
  /** 복사 실패 직후 2초간 보이는 문구 */
  copyFailed: string;
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
  categoryLabel,
  categoryValue,
  body,
  bodyFormat = 'markdown',
  attachments,
  attachmentLabels,
  postId,
  backHref,
  labels,
  locale,
  shareInert,
}: {
  /** 게시판명 (h2, TabbedContent h2와 동일 스타일) */
  boardName: string;
  title: string;
  date: string;
  /** 세 번째 메타 행 값 — 카테고리 라벨 또는 작성자 */
  metaValue: string;
  /** 네 번째 메타 행(선택) — 라벨/값이 다 있을 때만 그린다. 자료실의 '분류: 행정 서식'용 */
  categoryLabel?: string;
  categoryValue?: string;
  /** 본문 원문 — bodyFormat 에 따라 마크다운 또는 정화된 HTML */
  body: string;
  /** 'markdown'(기본, marked 로 렌더) | 'html'(DB 저장 산출물 — 서버 정화 전제) */
  bodyFormat?: 'markdown' | 'html';
  attachments?: Attachment[];
  /** 각 첨부의 로케일 라벨 (부모에서 pick 처리해 전달) */
  attachmentLabels?: string[];
  /** ZIP 다운로드 API 에 넘길 게시물 id — 게시판 글 상세만 갖는다 */
  postId?: string;
  backHref: string;
  labels: PostArticleLabels;
  locale: Locale;
  /** CMS 미리보기 — 공유·복사 버튼을 모양만 남기고 죽인다 */
  shareInert?: boolean;
}) {
  const hasAttachments = attachments && attachments.length > 0;

  // ZIP 버튼은 "한 번에 받을 게 여럿"일 때만 의미가 있다 — 첨부 1개면 파일 링크가 곧 답이다.
  // 라벨 3종과 postId 가 모두 온 호출부에서만 켜지므로, 넘기지 않는 화면(CMS 미리보기 등)엔 안 생긴다.
  const showZip =
    hasAttachments &&
    attachments!.length >= 2 &&
    !!postId &&
    !!labels.attachmentsZip &&
    !!labels.zipPreparing &&
    !!labels.zipFailed;

  return (
    <article className="anim-panel">
      {/* ⚠️ 탭 화면(TabbedContent)의 게시판명 h2 와 **완전히 같은 문법**이어야 한다 —
          글꼴 var(--font-subhead)(Paperlogy) + text-display-sm + font-semibold.
          예전에는 여기만 text-display(clamp 2~3rem, Pretendard 700)라, 목록에서 보던
          '공지사항·뉴스'와 게시물에 들어갔을 때의 크기·서체가 서로 달랐다(사용자 지적). */}
      <h2
        style={{ fontFamily: 'var(--font-subhead), var(--font-sans), sans-serif' }}
        className="mb-10 scroll-mt-24 text-display-sm font-semibold tracking-tight text-content"
      >
        {boardName}
      </h2>

      {/* 에디토리얼 헤더 — 굵은 네이비 룰 + 제목 + 슬림 메타 라인(작성일 · 작성자/분류) */}
      <header className="border-t-2 border-yonsei-navy pt-6">
        {/* 제목도 폭 제한을 두지 않는다 — 본문과 같은 열 폭에서 접혀야 CMS 편집 캔버스가
            재현하는 줄바꿈이 공개 화면과 일치한다.
            text-pretty: 전역 h1–h4 의 text-wrap:balance 를 끈다 — 긴 게시물 제목을 두 줄로
            똑같이 나누면 첫 줄이 열 폭의 절반에서 접혀 "자리가 있는데도 갇힌" 인상을 준다
            (사용자 지적). pretty 는 줄을 끝까지 채우되 마지막 줄 외톨이 단어만 막는다. */}
        <h3 className="text-pretty text-2xl font-bold leading-snug tracking-tight text-content sm:text-3xl">
          {title}
        </h3>
        {/* 메타 줄 — 왼쪽은 작성일·작성자/분류, 오른쪽 빈자리는 공유·URL 복사 버튼이 쓴다.
            밑줄(border-b)과 아래 여백은 두 덩어리를 함께 감싸는 이 래퍼가 갖는다.
            버튼의 ml-auto: 좁은 화면에서 줄이 접혀 버튼만 아랫줄로 내려가도 오른쪽 정렬을
            유지한다(justify-between 은 한 덩어리만 남으면 왼쪽으로 붙어 버린다). */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-7 gap-y-3 border-b border-surface-border pb-6">
          <dl className="flex flex-wrap items-baseline gap-x-7 gap-y-1.5 text-sm">
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
            {/* 분류는 자료실처럼 게시판 자체 분류를 가진 글에만 붙는다 —
                라벨·값이 다 있을 때만 그려 다른 게시판의 두 줄 메타를 그대로 둔다 */}
            {categoryLabel && categoryValue && (
              <div className="flex items-baseline gap-2">
                <dt className="font-semibold text-content-faint">{categoryLabel}</dt>
                <dd className="text-content-soft">{categoryValue}</dd>
              </div>
            )}
          </dl>
          <PostShareActions
            title={title}
            labels={{
              share: labels.share,
              copyUrl: labels.copyUrl,
              copied: labels.copied,
              copyFailed: labels.copyFailed,
            }}
            inert={shareInert}
          />
        </div>
      </header>

      {/* 본문 — 사이트 공통 prose 타이포. 게시물 본문은 **열 폭 전체**를 쓴다
          (사용자 지시 2026-08-23 — 좁은 측정폭 안에 갇혀 답답하다는 지적).
          줄길이 제한(--measure-prose)은 이제 콘텐츠 페이지의 Prose 에만 남는다.
          폭이 곧 줄바꿈이라, CMS 편집 캔버스(PostCanvas)가 이 열 폭을 그대로 재현한다.
          markdown 은 marked 로 렌더, html 은 DB 저장 시 서버에서 정화된 산출물 그대로 */}
      <div
        className="prose-content prose-wide mt-10"
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
              // 크기를 모르는 첨부(레거시 링크)는 괄호째 생략한다 — 빈 괄호가 더 나쁘다
              const size = formatBytes(att.size);
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
                    <span>
                      {attachmentLabels?.[i] ?? ''}
                      {size && <span className="font-normal text-content-faint"> ({size})</span>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>

          {showZip && (
            <AttachmentsZipButton
              postId={postId!}
              idleLabel={labels.attachmentsZip!}
              pendingLabel={labels.zipPreparing!}
              failedLabel={labels.zipFailed!}
              fallbackFileName={labels.zipFileName ?? 'attachments.zip'}
            />
          )}
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
