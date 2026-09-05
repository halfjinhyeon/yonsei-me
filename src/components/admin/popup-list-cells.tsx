'use client';

// 팝업 공지 목록의 전용 셀 — 썸네일 · 기간 두 줄 · 상태 배지.
//
// CollectionEditor 의 폴백 표는 셀 하나에 값 하나(cellText)를 찍는다. 팝업은 그 규칙으로
// 읽히지 않는다: "지금 뜨고 있나?"는 enabled·start·end 세 값을 함께 봐야 알 수 있고,
// 사진은 파일명(URL)이 아니라 그림으로 봐야 무엇인지 안다. 그래서 이 리소스에 한해
// 셀 렌더를 여기로 뺀다(다른 리소스의 표는 그대로 값 한 개).
//
// ⚠️ '지금'은 **한국 시간 문자열**로 비교한다 — start·end 가 KST 기준의
// 'YYYY-MM-DDTHH:mm' 문자열이라, Date 로 파싱하면 브라우저 표준시가 끼어든다.
// 사이트(PopupNotice.nowKst)와 같은 방식이어야 목록과 실제 노출이 어긋나지 않는다.
//
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { popupTemplate } from '@/lib/popup-templates';
import { cellText, type FormRecord } from '@/lib/admin/resources';

export type PopupStatus = 'hidden' | 'scheduled' | 'live' | 'ended';

/** 'YYYY-MM-DDTHH:mm' (KST) — PopupNotice 의 nowKst 와 같은 규칙 */
export function popupNowKst(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  return parts.replace(' ', 'T');
}

export function popupStatusOf(form: FormRecord, now: string): PopupStatus {
  if (form.enabled === false) return 'hidden';
  const start = cellText(form, 'start');
  const end = cellText(form, 'end');
  if (start && now < start) return 'scheduled';
  if (end && now > end) return 'ended';
  return 'live';
}

const STATUS: Record<PopupStatus, { label: string; cls: string }> = {
  hidden: { label: '숨김', cls: 'border border-dashed border-surface-border text-content-faint' },
  scheduled: { label: '예정', cls: 'bg-surface-soft text-content-faint' },
  live: { label: '게재 중', cls: 'bg-yonsei-blue/10 text-yonsei-blue' },
  ended: { label: '종료', cls: 'border border-solid border-surface-border text-content-faint' },
};

export function PopupStatusBadge({ status }: { status: PopupStatus }): React.ReactElement {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.025em] ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

/** 각주의 [숨김] 견본 — 배지와 같은 모양, 문장 안에 놓이므로 세로 정렬만 맞춘다 */
export function PopupHiddenBadgeInline(): React.ReactElement {
  return (
    <span className="inline-flex items-center border border-dashed border-surface-border px-1.5 py-px align-middle text-[10px] font-extrabold tracking-[0.025em] text-content-faint">
      숨김
    </span>
  );
}

/** 'YYYY-MM-DDTHH:mm' → 'YYYY-MM-DD HH:mm' */
function readableDateTime(v: string): string {
  return v.replace('T', ' ');
}

/**
 * 팝업 목록의 특수 셀. 이 리소스가 아니거나 평범한 값 셀이면 null 을 돌려주고,
 * 그 경우 표는 원래대로 cellText 를 찍는다.
 */
export function popupListCell(
  key: string,
  form: FormRecord,
  now: string,
): React.ReactNode | null {
  const status = popupStatusOf(form, now);

  if (key === 'image') {
    const src = cellText(form, 'image').trim();
    return (
      <span
        className="block h-16 w-12 overflow-hidden border border-surface-border"
        style={{
          opacity: status === 'ended' ? 0.6 : 1,
          // 사진이 없을 때의 빗금 — "아직 안 넣었다"를 빈칸보다 분명히 말한다
          backgroundImage: src
            ? undefined
            : 'repeating-linear-gradient(135deg,#E7ECF3 0 4px,#F4F7FB 4px 8px)',
        }}
      >
        {src && (
          // 관리자 화면이라 최적화보다 즉시 반영이 중요 — next/image 대신 일반 img.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        )}
      </span>
    );
  }

  if (key === 'styleDesktop' || key === 'styleMobile') {
    return popupTemplate(cellText(form, key)).label;
  }

  if (key === 'period') {
    const start = cellText(form, 'start');
    const end = cellText(form, 'end');
    return (
      <span className="block whitespace-nowrap leading-[1.5] tabular-nums">
        <span className="block">{readableDateTime(start)}</span>
        <span className="block">{end ? `~ ${readableDateTime(end)}` : ''}</span>
      </span>
    );
  }

  if (key === 'status') return <PopupStatusBadge status={status} />;

  return null;
}
