import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  JsonRecord,
  buildId,
  insertRow,
  nowIso,
  numberOrNull,
  pickAllowed,
  text,
  timeText,
  toCamelObject,
  updateRow,
} from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FLIGHT_RECORD_COLUMNS = [
  "flight_record_id",
  "booking_id",
  "flight_date",
  "flight_type",
  "instructor_id",
  "instructor_name",
  "aircraft_id",
  "aircraft_name",
  "customer_name",
  "user_id",
  "student_id",
  "pilot_id",
  "actual_start_time",
  "actual_end_time",
  "actual_flight_minutes",
  "settlement_minutes",
  "status",
  "source_type",
  "memo",
  "created_at",
  "updated_at",
];

function nullableText(value: unknown) {
  const raw = text(value);
  return raw || null;
}

function nullableDate(value: unknown) {
  const raw = text(value);
  return raw || null;
}

function normalizeFlightRecord(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.flightRecordId || input.flight_record_id) || buildId("FR");
  const normalizedFlightType = text(
    input.flightType ||
      input.flight_type ||
      input.bookingType ||
      input.booking_type ||
      input.reservationType ||
      input.reservation_type ||
      (text(input.studentId || input.student_id || input.userId || input.user_id) ? "교육비행" : "체험비행"),
  );
  const calculatedMinutes = minutesBetween(
    input.actualStartTime || input.actual_start_time,
    input.actualEndTime || input.actual_end_time,
  );

  return pickAllowed(
    {
      flight_record_id: id,
      booking_id: nullableText(input.bookingId || input.booking_id),
      flight_date: nullableDate(input.flightDate || input.flight_date || input.bookingDate || input.booking_date),
      flight_type: normalizedFlightType,
      instructor_id: nullableText(input.instructorId || input.instructor_id),
      instructor_name: text(input.instructorName || input.instructor_name),
      aircraft_id: nullableText(input.aircraftId || input.aircraft_id),
      aircraft_name: text(input.aircraftName || input.aircraft_name),
      customer_name: text(input.customerName || input.customer_name),
      user_id: nullableText(input.userId || input.user_id),
      student_id: nullableText(input.studentId || input.student_id),
      pilot_id: nullableText(input.pilotId || input.pilot_id),
      actual_start_time: timeText(input.actualStartTime || input.actual_start_time),
      actual_end_time: timeText(input.actualEndTime || input.actual_end_time),
      actual_flight_minutes:
        numberOrNull(input.actualFlightMinutes || input.actual_flight_minutes) ??
        (calculatedMinutes > 0 ? calculatedMinutes : null),
      settlement_minutes:
        numberOrNull(input.settlementMinutes || input.settlement_minutes) ??
        numberOrNull(input.actualFlightMinutes || input.actual_flight_minutes) ??
        (calculatedMinutes > 0 ? calculatedMinutes : null),
      status: text(input.status || "완료"),
      source_type: text(input.sourceType || input.source_type || "manual"),
      memo: text(input.memo),
      created_at: text(input.createdAt || input.created_at) || (isCreate ? now : undefined),
      updated_at: now,
    },
    FLIGHT_RECORD_COLUMNS,
  );
}

function isMissingTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("flight_records") &&
    (message.includes("does not exist") ||
      message.includes("Could not find") ||
      message.includes("schema cache") ||
      message.includes("42P01"))
  );
}

function kstDateParts(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}

function dateText(date: Date) {
  const { year, month, day } = kstDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const { year, month, day } = kstDateParts(date);
  return new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0));
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

function minutesValue(row: JsonRecord) {
  return Math.max(
    Math.round(
      Number(row.actualFlightMinutes || row.actual_flight_minutes || row.settlementMinutes || row.settlement_minutes || 0) ||
        minutesBetween(row.actualStartTime || row.actual_start_time, row.actualEndTime || row.actual_end_time) ||
        0,
    ),
    0,
  );
}

function activeFlightRecord(row: JsonRecord) {
  const status = text(row.status).replaceAll(" ", "");
  return !["작성대기", "대기", "취소", "기상취소", "노쇼", "반려", "삭제"].some((item) => status.includes(item));
}

function educationFlightRecord(row: JsonRecord) {
  const type = text(row.flightType || row.flight_type || row.bookingType || row.booking_type || row.reservationType || row.reservation_type);
  if (!type) return true;
  if (type.includes("체험") || type.includes("렌탈") || type.includes("기타") || type.includes("자가")) return false;
  return true;
}

function studentDeductedMinutes(row: JsonRecord) {
  if (!activeFlightRecord(row)) return 0;
  if (!educationFlightRecord(row)) return 0;
  return minutesValue(row);
}

function latestDateFromRecords(records: JsonRecord[]) {
  return records
    .map((row) => text(row.flight_date || row.flightDate).slice(0, 10))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || "";
}

