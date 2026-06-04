import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type JsonRecord = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateText(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeText(value: unknown) {
  const raw = text(value);
  const match = raw.match(/(\d{1,2}):(\d{1,2})/);
  if (!match) return raw ? raw.slice(0, 5) : "";
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}

function nullIfEmpty(value: unknown) {
  const raw = text(value);
  return raw ? raw : null;
}

function timeOrNull(value: unknown) {
  const valueText = timeText(value);
  return valueText ? valueText : null;
}

function dateOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

function numberOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toCamelKey(key: string) {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function toCamelObject(row: JsonRecord) {
  const result: JsonRecord = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    result[toCamelKey(key)] = value ?? "";
  });

  return result;
}

function removeUndefined(row: JsonRecord) {
  const result: JsonRecord = {};

  Object.entries(row).forEach(([key, value]) => {
    if (value === undefined) return;
    result[key] = value;
  });

  return result;
}

function withBookingAliases(row: JsonRecord) {
  const next = { ...row };

  if (next.aircraftName && !next.aircraft) next.aircraft = next.aircraftName;
  if (next.userName && !next.name) next.name = next.userName;
  if (next.instructorName && !next.instructor) next.instructor = next.instructorName;

  if (next.bookingId && !next.id) next.id = next.bookingId;
  if (next.bookingType && !next.type) next.type = next.bookingType;
  if (next.reservationType && !next.bookingType) next.bookingType = next.reservationType;

  return next;
}

function mapRows(rows: JsonRecord[] | null | undefined, alias = false) {
  return (rows || []).map((row) => {
    const camel = toCamelObject(row);
    return alias ? withBookingAliases(camel) : camel;
  });
}

function parseDateParam(value: string | null, fallback: string) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
}

function buildId(prefix: string) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

function normalizeBookingPayload(input: JsonRecord, existing?: JsonRecord) {
  const now = new Date().toISOString();
  const bookingId = text(input.bookingId || input.id || existing?.booking_id || existing?.bookingId) || buildId("BKG");

  const bookingDate = dateOrNull(input.bookingDate || input.booking_date || existing?.booking_date);
  const startTime = timeOrNull(input.startTime || input.start_time || existing?.start_time);
  const endTime = timeOrNull(input.endTime || input.end_time || existing?.end_time);

  if (!bookingDate) throw new Error("예약일을 선택하세요.");
  if (!startTime) throw new Error("시작시간을 선택하세요.");
  if (!endTime) throw new Error("종료시간을 선택하세요.");

  const bookingType = text(input.bookingType || input.booking_type || input.type || existing?.booking_type || "기타");
  const reservationType = text(input.reservationType || input.reservation_type || existing?.reservation_type || bookingType);

  const raw: JsonRecord = {
    booking_id: bookingId,
    booking_date: bookingDate,
    start_time: startTime,
    end_time: endTime,
    booking_type: bookingType,
    reservation_type: reservationType || bookingType,
    course_name: nullIfEmpty(input.courseName || input.course_name || existing?.course_name),
    user_id: nullIfEmpty(input.userId || input.user_id || existing?.user_id),
    user_name: nullIfEmpty(input.userName || input.user_name || input.name || existing?.user_name),
    phone: nullIfEmpty(input.phone || existing?.phone),
    instructor_id: nullIfEmpty(input.instructorId || input.instructor_id || existing?.instructor_id),
    instructor_name: nullIfEmpty(input.instructorName || input.instructor_name || existing?.instructor_name),
    aircraft_id: nullIfEmpty(input.aircraftId || input.aircraft_id || existing?.aircraft_id),
    aircraft_name: nullIfEmpty(input.aircraftName || input.aircraft_name || input.aircraft || existing?.aircraft_name),
    status: text(input.status || existing?.status || "확정"),
    payment_status: nullIfEmpty(input.paymentStatus || input.payment_status || existing?.payment_status),
    memo: nullIfEmpty(input.memo || existing?.memo),
    request_date: dateOrNull(input.requestDate || input.request_date || existing?.request_date || bookingDate),
    duration_minutes: numberOrNull(input.durationMinutes || input.duration_minutes || existing?.duration_minutes),
    buffer_end_time: timeOrNull(input.bufferEndTime || input.buffer_end_time || existing?.buffer_end_time),
    updated_at: now,
  };

  if (!existing?.created_at && !existing?.createdAt) {
    raw.created_at = text(input.createdAt || input.created_at) || now;
  }

  return removeUndefined(raw);
}

