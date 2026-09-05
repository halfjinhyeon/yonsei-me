'use client';

// 팝업 공지 스타일 선택기 — PC·모바일 한 쌍을 **한 위젯에서** 고른다.
//
// 기기 토글로 지금 고칠 쪽을 정하고, 카드 4장 중 하나를 누르면 그 기기의 스타일만
// 바뀐다(다른 기기는 그대로). 아래 미리보기는 학생이 실제로 보는 그 컴포넌트를
// (components/popup 의 템플릿) contained 모드로 그린 것이다 — 관리자가 "보는 대로
// 고친다"는 CMS 원칙을 지키기 위해 별도의 목업을 두지 않는다.
//
// 관리자 콘솔이라 문자열은 한국어 하드코딩(리소스 스키마와 같은 관례).

import { useState } from 'react';
import { POPUP_TEMPLATES, popupTemplate, type PopupTemplateKey } from '@/lib/popup-templates';
import { PopupGroup, templateComponent } from '@/components/popup';
import { cellText, type FormRecord, type LocalizedPair } from '@/lib/admin/resources';

type Device = 'desktop' | 'mobile';

interface Props {
  form: FormRecord;
  keys: { desktop: string; mobile: string };
  setValue: (key: string, value: FormRecord[string]) => void;
}

const PREVIEW_LABELS = {
  close: '닫기',
  hideToday: '오늘 하루 보지 않기',
  dialog: '공지 팝업',
};

/** 템플릿을 아주 작게 그린 그림 — 기기 프레임 + 사진 박스(+ 버튼 막대) 배치.
 *  실제 컴포넌트를 축소하지 않고 손그림을 쓰는 이유: 카드 4장이 동시에 보여야 하고,
 *  카드에서는 "어디에·무엇이" 만 알면 되기 때문이다(자세한 건 아래 미리보기가 맡는다). */
function TemplateThumb({
  device,
  placement,
  hasButton,
  selected,
}: {
  device: Device;
  placement: 'bottom' | 'center';
  hasButton: boolean;
  selected: boolean;
}) {
  // 세로가 긴 폰 / 가로가 긴 모니터
  const frame = device === 'mobile' ? { w: 44, h: 76 } : { w: 108, h: 68 };
  const pad = device === 'mobile' ? 4 : 10;
  const cardW = frame.w - pad * 2;
  const imgH = hasButton ? 26 : 34;
  const btnH = 6;
  const cardH = imgH + (hasButton ? btnH + 4 : 0) + 6; // 6 = 하단 바
  const x = (frame.w - cardW) / 2;
  const y = placement === 'bottom' ? frame.h - cardH - (device === 'mobile' ? 0 : 6) : (frame.h - cardH) / 2;
  const stroke = selected ? '#003377' : '#98A4B4';
  return (
    <svg
      viewBox={`0 0 ${frame.w} ${frame.h}`}
      width={device === 'mobile' ? 44 : 108}
      height={device === 'mobile' ? 76 : 68}
      role="presentation"
      aria-hidden="true"
    >
      {/* 기기 화면 */}
      <rect x="0.5" y="0.5" width={frame.w - 1} height={frame.h - 1} fill="#F4F7FB" stroke="#E0E6ED" />
      {/* 팝업 카드 */}
      <rect x={x} y={y} width={cardW} height={cardH} fill="#FFFFFF" stroke={stroke} />
      {/* 사진 */}
      <rect x={x + 2} y={y + 2} width={cardW - 4} height={imgH} fill={selected ? '#D6E2F2' : '#E7ECF3'} />
      {/* 버튼 */}
      {hasButton && (
        <rect x={x + 2} y={y + imgH + 4} width={cardW - 4} height={btnH} fill={selected ? '#003377' : '#B8C3D2'} />
      )}
      {/* 하단 바 구분선 */}
      <line x1={x} y1={y + cardH - 6} x2={x + cardW} y2={y + cardH - 6} stroke="#E0E6ED" />
    </svg>
  );
}

