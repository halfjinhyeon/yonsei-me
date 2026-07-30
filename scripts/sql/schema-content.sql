-- 연세 ME 사이트 콘텐츠 파일 스키마 (백엔드 전환 Stage A)
-- 적용 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run
-- (재실행 안전: if not exists / or replace 사용)
--
-- 게시판(schema.sql 의 posts)과 달리 여기엔 "파일 원문"을 그대로 담는다. CMS 가
-- 편집하는 content/*.json · content/pages/*.md 는 이미 파일 단위로 직렬화 규칙이
-- 확립돼 있어(관리자 콘솔의 resources.ts 스키마 = 파일 모양), 컬럼으로 쪼개면
-- 리소스마다 테이블이 하나씩 생긴다. 대신 경로를 키로 원문을 저장해
-- "Git 커밋 → row update" 만 바꾸고 직렬화·파싱 계층은 손대지 않는다.

-- ── content_files: CMS 대상 콘텐츠 파일 원문 ───────────────────────────
-- path 목록의 단일 소스는 src/lib/admin/managed-content.ts (쓰기 API allowlist).
create table if not exists content_files (
  path       text primary key,          -- 저장소 루트 기준 경로 ('content/staff.json')
  body       text not null,             -- 파일 원문 그대로 (JSON이든 md든 — 바이트 보존)
  version    bigint not null default 1, -- 낙관적 동시성 (커밋 sha 대체)
  updated_at timestamptz not null default now()
);

-- ── updated_at 자동 갱신 ──────────────────────────────────────────────
-- schema.sql 과 같은 함수를 공유한다(본문 동일 — 어느 파일을 먼저 실행해도 무방).
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists content_files_set_updated_at on content_files;
create trigger content_files_set_updated_at
  before update on content_files
  for each row execute function set_updated_at();

-- ── RLS: 공개 읽기, 쓰기는 service role 전용 ───────────────────────────
-- (service role 키는 RLS 를 우회하므로 별도 쓰기 정책이 필요 없다.
--  anon 키는 클라이언트에 배포하지 않지만, 정책은 방어선으로 둔다.)
alter table content_files enable row level security;

drop policy if exists "public read content files" on content_files;
create policy "public read content files"
  on content_files for select
  using (true);
