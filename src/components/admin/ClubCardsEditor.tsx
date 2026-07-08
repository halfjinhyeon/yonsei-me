'use client';

// 동아리 "카드 편집" 모드 — 소개 카드뉴스를 카드(패널)·SNS 링크 단위로 편집한다.
// (동아리 상세 페이지 카드뉴스처럼 카드 위주 문서를 팀별로 다루기 위한 기능.)
//
// 상태 설계: value 를 매 렌더 파싱하는 파생 방식은 커서 튐을 유발한다
// (serializeClubDoc 가 제목·본문을 trim 하므로, 끝 공백 입력 시 값이 되돌아옴).
// 따라서 doc 를 내부 state 로 보관하고, 외부 변경(원문 탭 수정·재로드)일 때만
// 재초기화한다. 표시 값은 doc 의 원시 문자열(트림 전)이라 타이핑이 강제 정리되지 않는다.
// (한국어 UI 문자열은 내부 운영 도구라 컴포넌트에 직접 둔다.)

import { useEffect, useRef, useState } from 'react';
import {
  CLUB_LINK_LABELS,
  emptyClubCard,
  parseClubDoc,
  serializeClubDoc,
  type ClubCard,
  type ClubDoc,
  type ClubEditLink,
} from '@/lib/admin/club-content';

// RecordForm 의 fieldClass 계열 (입력 테두리·포커스 스타일)
const fieldClass =
  'w-full rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

// 카드 본문 textarea 행 수: ceil(길이/60), 3~16 으로 클램프
function bodyRows(text: string): number {
  return clamp(Math.ceil(text.length / 60), 3, 16);
}

