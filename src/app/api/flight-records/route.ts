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

  return pickAllowed(
    {
      flight_record_id: id,
      booking_id: nullableText(input.bookingId || input.booking_id),
      flight_date: nullableDate(input.flightDate || input.flight_date),
      flight_type: text(input.flightType || input.flight_type || "체험비행"),
      instructor_id: nullableText(input.instructorId || input.instructor_id),
      instructor_name: text(input.instructorName || input.instructor_name),
      aircraft_id: nullableText(input.aircraftId || input.aircraft_id),
      aircraft_name: text(input.aircraftName || input.aircraft_name),
      customer_name: text(input.customerName || input.customer_name),
      actual_start_time: timeText(input.actualStartTime || input.actual_start_time),
      actual_end_time: timeText(input.actualEndTime || input.actual_end_time),
      actual_flight_minutes: numberOrNull(
        input.actualFlightMinutes || input.actual_flight_minutes,
      ),
      settlement_minutes: numberOrNull(
        input.settlementMinutes || input.settlement_minutes,
      ),
      status: text(input.status || "정산대상"),
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

function buildPendingRecordFromBooking(booking: JsonRecord) {
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

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action === "addFlightRecord" || action === "addRow") {
    const explicitId = text(data.flightRecordId || data.flight_record_id);

    if (explicitId) {
      const saved = await updateRow(
        "flight_records",
        "flight_record_id",
        explicitId,
        normalizeFlightRecord(data, false),
      );
      return { message: "비행실적을 수정했습니다.", flightRecord: saved, data: saved };
    }

    const bookingId = text(data.bookingId || data.booking_id);
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
          normalizeFlightRecord({ ...data, flightRecordId: existingId }, false),
        );
        return { message: "기존 예약 비행실적을 수정했습니다.", flightRecord: saved, data: saved };
      }
    }

    const saved = await insertRow("flight_records", normalizeFlightRecord(data, true));
    return { message: "비행실적을 등록했습니다.", flightRecord: saved, data: saved };
  }

  if (action === "updateFlightRecord" || action === "updateRow") {
    const row = normalizeFlightRecord(data, false);
    const id = text(data.flightRecordId || data.flight_record_id || row.flight_record_id);
    const saved = await updateRow("flight_records", "flight_record_id", id, row);
    return { message: "비행실적을 수정했습니다.", flightRecord: saved, data: saved };
  }

  throw new Error(`지원하지 않는 비행실적 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();

  try {
    let tableReady = true;
    let flightRecords: JsonRecord[] = [];
    const bookings = await selectOperationBookings();

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
      .map((booking) => buildPendingRecordFromBooking(booking));

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