function currentChargedMinutes(row: JsonRecord) {
  const minuteCandidates = [
    row.total_charged_minutes,
    row.charged_training_minutes,
    row.initial_charge_minutes,
  ];

  for (const value of minuteCandidates) {
    const number = Number(value || 0);
    if (Number.isFinite(number) && number > 0) return Math.round(number);
  }

  const hours = Number(row.initial_charge_hours || 0);
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 0;
}

function isOperationBooking(row: JsonRecord) {
  const type = text(
    row.bookingType ||
      row.booking_type ||
      row.reservationType ||
      row.reservation_type ||
      row.type,
  );
  if (!type) return false;
  if (type.includes("교육")) return false;
  return (
    type.includes("체험") ||
    type.includes("PFI") ||
    type.includes("렌탈") ||
    type.includes("자가") ||
    type.includes("기타")
  );
}

function isActiveBooking(row: JsonRecord) {
  const status = text(row.status);
  return !["취소", "기상취소", "노쇼", "반려"].includes(status);
}

function normalizedKey(value: unknown) {
  return text(value).replace(/\s/g, "").toLowerCase();
}

function courseMinutes(row: JsonRecord) {
  return (
    Number(row.durationMinutes || row.duration_minutes || 0) ||
    Number(row.defaultMinutes || row.default_minutes || 0) ||
    Number(row.minutes || row.minute || 0) ||
    0
  );
}

function findCourseForBooking(booking: JsonRecord, courseCatalog: JsonRecord[]) {
  const courseName = normalizedKey(booking.courseName || booking.course_name || booking.course || booking.courseId || booking.course_id);
  const bookingTypeName = normalizedKey(booking.bookingType || booking.booking_type || booking.reservationType || booking.reservation_type);

  return (
    courseCatalog.find((course) => {
      const names = [course.courseName, course.course_name, course.name, course.courseId, course.course_id]
        .map(normalizedKey)
        .filter(Boolean);
      return courseName && names.includes(courseName);
    }) ||
    courseCatalog.find((course) => {
      const type = normalizedKey(course.courseType || course.course_type);
      return bookingTypeName && type && (type === bookingTypeName || bookingTypeName.includes(type) || type.includes(bookingTypeName));
    }) ||
    null
  );
}

function operationMinutesForBooking(booking: JsonRecord, courseCatalog: JsonRecord[]) {
  const scheduledMinutes =
    Number(booking.durationMinutes || booking.duration_minutes || 0) ||
    minutesBetween(booking.startTime || booking.start_time, booking.endTime || booking.end_time) ||
    30;
  const type = text(
    booking.bookingType ||
      booking.booking_type ||
      booking.reservationType ||
      booking.reservation_type,
    "체험비행",
  );

  if (type.includes("체험")) {
    const course = findCourseForBooking(booking, courseCatalog);
    const minutes = course ? courseMinutes(course) : 0;
    if (minutes > 0) return minutes;
  }

  return scheduledMinutes;
}

function buildPendingRecordFromBooking(booking: JsonRecord, courseCatalog: JsonRecord[]) {
  const scheduledMinutes = operationMinutesForBooking(booking, courseCatalog);
  const type = text(
    booking.bookingType ||
      booking.booking_type ||
      booking.reservationType ||
      booking.reservation_type,
    "체험비행",
  );

  return {
    flightRecordId: "",
    bookingId: text(booking.bookingId || booking.booking_id || booking.id),
    flightDate: text(booking.bookingDate || booking.booking_date),
    flightType: type,
    instructorId: text(booking.instructorId || booking.instructor_id),
    instructorName: text(booking.instructorName || booking.instructor_name),
    aircraftId: text(booking.aircraftId || booking.aircraft_id),
    aircraftName: text(booking.aircraftName || booking.aircraft_name || booking.aircraft),
    customerName: text(booking.userName || booking.user_name || booking.name || booking.customerName),
    userId: text(booking.userId || booking.user_id),
    studentId: text(booking.studentId || booking.student_id),
    pilotId: text(booking.pilotId || booking.pilot_id),
    actualStartTime: timeText(booking.startTime || booking.start_time),
    actualEndTime: timeText(booking.endTime || booking.end_time),
    actualFlightMinutes: scheduledMinutes,
    settlementMinutes: scheduledMinutes,
    status: "작성대기",
    sourceType: "booking",
    memo: "",
  };
}

async function selectFlightRecords() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("flight_records")
    .select("*")
    .order("flight_date", { ascending: false })
    .order("actual_start_time", { ascending: true })
    .limit(1000);

  if (error) {
    const wrapped = new Error(error.message);
    throw wrapped;
  }

  return (data || []).map((row) => toCamelObject(row as JsonRecord));
}

