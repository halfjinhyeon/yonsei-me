# tools/

사이트 빌드·배포와 무관한 **개발 보조 자료** 모음입니다. `scripts/`의 데이터 변환
스크립트들이 입력으로 사용하거나, 로컬 디버깅 재현에만 쓰입니다.

- `course-list.csv` — 전체 개설과목 원본 CSV (`node scripts/parse-catalog.mjs`가 읽어
  `public/data/course-catalog.json`을 생성). 형식: `교과목명,학정번호,학점`
- `import-raw/` — 기존 학부 홈페이지에서 스크랩한 원본 HTML (`scripts/extract_import.py`
  등 파이썬 파서의 입력, 변환 결과는 `content/`로 들어감)
- `mileage/` — 마일리지 전략 플래너의 데이터 파이프라인 (크롤 JSON → 이력 SQLite →
  예측 번들 `public/data/mileage-*.json`). 학기마다 한 번 돌리는 갱신 절차와 함정 모음은
  `mileage/README.md`. 이력 DB는 gzip본(`mileage/data/*.db.gz`)만 git에 포함하고, 실행 시
  자동 해제되는 `.db`는 무시함
- `traineddata/` — tesseract 한국어/영어 학습데이터. 졸업요건 체커의 OCR을 Node에서
  로컬 재현할 때만 필요 (브라우저는 CDN에서 받음). git에는 포함하지 않음
