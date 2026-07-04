'use client';

import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  evaluate,
  matchCourses,
  normalizeName,
  searchCatalog,
  type CatalogCourse,
  type CheckerData,
} from '@/lib/checker-match';
import type { Locale } from '@/i18n/routing';

interface UploadedFile {
  id: string;
  name: string;
  status: 'processing' | 'done' | 'error';
  progress: number;
  courseIds: string[];
  hasChapel: boolean;
}

function StepLabel({ num, title }: { num: string; title: string }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.22em] text-yonsei-blue">
      STEP {num} <span className="mx-1 text-content-faint">·</span> {title}
    </p>
  );
}

const KIND_LABEL: Record<CatalogCourse['kind'], string> = {
  majorRequired: '전공필수',
  majorElective: '전공선택',
  engineering: '공학기초',
  liberal: '교양',
};

/** 흰 굵은 글씨(과목명) 배경색과 무관하게 배경색 채도가 있는 컬러 셀에서도 두드러지도록,
 * "밝고 채도 낮은(흰색에 가까운)" 픽셀만 검정 잉크로, 나머지는 흰 배경으로 바꾼 뒤 확대한다.
 * 임계값에 따라 잡히는 블록이 달라 두 임계값으로 각각 뽑아 합치는 편이 인식률이 더 높다. */
async function whiteTextMask(bitmap: ImageBitmap, threshold: number, scale = 2): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const minC = Math.min(d[i], d[i + 1], d[i + 2]);
    const v = minC > threshold ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const OCR_THRESHOLDS = [130, 165];

/**
 * 졸업요건 체크 — 에브리타임 시간표 캡처를 업로드하면 브라우저에서 OCR로
 * 과목을 인식해 학번별 졸업요건과 대조하고, 남은 요건을 보여준다.
 * (인식 결과는 칩으로 수정 가능, 과목 직접 추가도 지원)
 */
