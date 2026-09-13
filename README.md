# ECO QUEST

용인삼계고등학교 생태 탐사 수업을 위한 독립 웹 애플리케이션입니다.

- 학생 수업 코드 로그인
- 1~9반 및 통합 카카오 생태지도
- 모둠 공동 관찰과 대표 사진 저장
- 개인 생물도감
- 교사 Google Sheets 동기화

## Cloudflare Pages 배포

- Framework preset: `None`
- Build command: 비워 둠
- Build output directory: `apps/eco-map`
- Root directory: 비워 둠

Pages Functions는 저장소 루트의 `functions` 폴더를 사용합니다. 운영 데이터는 D1 `ECO_DB`,
대표 사진은 비공개 R2 `ECO_PHOTOS` 바인딩에 저장합니다. 자세한 설정은
`docs/eco-quest-production.md`를 참고하세요.

비밀 변수, Apps Script 배포 URL과 동기화 비밀키는 저장소에 커밋하지 않습니다.
