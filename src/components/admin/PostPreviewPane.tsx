'use client';

// 글쓰기 폼 상태(EditRecord)를 실제 게시물 상세와 "똑같은" 컴포넌트(PostArticle)로
// 렌더해 보여주는 미리보기. 저장 전 최종 확인용 — 사이트에는 아직 반영되지 않는다.
//
// 4단계에서 팝업(PostPreviewModal)을 걷어내고 본문 자리를 그대로 바꿔 끼우는
// 인라인 패널로 바꿨다. 글을 쓰다 미리보기를 누르면 시선이 같은 위치에 머물러야
// "쓴 것이 이렇게 보인다"가 한 번에 읽힌다 — 오버레이는 그 연결을 끊는다.
//
// 별도 프리뷰 마크업을 만들지 않고 PostArticle 을 그대로 재사용하는 이유는
// 실제 상세 페이지와 타이포·여백이 한 글자도 어긋나지 않게 하기 위해서다.

import { useState } from 'react';
import { PostArticle } from '@/components/PostArticle';
import type { BoardMeta, EditRecord } from '@/lib/admin/boards';

interface Props {
  meta: BoardMeta;
  rec: EditRecord;
}

/** en 이 비어 있으면 ko 로 폴백 — 저장 시 localized() 동작과 동일하게 맞춘다 */
function resolve(ko: string, en: string, locale: 'ko' | 'en'): string {
  if (locale === 'en') return en.trim() === '' ? ko : en;
  return ko;
}

// 뉴스형 게시판의 카테고리 라벨(메타 행에 표시)
// (키를 자유 문자열로 두는 이유: EditRecord.category 는 뉴스 분류와 일정 분류가
//  같은 칼럼을 나눠 쓰느라 string 이다. 여기서는 뉴스형에서만 읽고, 모르는 값이면
//  아래에서 '일반'으로 폴백한다 — 구 분류(notice/seminar)로 남은 글이 그 경로를 탄다.)
const CATEGORY_LABELS: Record<'ko' | 'en', Record<string, string>> = {
  ko: { general: '일반', achievement: '성과' },
  en: { general: 'General', achievement: 'Achievement' },
};

export function PostPreviewPane({ meta, rec }: Props) {
  const [previewLocale, setPreviewLocale] = useState<'ko' | 'en'>('ko');

  // ── PostArticle 에 넘길 값 계산 (previewLocale 반영 + en 빈값 폴백) ──
  const title = resolve(rec.titleKo, rec.titleEn, previewLocale);
  const body = resolve(rec.bodyKo, rec.bodyEn, previewLocale);

  // 메타 행 값: 뉴스형은 카테고리 라벨, 그 외는 주최(있으면) 또는 학부 기본값
  let metaValue: string;
  if (meta.isNews) {
    const labels = CATEGORY_LABELS[previewLocale];
    metaValue = labels[rec.category ?? 'general'] ?? labels.general;
  } else {
    const host = resolve(rec.hostKo ?? '', rec.hostEn ?? '', previewLocale);
    if (meta.hasHost && host.trim() !== '') {
      metaValue = host;
    } else {
      metaValue = previewLocale === 'en' ? 'Dept. of Mechanical Engineering' : '기계공학부';
    }
  }

  // 첨부: href 또는 라벨(한국어)이 채워진 행만 노출 (빈 행은 미리보기에서도 제외)
  const filledAtts = rec.attachments.filter((a) => a.href.trim() !== '' || a.labelKo.trim() !== '');
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
    <div className="anim-panel border border-surface-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-[#fcfdfe] px-4 py-2.5">
        <p className="cms-eyebrow">사이트에 이렇게 보입니다</p>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-content-faint sm:inline">
            저장 전까지 사이트에는 반영되지 않습니다
          </span>
          {/* ko/EN 세그먼트 토글 — 영문 폴백(빈 값이면 한국어)까지 그대로 확인한다 */}
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
        </div>
      </div>

      {/*
        onClickCapture 로 내부 링크 이동을 차단한다: PostArticle 안의 '목록으로'
        Link 나 본문 내부 링크를 누르면 라우팅이 일어나 편집 중이던 글이 사라지므로,
        새 탭(첨부의 외부 링크, target=_blank)이 아닌 앵커는 기본 동작을 막는다.
      */}
      <div
        className="px-5 py-10 sm:px-9"
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
  );
}
