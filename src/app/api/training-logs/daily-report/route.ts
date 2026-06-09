import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { JsonRecord, buildId, nowIso, text, timeText, toCamelObject } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FlightRecord = {
  id: string;
  source: "training_logs" | "flight_records";
  bookingId: string;
  flightDate: string;
  flightType: string;
  targetName: string;
  instructorId: string;
  instructorName: string;
  aircraftId: string;
  aircraftName: string;
  startTime: string;
  endTime: string;
  actualMinutes: number;
  settlementMinutes: number;
  content: string;
  publicMemo: string;
  internalMemo: string;
  cautionNotes: string;
  nextPlan: string;
  status: string;
};

function todayText() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function normalizeDate(value: unknown) {
  const raw = text(value);
  const matched = raw.match(/\d{4}-\d{2}-\d{2}/);
  return matched ? matched[0] : raw;
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

function numberValue(value: unknown, fallback = 0) {
  const raw = text(value);
  if (!raw) return fallback;
  const number = Number(raw);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedKey(value: unknown) {
  return text(value).replace(/\s/g, "").toLowerCase();
}

function courseMinutes(row: JsonRecord) {
  return (
    numberValue(row.durationMinutes || row.duration_minutes) ||
    numberValue(row.defaultMinutes || row.default_minutes) ||
    numberValue(row.minutes || row.minute)
  );
}

function findCourseForBooking(booking: JsonRecord | undefined, courseCatalog: JsonRecord[]) {
  if (!booking) return null;

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

function courseBasedExperienceMinutes(record: FlightRecord, bookingMap: Map<string, JsonRecord>, courseCatalog: JsonRecord[]) {
  if (record.flightType !== "체험비행" || !record.bookingId) return 0;
  const course = findCourseForBooking(bookingMap.get(record.bookingId), courseCatalog);
  return course ? courseMinutes(course) : 0;
}

function normalizeFlightType(value: unknown) {
  const raw = text(value, "기타");
  if (raw.includes("교육")) return "교육비행";
  if (raw.includes("체험")) return "체험비행";
  if (raw.includes("렌탈") || raw.includes("대여")) return "렌탈비행";
  if (raw.includes("동승")) return "동승비행";
  if (raw.includes("PFI")) return "기타";
  return raw || "기타";
}

function bookingType(row: JsonRecord) {
  return normalizeFlightType(
    row.bookingType ||
      row.booking_type ||
      row.reservationType ||
      row.reservation_type ||
      row.type,
  );
}

function isActiveBooking(row: JsonRecord) {
  const status = text(row.status);
  return !["취소", "기상취소", "노쇼", "반려"].includes(status);
}

function isFlightBooking(row: JsonRecord) {
  const type = text(
    row.bookingType ||
      row.booking_type ||
      row.reservationType ||
      row.reservation_type ||
      row.type,
  );
  if (!type) return true;
  return !type.includes("정비");
}

function toTrainingRecord(row: JsonRecord): FlightRecord {
  const startTime = timeText(row.actualStartTime || row.actual_start_time || row.scheduledStartTime || row.scheduled_start_time);
  const endTime = timeText(row.actualEndTime || row.actual_end_time || row.scheduledEndTime || row.scheduled_end_time);
  const actualMinutes =
    numberValue(row.actualFlightMinutes || row.actual_flight_minutes) ||
    minutesBetween(startTime, endTime) ||
    numberValue(row.deductedMinutes || row.deducted_minutes);

  return {
    id: text(row.trainingLogId || row.training_log_id) || buildId("DR-TL"),
    source: "training_logs",
    bookingId: text(row.bookingId || row.booking_id),
    flightDate: normalizeDate(row.trainingDate || row.training_date),
    flightType: normalizeFlightType(row.trainingType || row.training_type),
    targetName: text(row.studentName || row.student_name || row.customerName || row.customer_name),
    instructorId: text(row.instructorId || row.instructor_id),
    instructorName: text(row.instructorName || row.instructor_name),
    aircraftId: text(row.aircraftId || row.aircraft_id),
    aircraftName: text(row.aircraftName || row.aircraft_name),
    startTime,
    endTime,
    actualMinutes,
    settlementMinutes: numberValue(row.payableMinutes || row.payable_minutes, actualMinutes),
    content: text(row.trainingItems || row.training_items || row.lessonTitle || row.lesson_title),
    publicMemo: text(row.studentNotes || row.student_notes),
    internalMemo: text(row.instructorNotes || row.instructor_notes),
    cautionNotes: text(row.cautionNotes || row.caution_notes),
    nextPlan: text(row.nextTrainingPlan || row.next_training_plan),
    status: text(row.status || "작성완료"),
  };
}

function toFlightRecord(row: JsonRecord): FlightRecord {
  const startTime = timeText(row.actualStartTime || row.actual_start_time);
  const endTime = timeText(row.actualEndTime || row.actual_end_time);
  const actualMinutes = numberValue(row.actualFlightMinutes || row.actual_flight_minutes) || minutesBetween(startTime, endTime);

  return {
    id: text(row.flightRecordId || row.flight_record_id) || buildId("DR-FR"),
    source: "flight_records",
    bookingId: text(row.bookingId || row.booking_id),
    flightDate: normalizeDate(row.flightDate || row.flight_date),
    flightType: normalizeFlightType(row.flightType || row.flight_type),
    targetName: text(row.customerName || row.customer_name),
    instructorId: text(row.instructorId || row.instructor_id),
    instructorName: text(row.instructorName || row.instructor_name),
    aircraftId: text(row.aircraftId || row.aircraft_id),
    aircraftName: text(row.aircraftName || row.aircraft_name),
    startTime,
    endTime,
    actualMinutes,
    settlementMinutes: numberValue(row.settlementMinutes || row.settlement_minutes, actualMinutes),
    content: text(row.memo),
    publicMemo: "",
    internalMemo: text(row.memo),
    cautionNotes: "",
    nextPlan: "",
    status: text(row.status || "작성완료"),
  };
}

function toPendingFromBooking(row: JsonRecord) {
  const startTime = timeText(row.startTime || row.start_time);
  const endTime = timeText(row.endTime || row.end_time);
  const scheduledMinutes =
    numberValue(row.durationMinutes || row.duration_minutes) || minutesBetween(startTime, endTime);

  return {
    bookingId: text(row.bookingId || row.booking_id || row.id),
    flightDate: normalizeDate(row.bookingDate || row.booking_date),
    flightType: bookingType(row),
    targetName: text(row.userName || row.user_name || row.name || row.customerName || row.customer_name),
    instructorName: text(row.instructorName || row.instructor_name),
    aircraftName: text(row.aircraftName || row.aircraft_name || row.aircraft),
    startTime,
    endTime,
    scheduledMinutes,
    status: text(row.status),
  };
}

function addToSummary(map: Map<string, { count: number; minutes: number; settlementMinutes: number }>, key: string, minutes: number, settlementMinutes = minutes) {
  const label = key || "미지정";
  const current = map.get(label) || { count: 0, minutes: 0, settlementMinutes: 0 };
  current.count += 1;
  current.minutes += minutes;
  current.settlementMinutes += settlementMinutes;
  map.set(label, current);
}

function mapToRows(map: Map<string, { count: number; minutes: number; settlementMinutes: number }>) {
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "ko"));
}

async function selectRowsSafe(table: string, buildQuery: (table: string) => unknown) {
  try {
    const query = buildQuery(table) as { then: unknown };
    const { data, error } = await (query as PromiseLike<{ data: unknown; error: { message?: string } | null }>);
    if (error) throw new Error(error.message || `${table} 조회 실패`);
    return ((data || []) as JsonRecord[]).map((row) => toCamelObject(row));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (
      message.includes("does not exist") ||
      message.includes("Could not find") ||
      message.includes("schema cache") ||
      message.includes("42P01")
    ) {
      return [];
    }
    throw error;
  }
}

async function selectDailyCheck(date: string) {
  const supabase = getSupabaseServerClient();
  try {
    const { data, error } = await supabase
      .from("daily_flight_report_checks")
      .select("*")
      .eq("report_date", date)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toCamelObject(data as JsonRecord) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (
      message.includes("daily_flight_report_checks") &&
      (message.includes("does not exist") || message.includes("schema cache") || message.includes("42P01"))
    ) {
      return null;
    }
    throw error;
  }
}

async function buildReport(date: string) {
  const supabase = getSupabaseServerClient();

  const [trainingLogs, flightRecords, bookings, maintenanceRows, courseCatalog, check] = await Promise.all([
    selectRowsSafe("training_logs", (table) =>
      supabase.from(table).select("*").eq("training_date", date).order("actual_start_time", { ascending: true }),
    ),
    selectRowsSafe("flight_records", (table) =>
      supabase.from(table).select("*").eq("flight_date", date).order("actual_start_time", { ascending: true }),
    ),
    selectRowsSafe("bookings", (table) =>
      supabase.from(table).select("*").eq("booking_date", date).order("start_time", { ascending: true }),
    ),
    selectRowsSafe("aircraft_maintenance", (table) =>
      supabase.from(table).select("*").order("inspection_date", { ascending: false }).limit(1000),
    ),
    selectRowsSafe("course_catalog", (table) => supabase.from(table).select("*")),
    selectDailyCheck(date),
  ]);

  const bookingMap = new Map<string, JsonRecord>();
  bookings.forEach((booking) => {
    const id = text(booking.bookingId || booking.booking_id || booking.id);
    if (id) bookingMap.set(id, booking);
  });

  function applyCourseMinutes(record: FlightRecord): FlightRecord {
    const minutes = courseBasedExperienceMinutes(record, bookingMap, courseCatalog);
    return minutes > 0 ? { ...record, actualMinutes: minutes, settlementMinutes: minutes } : record;
  }

  const recordsByKey = new Map<string, FlightRecord>();

  trainingLogs.map(toTrainingRecord).map(applyCourseMinutes).forEach((record) => {
    const key = record.bookingId ? `booking:${record.bookingId}` : `training:${record.id}`;
    recordsByKey.set(key, record);
  });

  flightRecords.map(toFlightRecord).map(applyCourseMinutes).forEach((record) => {
    const key = record.bookingId ? `booking:${record.bookingId}` : `flight:${record.id}`;
    if (!recordsByKey.has(key)) recordsByKey.set(key, record);
  });

  const records = Array.from(recordsByKey.values()).sort((a, b) => {
    const aTime = a.startTime || "99:99";
    const bTime = b.startTime || "99:99";
    return aTime.localeCompare(bTime, "ko");
  });

  const savedBookingIds = new Set(records.map((item) => item.bookingId).filter(Boolean));
  const missingRecords = bookings
    .filter((row) => isActiveBooking(row) && isFlightBooking(row))
    .map(toPendingFromBooking)
    .filter((row) => row.bookingId && !savedBookingIds.has(row.bookingId));

  const typeMap = new Map<string, { count: number; minutes: number; settlementMinutes: number }>();
  const instructorMap = new Map<string, { count: number; minutes: number; settlementMinutes: number }>();
  const aircraftMap = new Map<string, { count: number; minutes: number; settlementMinutes: number }>();
  let noInstructorCount = 0;
  let noInstructorMinutes = 0;

  records.forEach((record) => {
    addToSummary(typeMap, record.flightType, record.actualMinutes, record.settlementMinutes);
    addToSummary(aircraftMap, record.aircraftName || record.aircraftId, record.actualMinutes, record.settlementMinutes);

    if (record.instructorName) {
      addToSummary(instructorMap, record.instructorName, record.actualMinutes, record.settlementMinutes);
    } else {
      noInstructorCount += 1;
      noInstructorMinutes += record.actualMinutes;
    }
  });

  const notes = records
    .flatMap((record) => [
      record.content ? { type: "비행내용", record, memo: record.content } : null,
      record.internalMemo ? { type: "내부메모", record, memo: record.internalMemo } : null,
      record.cautionNotes ? { type: "유의사항", record, memo: record.cautionNotes } : null,
      record.nextPlan ? { type: "다음계획", record, memo: record.nextPlan } : null,
    ])
    .filter(Boolean);

  const unresolvedSquawks = maintenanceRows
    .filter((row) => {
      const memo = text(row.memo);
      const maintenanceType = text(row.maintenanceType || row.maintenance_type);
      const status = text(row.status);
      const close = memo.includes("Close 여부: Y") || memo.includes("Close 여부: 완료") || status === "완료";
      return (memo.includes("결함/Squawk") || maintenanceType.includes("결함") || maintenanceType.includes("Squawk")) && !close;
    })
    .map((row) => ({
      maintenanceId: text(row.maintenanceId || row.maintenance_id),
      aircraftName: text(row.aircraftName || row.aircraft_name || row.registrationNo || row.registration_no),
      inspectionDate: normalizeDate(row.inspectionDate || row.inspection_date),
      status: text(row.status),
      memo: text(row.memo),
    }));

  const totalMinutes = records.reduce((sum, record) => sum + record.actualMinutes, 0);

  return {
    date,
    records,
    missingRecords,
    summaries: {
      totalCount: records.length,
      totalMinutes,
      missingCount: missingRecords.length,
      byType: mapToRows(typeMap),
      byInstructor: mapToRows(instructorMap),
      byAircraft: mapToRows(aircraftMap),
      noInstructor: { count: noInstructorCount, minutes: noInstructorMinutes },
    },
    notes,
    unresolvedSquawks,
    check,
  };
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const date = normalizeDate(request.nextUrl.searchParams.get("date") || todayText());
    const report = await buildReport(date);

    return NextResponse.json({
      ok: true,
      success: true,
      service: "skynuri-daily-flight-report",
      ...report,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: error instanceof Error ? error.message : "일일 비행기록 보고서를 불러오지 못했습니다.",
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
    const action = text(body.action);
    const data = (body.data || body) as JsonRecord;

    if (action !== "confirmDailyReport") {
      throw new Error(`지원하지 않는 action입니다: ${action}`);
    }

    const reportDate = normalizeDate(data.reportDate || data.report_date || todayText());
    const checkedBy = text(data.checkedBy || data.checked_by || "대표");
    const memo = text(data.memo);
    const now = nowIso();
    const supabase = getSupabaseServerClient();

    const row = {
      report_date: reportDate,
      checked_by: checkedBy,
      checked_at: now,
      memo,
      updated_at: now,
    };

    const { data: saved, error } = await supabase
      .from("daily_flight_report_checks")
      .upsert(row, { onConflict: "report_date" })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      success: true,
      message: "일일 비행기록 보고서를 확인 완료 처리했습니다.",
      check: toCamelObject(saved as JsonRecord),
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "일일 비행기록 보고서 확인 처리에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
