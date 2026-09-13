# ECO QUEST

용인삼계고등학교 생태 탐사 수업을 위한 독립 웹 애플리케이션입니다.

- 학생 수업 코드 로그인
- 1~9반 및 통합 카카오 생태지도
- 모둠 공동 관찰과 대표 사진 저장
- 개인 생물도감
- 교사 Google Sheets 동기화

## Cloudflare Workers 배포

- Build command: 비워 둠
- Deploy command: `npx wrangler deploy`
- Non-production branches: 필요할 때만 사용
- Cloudflare Access: 사용하지 않음

Workers Static Assets는 `apps/eco-map`의 화면을 제공하고 `src/index.js`가 `/api/eco/*` 요청을
서버 API로 전달합니다. 운영 데이터는 D1 `ECO_DB`, 대표 사진은 비공개 R2 `ECO_PHOTOS`
바인딩에 저장합니다. 자세한 설정은 `docs/eco-quest-production.md`를 참고하세요.

비밀 변수, Apps Script 배포 URL과 동기화 비밀키는 저장소에 커밋하지 않습니다.
