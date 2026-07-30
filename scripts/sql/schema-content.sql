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

-- ── content_file_history: 덮이기 직전 내용 보관 (복구용) ────────────────
-- 왜 필요한가: 백엔드 전환 전에는 모든 저장이 GitHub 커밋이라 실수로 지우거나
-- 덮어써도 커밋 이력에서 되살릴 수 있었다. DB 로 옮기면서 그 안전망이 사라졌다
-- (content_files 는 body 를 덮어쓰기만 하고 version 은 숫자만 올린다).
-- 이 표가 그 자리를 대신한다 — 앱 코드는 이것을 몰라도 되고, 트리거가 알아서 쌓는다.
create table if not exists content_file_history (
  id          bigint generated always as identity primary key,
  path        text not null,
  body        text not null,   -- 덮이기 직전의 내용
  version     bigint not null, -- 그 내용이 갖고 있던 버전
  op          text not null,   -- 'update' (덮어씀) | 'delete' (지움)
  replaced_at timestamptz not null default now()
);

create index if not exists content_file_history_path_idx
  on content_file_history (path, id desc);

-- 경로당 최근 50벌만 남긴다. 무한히 쌓으면 파일 하나가 최대 26KB 라 저장 용량을
-- 야금야금 먹는다. 50벌이면 관리자가 며칠에 걸쳐 되돌릴 만큼은 충분하고,
-- 13개 경로 전부가 가득 차도 최악 20MB 안쪽이다.
create or replace function log_content_file_history()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'UPDATE') then
    -- 내용이 그대로인 저장(버전만 오르는 경우)은 이력에 남기지 않는다.
    -- 남기면 되돌릴 지점 목록이 똑같은 내용으로 가득 차 쓸모가 없어진다.
    if (OLD.body is not distinct from NEW.body) then
      return null;
    end if;
    insert into content_file_history (path, body, version, op)
      values (OLD.path, OLD.body, OLD.version, 'update');
  else
    insert into content_file_history (path, body, version, op)
      values (OLD.path, OLD.body, OLD.version, 'delete');
  end if;

  delete from content_file_history
   where path = OLD.path
     and id not in (
       select id from content_file_history
        where path = OLD.path
        order by id desc
        limit 50
     );
  return null;
end $$;

-- after: 실제로 성공한 변경만 기록한다(before 로 두면 뒤에서 실패해도 일단 쌓인다).
drop trigger if exists content_files_history on content_files;
create trigger content_files_history
  after update or delete on content_files
  for each row execute function log_content_file_history();

-- RLS: 공개 읽기 정책을 두지 않는다 — content_files 와 달리 이력은 운영용이고
-- 사이트가 읽을 일이 없다. 정책이 없으면 anon 키로는 아무것도 못 읽고,
-- service role 키(서버·스크립트)만 RLS 를 우회해 접근한다.
alter table content_file_history enable row level security;

-- ── 쓰는 법 (Supabase SQL Editor 에 붙여 실행) ─────────────────────────
-- 1) 되돌릴 지점 찾기 — 최근 것부터
--    select id, path, version, op, replaced_at, length(body) as 크기
--      from content_file_history
--     where path = 'content/staff.json'
--     order by id desc;
--
-- 2) 내용 확인 (되돌리기 전에 반드시 눈으로 볼 것)
--    select body from content_file_history where id = <위에서 고른 id>;
--
-- 3) 되돌리기 — version 을 올려서 넣는다. 그래야 CMS 가 열어 둔 화면과
--    버전이 어긋나 충돌로 잡히고, 남의 편집을 조용히 덮지 않는다.
--    update content_files c
--       set body = h.body, version = c.version + 1
--      from content_file_history h
--     where h.id = <고른 id> and c.path = h.path;
--    → 되돌린 뒤 사이트에 즉시 반영하려면 CMS 에서 아무 값이나 저장하거나
--      (revalidateTag 가 돈다) 최대 1시간의 캐시 만료를 기다린다.
