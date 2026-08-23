'use client';

// 게시물 상세 헤더 메타 줄 오른쪽의 유틸 버튼 두 개 — '공유'와 'URL 복사'.
//
// PostArticle 은 본문을 서버에서 렌더하는 서버 컴포넌트라 통째로 'use client' 가 될 수
// 없다. AttachmentsZipButton 과 같은 이유로 상호작용 조각만 이 파일로 떼어냈다.
//
// 왜 주소를 클릭 시점에 계산하나
//   서버에서 만든 canonical 을 props 로 받아 두면 도메인 이관(vercel.app → me.yonsei.ac.kr)
//   이나 정적 캐시가 남았을 때 "지금 보고 있는 주소"와 다른 링크가 복사된다. 클릭 순간
//   window.location 에서 읽으면 독자가 실제로 열어 둔 페이지가 언제나 정답이고,
//   origin+pathname 만 쓰므로 목록에서 넘어오며 붙은 ?page=·#해시 같은 군더더기가 빠진다.
//
// 왜 Web Share 가 없는 브라우저에서 버튼을 숨기지 않고 복사로 대체하나
//   navigator.share 는 사실상 모바일 전용이라, 없을 때 버튼을 감추면 데스크톱 파이어폭스·
//   리눅스 크롬에서만 헤더 모양이 달라진다. 브라우저마다 다른 화면은 그 자체로 버그처럼
//   읽히므로, 자리는 그대로 두고 동작만 '복사'로 떨어뜨린다(공유의 최소 형태가 링크 전달이다).

import { useEffect, useRef, useState } from 'react';

export interface PostShareLabels {
  /** 공유 버튼 */
  share: string;
  /** URL 복사 버튼 */
  copyUrl: string;
  /** 복사 성공 후 2초간 대신 보이는 문구 */
  copied: string;
  /** 복사 실패 후 2초간 대신 보이는 문구 */
  copyFailed: string;
}

/** 복사 결과 피드백 — 2초 뒤 idle 로 돌아간다 */
type Feedback = 'idle' | 'copied' | 'failed';

/** 클립보드 API 가 없을 때(비보안 컨텍스트 등)의 구식 복사. 실패하면 throw 한다. */
function legacyCopy(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // display:none 이면 선택 자체가 안 된다 — 화면 밖으로 밀어 두고 스크롤 점프만 막는다
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('execCommand copy failed');
}

export function PostShareActions({
  title,
  labels,
  inert,
}: {
  /** 공유 시트에 실을 글 제목 */
  title: string;
  labels: PostShareLabels;
  /** CMS 미리보기용 — 모양은 같게, 동작만 죽인다 */
  inert?: boolean;
}) {
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 2초 타이머가 살아 있는 동안 페이지를 떠나면(목록으로 이동 등) 사라진 컴포넌트에
  // setState 가 걸린다 — 언마운트 때 반드시 정리한다.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function flash(next: Exclude<Feedback, 'idle'>) {
    setFeedback(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback('idle'), 2000);
  }

  /** 지금 열려 있는 페이지의 주소 (쿼리·해시 제외) */
  function currentUrl() {
    return window.location.origin + window.location.pathname;
  }

  async function copy() {
    const url = currentUrl();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        legacyCopy(url);
      }
      flash('copied');
    } catch {
      // 권한 거부든 execCommand 실패든 이용자에겐 결과가 같다 — 한 문구로 알린다
      flash('failed');
    }
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url: currentUrl() });
      } catch {
        // 공유 시트를 닫으면 AbortError 로 거절된다 — 취소는 오류가 아니므로 삼킨다
      }
      return;
    }
    await copy();
  }

  const copyState =
    feedback === 'copied' ? labels.copied : feedback === 'failed' ? labels.copyFailed : null;

  // 두 버튼이 같은 문법을 공유한다 — 하단 '목록으로' 버튼의 축소판(각진 엣지, 실선 헤어라인)
  const buttonClass = `inline-flex h-8 items-center gap-1.5 border px-2.5 text-xs font-semibold transition-colors ${
    inert ? 'cursor-default ' : ''
  }`;
  const idleTone = 'border-surface-border text-content-soft';
  const hoverTone = inert ? '' : ' hover:border-yonsei-navy hover:text-yonsei-navy';
  // 미리보기에서 흐리게 만들지 않는다 — 관리자가 보는 화면이 공개 화면과 같아야 한다
  const inertProps = inert
    ? ({ 'aria-disabled': true, title: '미리보기에서는 동작하지 않습니다' } as const)
    : {};

  return (
    <div className="ml-auto flex items-center gap-2">
      <button
        type="button"
        onClick={inert ? undefined : share}
        className={buttonClass + idleTone + hoverTone}
        {...inertProps}
      >
        {/* 공유 아이콘 — 상자에서 위로 화살표가 빠져나오는 iOS 문법 */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="h-[15px] w-[15px] shrink-0"
        >
          <path
            d="M12 3v12M12 3 8.5 6.5M12 3l3.5 3.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {labels.share}
      </button>

      <button
        type="button"
        onClick={inert ? undefined : copy}
        className={
          buttonClass +
          (copyState ? 'border-yonsei-blue text-yonsei-blue' : idleTone + hoverTone)
        }
        {...inertProps}
      >
        {feedback === 'copied' ? (
          /* 복사 성공 — 체크 */
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            className="h-[15px] w-[15px] shrink-0"
          >
            <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          /* 링크(사슬) 아이콘 */
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            className="h-[15px] w-[15px] shrink-0"
          >
            <path
              d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1.5 1.5M14 10a4 4 0 0 0-5.66 0l-3 3A4 4 0 1 0 11 18.66l1.5-1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {copyState ?? labels.copyUrl}
      </button>

      {/* 버튼 안의 문구 교체는 눈으로만 읽힌다 — 스크린리더에도 결과를 들려준다 */}
      <span role="status" aria-live="polite" className="sr-only">
        {copyState ?? ''}
      </span>
    </div>
  );
}