async function selectOperationBookings() {
  const supabase = getSupabaseServerClient();
  const today = new Date();
  const fromDate = dateText(addDays(today, -14));
  const toDate = dateText(addDays(today, 14));

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: false })
    .order("start_time", { ascending: true });

  if (error) throw new Error(`bookings 조회 실패: ${error.message}`);

  return (data || [])
    .map((row) => toCamelObject(row as JsonRecord))
    .filter((row) => isOperationBooking(row) && isActiveBooking(row));
}

async function selectCourseCatalog() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("course_catalog").select("*");
  if (error) return [] as JsonRecord[];
  return (data || []).map((row) => toCamelObject(row as JsonRecord));
}


async function enrichRecordOwnerIds(data: JsonRecord) {
  const bookingId = text(data.bookingId || data.booking_id);
  const hasOwner = text(data.userId || data.user_id || data.studentId || data.student_id || data.pilotId || data.pilot_id);
  if (!bookingId || hasOwner) return data;

  const supabase = getSupabaseServerClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error || !booking) return data;

  const row = booking as JsonRecord;
  return {
    ...data,
    bookingType: text(data.bookingType || data.booking_type || row.booking_type),
    reservationType: text(data.reservationType || data.reservation_type || row.reservation_type),
    flightType: text(data.flightType || data.flight_type || row.booking_type || row.reservation_type),
    userId: text(data.userId || data.user_id || row.user_id),
    studentId: text(data.studentId || data.student_id || row.student_id),
    pilotId: text(data.pilotId || data.pilot_id || row.pilot_id),
    customerName: text(data.customerName || data.customer_name || row.user_name || row.name),
    instructorId: text(data.instructorId || data.instructor_id || row.instructor_id),
    instructorName: text(data.instructorName || data.instructor_name || row.instructor_name),
    aircraftId: text(data.aircraftId || data.aircraft_id || row.aircraft_id),
    aircraftName: text(data.aircraftName || data.aircraft_name || row.aircraft_name),
    flightDate: text(data.flightDate || data.flight_date || row.booking_date),
    actualStartTime: timeText(data.actualStartTime || data.actual_start_time || row.start_time),
    actualEndTime: timeText(data.actualEndTime || data.actual_end_time || row.end_time),
  };
}