export function PopupStylePicker({ form, keys, setValue }: Props) {
  const [device, setDevice] = useState<Device>('desktop');
  const activeKey = device === 'mobile' ? keys.mobile : keys.desktop;
  const current = popupTemplate(cellText(form, activeKey), device).key;

  const desktopLabel = popupTemplate(cellText(form, keys.desktop), 'desktop').label;
  const mobileLabel = popupTemplate(cellText(form, keys.mobile), 'mobile').label;

  function choose(key: PopupTemplateKey) {
    setValue(activeKey, key);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="미리볼 기기"
          className="inline-flex rounded-[2px] border border-surface-border"
        >
          {(['mobile', 'desktop'] as Device[]).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className={
                device === d
                  ? 'bg-yonsei-navy px-3 py-1.5 text-xs font-semibold text-white'
                  : 'px-3 py-1.5 text-xs font-semibold text-content-faint hover:text-content'
              }
            >
              {d === 'mobile' ? 'Mobile' : 'PC'}
            </button>
          ))}
        </div>
        <p className="text-xs text-content-faint">
          PC: {desktopLabel} · Mobile: {mobileLabel}
        </p>
      </div>

      {/* 카드 4장을 한 줄로 두고 미리보기는 그 아래 — 전용 편집기의 입력 열(~740px)에서
          카드와 640px 미리보기를 나란히 놓으면 카드가 40px 폭으로 눌린다 */}
      <div className="grid gap-4">
        <div className="grid grid-cols-2 content-start gap-2 sm:grid-cols-4">
          {POPUP_TEMPLATES.map((t) => {
            const selected = t.key === current;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(t.key)}
                className={`flex flex-col items-center gap-2 rounded-[2px] border-2 bg-surface p-3 text-center transition-colors ${
                  selected
                    ? 'border-yonsei-navy'
                    : 'border-surface-border hover:border-yonsei-blue'
                }`}
              >
                <TemplateThumb
                  device={device}
                  placement={t.placement}
                  hasButton={t.hasButton}
                  selected={selected}
                />
                <span className="text-xs font-semibold text-content">{t.label}</span>
                <span className="text-[11px] text-content-faint">{t.summary}</span>
              </button>
            );
          })}
        </div>

        <StylePreview form={form} device={device} styleKey={current} />
      </div>
    </div>
  );
}

/** 지금 고르고 있는 기기의 실제 템플릿을 작은 프레임 안에 그린다(contained).
 *  모바일 프레임(390×700)은 그대로 두면 폼을 밀어내므로 CSS zoom 으로 줄인다 —
 *  PostCanvas 와 같은 관례(자식은 레이아웃 px 를 그대로 쓰고 화면만 축소된다). */
function StylePreview({
  form,
  device,
  styleKey,
}: {
  form: FormRecord;
  device: Device;
  styleKey: PopupTemplateKey;
}) {
  const Template = templateComponent(styleKey, device);
  const placement = popupTemplate(styleKey, device).placement;
  const image =
    (device === 'mobile' && cellText(form, 'imageMobile')) || cellText(form, 'image');
  const link = cellText(form, 'link').trim();
  const buttonPair = (form.buttonLabel ?? { ko: '', en: '' }) as LocalizedPair;
  const closeControl = cellText(form, 'closeControl');
  // PC 프레임 높이는 카드가 잘리지 않을 만큼 — 사진 상한(contained 360px) + 버튼 + 하단 바.
  const frame = device === 'mobile' ? { width: 390, height: 700 } : { width: 640, height: 520 };
  const zoom = device === 'mobile' ? 0.6 : 1;

  return (
    <div className="justify-self-center">
      <p className="mb-2 text-xs font-semibold text-content-faint">
        미리보기 ({device === 'mobile' ? '모바일' : 'PC'})
      </p>
      <div
        className="relative overflow-hidden rounded-[2px] border border-surface-border bg-surface-soft"
        style={{ ...frame, zoom }}
      >
        <PopupGroup placement={placement} device={device} contained>
          <Template
            image={image}
            alt={((form.title ?? { ko: '', en: '' }) as LocalizedPair).ko || '팝업 사진'}
            link={link || undefined}
            newTab={form.newTab === true}
            buttonLabel={buttonPair.ko || '자세히 보기'}
            device={device}
            labels={PREVIEW_LABELS}
            closeControl={
              closeControl === 'hideToday' || closeControl === 'none' ? closeControl : 'close'
            }
            hideTodayButton={form.hideTodayButton === true}
            contained
            onDismiss={() => {
              /* 미리보기에서는 닫히지 않는다 */
            }}
          />
        </PopupGroup>
      </div>
    </div>
  );
}
