import { NextRequest, NextResponse } from "next/server";
import {
  JsonRecord,
  addDaysText,
  getMobileAuthContext,
  mapRows,
  mobileSupabase,
  text,
  timeText,
  todayText,
  toCamelObject,
} from "@/lib/supabase/mobile-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function numberValue(value: unknown) {
  const raw = text(value);
  if (!raw) return 0;
  const number = Number(raw);
  return Number.isFinite(number) ? number : 0;
}

function minutesFieldValue(row: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(row[key]);
    if (value > 0) return value;
  }
  return 0;
}

function remainingMinutesOf(student: JsonRecord, rentalPilot: JsonRecord) {
  const studentMinutes = minutesFieldValue(student, [
    "remainingTrainingMinutes",
    "remaining_training_minutes",
    "remainingMinutes",
    "remaining_minutes",
  ]);
  if (studentMinutes > 0) return studentMinutes;

  const rentalMinutes = minutesFieldValue(rentalPilot, [
    "remainingFlightMinutes",
    "remaining_flight_minutes",
    "remainingRentalMinutes",
    "remaining_rental_minutes",
    "remainingMinutes",
    "remaining_minutes",
  ]);
  return rentalMinutes;
}

function chargedMinutesOf(student: JsonRecord, rentalPilot: JsonRecord) {
  const studentMinutes = minutesFieldValue(student, [
    "totalChargedMinutes",
    "total_charged_minutes",
    "chargedTrainingMinutes",
    "charged_training_minutes",
    "initialChargeMinutes",
    "initial_charge_minutes",
  ]);
  if (studentMinutes > 0) return studentMinutes;

  return minutesFieldValue(rentalPilot, [
    "totalChargedMinutes",
    "total_charged_minutes",
    "chargedMinutes",
    "charged_minutes",
  ]);
}

function minutesBetween(startTime: unknown, endTime: unknown) {
  const start = timeText(startTime);
  const end = timeText(endTime);
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);

  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(endMinute)
  ) {
    return 0;
  }

  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return endTotal > startTotal ? endTotal - startTotal : 0;
}

function normalizeDate(value: unknown) {
  return text(value).slice(0, 10);
}

function isCompletedBooking(row: JsonRecord) {
  const status = text(row.status).replaceAll(" ", "");
  return ["완료", "비행완료", "운항완료", "정산대상", "정산완료", "completed", "done"].some((item) =>
    status.toLowerCase().includes(item.toLowerCase()),
  );
}

function isCancelledStatus(value: unknown) {
  const status = text(value).replaceAll(" ", "");
  return ["취소", "기상취소", "노쇼", "반려", "cancel", "cancelled", "rejected"].some((item) =>
    status.toLowerCase().includes(item.toLowerCase()),
  );
}


function isBlankOrUnassignedInstructorName(value: unknown) {
  const name = text(value).replaceAll(" ", "").toLowerCase();
  return !name || ["미배정", "미지정", "없음", "-", "unassigned", "none", "null"].includes(name);
}

async function selectInstructorNameMap(instructorIds: string[]) {
  const ids = Array.from(new Set(instructorIds.map((id) => text(id)).filter(Boolean)));
  if (!ids.length) return new Map<string, string>();

  const supabase = mobileSupabase();
  const { data, error } = await supabase
    .from("instructors")
    .select("instructor_id,name,instructor_name")
    .in("instructor_id", ids);

  if (error) {
    return new Map<string, string>();
  }

  const map = new Map<string, string>();
  for (const row of mapRows(data as JsonRecord[])) {
    const id = text(row.instructorId || row.instructor_id);
    const name = text(row.name || row.instructorName || row.instructor_name);
    if (id && name) map.set(id, name);
  }
  return map;
}

function bookingMapById(bookings: JsonRecord[]) {
  const map = new Map<string, JsonRecord>();
  for (const booking of bookings) {
    const bookingId = bookingIdOf(booking);
    if (bookingId) map.set(bookingId, booking);
  }
  return map;
}

