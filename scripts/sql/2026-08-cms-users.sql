-- CMS 사용자(허용 계정) 스키마 — 로그인 수단 확장(이메일 OTP · 카카오 · GitHub).
-- 적용 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run (재실행 안전).
--
-- 지금까지 콘솔 접근 허용 목록은 환경변수 ALLOWED_GITHUB_LOGINS 였다. 계정을
-- 하나 늘리려면 Vercel 환경변수를 고치고 재배포해야 해서 학과 실무자가 손댈 수
-- 없었다. 이 테이블이 그 자리를 대신한다 — CMS 에서 등록하면 즉시 반영된다.
--
-- RLS 는 켜되 정책을 두지 않는다 = 서비스 롤(SUPABASE_SERVICE_ROLE_KEY)로만 접근.
-- otp_hash 는 인증번호 원문이 아니라 sha256 16진 해시다(메일 유출 시 재사용 방지).

create table if not exists cms_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'editor' check (role in ('admin','editor')),
  email text unique,
  github_login text unique,
  kakao_id text unique,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts int not null default 0,
  otp_sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table cms_users enable row level security;
insert into cms_users (name, role, email, github_login) values
  ('김진현', 'admin', 'wlsgus2006@gmail.com', 'halfjinhyeon'),
  ('학과 계정', 'admin', null, 'yonsei-mech'),
  ('김해진', 'editor', 'hjk@yonsei.ac.kr', null),
  ('민경민', 'editor', 'kmin.min@yonsei.ac.kr', null),
  ('김석', 'editor', 'seokkim@yonsei.ac.kr', null),
  ('현재상', 'editor', 'hyun.jaesang@yonsei.ac.kr', null)
on conflict do nothing;
