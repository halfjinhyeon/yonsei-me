# tools/

사이트 빌드·배포와 무관한 **개발 보조 자료** 모음입니다. `scripts/`의 데이터 변환
스크립트들이 입력으로 사용하거나, 로컬 디버깅 재현에만 쓰입니다.

- `course-list.csv` — 전체 개설과목 원본 CSV (`node scripts/parse-catalog.mjs`가 읽어
  `public/data/course-catalog.json`을 생성). 형식: `교과목명,학정번호,학점`
- `import-raw/` — 기존 학부 홈페이지에서 스크랩한 원본 HTML (`scripts/extract_import.py`
  등 파이썬 파서의 입력, 변환 결과는 `content/`로 들어감)
- `traineddata/` — tesseract 한국어/영어 학습데이터. 졸업요건 체커의 OCR을 Node에서
  로컬 재현할 때만 필요 (브라우저는 CDN에서 받음). git에는 포함하지 않음