async function enrichInstructorNames(records: JsonRecord[], bookings: JsonRecord[]) {
  const bookingById = bookingMapById(bookings);
  const instructorIds = new Set<string>();

  for (const record of records) {
    const booking = bookingById.get(text(record.bookingId || record.booking_id));
    const recordInstructorId = text(record.instructorId || record.instructor_id);
    const bookingInstructorId = text(booking?.instructorId || booking?.instructor_id);
    const instructorId = recordInstructorId || bookingInstructorId;
    if (instructorId) instructorIds.add(instructorId);
  }

  const nameMap = await selectInstructorNameMap(Array.from(instructorIds));

  return records.map((record) => {
    const booking = bookingById.get(text(record.bookingId || record.booking_id));
    const recordInstructorId = text(record.instructorId || record.instructor_id);
    const bookingInstructorId = text(booking?.instructorId || booking?.instructor_id);
    const instructorId = recordInstructorId || bookingInstructorId;

    const recordInstructorName = text(record.instructorName || record.instructor_name);
    const bookingInstructorName = text(booking?.instructorName || booking?.instructor_name);
    const resolvedName =
      (!isBlankOrUnassignedInstructorName(recordInstructorName) && recordInstructorName) ||
      (!isBlankOrUnassignedInstructorName(bookingInstructorName) && bookingInstructorName) ||
      (instructorId ? nameMap.get(instructorId) : "") ||
      "";

    return {
      ...record,
      instructorId,
      instructorName: resolvedName,
      instructor_id: instructorId,
      instructor_name: resolvedName,
    };
  });
}

function bookingIdOf(row: JsonRecord) {
  return text(row.bookingId || row.booking_id || row.id);
}

function flightRecordIdOf(row: JsonRecord) {
  return text(row.flightRecordId || row.flight_record_id || row.id);
}

function trainingLogIdOf(row: JsonRecord) {
  return text(row.trainingLogId || row.training_log_id || row.id);
}

function flightDateOf(row: JsonRecord) {
  return normalizeDate(row.flightDate || row.flight_date || row.bookingDate || row.booking_date || row.requestDate || row.request_date);
}

function startTimeOf(row: JsonRecord) {
  return timeText(row.actualStartTime || row.actual_start_time || row.startTime || row.start_time);
}

function endTimeOf(row: JsonRecord) {
  return timeText(row.actualEndTime || row.actual_end_time || row.endTime || row.end_time);
}

function minutesOf(row: JsonRecord) {
  return (
    numberValue(row.actualFlightMinutes || row.actual_flight_minutes) ||
    numberValue(row.settlementMinutes || row.settlement_minutes) ||
    numberValue(row.durationMinutes || row.duration_minutes) ||
    minutesBetween(startTimeOf(row), endTimeOf(row))
  );
}

function detailTextOf(row: JsonRecord) {
  const parts = [
    row.logContent,
    row.log_content,
    row.content,
    row.trainingContent,
    row.training_content,
    row.lessonContent,
    row.lesson_content,
    row.debriefing,
    row.review,
    row.note,
    row.memo,
  ]
    .map((value) => text(value))
    .filter(Boolean);

  return Array.from(new Set(parts)).join("\n");
}

function mapFlightRecord(row: JsonRecord, source: "flight_record" | "training_log" | "booking") {
  const camel = toCamelObject(row);
  const date = flightDateOf(camel);
  const startTime = startTimeOf(camel);
  const endTime = endTimeOf(camel);
  const minutes = minutesOf(camel);
  const id = flightRecordIdOf(camel) || bookingIdOf(camel);

  return {
    ...camel,
    id,
    source,
    flightRecordId: flightRecordIdOf(camel),
    bookingId: bookingIdOf(camel),
    flightDate: date,
    flightType: text(camel.flightType || camel.flight_type || camel.bookingType || camel.booking_type || camel.reservationType || camel.reservation_type),
    aircraftId: text(camel.aircraftId || camel.aircraft_id),
    aircraftName: text(camel.aircraftName || camel.aircraft_name || camel.aircraft),
    instructorId: text(camel.instructorId || camel.instructor_id),
    instructorName: text(camel.instructorName || camel.instructor_name),
    customerName: text(camel.customerName || camel.customer_name || camel.userName || camel.user_name || camel.name),
    actualStartTime: startTime,
    actualEndTime: endTime,
    actualFlightMinutes: minutes,
    settlementMinutes: numberValue(camel.settlementMinutes || camel.settlement_minutes) || minutes,
    status: text(camel.status || (source === "booking" ? "비행완료" : "")),
    memo: text(camel.memo),
    logDetail: detailTextOf(camel),
    lessonContent: text(camel.lessonContent || camel.lesson_content || camel.trainingContent || camel.training_content),
    debriefing: text(camel.debriefing || camel.review),
  };
}

