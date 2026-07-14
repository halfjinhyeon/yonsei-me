'use client';

// 글쓰기 폼 상태(EditRecord)를 실제 게시물 상세와 "똑같은" 컴포넌트(PostArticle)로
// 렌더해 보여주는 팝업 미리보기. 저장 전 최종 확인용 — 사이트에는 아직 반영되지 않는다.
// 실제 상세 페이지와 동일한 마크다운·타이포·레이아웃을 쓰기 위해 별도 프리뷰 마크업을
// 만들지 않고 PostArticle 을 그대로 재사용한다.

import { useEffect, useRef, useState } from 'react';
import { PostArticle } from '@/components/PostArticle';
import type { BoardMeta, EditRecord } from '@/lib/admin/boards';

interface Props {
  meta: BoardMeta;
  rec: EditRecord;
  onClose: () => void;
}

/** en 이 비어 있으면 ko 로 폴백 — 저장 시 localized() 동작과 동일하게 맞춘다 */
function resolve(ko: string, en: string, locale: 'ko' | 'en'): string {
  if (locale === 'en') return en.trim() === '' ? ko : en;
  return ko;
}

// 뉴스형 게시판의 카테고리 라벨(메타 행에 표시)
const CATEGORY_LABELS: Record<'ko' | 'en', Record<'notice' | 'seminar' | 'achievement', string>> = {
  ko: { notice: '공지', seminar: '세미나', achievement: '성과' },
  en: { notice: 'Notice', seminar: 'Seminar', achievement: 'Achievement' },
};

export function PostPreviewModal({ meta, rec, onClose }: Props) {
  const [previewLocale, setPreviewLocale] = useState<'ko' | 'en'>('ko');
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // ESC 로 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 열려 있는 동안 배경 스크롤 잠금 (닫힐 때 원복)
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  // 마운트 시 닫기 버튼에 포커스 (모달 진입점 명확화)
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  // ── PostArticle 에 넘길 값 계산 (previewLocale 반영 + en 빈값 폴백) ──
  const title = resolve(rec.titleKo, rec.titleEn, previewLocale);
  const body = resolve(rec.bodyKo, rec.bodyEn, previewLocale);

  // 메타 행 값: 뉴스형은 카테고리 라벨, 그 외는 주최(있으면) 또는 학부 기본값
  let metaValue: string;
  if (meta.isNews) {
    metaValue = CATEGORY_LABELS[previewLocale][rec.category ?? 'notice'];
  } else {
    const host = resolve(rec.hostKo ?? '', rec.hostEn ?? '', previewLocale);
    if (meta.hasHost && host.trim() !== '') {
      metaValue = host;
    } else {
      metaValue = previewLocale === 'en' ? 'Dept. of Mechanical Engineering' : '기계공학부';
    }
  }

  // 첨부: href 또는 라벨(한국어)이 채워진 행만 노출 (빈 행은 미리보기에서도 제외)
  const filledAtts = rec.attachments.filter(
    (a) => a.href.trim() !== '' || a.labelKo.trim() !== '',
  );
  const attachments = filledAtts.map((a) => ({
    label: { ko: a.labelKo, en: a.labelEn.trim() === '' ? a.labelKo : a.labelEn },
    href: a.href,
  }));
  const attachmentLabels = filledAtts.map((a) =>
    previewLocale === 'en' ? (a.labelEn.trim() === '' ? a.labelKo : a.labelEn) : a.labelKo,
  );

  const labels =
    previewLocale === 'en'
      ? {
          title: 'Title',
          date: 'Date',
          metaRow: meta.isNews ? 'Category' : 'Author',
          attachments: 'Attachments',
          backToList: 'Back to list',
        }
      : {
          title: '제목',
          date: '작성일',
          metaRow: meta.isNews ? '분류' : '작성자',
          attachments: '첨부파일',
          backToList: '목록으로',
        };

  return (
    // 오버레이 — 배경 클릭 시 닫기
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="게시물 미리보기"
      onClick={onClose}
    >
      {/* 패널 — 내부 클릭이 오버레이로 전파돼 닫히지 않도록 차단 */}
      <div
        className="flex max-h-[calc(100dvh-4rem)] w-full max-w-5xl flex-col overflow-y-auto bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 바 — 스크롤해도 고정, 로케일 토글 + 닫기 */}
        <div className="sticky top-0 z-10 border-b border-surface-border bg-surface px-5 py-3 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold text-content">미리보기</span>
              <span className="border border-surface-border bg-surface-soft px-2 py-0.5 text-xs font-semibold text-content-soft">
                {meta.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* ko/EN 세그먼트 토글 */}
              <div className="flex border border-surface-border text-xs font-semibold" role="group" aria-label="미리보기 언어">
                {(
                  [
                    ['ko', '한국어'],
                    ['en', 'EN'],
                  ] as const
                ).map(([loc, label]) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setPreviewLocale(loc)}
                    aria-pressed={previewLocale === loc}
                    className={`px-3 py-1.5 transition-colors ${
                      previewLocale === loc
                        ? 'bg-yonsei-navy text-white'
                        : 'text-content-soft hover:text-content'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                aria-label="미리보기 닫기"
                className="grid h-8 w-8 place-items-center border border-surface-border text-content-soft transition-colors hover:border-yonsei-blue hover:text-yonsei-blue"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ×
                </span>
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-content-faint">
            실제 게시물 페이지와 동일한 컴포넌트로 렌더링됩니다. 저장 전까지 사이트에는 반영되지 않습니다.
          </p>
        </div>

        {/*
          본문 — 사이트 상세 페이지와 비슷한 여백 안에 PostArticle 을 그대로 렌더.
          onClickCapture 로 내부 링크 이동을 차단한다: PostArticle 안의 '목록으로'
          Link 나 본문 내부 링크를 누르면 라우팅이 일어나 미리보기가 사라지므로,
          새 탭(첨부의 외부 링크, target=_blank)이 아닌 앵커는 기본 동작을 막는다.
        */}
        <div
          className="px-5 py-10 sm:px-10"
          onClickCapture={(e) => {
            const anchor = (e.target as HTMLElement).closest('a');
            if (anchor && anchor.getAttribute('target') !== '_blank') {
              e.preventDefault();
            }
          }}
        >
          <PostArticle
            boardName={meta.label}
            title={title}
            date={rec.date}
            metaValue={metaValue}
            body={body}
            bodyFormat="html" /* Tiptap 전환: rec.body* 는 위지윅 HTML */
            attachments={attachments}
            attachmentLabels={attachmentLabels}
            backHref="/news"
            labels={labels}
            locale={previewLocale}
          />
        </div>
      </div>
    </div>
  );
}
