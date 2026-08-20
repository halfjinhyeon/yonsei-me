// 연혁 타임라인 연대별 사진 — 연대(10년) → 사진 URL 맵.
//
// ⚠️ 2026-08 전까지는 public/img/history/<연도 4자리>.{jpg,png,webp} 를 **폴더 스캔**해
// 연대에 붙였다(교수 사진과 같은 "파일명 규약 매칭"). CMS 로 옮기면서 걷어냈다 —
// 관리자가 브라우저에서 저장소에 파일을 넣을 방법이 없어, 규약이 아무리 단순해도
// 콘솔에서는 손댈 수 없는 데이터였기 때문이다. 이제 원본은 content/history-images.json
// 한 곳이고, 읽기는 다른 콘텐츠와 같은 데이터 레이어(lib/content-runtime.ts 의
// getHistoryImagesRuntime)를 탄다(dev=로컬 파일, prod=DB, CONTENT_SOURCE=git 폴백).
//
// 이 모듈에 남는 것은 (1) 빌드 시점 폴백 스냅샷과 (2) 원본 → 소비 형태 어댑터뿐이다.
// content-runtime 이 이 둘을 가져다 쓴다(faculty.ts 의 어댑터와 같은 구조 —
// 여기서 content-runtime 을 import 하면 순환이 된다).

import historyImagesJson from '@content/history-images.json';

/**
 * 원본(연대 문자열 키) → 소비 형태(연대 숫자 키). HistoryTimeline 이 연대를 숫자로
 * 계산(Math.floor(year/10)*10)해 찾으므로 키 타입을 맞춰 준다. 숫자가 아닌 키와 빈
 * 값은 버린다 — 손으로 고칠 수 있는 파일이라 깨진 한 줄이 페이지를 죽이면 안 된다.
 */
export function adaptHistoryImages(raw: Record<string, string>): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [decade, url] of Object.entries(raw)) {
    const n = Number(decade);
    if (!Number.isFinite(n) || typeof url !== 'string' || url.trim() === '') continue;
    out[n] = url;
  }
  return out;
}

/** 빌드 시점 스냅샷(git 소스·DB 폴백). 평상시 소비처는 getHistoryImagesRuntime 을 쓴다 */
export function getHistoryImages(): Record<number, string> {
  return adaptHistoryImages(historyImagesJson as Record<string, string>);
}