function mapTrainingLog(row: JsonRecord) {
  const camel = toCamelObject(row);
  const date = normalizeDate(camel.trainingDate || camel.training_date);
  const startTime = timeText(camel.actualStartTime || camel.actual_start_time || camel.scheduledStartTime || camel.scheduled_start_time);
  const endTime = timeText(camel.actualEndTime || camel.actual_end_time || camel.scheduledEndTime || camel.scheduled_end_time);
  const minutes =
    numberValue(camel.deductedMinutes || camel.deducted_minutes) ||
    numberValue(camel.actualFlightMinutes || camel.actual_flight_minutes) ||
    minutesBetween(startTime, endTime);
  // 앱 비행일지에는 교육항목과 학생 앱 공개내용만 내려줍니다.
  // 교관 내부 메모, 과제, 유의사항, 다음 계획, 관리자 메모는 앱에서 제외합니다.
  const trainingItems = text(camel.trainingItems || camel.training_items);
  const studentAppContent = text(camel.studentNotes || camel.student_notes);
  const publicDetailParts = [trainingItems, studentAppContent].filter(Boolean);
  const logDetail = Array.from(new Set(publicDetailParts)).join("\n");

  return {
    ...camel,
    id: trainingLogIdOf(camel),
    source: "training_log",
    trainingLogId: trainingLogIdOf(camel),
    bookingId: bookingIdOf(camel),
    flightDate: date,
    flightType: text(camel.trainingType || camel.training_type || "교육비행"),
    aircraftId: text(camel.aircraftId || camel.aircraft_id),
    aircraftName: text(camel.aircraftName || camel.aircraft_name || camel.aircraft),
    instructorId: text(camel.instructorId || camel.instructor_id),
    instructorName: text(camel.instructorName || camel.instructor_name),
    customerName: text(camel.studentName || camel.student_name || camel.customerName || camel.customer_name || camel.userName || camel.user_name || camel.name),
    userId: text(camel.userId || camel.user_id),
    studentId: text(camel.studentId || camel.student_id),
    actualStartTime: startTime,
    actualEndTime: endTime,
    actualFlightMinutes: minutes,
    settlementMinutes: minutes,
    status: text(camel.status || "작성완료"),
    memo: "",
    logDetail,
    lessonTitle: "",
    trainingItems,
    studentNotes: studentAppContent,
    homework: "",
    cautionNotes: "",
    nextTrainingPlan: "",
    lessonContent: trainingItems,
    debriefing: studentAppContent,
  };
}

function belongsToMe(row: JsonRecord, my: {
  userId: string;
  studentId: string;
  pilotId: string;
  name: string;
  email: string;
  phone: string;
  bookingIds: Set<string>;
}) {
  const userId = text(row.userId || row.user_id);
  const studentId = text(row.studentId || row.student_id);
  const pilotId = text(row.pilotId || row.pilot_id);
  const bookingId = bookingIdOf(row);
  const email = text(row.email).toLowerCase();
  const phone = text(row.phone).replace(/[^0-9]/g, "");
  const name = text(row.customerName || row.customer_name || row.studentName || row.student_name || row.userName || row.user_name || row.name);

  if (userId && userId === my.userId) return true;
  if (studentId && my.studentId && studentId === my.studentId) return true;
  if (pilotId && my.pilotId && pilotId === my.pilotId) return true;
  if (bookingId && my.bookingIds.has(bookingId)) return true;
  if (email && my.email && email === my.email) return true;
  if (phone && my.phone && phone === my.phone) return true;
  if (name && my.name && name.replace(/\s/g, "") === my.name.replace(/\s/g, "")) return true;

  return false;
}

async function selectMyBookings(userId: string, fromDate: string, toDate: string) {
  const supabase = mobileSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("user_id", userId)
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) throw new Error(`예약 기반 비행기록 조회 실패: ${error.message}`);
  return mapRows(data as JsonRecord[]);
}

async function selectFlightRecords(fromDate: string, toDate: string) {
  const supabase = mobileSupabase();
  const { data, error } = await supabase
    .from("flight_records")
    .select("*")
    .gte("flight_date", fromDate)
    .lte("flight_date", toDate)
    .order("flight_date", { ascending: false })
    .order("actual_start_time", { ascending: false })
    .limit(1000);

  if (error) {
    const message = error.message || "";
    if (
      message.includes("flight_records") &&
      (message.includes("does not exist") || message.includes("schema cache") || message.includes("42P01"))
    ) {
      return [] as JsonRecord[];
    }
    throw new Error(`비행기록 조회 실패: ${message}`);
  }

  return mapRows(data as JsonRecord[]);
}

