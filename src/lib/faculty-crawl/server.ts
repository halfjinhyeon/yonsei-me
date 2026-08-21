// 수집기의 서버 쪽 배선 — 대상 명단과 프로필 저장소.
//
// 저장처는 콘텐츠 API(/api/admin/content)와 **같은 규칙**을 따른다:
//   dev  → 로컬 content/faculty-profiles/<이름>.json (dev 서버가 작업 트리를 서빙한다)
//   prod → Supabase content_files 행 + revalidateTag('content')
// 같은 파일을 CMS 팝업 편집기도 그 API 로 저장하므로, 규칙이 갈리면 한쪽이 다른 쪽의
// 변경을 못 본다. 여기서 API 라우트를 다시 호출하지 않고 직접 읽고 쓰는 이유는 하나뿐이다
// — 수집은 요청 하나 안에서 읽기→병합→쓰기를 원자적으로 끝내야 하기 때문(중간에 다른
// 저장이 끼면 병합 결과가 옛 원본 위에 얹힌다).
//
// ⚠️ 대상 판정 기준은 **프로필 파일의 sourceUrl**(암호화된 userId 가 들어 있다)이다.
//    과거엔 faculty-directory 의 moreInfoUrl 을 썼는데, 레거시 링크 청산(2026-08) 때 그 값이
//    전부 null 이 되면서 대상이 0명이 돼 크롤러가 통째로 멈춰 있었다. 프로필이 아직 없는
//    교수만 디렉터리 moreInfoUrl 로 보완한다(수동으로 채운 경우).

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { revalidateTag } from 'next/cache';
import { adminDb } from '@/lib/admin/posts-server';
import { isFacultyProfilePath } from '@/lib/admin/managed-content';
import { getFacultyDirectoryRuntime } from '@/lib/content-runtime';
import type { CrawlTarget, Profile } from './core';

const PROFILE_DIR = join(process.cwd(), 'content', 'faculty-profiles');

export function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function profilePath(name: string): string {
  return `content/faculty-profiles/${name}.json`;
}

/** 이름이 프로필 경로 규칙(한글 2~10자)에 맞는지 — 경로 탈출 차단 겸 */
export function isValidProfileName(name: string): boolean {
  return isFacultyProfilePath(profilePath(name));
}

export interface ProfileStore {
  /** 원문 문자열 — 변경 여부 비교에 쓴다(직렬화 결과와 문자열로 비교) */
  raw(name: string): Promise<string | null>;
  read(name: string): Promise<Profile | null>;
  write(name: string, body: string): Promise<void>;
  /** 프로필이 존재하는 교수 이름 목록 */
  names(): Promise<string[]>;
}

function fileStore(): ProfileStore {
  const pathOf = (name: string): string => join(PROFILE_DIR, `${name}.json`);
  const raw = async (name: string): Promise<string | null> => {
    try {
      return await readFile(pathOf(name), 'utf8');
    } catch {
      return null;
    }
  };
  return {
    raw,
    read: async (name) => {
      const t = await raw(name);
      return t ? (JSON.parse(t) as Profile) : null;
    },
    write: async (name, body) => {
      await mkdir(PROFILE_DIR, { recursive: true });
      await writeFile(pathOf(name), body, 'utf8');
    },
    names: async () => {
      try {
        const files = await readdir(PROFILE_DIR);
        return files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
      } catch {
        return []; // 첫 실행 — 디렉터리 없음
      }
    },
  };
}

function dbStore(): ProfileStore {
  // 한 요청 안에서 같은 교수를 두 번 읽지 않도록 행을 기억한다(읽기→병합→쓰기 한 바퀴).
  const cache = new Map<string, { body: string; version: number } | null>();
  const load = async (name: string): Promise<{ body: string; version: number } | null> => {
    const hit = cache.get(name);
    if (hit !== undefined) return hit;
    const { data, error } = await adminDb()
      .from('content_files')
      .select('body, version')
      .eq('path', profilePath(name))
      .maybeSingle();
    if (error) throw new Error(`content_files 조회 실패 (${name}): ${error.message}`);
    const row = data ? { body: String(data.body), version: Number(data.version) } : null;
    cache.set(name, row);
    return row;
  };
  return {
    raw: async (name) => (await load(name))?.body ?? null,
    read: async (name) => {
      const row = await load(name);
      return row ? (JSON.parse(row.body) as Profile) : null;
    },
    write: async (name, body) => {
      const row = await load(name);
      const db = adminDb();
      const { error } = row
        ? await db
            .from('content_files')
            .update({ body, version: row.version + 1 })
            .eq('path', profilePath(name))
        : await db.from('content_files').insert({ path: profilePath(name), body, version: 1 });
      if (error) throw new Error(`content_files 기록 실패 (${name}): ${error.message}`);
      cache.set(name, { body, version: (row?.version ?? 0) + 1 });
      // 저장 즉시 공개 페이지에 반영된다(콘텐츠 API 와 같은 태그).
      revalidateTag('content');
    },
    names: async () => {
      const { data, error } = await adminDb()
        .from('content_files')
        .select('path')
        .like('path', 'content/faculty-profiles/%');
      if (error) throw new Error(`content_files 목록 조회 실패: ${error.message}`);
      return (data ?? [])
        .map((r) => String(r.path).replace(/^content\/faculty-profiles\//, '').replace(/\.json$/, ''))
        .filter((n) => n.length > 0);
    },
  };
}

export function openStore(): ProfileStore {
  return isDev() ? fileStore() : dbStore();
}

export interface TargetInfo extends CrawlTarget {
  /** 마지막 수집일(YYYY-MM-DD) — 프로필에 기록돼 있을 때만 */
  crawledAt: string | null;
}

/**
 * 수집 대상 명단. 프로필의 sourceUrl 이 1순위, 없는 교수는 디렉터리 moreInfoUrl 로 보완.
 * 순서는 **교수진 디렉터리 순서**를 따른다 — CMS 카드 목록과 같은 차례로 로그가 쌓여야
 * 담당자가 "지금 어디까지 왔는지"를 카드에서 눈으로 찾을 수 있다.
 */
export async function listTargets(store: ProfileStore): Promise<TargetInfo[]> {
  const found = new Map<string, TargetInfo>();

  for (const name of await store.names()) {
    if (!isValidProfileName(name)) continue;
    let profile: Profile | null = null;
    try {
      profile = await store.read(name);
    } catch {
      continue; // 깨진 파일은 건너뛴다
    }
    const sourceUrl = profile?.sourceUrl;
    if (typeof sourceUrl === 'string' && sourceUrl.includes('mode=view')) {
      const crawledAt = typeof profile?.crawledAt === 'string' ? profile.crawledAt : null;
      found.set(name, { name, viewUrl: sourceUrl, crawledAt });
    }
  }

  const directory = await getFacultyDirectoryRuntime();
  const ordered: TargetInfo[] = [];
  for (const person of directory) {
    const hit = found.get(person.name);
    if (hit) {
      ordered.push(hit);
      found.delete(person.name);
      continue;
    }
    const url = person.moreInfoUrl;
    if (typeof url === 'string' && url.includes('mode=view')) {
      ordered.push({ name: person.name, viewUrl: url, crawledAt: null });
    }
  }
  // 디렉터리에 없는데 프로필만 남은 교수(퇴임 등)도 뒤에 붙인다 — 기록은 계속 갱신한다.
  for (const rest of found.values()) ordered.push(rest);

  return ordered;
}
