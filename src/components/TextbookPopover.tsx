'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

/** content/textbooks.json 의 교재 한 권.
 *  저자·출판사·연도는 원본에 없으면 빈 문자열, 표지는 미러링에 실패했으면 null 이다. */
export interface Textbook {
  kind: string;
  title: string;
  author: string;
  publisher: string;
  year: string;
  isbn: string;
  cover: string | null;
}

/** 학정번호 → 그 과목의 교재 목록. 배열 순서(주교재→부교재→참고자료)는 원본이 이미
 *  정렬해 둔 것이라 화면에서 다시 정렬하지 않는다. */
export type TextbookData = Record<string, { name: string; books: Textbook[] } | undefined>;

/** 교재 구분 → 태그 스타일. 주교재(네이비 채움) > 부교재(네이비 윤곽) > 참고자료(중립 윤곽)
 *  위계는 같은 표의 종별 배지(KindBadge)와 같은 규칙이다. */
const KIND_TAG: Record<string, { className: string; msg: 'main' | 'sub' | 'ref' }> = {
  주교재: { className: 'bg-yonsei-navy text-white', msg: 'main' },
  부교재: { className: 'border border-yonsei-navy text-yonsei-navy', msg: 'sub' },
  참고자료: { className: 'border border-content-faint text-content-faint', msg: 'ref' },
};

/** 팝오버(데스크톱)와 펼침 패널(모바일)의 치수 차이. 좁은 화면은 표지·제목을 키워
 *  손가락으로 훑을 때 읽히게 한다. 클래스는 JIT 가 훑을 수 있게 완성형 문자열로 둔다. */
const VARIANT = {
  popover: { w: 56, h: 78, box: 'h-[78px] w-[56px]', title: 'text-[13px]' },
  mobile: { w: 64, h: 90, box: 'h-[90px] w-[64px]', title: 'text-[14px]' },
} as const;

type Variant = keyof typeof VARIANT;

/** 팝오버가 쓰는 문자열 — CourseCatalog 가 useTranslations('research') 로 뽑아 넘긴다.
 *  (이 파일에서 다시 훅을 부르면 같은 네임스페이스를 두 번 구독하게 된다) */
export interface TextbookLabels {
  /** 트리거 aria-label 겸 모바일 패널 제목 */
  label: string;
  close: string;
  /** 서지 정보가 통째로 빈 교재(자체 강의노트)의 대체 문구 */
  noBib: string;
  kinds: Record<'main' | 'sub' | 'ref', string>;
}

