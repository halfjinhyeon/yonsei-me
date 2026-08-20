/** 변환 결과 요약 출력 — 파일·DB 스크립트가 같은 형식으로 찍는다. 문제가 있으면 true. */
export function reportChanges(label, changes) {
  const bad = changes.filter((c) => c.unmapped || c.missingImage);
  const moved = changes.filter((c) => !c.unmapped && !c.missingImage);

  const tally = {};
  for (const c of moved) (tally[`${c.from} → ${c.to}`] ??= []).push(c.id);

  console.log(`\n── ${label} — ${moved.length}건 변경`);
  for (const [k, ids] of Object.entries(tally).sort()) {
    console.log(`   ${k.padEnd(44)} ${ids.length}건  ${ids.slice(0, 6).join(' ')}${ids.length > 6 ? ' …' : ''}`);
  }
  for (const c of bad) {
    if (c.missingImage) console.log(`   ⚠️ 사진 없음 — ${c.to} 슬라이드를 빈 사진으로 만들었다. CMS 에서 올릴 것.`);
    else console.log(`   ⚠️ 매핑 없음 — ${c.id} (현재 값 ${c.from})`);
  }
  return bad.length > 0;
}
