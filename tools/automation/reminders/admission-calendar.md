**{{year}}학년도** 입학 일정이 공개될 시기입니다. 사이트의 입학 캘린더를 새 학년도 기준으로 다시 씁니다.
공식 일정은 매년 문구·구성이 바뀌고 학과가 아니라 입학처가 정하므로 **자동 반영하지 않고 사람이 옮겨 적습니다**.

**출처 (반드시 원문 확인)**

- 입학처 공식 캘린더: <https://admission.yonsei.ac.kr/seoul/admission/html/counsel/calendar.asp?s_year={{year}}>
- 모집요강(수시): <https://admission.yonsei.ac.kr/seoul/admission/html/rolling/guide.asp> — 정시·편입 등 다른 전형은 입학처 사이트의 해당 메뉴에서 확인합니다.
- 참고: 변경 감지 워커가 남긴 최근 리포트(라벨 `automation`, 제목 `[자동] 입학처 변경 감지`) — 마지막 스냅샷 이후 무엇이 바뀌었는지 먼저 훑어보면 빠릅니다.

**할 일**

- [ ] `content/admission-guide.json` 의 `calendar` 블록을 **전면 재작성** — `year` 를 `{{year}}` 로 올리고, `intro` 문구와
      `events` 배열(전형별 일정)을 위 출처대로 새로 채웁니다. 지난 학년도 값이 남아 있으면 안 됩니다.
- [ ] 남은 옛 학년도 표기(`title`·`disclaimer`·전형 설명)가 없는지 훑어봅니다.
- [ ] 영문(`en`)은 관리자 콘솔의 DeepL 번역을 재사용합니다 — 손으로 번역하지 말고 콘솔에서 돌린 결과를 넣습니다.
- [ ] `npm run typecheck` 통과 + `/ko/admission`·`/en/admission` 화면에서 일정표를 눈으로 확인합니다.
- [ ] 바뀐 파일만 **명시적으로 스테이징**해 커밋합니다(`git add -A` 금지).

⚠️ 입학 일정은 학생이 실제 지원 일정을 판단하는 정보입니다. 확정 전 일정을 옮겨 적었다면 `disclaimer` 에 그 사실과
확인 시점을 남기고, 공식 발표 후 다시 갱신합니다.