/** 펼친 책 픽토그램 — 트리거(15px)와 표지 없음 플레이스홀더(24px)가 공유한다. */
function BookIcon({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
    >
      <path
        d="M12 6.4C10.4 5.2 8.3 4.7 5 4.7v12c3.3 0 5.4.5 7 1.8 1.6-1.3 3.7-1.8 7-1.8v-12c-3.3 0-5.4.5-7 1.7z"
        strokeLinejoin="round"
      />
      <path d="M12 6.4v12.1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 교과목명 뒤에 붙는 책 아이콘 버튼. 교재 데이터가 있는 과목에만 렌더된다.
 * 열림 상태는 CourseCatalog 가 들고 있어(한 번에 하나만) 여기서는 표시만 한다.
 */
export function TextbookTrigger({
  open,
  label,
  controls,
  onToggle,
}: {
  open: boolean;
  label: string;
  /** 데스크톱 팝오버·모바일 패널 두 컨테이너 id (공백 구분) */
  controls: string;
  /** 누른 버튼 자체를 넘긴다 — ESC 로 닫을 때 포커스를 되돌릴 대상이다 */
  onToggle: (el: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onToggle(e.currentTarget)}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      className={cn(
        'ml-1.5 inline-flex items-center rounded-[2px] p-0.5 align-middle leading-none transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue',
        open ? 'text-yonsei-navy' : 'text-content-faint hover:text-yonsei-blue',
      )}
    >
      <BookIcon size={15} strokeWidth={1.5} />
    </button>
  );
}

/** 헤더 우상단 닫기 × — 팝오버와 모바일 패널이 공유한다. */
function CloseButton({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="-mr-1 -mt-1 shrink-0 rounded-[2px] p-1 leading-none text-content-faint transition-colors hover:text-yonsei-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yonsei-blue"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M1 1l10 10M11 1L1 11" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** 헤더 한 줄 — 제목(데스크톱은 과목명, 모바일은 '교재 정보') + 학정번호 + 닫기 */
function PanelHeader({
  title,
  code,
  titleClass,
  labels,
  onClose,
}: {
  title: string;
  code: string;
  titleClass: string;
  labels: TextbookLabels;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className={cn('font-bold leading-snug text-content', titleClass)}>
        {title}
        <span className="ml-2 text-[12px] font-semibold tabular-nums text-yonsei-navy">{code}</span>
      </p>
      <CloseButton label={labels.close} onClose={onClose} />
    </div>
  );
}

/** 교재 한 권 — 표지(없으면 플레이스홀더) + 구분 태그 + 제목 + 서지 */
function BookEntry({ book, variant, labels }: { book: Textbook; variant: Variant; labels: TextbookLabels }) {
  const v = VARIANT[variant];
  const tag = KIND_TAG[book.kind];
  // 원본에 빈 값이 섞여 있어(저자만 없거나 연도만 없거나) 빈 칸을 걸러 낸 뒤 이어 붙인다 —
  // 그대로 join 하면 ' · · 2017' 같은 구분자만 남은 줄이 나온다.
  const bib = [book.author, book.publisher, book.year].map((s) => s.trim()).filter(Boolean).join(' · ');

  return (
    <div className="flex items-start gap-3">
      {book.cover ? (
        <Image
          src={book.cover}
          alt=""
          width={v.w}
          height={v.h}
          className={cn('flex-none border border-surface-border object-cover', v.box)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'grid flex-none place-items-center border border-surface-border bg-surface-soft text-content-faint',
            v.box,
          )}
        >
          <BookIcon size={24} strokeWidth={1.3} />
        </span>
      )}
      <div className="min-w-0">
        <span
          className={cn(
            'inline-block rounded-[2px] px-[5px] py-px text-[11px] font-bold leading-[1.5]',
            tag ? tag.className : 'border border-content-faint text-content-faint',
          )}
        >
          {tag ? labels.kinds[tag.msg] : book.kind}
        </span>
        {/* 제목은 원문 그대로(번역 대상이 아닌 사실 데이터). 길어도 2줄에서 자른다 */}
        <p className={cn('mt-[5px] line-clamp-2 font-semibold leading-[1.45] text-content', v.title)}>
          {book.title}
        </p>
        <p className="mt-[3px] text-[12px] leading-[1.5] text-content-faint">{bib || labels.noBib}</p>
      </div>
    </div>
  );
}

/** 교재 목록 본문 — 팝오버와 모바일 패널이 공유한다. */
function BookList({ books, variant, labels }: { books: Textbook[]; variant: Variant; labels: TextbookLabels }) {
  return (
    <div className="flex flex-col gap-[12px]">
      {books.map((book, i) => (
        <BookEntry key={`${book.isbn}-${i}`} book={book} variant={variant} labels={labels} />
      ))}
    </div>
  );
}

/**
 * 데스크톱(lg+) 팝오버. 교과목명 셀의 relative 래퍼를 기준으로 이름 바로 아래에 떠서
 * 뒤 내용을 덮는다 — 표 행 높이를 바꾸지 않으려면 흐름에서 빼는 수밖에 없다.
 * 모달이 아니므로 role="dialog" 를 쓰지 않고 트리거의 aria-expanded/-controls 로만 잇는다.
 */
export function TextbookPopover({
  id,
  name,
  code,
  books,
  labels,
  onClose,
}: {
  id: string;
  name: string;
  code: string;
  books: Textbook[];
  labels: TextbookLabels;
  onClose: () => void;
}) {
  return (
    // 배경은 완전 불투명 흰색(사용자 지시) — 체계도(CurriculumFlow)의 팝오버처럼
    // 가려진 요소를 비치게 하는 반투명 처리를 이 팝오버에는 넣지 않는다.
    <div
      id={id}
      className="anim-panel absolute left-0 top-full z-30 mt-2 hidden w-[380px] border-2 border-yonsei-navy bg-surface p-4 font-normal text-content lg:block"
    >
      <PanelHeader title={name} code={code} titleClass="text-[14px]" labels={labels} onClose={onClose} />
      {/* 3권 이상이면 팝오버가 표 밖까지 자라 스크롤을 따라다닌다 — 본문만 스크롤시킨다 */}
      <div
        className={cn(
          'mt-[10px] border-t border-surface-border pt-3',
          books.length >= 3 && 'max-h-[322px] overflow-y-auto',
        )}
      >
        <BookList books={books} variant="popover" labels={labels} />
      </div>
    </div>
  );
}

/**
 * 좁은 화면(lg 미만) 펼침 패널 본문. 같은 표의 교과목 소개 토글(descRow)과 같은 문법으로
 * 표 폭을 다 쓰는 별도 행 안에 놓인다 — 과목명 셀 안에 넣으면 종별·학점 열이 자리를
 * 잡아 두어 서너 단어마다 줄바꿈된다.
 */
export function TextbookMobilePanel({
  id,
  code,
  books,
  labels,
  onClose,
}: {
  id: string;
  code: string;
  books: Textbook[];
  labels: TextbookLabels;
  onClose: () => void;
}) {
  return (
    <div id={id} className="border-t-2 border-yonsei-navy pb-5 pt-[14px]">
      <PanelHeader title={labels.label} code={code} titleClass="text-[13px]" labels={labels} onClose={onClose} />
      <div className="mt-3">
        <BookList books={books} variant="mobile" labels={labels} />
      </div>
    </div>
  );
}