export function ClubCardsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [doc, setDoc] = useState<ClubDoc>(() => parseClubDoc(value));
  // 마지막으로 우리가 방출한 직렬화 결과 — 외부 변경 감지용
  const lastEmitted = useRef<string>(value);

  // 외부에서 value 가 바뀐 경우(원문 탭 수정·재로드)에만 재초기화한다.
  // 우리가 방출한 값이면(value === lastEmitted) 무시해 커서 튐을 막는다.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setDoc(parseClubDoc(value));
    }
  }, [value]);

  // 불변 갱신 → 직렬화 → 방출
  function commit(next: ClubDoc) {
    setDoc(next);
    const out = serializeClubDoc(next);
    lastEmitted.current = out;
    onChange(out);
  }

  // 특정 인덱스의 카드를 교체
  function updateCard(index: number, card: ClubCard) {
    const next = doc.cards.slice();
    next[index] = card;
    commit({ ...doc, cards: next });
  }

  // ---- 소개 카드(heading === '') ----

  // 인트로 카드의 cards 배열 인덱스 (없으면 -1)
  const introIndex = doc.cards.findIndex((c) => c.heading === '');

  function addIntroCard() {
    // 소개 카드는 항상 맨 앞
    commit({ ...doc, cards: [{ heading: '', body: '' }, ...doc.cards] });
  }

  function setIntroBody(index: number, body: string) {
    updateCard(index, { heading: '', body });
  }

  // ---- 라벨 카드(heading !== '') ----

  // 라벨 카드들의 원본 인덱스 목록 (순서 유지)
  const labelIndices = doc.cards
    .map((c, i) => (c.heading !== '' ? i : -1))
    .filter((i) => i >= 0);

  function setCardHeading(index: number, heading: string) {
    updateCard(index, { ...doc.cards[index], heading });
  }

  function setCardBody(index: number, body: string) {
    updateCard(index, { ...doc.cards[index], body });
  }

  function addCard() {
    commit({ ...doc, cards: [...doc.cards, emptyClubCard()] });
  }

  function deleteCard(index: number) {
    const title = doc.cards[index].heading.trim() || '이 카드';
    if (!window.confirm(`"${title}" 카드를 삭제할까요?`)) return;
    const next = doc.cards.filter((_, i) => i !== index);
    commit({ ...doc, cards: next });
  }

  // 라벨 카드끼리만 자리를 맞바꾼다 (소개 카드는 넘지 않음).
  // pos 는 labelIndices 상의 위치, dir 은 -1(위)/1(아래).
  function moveCard(pos: number, dir: -1 | 1) {
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= labelIndices.length) return;
    const a = labelIndices[pos];
    const b = labelIndices[targetPos];
    const next = doc.cards.slice();
    [next[a], next[b]] = [next[b], next[a]];
    commit({ ...doc, cards: next });
  }

  // ---- SNS·외부 링크 ----

  function setLinkLabel(i: number, label: string) {
    const links = doc.links.slice();
    links[i] = { ...links[i], label };
    commit({ ...doc, links });
  }

  function setLinkValue(i: number, value2: string) {
    const links = doc.links.slice();
    links[i] = { ...links[i], value: value2 };
    commit({ ...doc, links });
  }

  function addLink() {
    const link: ClubEditLink = { label: CLUB_LINK_LABELS[0], value: '' };
    commit({ ...doc, links: [...doc.links, link] });
  }

  function removeLink(i: number) {
    const links = doc.links.filter((_, idx) => idx !== i);
    commit({ ...doc, links });
  }

  return (
    <div className="space-y-6">
      {/* 소개 카드 (라벨 없는 첫 패널) — 항상 맨 위 고정, 이동·삭제 없음 */}
      {introIndex >= 0 ? (
        <fieldset className="rounded-lg border border-surface-border p-4">
          <legend className="px-1 text-sm font-semibold text-content">소개 카드</legend>
          <textarea
            aria-label="소개 카드 본문"
            rows={bodyRows(doc.cards[introIndex].body)}
            value={doc.cards[introIndex].body}
            onChange={(e) => setIntroBody(introIndex, e.target.value)}
            className={fieldClass}
          />
        </fieldset>
      ) : (
        <button type="button" onClick={addIntroCard} className="btn-secondary px-4 py-2 text-sm">
          ＋ 소개 카드 추가
        </button>
      )}

      {/* 라벨 카드 목록 (원래 순서 유지) */}
      {labelIndices.map((cardIndex, pos) => {
        const card = doc.cards[cardIndex];
        const empty = card.heading.trim() === '';
        return (
          <fieldset key={cardIndex} className="rounded-lg border border-surface-border p-4">
            <div className="flex items-start justify-between gap-3">
              <legend className="px-1 text-sm font-semibold text-content">카드</legend>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveCard(pos, -1)}
                  disabled={pos === 0}
                  aria-label={`${pos + 1}번 카드 위로`}
                  className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveCard(pos, 1)}
                  disabled={pos === labelIndices.length - 1}
                  aria-label={`${pos + 1}번 카드 아래로`}
                  className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => deleteCard(cardIndex)}
                  aria-label={`${pos + 1}번 카드 삭제`}
                  className="btn-secondary px-2 py-1 text-xs text-red-600 hover:border-red-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                aria-label={`${pos + 1}번 카드 제목`}
                value={card.heading}
                onChange={(e) => setCardHeading(cardIndex, e.target.value)}
                placeholder="카드 제목(팀명)"
                className={`${fieldClass} font-semibold`}
              />
              {empty && (
                <p className="text-xs text-red-600">
                  제목을 비우면 앞 카드에 합쳐집니다.
                </p>
              )}
              <textarea
                aria-label={`${pos + 1}번 카드 본문`}
                rows={bodyRows(card.body)}
                value={card.body}
                onChange={(e) => setCardBody(cardIndex, e.target.value)}
                className={fieldClass}
              />
            </div>
          </fieldset>
        );
      })}

      <button type="button" onClick={addCard} className="btn-secondary px-4 py-2 text-sm">
        ＋ 카드 추가
      </button>

      {/* SNS·외부 링크 */}
      <fieldset className="rounded-lg border border-surface-border p-4">
        <legend className="px-1 text-sm font-semibold text-content">SNS·외부 링크</legend>
        <div className="space-y-3">
          {doc.links.length === 0 && (
            <p className="text-xs text-content-faint">링크가 없습니다.</p>
          )}
          {doc.links.map((link, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <select
                aria-label={`${i + 1}번 링크 종류`}
                value={link.label}
                onChange={(e) => setLinkLabel(i, e.target.value)}
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
                onChange={(e) => setLinkValue(i, e.target.value)}
                placeholder="@handle 또는 URL"
                className="rounded-lg border border-surface-border bg-surface-soft px-3 py-2 text-sm text-content outline-none focus:border-yonsei-blue"
              />
              <button
                type="button"
                onClick={() => removeLink(i)}
                aria-label={`${i + 1}번 링크 삭제`}
                className="btn-secondary px-3 py-2 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLink} className="btn-secondary mt-3 px-4 py-2 text-xs">
          링크 추가
        </button>
      </fieldset>

      <p className="text-xs text-content-faint">
        카드 편집으로 저장하면 사이트에 쓰이지 않는 이미지 태그·서식이 정리됩니다. 카드 표시는
        동일합니다.
      </p>
    </div>
  );
}