async function selectTable(table: string, options?: {
  orderColumn?: string;
  ascending?: boolean;
  limit?: number;
}) {
  const supabase = getSupabaseServerClient();

  let query = supabase.from(table).select("*");

  if (options?.orderColumn) {
    query = query.order(options.orderColumn, { ascending: options.ascending ?? true });
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`${table} 조회 실패: ${error.message}`);
  }

  return mapRows(data as JsonRecord[]);
}

async function selectBookings(fromDate: string, toDate: string) {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`bookings 조회 실패: ${error.message}`);
  }

  return mapRows(data as JsonRecord[], true);
}

async function loadBookingsPageData(fromDate: string, toDate: string) {
  const [
    bookings,
    students,
    instructors,
    aircraft,
    settings,
    courseCatalog,
    rentalPilots,
  ] = await Promise.all([
    selectBookings(fromDate, toDate),
    selectTable("students", { orderColumn: "student_id", ascending: true }),
    selectTable("instructors", { orderColumn: "instructor_id", ascending: true }),
    selectTable("aircraft", { orderColumn: "aircraft_id", ascending: true }),
    selectTable("settings", { orderColumn: "id", ascending: true }),
    selectTable("course_catalog", { orderColumn: "course_id", ascending: true }),
    selectTable("rental_pilots", { orderColumn: "pilot_id", ascending: true }),
  ]);

  return {
    bookings,
    students,
    instructors,
    aircraft,
    settings,
    courseCatalog,
    rentalPilots,
  };
}

async function insertBooking(data: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const row = normalizeBookingPayload(data);

  const { data: inserted, error } = await supabase
    .from("bookings")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return withBookingAliases(toCamelObject(inserted as JsonRecord));
}

async function updateBooking(data: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const bookingId = text(data.bookingId || data.booking_id || data.id);

  if (!bookingId) {
    throw new Error("bookingId가 필요합니다.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    throw new Error(`수정할 예약을 찾을 수 없습니다: ${bookingId}`);
  }

  const row = normalizeBookingPayload(data, existing as JsonRecord);

  const { data: updated, error } = await supabase
    .from("bookings")
    .update(row)
    .eq("booking_id", bookingId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return withBookingAliases(toCamelObject(updated as JsonRecord));
}

async function updateBookingStatus(data: JsonRecord, status: string) {
  return updateBooking({
    ...data,
    status,
  });
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (!action) {
    throw new Error("action 값이 필요합니다.");
  }

  if (action === "addBooking") {
    const booking = await insertBooking(data);
    return { message: "예약을 등록했습니다.", booking, data: booking };
  }

  if (action === "updateBooking") {
    const booking = await updateBooking(data);
    return { message: "예약을 수정했습니다.", booking, data: booking };
  }

  if (action === "approveBooking") {
    const booking = await updateBookingStatus(data, "확정");
    return { message: "예약을 확정했습니다.", booking, data: booking };
  }

  if (action === "cancelBooking") {
    const booking = await updateBookingStatus(data, "취소");
    return { message: "예약을 취소했습니다.", booking, data: booking };
  }

  if (action === "addRow" && text(data.sheetName) === "bookings") {
    const booking = await insertBooking(data);
    return { message: "예약을 등록했습니다.", booking, data: booking };
  }

  if (action === "updateRow" && text(data.sheetName) === "bookings") {
    const booking = await updateBooking(data);
    return { message: "예약을 수정했습니다.", booking, data: booking };
  }

  throw new Error(`지원하지 않는 예약 action입니다: ${action}`);
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const now = new Date();
    const defaultFromDate = dateText(addDays(now, -7));
    const defaultToDate = dateText(addDays(now, 90));

    const { searchParams } = new URL(request.url);
    const fromDate = parseDateParam(searchParams.get("fromDate"), defaultFromDate);
    const toDate = parseDateParam(searchParams.get("toDate"), defaultToDate);

    const pageData = await loadBookingsPageData(fromDate, toDate);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-supabase-bookings",
      range: { fromDate, toDate },
      elapsedMs: Date.now() - startedAt,

      ...pageData,

      data: pageData,

      counts: {
        bookings: pageData.bookings.length,
        students: pageData.students.length,
        instructors: pageData.instructors.length,
        aircraft: pageData.aircraft.length,
        settings: pageData.settings.length,
        courseCatalog: pageData.courseCatalog.length,
        rentalPilots: pageData.rentalPilots.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-supabase-bookings",
        message: error instanceof Error ? error.message : "Supabase 예약관리 조회에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
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
      service: "skynuri-supabase-bookings",
      elapsedMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-supabase-bookings",
        message: error instanceof Error ? error.message : "Supabase 예약 처리에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
