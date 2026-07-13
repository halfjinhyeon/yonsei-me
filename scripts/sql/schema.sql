-- 연세 ME 사이트 게시판 스키마 (백엔드 전환 Phase 2)
-- 적용 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run
-- (재실행 안전: if not exists / or replace 사용)

-- ── posts: 게시판 10종 통합 테이블 ─────────────────────────────────────
-- board 값은 기존 코드의 BoardKey 그대로:
--   noticesUndergrad | noticesGraduate | news | seminars | events |
--   thesis | resources | career | alumniNews | alumniEvents
create table if not exists posts (
  id            bigint generated always as identity primary key,
  board         text not null,
  slug          text unique,              -- 뉴스형만 사용(기존 URL 보존), 게시판형은 null
  title_ko      text not null,
  title_en      text,
  body_html_ko  text not null default '', -- 에디터 산출 HTML(서버에서 정화 후 저장)
  body_html_en  text,
  excerpt_ko    text,
  excerpt_en    text,
  category      text,                     -- 뉴스: notice | seminar | achievement
  host_ko       text,                     -- 세미나형: 연사/주최
  host_en       text,
  date_label_ko text,                     -- 행사형: 표시용 일정 라벨
  date_label_en text,
  is_event      boolean not null default false,
  event_date    date,                     -- 캘린더용(있으면)
  thumbnail_url text,
  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists posts_board_created_idx on posts (board, created_at desc);
create index if not exists posts_published_idx on posts (published);

-- ── attachments: 첨부 메타 (실체는 R2, 여기엔 URL 만) ──────────────────
create table if not exists attachments (
  id       bigint generated always as identity primary key,
  post_id  bigint not null references posts (id) on delete cascade,
  label_ko text,
  label_en text,
  url      text not null,
  sort     int not null default 0
);

create index if not exists attachments_post_idx on attachments (post_id);

-- ── updated_at 자동 갱신 ──────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists posts_set_updated_at on posts;
create trigger posts_set_updated_at
  before update on posts
  for each row execute function set_updated_at();

-- ── RLS: 공개 읽기는 published 만, 쓰기는 service role 전용 ────────────
-- (service role 키는 RLS 를 우회하므로 별도 쓰기 정책이 필요 없다.
--  anon 키는 클라이언트에 배포하지 않지만, 정책은 방어선으로 둔다.)
alter table posts enable row level security;
alter table attachments enable row level security;

drop policy if exists "public read published posts" on posts;
create policy "public read published posts"
  on posts for select
  using (published);

drop policy if exists "public read attachments of published posts" on attachments;
create policy "public read attachments of published posts"
  on attachments for select
  using (exists (select 1 from posts p where p.id = post_id and p.published));
