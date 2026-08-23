/** 게시물 본문의 설계 폭(px) — BoardShell 의 lg 콘텐츠 열 폭(1360 이상 화면에서 실측 1046).
 *  컨테이너 1360 − 좌우 패딩 1.25rem×2 = 1320, 거기서 우측 목차 218 + 간격 56(lg:gap-14)을 뺀 값.
 *  ⚠️ 컨테이너 패딩은 모든 폭에서 20px 이다 — tailwind.config 의 container.padding 에 sm/lg
 *  키가 있지만 container.screens 가 2xl 하나뿐이라 그 키들은 적용되지 않는다(실측으로 확인).
 *  ⚠️ BoardShell/Container/tailwind container 값을 바꾸면 여기도 함께 맞춘다 — 공개 화면과
 *  CMS 편집 캔버스(PostCanvas)가 이 숫자 하나로 줄바꿈을 맞춘다. */
export const POST_BODY_WIDTH = 1046;

/** 편집 캔버스 최소 축소 배율 — 이보다 더 줄여야 하면(좁은 태블릿·폰) 축소를 포기하고
 *  자연 줄바꿈으로 돌아간다. 16px 본문이 9.6px 아래로 내려가면 읽을 수 없다. */
export const POST_CANVAS_MIN_ZOOM = 0.6;
