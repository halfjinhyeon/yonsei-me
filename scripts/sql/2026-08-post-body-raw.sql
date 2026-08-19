-- 게시물 "원문 모드" 플래그 — 본문 HTML 을 화이트리스트 정화 없이 저장한다.
-- 적용 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run (재실행 안전).
--
-- 배경: 구 사이트(Froala)는 사실상 무정화였고, 교수·관리자들이 아래아한글·워드에서
-- 꾸민 공지를 "붙여넣은 그대로" 올려 왔다. 우리 저장 경로는 화이트리스트 정화
-- (src/lib/admin/sanitize.ts 의 sanitizeEditorHtml)라 그 디자인이 일부 깎인다.
-- 이 컬럼이 true 인 글만 대신 scrubRawHtml(블랙리스트-라이트: 스크립트류만 제거)을
-- 탄다 — 사이트 소유자가 위험(정화 우회 가능성·레이아웃 충돌·게시물 내 접근성
-- 비보장·다크모드 미대응)을 명시적으로 수용한 관리자 전용 경로다.
--
-- 저장 시점에 이미 걸러 두므로 게시 화면(.prose-content) 렌더 경로는 그대로다.
-- 기본값 false = 기존 글·기존 동작 완전 무변경.

alter table posts add column if not exists body_raw boolean not null default false;

comment on column posts.body_raw is
  '원문 모드 — true 면 저장 시 화이트리스트 정화 대신 스크립트류만 제거(scrubRawHtml). 관리자가 명시적으로 켠 글에만 붙는다.';