export function GraduationChecker({ data, locale }: { data: CheckerData; locale: Locale }) {
  const ko = locale === 'ko';
  const [cohortId, setCohortId] = useState(data.cohorts[0].id);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [chapelCount, setChapelCount] = useState(0);
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const cohort = data.cohorts.find((c) => c.id === cohortId) ?? data.cohorts[0];
  const byId = useMemo(() => new Map(data.catalog.map((c) => [c.id, c])), [data.catalog]);

  const takenIds = useMemo(() => {
    const ids = new Set<string>(manualIds);
    for (const f of files) for (const id of f.courseIds) ids.add(id);
    for (const r of removedIds) ids.delete(r);
    return ids;
  }, [files, manualIds, removedIds]);

  const result = useMemo(
    () => evaluate(data, cohort, takenIds, chapelCount),
    [data, cohort, takenIds, chapelCount],
  );

  const suggestions = useMemo(
    () => searchCatalog(query, data.catalog).filter((c) => !takenIds.has(c.id)),
    [query, data.catalog, takenIds],
  );

  async function processFiles(list: FileList | File[]) {
    const images = [...list].filter((f) => f.type.startsWith('image/'));
    for (const file of images) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setFiles((prev) => [
        ...prev,
        { id, name: file.name, status: 'processing', progress: 0, courseIds: [], hasChapel: false },
      ]);
      // 워커 동시 실행을 피하기 위해 순차 처리
      while (busyRef.current) await new Promise((r) => setTimeout(r, 150));
      busyRef.current = true;
      try {
        const { createWorker, PSM } = await import('tesseract.js');
        const bitmap = await createImageBitmap(file);
        let passIndex = 0; // 진행률 계산용 — 현재 몇 번째 임계값 패스인지
        const worker = await createWorker('kor+eng', 1, {
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') {
              const combined = (passIndex + m.progress) / OCR_THRESHOLDS.length;
              setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress: combined } : f)));
            }
          },
        });
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

        // 임계값을 달리해 두 번 인식 (배경색에 따라 잡히는 블록이 달라짐) 후 합침
        const texts: string[] = [];
        for (const threshold of OCR_THRESHOLDS) {
          const canvas = await whiteTextMask(bitmap, threshold);
          const { data: ocr } = await worker.recognize(canvas);
          texts.push(ocr.text);
          passIndex += 1;
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, progress: passIndex / OCR_THRESHOLDS.length } : f)),
          );
        }
        await worker.terminate();
        bitmap.close();

        const courseIds = matchCourses(texts, data.catalog);
        const hasChapel = texts.some((t) => normalizeName(t).includes('채플'));
        if (hasChapel) setChapelCount((n) => Math.min(4, n + 1));
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: 'done', progress: 1, courseIds, hasChapel } : f,
          ),
        );
        // 새로 인식된 과목은 제거 목록에서 해제하지 않음 (사용자 결정 유지)
      } catch {
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: 'error' } : f)));
      } finally {
        busyRef.current = false;
      }
    }
  }

  function removeFile(id: string) {
    const target = files.find((f) => f.id === id);
    if (target?.hasChapel) setChapelCount((n) => Math.max(0, n - 1));
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function addCourse(id: string) {
    setRemovedIds((prev) => prev.filter((r) => r !== id));
    setManualIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery('');
  }

  function removeCourse(id: string) {
    setRemovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  const takenCourses = [...takenIds]
    .map((id) => byId.get(id))
    .filter(Boolean) as CatalogCourse[];
  const grouped = (['majorRequired', 'majorElective', 'engineering', 'liberal'] as const).map(
    (kind) => ({ kind, courses: takenCourses.filter((c) => c.kind === kind) }),
  );

  const pct = Math.min(100, Math.round((result.totalEarned / result.totalRequired) * 100));

  return (
    <div className="space-y-16">
      <p className="max-w-2xl text-base leading-[1.8] text-content-soft">
        {ko
          ? '에브리타임 시간표 캡처를 학기별로 업로드하면, 과목을 자동 인식해 학번별 졸업요건과 대조합니다. 인식 결과는 아래에서 직접 수정할 수 있습니다.'
          : 'Upload your Everytime timetable screenshots (one per semester). Courses are recognized on-device and checked against your cohort’s graduation requirements. You can edit the results below.'}
      </p>

      {/* STEP 01 — 학번 선택 */}
      <section>
        <StepLabel num="01" title={ko ? '학번 선택' : 'Cohort'} />
        <div className="mt-4 inline-flex overflow-hidden rounded-lg border border-surface-border">
          {data.cohorts.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCohortId(c.id)}
              aria-pressed={cohortId === c.id}
              className={cn(
                'px-5 py-2.5 text-sm font-semibold transition-colors',
                i > 0 && 'border-l border-surface-border',
                cohortId === c.id
                  ? 'bg-yonsei-navy text-white'
                  : 'bg-surface text-content-soft hover:text-yonsei-navy',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* STEP 02 — 시간표 업로드 */}
      <section>
        <StepLabel num="02" title={ko ? '시간표 업로드' : 'Upload timetables'} />
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            processFiles(e.dataTransfer.files);
          }}
          className={cn(
            'mt-4 flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed px-6 py-12 text-center transition-colors',
            dragOver
              ? 'border-yonsei-blue bg-yonsei-navy/5'
              : 'border-surface-border hover:border-yonsei-blue/60',
          )}
        >
          <span
            aria-hidden="true"
            className="grid h-12 w-12 place-items-center rounded-full bg-yonsei-navy/10 text-yonsei-navy"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="font-semibold text-content">
            {ko ? '이미지를 끌어다 놓거나 클릭해서 선택' : 'Drag & drop images, or click to browse'}
          </p>
          <p className="text-sm text-content-faint">
            {ko
              ? '학기별 에브리타임 캡처 (여러 장 가능) — 브라우저 안에서만 처리되고 서버로 전송되지 않습니다'
              : 'Everytime captures per semester — processed entirely in your browser'}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) processFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-4 divide-y divide-surface-border border-y border-surface-border">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                  {f.name}
                </span>
                {f.status === 'processing' && (
                  <span className="flex items-center gap-2 text-xs text-content-faint">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-soft">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-yonsei-navy to-yonsei-blue transition-all"
                        style={{ width: `${Math.round(f.progress * 100)}%` }}
                      />
                    </span>
                    {ko ? '인식 중' : 'Reading'} {Math.round(f.progress * 100)}%
                  </span>
                )}
                {f.status === 'done' && (
                  <span className="text-xs font-semibold text-yonsei-blue">
                    {ko ? `과목 ${f.courseIds.length}개 인식` : `${f.courseIds.length} courses`}
                    {f.hasChapel && (ko ? ' · 채플' : ' · chapel')}
                  </span>
                )}
                {f.status === 'error' && (
                  <span className="text-xs font-semibold text-red-600">
                    {ko ? '인식 실패' : 'Failed'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  aria-label={ko ? '파일 제거' : 'Remove file'}
                  className="text-content-faint transition-colors hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* STEP 03 — 수강 과목 확인 */}
      <section>
        <StepLabel num="03" title={ko ? '수강 과목 확인' : 'Review courses'} />
        <p className="mt-2 text-sm text-content-faint">
          {ko
            ? '잘못 인식된 과목은 ✕로 지우고, 빠진 과목은 검색해서 추가하세요.'
            : 'Remove misread courses with ✕ and add missing ones via search.'}
        </p>

        {/* 검색 추가 */}
        <div className="relative mt-4 max-w-md">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ko ? '과목명 검색 후 추가 (예: 열역학)' : 'Search a course to add'}
            className="w-full border border-surface-border bg-surface px-4 py-2.5 text-sm text-content outline-none transition-colors focus:border-yonsei-blue"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden border border-surface-border bg-surface shadow-card">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => addCourse(c.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm text-content-soft transition-colors hover:bg-surface-soft hover:text-yonsei-navy"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-content-faint">
                      {KIND_LABEL[c.kind]}
                      {c.area ? ` · ${c.area}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 채플 카운터 */}
        <div className="mt-5 flex items-center gap-4">
          <span className="text-sm font-semibold text-content">{ko ? '채플 이수 학기' : 'Chapel semesters'}</span>
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-surface-border">
            <button
              type="button"
              onClick={() => setChapelCount((n) => Math.max(0, n - 1))}
              className="px-3 py-1.5 text-content-soft transition-colors hover:text-yonsei-navy"
              aria-label="-"
            >
              −
            </button>
            <span className="border-x border-surface-border px-4 py-1.5 text-sm font-bold tabular-nums text-content">
              {chapelCount} / 4
            </span>
            <button
              type="button"
              onClick={() => setChapelCount((n) => Math.min(4, n + 1))}
              className="px-3 py-1.5 text-content-soft transition-colors hover:text-yonsei-navy"
              aria-label="+"
            >
              +
            </button>
          </div>
          <span className="text-xs text-content-faint">
            {ko ? '캡처에서 채플이 인식되면 자동 +1' : 'Auto +1 when chapel is detected'}
          </span>
        </div>

        {/* 인식/추가된 과목 칩 */}
        {takenCourses.length > 0 ? (
          <div className="mt-6 space-y-4">
            {grouped
              .filter((g) => g.courses.length > 0)
              .map((g) => (
                <div key={g.kind}>
                  <p className="text-xs font-bold uppercase tracking-wide text-content-faint">
                    {KIND_LABEL[g.kind]} ({g.courses.length})
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {g.courses.map((c) => (
                      <li
                        key={c.id}
                        className="inline-flex items-center gap-2 border border-surface-border bg-surface-soft px-3 py-1.5 text-sm text-content"
                      >
                        {c.name}
                        <button
                          type="button"
                          onClick={() => removeCourse(c.id)}
                          aria-label={`${c.name} ${ko ? '제거' : 'remove'}`}
                          className="text-content-faint transition-colors hover:text-red-600"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-content-faint">
            {ko ? '아직 인식되거나 추가된 과목이 없습니다.' : 'No courses recognized or added yet.'}
          </p>
        )}
      </section>

      {/* STEP 04 — 결과 */}
      <section>
        <StepLabel num="04" title={ko ? '남은 졸업요건' : 'Remaining requirements'} />

        {/* 총괄 */}
        <div className="mt-6 border-t-2 border-content pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="text-4xl font-bold tracking-tight text-content sm:text-5xl">
              {pct}
              <span className="text-2xl">%</span>
              <span className="ml-3 text-base font-medium text-content-soft">
                {result.totalEarned} / {result.totalRequired}
                {ko ? '학점' : ' cr.'}
              </span>
            </p>
            <p className="text-sm text-content-soft">
              {ko
                ? `남은 학점(추정) ${Math.max(0, Math.round((result.totalRequired - result.totalEarned) * 10) / 10)}학점 · 남은 필수과목 ${result.remainingRequired.length}개`
                : `~${Math.max(0, result.totalRequired - result.totalEarned)} credits and ${result.remainingRequired.length} required courses remaining`}
            </p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-soft">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yonsei-navy via-yonsei-blue to-yonsei-gold transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* 섹션별 */}
        <ul className="mt-8">
          {result.sections.map((sec, i) => {
            const secPct = Math.min(100, Math.round((sec.earned / sec.required) * 100));
            const remaining = sec.items?.filter((it) => !it.done) ?? [];
            const done = sec.items?.filter((it) => it.done) ?? [];
            return (
              <li key={sec.id} className="border-b border-surface-border py-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-10">
                  <span className="shrink-0 text-sm font-bold tabular-nums text-yonsei-blue">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="text-lg font-bold tracking-tight text-content sm:text-xl">
                        {sec.title}
                      </h4>
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums',
                          secPct >= 100 ? 'text-yonsei-blue' : 'text-content-soft',
                        )}
                      >
                        {sec.earned} / {sec.required}
                        {ko ? '학점' : ' cr.'}
                        {secPct >= 100 && ' ✓'}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-soft">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          secPct >= 100
                            ? 'bg-gradient-to-r from-yonsei-blue to-yonsei-gold'
                            : 'bg-gradient-to-r from-yonsei-navy to-yonsei-blue',
                        )}
                        style={{ width: `${secPct}%` }}
                      />
                    </div>

                    {sec.areas && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {sec.areas.map((a) => (
                          <li
                            key={a.name}
                            className={cn(
                              'border px-2.5 py-1 text-xs font-medium',
                              a.done
                                ? 'border-yonsei-blue/40 bg-yonsei-navy/5 text-yonsei-navy'
                                : 'border-surface-border text-content-faint',
                            )}
                          >
                            {a.done ? '✓ ' : ''}
                            {a.name}
                          </li>
                        ))}
                      </ul>
                    )}

                    {remaining.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-content-faint">
                          {ko ? '남은 과목' : 'Remaining'}
                        </p>
                        <ul className="mt-1.5 flex flex-wrap gap-2">
                          {remaining.map((it) => (
                            <li
                              key={it.name}
                              className="border border-yonsei-navy/30 bg-surface px-2.5 py-1 text-xs font-semibold text-yonsei-navy"
                            >
                              {it.name} ({it.credits})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {done.length > 0 && (
                      <p className="mt-2 text-xs text-content-faint">
                        ✓ {done.map((d) => d.name).join(' · ')}
                      </p>
                    )}
                    {sec.note && <p className="mt-2 text-xs text-content-faint">{sec.note}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-content-faint">
          {ko
            ? '※ 학점은 표준 학점 기준 추정치이며, 재수강·계절학기·인정과목 등은 반영되지 않을 수 있습니다. 실제 졸업사정은 연세포털 학사정보를 기준으로 하세요.'
            : '※ Credits are estimates based on standard values; retakes, summer sessions, and transfer credits may not be reflected. Refer to the Yonsei portal for the official audit.'}
        </p>
      </section>
    </div>
  );
}
