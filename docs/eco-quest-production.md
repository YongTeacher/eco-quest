# ECO QUEST 실사용 백엔드

ECO QUEST의 실제 데이터는 Cloudflare D1을 원본으로 저장하고, 대표 사진은 비공개 R2 버킷에 저장합니다.
Google Sheets는 교사가 한눈에 확인하는 운영용 사본이며, 시트 전송이 잠시 실패해도 D1의 원본 데이터는 사라지지 않습니다.

## Cloudflare 바인딩

- D1: `ECO_DB`
- R2: `ECO_PHOTOS`

## 암호화된 환경 변수

- `ECO_CLASS_CODE`: 학생에게 알려 줄 공통 수업 코드
- `ECO_AUTH_PEPPER`: PIN과 세션 보호용 무작위 비밀값
- `ECO_ADMIN_PASSWORD`: 교사 관리자 비밀번호
- `ECO_SHEETS_WEBHOOK_URL`: Apps Script `/exec` 주소
- `ECO_SHEETS_WEBHOOK_SECRET`: Apps Script의 `ECO QUEST → 동기화 비밀키 확인` 값

위 값은 GitHub나 브라우저 JavaScript에 기록하지 않습니다.

## 적용 순서

1. D1 데이터베이스와 비공개 R2 버킷을 생성합니다.
2. Pages 프로젝트에 `ECO_DB`, `ECO_PHOTOS` 바인딩을 연결합니다.
3. 위의 다섯 비밀 변수를 Preview와 Production에 등록합니다.
4. `migrations/0001_eco_quest.sql`을 D1에 적용합니다.
5. `/api/eco/health`의 `ready`가 `true`인지 확인합니다.
6. 학생 로그인·관찰 등록·사진 조회·시트 반영을 순서대로 검증합니다.

## 데이터 공개 범위

- 지도, 관찰 및 사진 API는 로그인 세션이 있어야 읽을 수 있습니다.
- 학생은 공통 수업 코드와 본인의 반·번호·이름·모둠·PIN으로 최초 등록합니다.
- 이후 같은 반·번호는 최초 등록한 PIN으로만 로그인할 수 있습니다.
- 교사 기능은 별도의 관리자 비밀번호로 보호합니다.
- 최종 등록 시 대표 사진 한 장만 서버로 전송하며 나머지 후보 사진은 브라우저에서 폐기합니다.
