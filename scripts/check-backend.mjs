// 백엔드 연결 점검 — R2 업로드/공개 URL + Supabase 접속/스키마 존재 확인.
// 실행: node scripts/check-backend.mjs   (.env.local 의 키를 읽는다)
// ⚠ 어떤 경우에도 키 "값"은 출력하지 않는다 — 존재 여부와 결과 상태만.

import { readFileSync, existsSync } from 'node:fs';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

// ── .env.local 로더 (dotenv 없이 최소 구현) ──
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

const need = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
];
let missing = false;
for (const k of need) {
  const ok = Boolean(process.env[k]);
  console.log(`${ok ? 'OK ' : '없음'}  ${k}`);
  if (!ok) missing = true;
}
if (missing) {
  console.log('\n→ .env.local 에 누락 키를 채운 뒤 다시 실행하세요.');
  process.exit(1);
}

// ── R2: 테스트 객체 업로드 → 공개 URL GET → 삭제 ──
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const testKey = `uploads/_check/${Date.now()}.txt`;
try {
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: testKey,
      Body: Buffer.from('yonsei-me backend check'),
      ContentType: 'text/plain',
    }),
  );
  console.log('\nR2 업로드      OK');
  const publicUrl = `${process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${testKey}`;
  const res = await fetch(publicUrl);
  console.log(`R2 공개 접근   ${res.ok ? 'OK' : `실패 (HTTP ${res.status}) — 버킷 Public access(r2.dev) 활성화 확인`}`);
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: testKey }));
  console.log('R2 정리(삭제)  OK');
} catch (err) {
  console.log(`\nR2 실패: ${err?.name ?? ''} ${err?.message ?? err}`);
}

// ── Supabase: 접속 + posts 테이블 존재 확인 ──
try {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error, count } = await sb.from('posts').select('id', { count: 'exact', head: true });
  if (!error) console.log(`\nSupabase 접속  OK — posts 테이블 존재 (rows: ${count ?? 0})`);
  else if (/does not exist|schema cache/i.test(error.message))
    console.log('\nSupabase 접속  OK — 단 posts 테이블 없음 → scripts/sql/schema.sql 을 SQL Editor 에 적용 필요');
  else console.log(`\nSupabase 오류: ${error.message}`);
} catch (err) {
  console.log(`\nSupabase 실패: ${err?.message ?? err}`);
}