async function selectStudentForRecord(record: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const studentId = text(record.studentId || record.student_id);
  const userId = text(record.userId || record.user_id);
  const name = text(record.customerName || record.customer_name);
  const phone = text(record.phone).replace(/[^0-9]/g, "");

  if (studentId) {
    const { data, error } = await supabase.from("students").select("*").eq("student_id", studentId).maybeSingle();
    if (error) throw new Error(`교육생 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (userId) {
    const { data, error } = await supabase.from("students").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`교육생 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (phone) {
    const { data, error } = await supabase.from("students").select("*").eq("phone", phone).limit(1).maybeSingle();
    if (!error && data) return data as JsonRecord;
  }

  if (name) {
    const { data, error } = await supabase.from("students").select("*").eq("name", name).limit(1).maybeSingle();
    if (!error && data) return data as JsonRecord;
  }

  return null;
}

async function selectStudentFlightRecords(student: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const studentId = text(student.student_id || student.studentId);
  const userId = text(student.user_id || student.userId);
  const queries = [];

  if (studentId) queries.push(supabase.from("flight_records").select("*").eq("student_id", studentId));
  if (userId) queries.push(supabase.from("flight_records").select("*").eq("user_id", userId));

  const results = await Promise.all(queries);
  const rows: JsonRecord[] = [];
  for (const result of results) {
    if (result.error) throw new Error(`교육생 비행시간 집계 실패: ${result.error.message}`);
    rows.push(...((result.data || []) as JsonRecord[]));
  }

  return Array.from(new Map(rows.map((row) => [text(row.flight_record_id || row.flightRecordId || row.id), row])).values());
}

async function refreshStudentFlightTimeFromRecords(record: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const student = await selectStudentForRecord(record);
  if (!student) return null;

  const records = await selectStudentFlightRecords(student);
  const completedRecords = records
    .map((row) => ({ row, minutes: studentDeductedMinutes(row) }))
    .filter((item) => item.minutes > 0);

  const usedMinutes = completedRecords.reduce((sum, item) => sum + item.minutes, 0);
  const chargedMinutes = currentChargedMinutes(student);
  const manualMinutes = Number(student.manual_training_minutes || student.manualTrainingMinutes || 0) || 0;
  const remainingMinutes = chargedMinutes > 0 ? Math.max(chargedMinutes - usedMinutes - manualMinutes, 0) : 0;
  const latestDate = latestDateFromRecords(completedRecords.map((item) => item.row));
  const now = nowIso();

  const updateRowData: JsonRecord = {
    used_training_minutes: usedMinutes,
    used_minutes: usedMinutes,
    used_training_hours: Number((usedMinutes / 60).toFixed(2)),
    used_hours: Number((usedMinutes / 60).toFixed(2)),
    completed_training_count: completedRecords.length,
    remaining_training_minutes: remainingMinutes,
    remaining_minutes: remainingMinutes,
    remaining_training_hours: Number((remainingMinutes / 60).toFixed(2)),
    remaining_hours: Number((remainingMinutes / 60).toFixed(2)),
    last_flight_date: latestDate || null,
    recent_flight_date: latestDate || null,
    updated_at: now,
  };

  const studentId = text(student.student_id || student.studentId);
  const { data, error } = await supabase
    .from("students")
    .update(updateRowData)
    .eq("student_id", studentId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`교육생 비행시간 반영 실패: ${error.message}`);
  return data ? toCamelObject(data as JsonRecord) : null;
}

async function syncFlightRecordSideEffects(sourceData: JsonRecord, savedRecord: JsonRecord) {
  const bookingId = text(savedRecord.bookingId || savedRecord.booking_id || sourceData.bookingId || sourceData.booking_id);
  const supabase = getSupabaseServerClient();

  if (bookingId) {
    await supabase
      .from("bookings")
      .update({ status: "완료", updated_at: nowIso() })
      .eq("booking_id", bookingId);
  }

  return refreshStudentFlightTimeFromRecords({ ...sourceData, ...savedRecord });
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action === "addFlightRecord" || action === "addRow") {
    const sourceData = await enrichRecordOwnerIds(data);
    const explicitId = text(sourceData.flightRecordId || sourceData.flight_record_id);

    if (explicitId) {
      const saved = await updateRow(
        "flight_records",
        "flight_record_id",
        explicitId,
        normalizeFlightRecord(sourceData, false),
      );
      const student = await syncFlightRecordSideEffects(sourceData, saved);
      return { message: "비행실적을 수정하고 비행시간을 반영했습니다.", flightRecord: saved, student, data: saved };
    }

    const bookingId = text(sourceData.bookingId || sourceData.booking_id);
    if (bookingId) {
      const supabase = getSupabaseServerClient();
      const { data: existing, error } = await supabase
        .from("flight_records")
        .select("flight_record_id")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`기존 비행실적 확인 실패: ${error.message}`);

      const existingId = text((existing || {}).flight_record_id);
      if (existingId) {
        const saved = await updateRow(
          "flight_records",
          "flight_record_id",
          existingId,
          normalizeFlightRecord({ ...sourceData, flightRecordId: existingId }, false),
        );
        const student = await syncFlightRecordSideEffects(sourceData, saved);
        return { message: "기존 예약 비행실적을 수정하고 비행시간을 반영했습니다.", flightRecord: saved, student, data: saved };
      }
    }

    const saved = await insertRow("flight_records", normalizeFlightRecord(sourceData, true));
    const student = await syncFlightRecordSideEffects(sourceData, saved);
    return { message: "비행실적을 등록하고 비행시간을 반영했습니다.", flightRecord: saved, student, data: saved };
  }

  if (action === "updateFlightRecord" || action === "updateRow") {
    const sourceData = await enrichRecordOwnerIds(data);
    const row = normalizeFlightRecord(sourceData, false);
    const id = text(sourceData.flightRecordId || sourceData.flight_record_id || row.flight_record_id);
    const saved = await updateRow("flight_records", "flight_record_id", id, row);
    const student = await syncFlightRecordSideEffects(sourceData, saved);
    return { message: "비행실적을 수정하고 비행시간을 반영했습니다.", flightRecord: saved, student, data: saved };
  }

  throw new Error(`지원하지 않는 비행실적 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();

  try {
    let tableReady = true;
    let flightRecords: JsonRecord[] = [];
    const [bookings, courseCatalog] = await Promise.all([selectOperationBookings(), selectCourseCatalog()]);

    try {
      flightRecords = await selectFlightRecords();
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      tableReady = false;
      flightRecords = [];
    }

    const savedBookingIds = new Set(
      flightRecords.map((item) => text(item.bookingId)).filter(Boolean),
    );
    const pendingFlightRecords = bookings
      .filter((booking) => !savedBookingIds.has(text(booking.bookingId || booking.id)))
      .map((booking) => buildPendingRecordFromBooking(booking, courseCatalog));

    const data = { flightRecords, pendingFlightRecords };

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-supabase-flight-records",
      tableReady,
      message: tableReady ? "" : "flight_records 테이블이 아직 없습니다.",
      ...data,
      data,
      counts: {
        flightRecords: flightRecords.length,
        pendingFlightRecords: pendingFlightRecords.length,
      },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message: error instanceof Error ? error.message : "비행실적 조회에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const result = await handlePost(body);
    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-supabase-flight-records",
      elapsedMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message: error instanceof Error ? error.message : "비행실적 처리에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
