'use client';

// 동아리 소개 "피드 편집" — 인스타그램 피드를 고치듯, 사진 한 장 + 설명 한 문단을
// 피드 카드 하나로 묶어 그 자리에서 편집한다(WYSIWYG).
//
// 사이트(ClubCardNews)는 마크다운 카드 i번에 clubs.json images[i] 를 짝지어
// 좌우 교대로 렌더한다. 예전 편집기는 이 짝을 화면에 보여 주지 않아(카드는 textarea
// 나열, 사진은 경로 텍스트 입력 나열) "3번 사진이 어느 문단 옆에 나오는지"를 알 수
// 없었다. 여기서는 실제 페이지와 같은 배치(네이비 라벨 박스 + 사진/문단 좌우 교대)를
// 그대로 그리고, 카드 이동·삭제 시 짝지어진 사진도 함께 움직인다.
//
// 사진 값의 자리표시자 규칙: "가운데 카드만 사진 없음"은 images 의 그 자리에 빈
// 문자열을 남겨 표현한다(사이트는 falsy 값에 팀명 데코 블록을 그린다). 꼬리의 빈
// 값은 저장 시 clubs 리소스의 fromForm 이 잘라 낸다 — 여기서도 방출 전에 자른다.
//
// 상태 설계: 마크다운 doc 는 내부 state 로 보관하고 외부 변경(원문 탭 수정·재로드)
// 일 때만 재초기화한다(옛 카드 편집기의 커서 튐 방지 패턴 그대로). 사진 배열은
// 폼(RecordForm)의 images 필드가 원본이라 로컬 사본 없이 props 로 오간다.
// 업로드만 즉시 스토리지로 나가고(히어로 편집기와 같은 통로), 저장은 폼의
// '저장 (커밋)' 버튼 한 번이 JSON·마크다운 두 행을 순서대로 커밋한다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CLUB_LINK_LABELS,
  emptyClubCard,
  parseClubDoc,
  serializeClubDoc,
  type ClubDoc,
  type ClubEditLink,
} from '@/lib/admin/club-content';

// RecordForm 의 fieldClass 계열 (링크 입력 테두리·포커스 스타일)
const fieldClass =
  'w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue';

/** 업로드 규격 — 사이트 표시 폭(~45vw)에 맞는 기본 압축(1600px)이면 충분하다 */
const UPLOAD_FOLDER = 'club-photos';
const UPLOAD_LIMIT_MB = 5;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

// 문단 textarea 행 수: ceil(길이/55), 4~18 로 클램프 — 사이트 본문처럼 넉넉하게
function bodyRows(text: string): number {
  return clamp(Math.ceil(text.length / 55), 4, 18);
}

/** 네이비 라벨 박스 input 폭(ch) — 한글·전각은 2ch 로 셈해 글자에 딱 붙는 폭을 만든다 */
function labelChWidth(text: string): string {
  let units = 0;
  for (const ch of text) units += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
  return `${clamp(units + 3, 8, 34)}ch`;
}

/** 꼬리의 빈 사진 자리만 잘라 낸다 — 가운데 자리표시자('')는 짝 유지를 위해 보존 */
function trimTail(arr: string[]): string[] {
  const next = arr.slice();
  while (next.length > 0 && next[next.length - 1].trim() === '') next.pop();
  return next;
}

function padded(arr: string[], len: number): string[] {
  const next = arr.slice();
  while (next.length < len) next.push('');
  return next;
}

export interface ClubFeedEditorProps {
  /** 연결 마크다운 원문 (카드·링크의 저장 형식) */
  value: string;
  onChange: (v: string) => void;
  /** 폼의 images 필드 — 카드 i번과 images[i] 가 사이트에서 짝이 된다 */
  images: string[];
  onImagesChange: (next: string[]) => void;
  /** 소개 카드 라벨·사진 없는 카드의 데코 타이포에 쓰는 동아리명 */
  clubName: string;
  busy?: boolean;
  /** 사진 업로드 — 즉시 올리고 저장할 공개 URL 을 돌려준다 (RecordForm 과 같은 통로) */
  onUploadImage?: (file: File, opts?: { maxDim?: number; folder?: string }) => Promise<string>;
}

