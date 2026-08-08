import type { NextRequest } from 'next/server';
import { fetchAlumniEventById } from '@/lib/posts';
import { alumniEventHref } from '@/lib/board-links';
import { legacyRedirect, legacyNotFound } from '@/lib/legacy-resolver';

// 구 동문 행사 주소 `/alumni/post/<id>` → `/alumni/network/<id>` 308 리졸버.
// 없는 글은 목적지로 떠넘기지 않고 여기서 404 한다.

export async function GET(
  req: NextRequest,
  { params }: { params: { locale: string; id: string } },
) {
  const event = await fetchAlumniEventById(params.id);
  if (!event) return legacyNotFound(params.locale);
  return legacyRedirect(req, params.locale, alumniEventHref(params.id));
}