async function selectTrainingLogs(fromDate: string, toDate: string) {
  const supabase = mobileSupabase();
  const { data, error } = await supabase
    .from("training_logs")
    .select("*")
    .gte("training_date", fromDate)
    .lte("training_date", toDate)
    .order("training_date", { ascending: false })
    .order("actual_start_time", { ascending: false })
    .limit(1000);

  if (error) {
    const message = error.message || "";
    if (
      message.includes("training_logs") &&
      (message.includes("does not exist") || message.includes("schema cache") || message.includes("42P01"))
    ) {
      return [] as JsonRecord[];
    }
    throw new Error(`교육 비행일지 조회 실패: ${message}`);
  }

  return mapRows(data as JsonRecord[]);
}

function sortRecords(records: JsonRecord[]) {
  return records.sort((a, b) => {
    const aDate = flightDateOf(a);
    const bDate = flightDateOf(b);
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return endTimeOf(b).localeCompare(endTimeOf(a));
  });
}

function buildSummary(records: JsonRecord[], student: JsonRecord, rentalPilot: JsonRecord) {
  const totalMinutes = records.reduce((sum, row) => sum + minutesOf(row), 0);
  const latest = records[0] || {};
  const remainingMinutes = remainingMinutesOf(student, rentalPilot);
  const chargedMinutes = chargedMinutesOf(student, rentalPilot);

  return {
    recordCount: records.length,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    remainingMinutes,
    remainingHours: Math.round((remainingMinutes / 60) * 10) / 10,
    chargedMinutes,
    chargedHours: Math.round((chargedMinutes / 60) * 10) / 10,
    latestFlightDate: flightDateOf(latest),
    latestAircraftName: text(latest.aircraftName || latest.aircraft_name || latest.aircraft),
  };
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const today = todayText();
    const fromDate = text(searchParams.get("fromDate")) || addDaysText(today, -365);
    const toDate = text(searchParams.get("toDate")) || addDaysText(today, 30);

    const context = await getMobileAuthContext(request, searchParams.get("userId"));
    const user = (context.user || {}) as JsonRecord;
    const student = (context.student || {}) as JsonRecord;
    const rentalPilot = (context.rentalPilot || {}) as JsonRecord;

    const myBookings = await selectMyBookings(context.userId, fromDate, toDate);
    const bookingIds = new Set<string>(myBookings.map(bookingIdOf).filter(Boolean));

    const my = {
      userId: context.userId,
      studentId: text(student.studentId || student.student_id),
      pilotId: text(rentalPilot.pilotId || rentalPilot.pilot_id),
      name: text(user.name || student.name || rentalPilot.name),
      email: text(user.email).toLowerCase(),
      phone: text(user.phone).replace(/[^0-9]/g, ""),
      bookingIds,
    };

    const savedFlightRecords = (await selectFlightRecords(fromDate, toDate))
      .filter((row) => belongsToMe(row, my))
      .map((row) => mapFlightRecord(row, "flight_record"));

    const savedTrainingLogs = (await selectTrainingLogs(fromDate, toDate))
      .filter((row) => belongsToMe(row, my))
      .map((row) => mapTrainingLog(row));

    const savedBookingIds = new Set(
      [...savedFlightRecords, ...savedTrainingLogs].map((row) => text(row.bookingId)).filter(Boolean),
    );
    const completedBookingRecords = myBookings
      .filter((booking) => !savedBookingIds.has(bookingIdOf(booking)))
      .filter((booking) => isCompletedBooking(booking) && !isCancelledStatus(booking.status))
      .map((booking) => mapFlightRecord(booking, "booking"));

    const rawFlightLogs = sortRecords([...savedTrainingLogs, ...savedFlightRecords, ...completedBookingRecords]);
    const flightLogs = await enrichInstructorNames(rawFlightLogs, myBookings);
    const summary = buildSummary(flightLogs, student, rentalPilot);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-mobile-flightlogs",
      userId: context.userId,
      range: { fromDate, toDate },
      flightLogs,
      summary,
      data: { flightLogs, summary },
      counts: { flightLogs: flightLogs.length },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-mobile-flightlogs",
        message: error instanceof Error ? error.message : "비행기록 조회에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