export function ClubFeedEditor({
  value,
  onChange,
  images,
  onImagesChange,
  clubName,
  busy = false,
  onUploadImage,
}: ClubFeedEditorProps) {
  const [doc, setDoc] = useState<ClubDoc>(() => parseClubDoc(value));
  // 소개 카드(맨 위, 라벨 없음)가 있는지 — "지금 제목이 빈 카드"와는 다른 판별이다.
  // 제목 텍스트로 판별하면 팀 카드 제목을 지우고 다시 쓰는 순간(값이 잠깐 '')
  // 입력창이 소개 라벨로 바뀌어 포커스를 잃는다. 그래서 구조(파싱·추가 시점)로만
  // 정하고, 타이핑 중에는 바뀌지 않게 한다.
  const [hasIntro, setHasIntro] = useState(() => parseClubDoc(value).cards[0]?.heading === '');
  // 마지막으로 우리가 방출한 직렬화 결과 — 외부 변경(원문 탭 수정·재로드) 감지용
  const lastEmitted = useRef<string>(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      const parsed = parseClubDoc(value);
      setDoc(parsed);
      setHasIntro(parsed.cards[0]?.heading === '');
    }
  }, [value]);

  function commitDoc(next: ClubDoc) {
    setDoc(next);
    const out = serializeClubDoc(next);
    lastEmitted.current = out;
    onChange(out);
  }

  // ---- 업로드 (카드 한 장씩 — 두 카드를 동시에 올릴 일은 없다) ----

  const [pending, setPending] = useState<{ index: number; name: string } | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string | undefined>>({});
  // 업로드 직후 같은 경로 이미지를 새로 받기 위한 캐시버스터 (히어로 편집기와 동일)
  const [bust, setBust] = useState(0);

  async function upload(index: number, file: File) {
    setUploadErrors((e) => ({ ...e, [index]: undefined }));
    if (!onUploadImage) {
      setUploadErrors((e) => ({ ...e, [index]: '업로드를 사용할 수 없습니다.' }));
      return;
    }
    if (file.size > UPLOAD_LIMIT_MB * 1024 * 1024) {
      setUploadErrors((e) => ({ ...e, [index]: `${UPLOAD_LIMIT_MB}MB 이하 이미지만 올릴 수 있습니다.` }));
      return;
    }
    setPending({ index, name: file.name });
    try {
      const url = await onUploadImage(file, { folder: UPLOAD_FOLDER });
      // 값은 폼 상태에 쌓인다 — '저장 (커밋)' 전까지 사이트는 아직 옛 사진이다
      const next = padded(images, index + 1);
      next[index] = url;
      onImagesChange(trimTail(next));
      setBust((b) => b + 1);
    } catch (err) {
      setUploadErrors((e) => ({
        ...e,
        [index]: err instanceof Error ? err.message : '업로드에 실패했습니다.',
      }));
    } finally {
      setPending(null);
    }
  }

  function clearImage(index: number) {
    if (index >= images.length) return;
    const next = images.slice();
    next[index] = '';
    onImagesChange(trimTail(next));
  }

  // ---- 카드 조작 (사진 짝 동반) ----

  // 이동 가능한 카드(팀 카드)의 원본 인덱스 목록 — 소개 카드(0번)는 맨 위 고정
  const movable = doc.cards.map((_, i) => i).filter((i) => !(hasIntro && i === 0));

  function updateCard(index: number, patch: Partial<{ heading: string; body: string }>) {
    const cards = doc.cards.slice();
    cards[index] = { ...cards[index], ...patch };
    commitDoc({ ...doc, cards });
  }

  function addIntro() {
    // 소개 카드는 항상 맨 앞 — 뒤 카드들의 사진 짝이 밀리지 않게 빈 자리를 함께 끼운다
    commitDoc({ ...doc, cards: [{ heading: '', body: '' }, ...doc.cards] });
    setHasIntro(true);
    onImagesChange(trimTail(['', ...images]));
  }

  function addCard() {
    commitDoc({ ...doc, cards: [...doc.cards, emptyClubCard()] });
  }

  function deleteCard(index: number) {
    const title = doc.cards[index].heading.trim() || '이 카드';
    const hasPhoto = (images[index] ?? '').trim() !== '';
    const msg = hasPhoto
      ? `"${title}" 카드를 삭제할까요? 짝지어진 사진도 함께 빠집니다.`
      : `"${title}" 카드를 삭제할까요?`;
    if (!window.confirm(msg)) return;
    commitDoc({ ...doc, cards: doc.cards.filter((_, i) => i !== index) });
    if (index < images.length) {
      const next = images.slice();
      next.splice(index, 1);
      onImagesChange(trimTail(next));
    }
  }

  // 라벨 카드끼리만 자리를 맞바꾼다. pos 는 movable 상의 위치, dir 은 -1(위)/1(아래).
  function moveCard(pos: number, dir: -1 | 1) {
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= movable.length) return;
    const a = movable[pos];
    const b = movable[targetPos];
    const cards = doc.cards.slice();
    [cards[a], cards[b]] = [cards[b], cards[a]];
    commitDoc({ ...doc, cards });
    // 사진도 함께 — 어느 한쪽에 사진이 없어도 빈 자리로 셈해 짝이 흐트러지지 않는다
    const imgs = padded(images, Math.max(a, b) + 1);
    [imgs[a], imgs[b]] = [imgs[b], imgs[a]];
    onImagesChange(trimTail(imgs));
  }

  // roboin 특례 — 라벨 카드 없이 본문이 길면(빈 줄 제외 4줄 이상) 사이트가 절반으로
  // 나눠 두 패널로 표시한다(pages.ts parseClubContent). 여기 미리보기(카드 1개)와
  // 실제가 달라지는 유일한 경우라, 명시적으로 카드를 나누도록 안내한다.
  const autoSplit =
    doc.cards.length === 1 &&
    doc.cards[0].heading === '' &&
    doc.cards[0].body.split('\n').filter((l) => l.trim() !== '').length >= 4;

  // 사이트가 실제로 그리는 패널 수 — 자동 분할이 걸리면 카드 1개라도 두 패널이 되고
  // 사진도 두 장 쓰인다. '남는 사진' 판정은 카드 수가 아니라 이 값을 기준으로 해야
  // 실제로 쓰이는 사진을 "표시되지 않는다"고 잘못 안내하지 않는다.
  const sitePanelCount = autoSplit ? 2 : doc.cards.length;

  // ---- 짝 없는 사진 (사이트 패널 수보다 사진이 많을 때) ----

  const extras = images
    .map((src, i) => ({ src, i }))
    .filter(({ src, i }) => i >= sitePanelCount && src.trim() !== '');

  function makeCardFromExtra(imageIndex: number) {
    // 사진을 새 카드 자리(cards.length)로 끌어오고 카드를 덧붙인다 → 짝이 맞는다
    const next = images.slice();
    const [img] = next.splice(imageIndex, 1);
    next.splice(doc.cards.length, 0, img);
    onImagesChange(trimTail(next));
    commitDoc({ ...doc, cards: [...doc.cards, emptyClubCard()] });
  }

  function removeExtra(imageIndex: number) {
    if (!window.confirm('이 사진을 목록에서 뺄까요?')) return;
    const next = images.slice();
    next.splice(imageIndex, 1);
    onImagesChange(trimTail(next));
  }

  // ---- SNS·외부 링크 ----

  function setLink(i: number, patch: Partial<ClubEditLink>) {
    const links = doc.links.slice();
    links[i] = { ...links[i], ...patch };
    commitDoc({ ...doc, links });
  }

  function addLink() {
    commitDoc({ ...doc, links: [...doc.links, { label: CLUB_LINK_LABELS[0], value: '' }] });
  }

  function removeLink(i: number) {
    commitDoc({ ...doc, links: doc.links.filter((_, idx) => idx !== i) });
  }

  const disabled = busy;

  return (
    <div className="space-y-8">
      <p className="text-xs text-content-faint">
        실제 페이지와 같은 배치입니다 — 사진 한 장에 설명 한 문단이 기본 리듬이고, 홀수 카드는
        사진이 왼쪽, 짝수 카드는 오른쪽에 놓입니다. 사진을 빼면 그 자리에 팀명 데코 블록이
        표시됩니다.
      </p>

      {autoSplit && (
        <p className="border border-yonsei-blue/30 bg-yonsei-blue/[0.05] px-3.5 py-2.5 text-xs leading-relaxed text-content-soft">
          팀 카드가 없어서 사이트가 소개 문단을 절반으로 나눠 두 카드(사진 두 장)로 자동 표시하고
          있습니다. 아래 미리보기와 실제 표시가 다를 수 있으니, 문단을 나눠 카드를 직접 만들면
          보이는 그대로 게시됩니다.
        </p>
      )}

      {/* 피드 — 카드 순서가 곧 페이지의 섹션 순서다 */}
      {doc.cards.length > 0 ? (
        <ul className="space-y-8">
          {doc.cards.map((card, index) => {
            const isIntro = hasIntro && index === 0;
            const pos = movable.indexOf(index);
            const imageFirst = index % 2 === 0;
            const src = (images[index] ?? '').trim();
            const heading = isIntro ? clubName || '소개' : card.heading;
            const emptyHeading = !isIntro && card.heading.trim() === '';
            return (
              <li key={index} className="border border-surface-border bg-surface">
                {/* 조작줄 — 편집 크롬은 이 한 줄에 모으고, 아래는 페이지 미리보기 그대로 */}
                <div className="flex items-center gap-2 border-b border-surface-border bg-surface-soft px-3 py-1.5 text-[11px] text-content-faint">
                  <span className="font-bold tabular-nums">{index + 1}번 카드</span>
                  {isIntro ? (
                    <span>소개 · 맨 위 고정</span>
                  ) : (
                    <span className="inline-flex items-center">
                      <button
                        type="button"
                        aria-label={`${index + 1}번 카드 위로`}
                        onClick={() => moveCard(pos, -1)}
                        disabled={disabled || pos <= 0}
                        className="px-1 py-0.5 text-[11px] text-content-faint transition-colors hover:text-yonsei-blue disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label={`${index + 1}번 카드 아래로`}
                        onClick={() => moveCard(pos, 1)}
                        disabled={disabled || pos === movable.length - 1}
                        className="px-1 py-0.5 text-[11px] text-content-faint transition-colors hover:text-yonsei-blue disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </span>
                  )}
                  {!isIntro && (
                    <button
                      type="button"
                      onClick={() => deleteCard(index)}
                      disabled={disabled}
                      className="ml-auto font-semibold text-[#b42318] transition-colors hover:underline disabled:opacity-40"
                    >
                      삭제
                    </button>
                  )}
                </div>

                <div className="px-4 py-5 sm:px-5">
                  {/* 섹션 헤더 — 사이트와 동일: 네이비 박스 + 반대편으로 뻗는 헤어라인.
                      사진이 왼쪽인 카드는 박스도 왼쪽(페이지 리듬 그대로). */}
                  <div className={cn('flex items-center gap-4', !imageFirst && 'flex-row-reverse')}>
                    {isIntro ? (
                      <span className="inline-block shrink-0 bg-yonsei-navy px-4 py-2 text-base font-bold tracking-tight text-white">
                        {heading}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={card.heading}
                        onChange={(e) => updateCard(index, { heading: e.target.value })}
                        disabled={disabled}
                        placeholder="팀명"
                        aria-label={`${index + 1}번 카드 제목`}
                        style={{ width: labelChWidth(card.heading || '팀명') }}
                        className={cn(
                          'shrink-0 bg-yonsei-navy px-4 py-2 text-base font-bold tracking-tight text-white outline-none transition-colors placeholder:text-white/40',
                          'focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-yonsei-blue',
                          emptyHeading && 'outline outline-2 outline-offset-2 outline-[#b42318]',
                        )}
                      />
                    )}
                    <span aria-hidden="true" className="h-px flex-1 bg-surface-border" />
                  </div>
                  {emptyHeading && (
                    <p className="mt-2 text-xs font-semibold text-[#b42318]">
                      제목이 비어 있습니다 — 이대로 저장하면 앞 카드에 합쳐집니다.
                    </p>
                  )}

                  {/* 사진 | 문단 — 사이트와 같은 열 비율(0.85 : 1.15)·좌우 교대 */}
                  <div
                    className={cn(
                      'mt-5 grid items-center gap-5 md:gap-8',
                      imageFirst
                        ? 'md:grid-cols-[0.85fr_1.15fr]'
                        : 'md:grid-cols-[1.15fr_0.85fr]',
                    )}
                  >
                    <div className={cn('min-w-0', imageFirst ? 'md:order-1' : 'md:order-2')}>
                      <FeedPhoto
                        src={src}
                        decoLabel={heading}
                        bust={bust}
                        ariaLabel={`${index + 1}번 카드 사진`}
                        disabled={disabled || !onUploadImage}
                        uploading={pending?.index === index}
                        uploadName={pending?.index === index ? pending.name : ''}
                        error={uploadErrors[index]}
                        onFile={(f) => void upload(index, f)}
                        onClear={src !== '' ? () => clearImage(index) : undefined}
                      />
                    </div>
                    <div className={cn('min-w-0', imageFirst ? 'md:order-2' : 'md:order-1')}>
                      <textarea
                        rows={bodyRows(card.body)}
                        value={card.body}
                        onChange={(e) => updateCard(index, { body: e.target.value })}
                        disabled={disabled}
                        placeholder="이 사진에 대한 설명 한 문단을 적어 주세요."
                        aria-label={`${index + 1}번 카드 설명`}
                        className="w-full resize-none border border-dashed border-transparent bg-transparent px-3 py-2 text-[15px] leading-[1.85] text-content outline-none transition-colors placeholder:text-content-faint hover:border-surface-border focus:border-solid focus:border-yonsei-blue"
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-content-soft">아직 카드가 없습니다 — 아래에서 추가하세요.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!hasIntro && (
          <button type="button" onClick={addIntro} disabled={disabled} className="cms-btn cms-btn-sm">
            ＋ 소개 문단 추가
          </button>
        )}
        <button type="button" onClick={addCard} disabled={disabled} className="cms-btn cms-btn-sm">
          ＋ 카드 추가 (사진 + 문단)
        </button>
      </div>

      {/* 짝 없는 사진 — 카드보다 사진이 많으면 사이트에 표시되지 않는다 */}
      {extras.length > 0 && (
        <fieldset className="rounded-lg border border-surface-border p-4">
          <legend className="px-1 text-sm font-semibold text-content">남는 사진</legend>
          <p className="mb-3 text-xs text-content-faint">
            카드보다 사진이 많습니다 — 아래 사진은 지금 사이트에 표시되지 않습니다. 카드를 만들어
            짝을 지어 주거나 목록에서 빼세요.
          </p>
          <ul className="flex flex-wrap gap-4">
            {extras.map(({ src, i }) => (
              <li key={i} className="w-44">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="aspect-[4/3] w-full border border-surface-border object-cover"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => makeCardFromExtra(i)}
                    disabled={disabled}
                    className="cms-btn cms-btn-sm"
                  >
                    카드 만들기
                  </button>
                  <button
                    type="button"
                    onClick={() => removeExtra(i)}
                    disabled={disabled}
                    className="text-xs font-semibold text-[#b42318] transition-colors hover:underline disabled:opacity-40"
                  >
                    빼기
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {/* SNS·외부 링크 — 페이지 맨 아래 Connect 블록에 표시된다 */}
      <fieldset className="rounded-lg border border-surface-border p-4">
        <legend className="px-1 text-sm font-semibold text-content">SNS·외부 링크</legend>
        <p className="mb-3 text-xs text-content-faint">
          페이지 맨 아래 &ldquo;SNS로 보는 {clubName || '동아리'}&rdquo; 블록에 카드로 표시됩니다.
        </p>
        <div className="space-y-3">
          {doc.links.length === 0 && <p className="text-xs text-content-faint">링크가 없습니다.</p>}
          {doc.links.map((link, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <select
                aria-label={`${i + 1}번 링크 종류`}
                value={link.label}
                onChange={(e) => setLink(i, { label: e.target.value })}
                disabled={disabled}
                className="rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
              >
                {CLUB_LINK_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label={`${i + 1}번 링크 주소`}
                value={link.value}
                onChange={(e) => setLink(i, { value: e.target.value })}
                disabled={disabled}
                placeholder="@handle 또는 URL"
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => removeLink(i)}
                disabled={disabled}
                aria-label={`${i + 1}번 링크 삭제`}
                className="btn-secondary px-3 py-2 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLink}
          disabled={disabled}
          className="btn-secondary mt-3 px-4 py-2 text-xs"
        >
          링크 추가
        </button>
      </fieldset>

      <p className="text-xs text-content-faint">
        저장하면 사이트에 쓰이지 않는 이미지 태그·서식이 정리됩니다. 표시는 동일합니다.
      </p>
    </div>
  );
}

/** 사진 한 칸 — 사이트 프레임 그대로 미리보고, 그 아래에서 교체·빼기를 끝낸다.
 *  사진이 없으면 사이트가 대신 그리는 팀명 데코 블록을 그대로 보여 준다. */
function FeedPhoto({
  src,
  decoLabel,
  bust,
  ariaLabel,
  disabled,
  uploading,
  uploadName,
  error,
  onFile,
  onClear,
}: {
  src: string;
  decoLabel: string;
  bust: number;
  ariaLabel: string;
  disabled: boolean;
  uploading: boolean;
  uploadName: string;
  error?: string;
  onFile: (file: File) => void;
  /** 사진이 있을 때만 온다 — 빼면 자리표시자('')가 남아 데코 블록으로 표시된다 */
  onClear?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const has = src !== '';

  return (
    <div className="min-w-0">
      <div
        className={cn(
          'relative aspect-[4/3] w-full overflow-hidden border transition-colors duration-200 ease-out-expo',
          dragOver ? 'border-yonsei-blue' : 'border-surface-border',
          !has && 'anim-gradient',
        )}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith('image/')) onFile(f);
        }}
      >
        {has ? (
          // 관리자 화면이라 최적화보다 즉시 반영이 중요 — next/image 대신 일반 img.
          // 값이 사이트 내부 경로(/img/club-photos/…)든 업로드 결과 절대 URL 이든 그대로 뜬다.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${src}${bust ? `?v=${bust}` : ''}`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          // 사이트의 PanelDeco 와 같은 모습 — "사진이 없으면 이렇게 나갑니다"
          <span className="flex h-full w-full items-center justify-center p-6">
            <span className="text-center text-2xl font-bold leading-tight tracking-tight text-white/90">
              {decoLabel}
            </span>
          </span>
        )}

        {!has && !uploading && (
          <span className="absolute inset-x-0 bottom-0 flex justify-center pb-2.5">
            <span className="bg-white/85 px-2 py-1 text-[11px] font-semibold text-content-soft">
              사진 없음 — 팀명 데코로 표시됩니다
            </span>
          </span>
        )}

        {/* 업로드 중 오버레이 — 진행률을 알 수 없는 API 라 불확정 막대를 쓴다 */}
        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-white/90 px-5">
            <span className="text-xs font-bold text-yonsei-navy">사진 업로드 중…</span>
            <span className="block h-1 w-full max-w-[180px] bg-surface-border">
              <span className="block h-full w-1/3 animate-pulse bg-yonsei-blue" />
            </span>
            <span className="w-full truncate text-center text-[10px] text-content-faint">
              {uploadName}
            </span>
          </div>
        )}
      </div>

      {/* 미리보기 바로 아래에서 교체를 끝낸다 — 누르면 파일 선택 대화상자가 열린다 */}
      <div className="mt-2 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          aria-label={`${ariaLabel} ${has ? '교체' : '추가'}`}
          title="사진 파일을 고르거나 미리보기 위에 끌어다 놓으세요"
          className="cms-btn cms-btn-sm"
        >
          {has ? '사진 교체' : '사진 추가'}
        </button>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled || uploading}
            className="text-xs font-semibold text-content-soft transition-colors hover:text-[#b42318] disabled:opacity-40"
          >
            사진 빼기
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-[#b42318]">
          {error}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // 같은 파일을 다시 고를 수 있게 값을 비운다
          e.target.value = '';
        }}
      />
    </div>
  );
}
