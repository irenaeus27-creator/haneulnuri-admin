# 하늘누리 비행교육원 웹 관리자 프로그램 작업 지침

## 프로젝트 개요
- 프로젝트명: 하늘누리 비행교육원 웹 관리자 프로그램
- 기술 스택:
  - Next.js 16.2.6
  - TypeScript
  - Tailwind CSS
  - App Router
  - src directory 사용
  - Google Apps Script API + Google Spreadsheet DB
- 환경변수:
  - NEXT_PUBLIC_API_URL=Apps Script exec URL
  - NEXT_PUBLIC_BASE_URL=http://localhost:3000

## 기본 규칙
- 부분 코드가 아니라 전체 파일 단위로 수정한다.
- 기능을 빠르게 추가하되 기존 동작을 깨지 않게 한다.
- 출퇴근관리 /attendance는 만들지 않는다.
- 비행일지는 제거 방향이다.
- 항공기 표시는 화면에서 HL-C 형식으로 통일한다.
- 내부 aircraftId는 A-001 형식을 유지해도 되지만 화면 표시명은 HL-C로 보이게 한다.
- 렌탈비행은 솔로 비행이므로 담당 교관을 표시하지 않는다.
- 교육비는 금액뿐 아니라 교육시간 충전/사용/잔여시간을 관리한다.

## 예약 규칙
예약 상태값:
- 요청
- 예정
- 확정
- 취소
- 취소요청
- 완료
- 기상취소
- 노쇼
- 반려

예약 유형:
- 체험비행
- 교육비행
- 렌탈비행
- 자가비행
- 정비
- 기타

운영시간:
- 07:00~20:00

PFI:
- 교육비행과 렌탈비행은 예약 시작 전 30분 PFI 블록을 표시한다.
- PFI는 시간선을 넘지 않아야 한다.
- PFI 블록에는 PFI 글자를 작게 중앙 표시한다.

예약관리:
- 요청 상태는 승인/반려 처리 가능해야 한다.
- 취소요청은 취소 승인/취소 반려 처리가 가능해야 한다.
- 요청 처리 시 memo에 처리 이력을 누적한다.
- 예약 변경 시 notifications 시트에 예약 변경 알림을 생성한다.
- 대시보드 운항일정에서 예약 블록 우측 작은 수정 아이콘으로 30분 앞/뒤 이동 가능하게 한다.
- 30분 이동 시 예약자에게 알림이 가야 하므로 notifications 시트에 예약변경 알림 데이터를 생성한다.

## 교관 스케줄
- 교관별 요일 근무/휴일을 관리한다.
- 점심시간 배정 불가 체크 시 12:00~13:00 예약 불가.
- 교관 가능시간 밖 예약은 저장 차단.
- 출근 교관 수는 예약에 잡힌 교관 수가 아니라 교관 스케줄 기준으로 계산한다.
- 스케줄은 instructorSchedules의 weeklyAvailableTimes 또는 memo의 WEEKLY_CONFIG를 확인한다.
- 필요 시 instructors 시트의 weeklyOffDays, weeklyAvailableTimes도 보조 확인한다.

## 대시보드 방향
- 운영자가 아침에 켜놓고 쓰는 화면으로 구성한다.
- 최근 회원가입은 중요도가 낮으므로 주요 카드에서 제외한다.
- 핵심 구성:
  - 상단 요약 카드
  - 운항 일정
  - 앞으로 7일 예약 현황
  - 예약 유형 분포
  - 다가오는 예약
  - 교관별 오늘 일정
  - 오늘 처리할 일
- 운항 일정에는 날짜 드롭다운과 교관 필터가 있어야 한다.
- 최근 예약에는 예약번호 대신 예약자, 시간, 항공기, 교관/기장, 상태를 표시한다.
- 요청 예약은 대시보드에서도 승인/반려 가능하게 한다.
- 렌탈비행은 솔로 비행이므로 담당자/교관 표시를 하지 않는다.
- PFI 블록은 시간선을 넘지 않게 하고 PFI 글자를 중앙에 작게 표시한다.

## 알림
- 오른쪽 상단 종모양 알림을 사용한다.
- 예약 승인 대기와 회원 승인 대기를 표시한다.
- 사이드바의 예약관리/회원관리에도 대기 건수 배지를 표시한다.
- 실제 문자/카카오 연동 전까지는 notifications 시트에 발송대상 데이터를 생성한다.

## 회원 승인
- 앱 회원가입 시 users.status = 승인대기
- 관리자 /users에서 승인하면 users.status = 승인완료
- 승인 후 가입유형에 따라 자동 등록:
  - 교육/교육생/학생 → students 시트
  - 렌탈/렌탈기장/rental → rentalPilots 시트
- 예약 API에서 회원 승인 여부를 직접 막지는 않는다. 앱에서 승인완료일 때 예약 기능을 열도록 한다.

## 교육비
trainingCharges 시트는 기존 컬럼을 유지하고 뒤에 시간관리 컬럼을 추가한다.

현재/권장 헤더:
chargeId	userId	studentId	bookingId	flightLogId	chargeDate	chargeType	description	amount	paymentStatus	paymentMethod	paidAt	memo	createdAt	studentName	chargeHours	usedHours	remainingHours	paidAmount	unpaidAmount	hourlyRate	updatedAt

교육비 관리는:
- 20시간 단위 충전
- 사용시간
- 잔여시간
- 청구금액
- 납부금액
- 미납금액
- 시간당 단가
를 관리한다.

## 충돌 주의
아래 파일은 있으면 안 된다.
- src/app/api/notifications/page.tsx
- src/app/notifications/route.ts

정상 구조:
- src/app/api/notifications/route.ts
- src/app/notifications/page.tsx

## 최근 주의 오류
- Next.js App Router에서 같은 경로에 route.ts와 page.tsx가 함께 있으면 충돌한다.
- /api/notifications에는 route.ts만 있어야 한다.
- /notifications에는 page.tsx만 있어야 한다.