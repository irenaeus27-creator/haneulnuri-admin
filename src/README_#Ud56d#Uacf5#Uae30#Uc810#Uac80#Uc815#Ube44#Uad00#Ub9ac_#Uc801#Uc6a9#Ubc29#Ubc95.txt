하늘누리 비행교육원 웹 관리자 프로그램 - 항공기 점검/정비관리 추가본

1) ZIP 압축을 풀면 app, components, lib 폴더와 apps-script-api-updated.txt가 있습니다.

2) Next.js 프로젝트의 src 폴더 안에 아래 파일을 덮어쓰거나 추가하세요.

추가 파일:
- src/app/aircraft-maintenance/page.tsx
- src/app/api/aircraft-maintenance/route.ts

수정 파일:
- src/components/Sidebar.tsx

그 외 기존 파일은 그대로 포함되어 있으므로, 전체 app/components/lib를 src 안에 덮어써도 됩니다.
단, 현재 작업 중인 파일이 따로 있으면 위 3개 파일만 우선 적용하는 것을 권장합니다.

3) Google Spreadsheet에 새 시트를 추가하세요.

시트명:
- aircraftMaintenance

1행 헤더:
maintenanceId, aircraftId, aircraftName, registrationNo, inspectionDate, maintenanceType, status, nextInspectionDate, mechanic, cost, memo, createdAt, updatedAt

4) Apps Script 코드도 업데이트해야 저장 기능이 동작합니다.

- apps-script-api-updated.txt 내용을 Apps Script 편집기의 기존 코드 전체와 교체하세요.
- 저장 후 배포 > 배포 관리 > 새 버전으로 배포하세요.
- 기존 exec URL이 유지되는 배포라면 .env.local은 그대로 사용할 수 있습니다.

5) 실행 확인

브라우저:
- http://localhost:3000/aircraft-maintenance

API 직접 확인:
- http://localhost:3000/api/aircraft-maintenance

6) 기능 범위

- 항공기 선택
- 점검/정비 신규 등록
- 기존 점검/정비 수정
- 상태 필터
- 정비 유형 필터
- 검색
- 30일 내 점검 예정 표시
- 다음 점검일 경과 표시
- 저장 시 logs 시트에 로그 기록
- nextInspectionDate가 있으면 aircraft 시트의 nextInspectionDate도 같이 갱신

7) 이번 ZIP에는 출퇴근관리 /attendance 관련 페이지를 추가하지 않았습니다.
