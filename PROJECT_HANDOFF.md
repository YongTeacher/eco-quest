# 생태월드 작업 인수인계

최종 갱신: 2026-09-21

## 작업을 시작할 때

이 저장소는 생태월드 본체입니다.

- GitHub: `https://github.com/YongTeacher/eco-quest`
- 기본 브랜치: `main`
- 운영 주소: `https://eco-quest.bsy0708.workers.dev`
- 배포: GitHub `main` 푸시 후 Cloudflare Workers 자동 배포

다른 컴퓨터에서는 먼저 로컬 변경사항을 확인하고, 변경사항을 덮어쓰지 않은 상태에서 최신 코드를 받습니다.

```powershell
git status -sb
git remote -v
git pull origin main
```

아직 저장소를 내려받지 않았다면 다음 명령을 사용합니다.

```powershell
git clone https://github.com/YongTeacher/eco-quest.git
cd eco-quest
code .
```

## 현재 운영 구성

- Cloudflare Workers: 웹 화면과 API
- Cloudflare D1: 학생 명단, 로그인, 관찰 기록, 개인 도감, 소감문
- Cloudflare R2: 학생 관찰 사진
- Google Apps Script: D1에서 Google Sheets로 자료 동기화
- 카카오맵: 학교 주변 생태지도와 발견 위치 선택

Cloudflare Secret 값, 관리자 비밀번호, 학생 PIN, 학생 명단 원본 XLSX는 GitHub에 저장하지 않습니다.

## 구현된 주요 기능

- 1~9반 및 통합 생태지도
- 모둠 공동 관찰과 대표 사진 등록
- 생물 후보 사진 및 학생 최종 동정
- 개인 생물도감 3개, 교사 승인 시 5개
- 나이스 XLSX/XLS/CSV 학생 명단 일괄 등록
- 교사 관리자 학생·모둠 배정
- 교사 관리자 생태지도, 관찰 기록, 개인 도감 조회
- 교사 관찰 기록 휴지통·30일 내 복구·매시간 만료 자료 영구 정리
- 학생 개인 소감문 7문항
- 소감문 임시 저장 및 최종 제출
- 개인 도감 1개 이상 완성 후 소감문 최종 제출
- 교사의 최종 제출 후 수정 허용/잠금
- 교사 관리자 소감문 제출 현황 및 상세 조회
- Google Sheets `소감문` 시트 및 `GPT 복사용 통합본` 한 셀 생성
- 9반 99번 테스트학생 유지 및 관리자 삭제 기능

## 최신 커밋

- `6ae17ac` — Google Sheets 소감문 GPT 복사용 통합본
- `a5b24b1` — 학생 소감문과 교사 확인 화면
- `96e8519` — 교사 생태지도·관찰·도감 화면

## Google Sheets에서 남은 확인 작업

최신 Apps Script 버전은 `1.4.1`입니다.

1. `apps/eco-map/google-apps-script/Code.gs` 전체를 Apps Script에 붙여넣고 저장합니다.
2. 함수 목록에서 `setupEcoQuest`를 실행하고 `실행 완료`를 확인합니다.
3. Google Sheets에 `소감문` 탭과 마지막 열 `GPT 복사용 통합본`이 생성됐는지 확인합니다.
4. Apps Script의 기존 배포를 편집해 `새 버전`으로 배포합니다.
5. 생태월드 교사 관리자에서 `지금 동기화`를 실행합니다.

기존 배포를 새 버전으로 갱신하면 웹 앱 URL과 동기화 비밀키는 유지됩니다. `setupEcoQuest`는 기존 학생·관찰·도감·소감문 데이터를 의도적으로 삭제하지 않습니다.

## 작업 시 주의사항

- 작업 전 항상 `git status -sb`와 `git remote -v`를 확인합니다.
- 로컬 변경사항이 있으면 강제로 덮어쓰거나 초기화하지 않습니다.
- 실제 학생 데이터나 명단 XLSX를 커밋하지 않습니다.
- Cloudflare Secret 값을 코드, 로그, 문서에 기록하지 않습니다.
- 변경 후 JavaScript 문법 검사, `git diff --check`, Wrangler dry-run을 수행합니다.
- 푸시 후 운영 주소에서 최신 파일 반영 여부를 확인합니다.
