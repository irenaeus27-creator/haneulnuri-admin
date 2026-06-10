import { NextRequest, NextResponse } from "next/server";
import {
  JsonRecord,
  MobileAuthContext,
  addDaysText,
  buildId,
  getMobileAuthContext,
  mapRows,
  mobileSupabase,
  nowIso,
  text,
  timeText,
  todayText,
  toCamelObject,
} from "@/lib/supabase/mobile-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeMobileBooking(input: JsonRecord, context: MobileAuthContext) {
  const now = nowIso();
  const bookingDate = text(input.bookingDate || input.booking_date || input.requestDate || input.request_date);
  const startTime = timeText(input.startTime || input.start_time);
  const endTime = timeText(input.endTime || input.end_time);
  const bookingType = text(input.bookingType || input.booking_type || input.type || "교육비행");
  const userName = text(input.userName || input.user_name || input.name || context.user?.name || context.student?.name);
  const phone = text(input.phone || context.user?.phone || context.student?.phone);

  if (!bookingDate) throw new Error("예약일이 필요합니다.");
  if (!startTime) throw new Error("시작시간이 필요합니다.");
  if (!endTime) throw new Error("종료시간이 필요합니다.");

  return {
    booking_id: text(input.bookingId || input.booking_id) || buildId("BKG"),
    booking_date: bookingDate,
    start_time: startTime,
    end_time: endTime,
    booking_type: bookingType,
    reservation_type: text(input.reservationType || input.reservation_type || bookingType),
    course_name: text(input.courseName || input.course_name || context.student?.course),
    user_id: context.userId,
    user_name: userName,
    phone,
    instructor_id: text(input.instructorId || input.instructor_id || context.student?.assignedInstructorId),
    instructor_name: text(input.instructorName || input.instructor_name || context.student?.assignedInstructorName),
    aircraft_id: text(input.aircraftId || input.aircraft_id),
    aircraft_name: text(input.aircraftName || input.aircraft_name || input.aircraft),
    status: text(input.status || "요청"),
    payment_status: text(input.paymentStatus || input.payment_status),
    memo: text(input.memo),
    request_date: bookingDate,
    duration_minutes: Number(input.durationMinutes || input.duration_minutes || 0) || null,
    buffer_end_time: timeText(input.bufferEndTime || input.buffer_end_time),
    created_at: now,
    updated_at: now,
  };
}

async function getMyBookings(userId: string, fromDate: string, toDate: string) {
  const supabase = mobileSupabase();

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("user_id", userId)
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw new Error(`예약 조회 실패: ${error.message}`);

  return mapRows(data as JsonRecord[]);
}


async function getAllVisibleBookings(fromDate: string, toDate: string) {
  const supabase = mobileSupabase();

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw new Error(`예약 조회 실패: ${error.message}`);

  return mapRows(data as JsonRecord[]);
}

async function requestBooking(data: JsonRecord, context: MobileAuthContext) {
  const row = normalizeMobileBooking(data, context);
  const supabase = mobileSupabase();

  const { data: saved, error } = await supabase
    .from("bookings")
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return toCamelObject(saved as JsonRecord);
}

async function cancelRequest(data: JsonRecord, context: MobileAuthContext) {
  const bookingId = text(data.bookingId || data.booking_id || data.id);
  if (!bookingId) throw new Error("bookingId가 필요합니다.");

  const supabase = mobileSupabase();

  const { data: saved, error } = await supabase
    .from("bookings")
    .update({
      status: "취소요청",
      updated_at: nowIso(),
    })
    .eq("booking_id", bookingId)
    .eq("user_id", context.userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return toCamelObject(saved as JsonRecord);
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const context = await getMobileAuthContext(request, searchParams.get("userId"));
    const today = todayText();
    const fromDate = text(searchParams.get("fromDate")) || addDaysText(today, -30);
    const toDate = text(searchParams.get("toDate")) || addDaysText(today, 90);
    const scope = text(searchParams.get("scope")).toLowerCase();
    const bookings = scope === "all"
      ? await getAllVisibleBookings(fromDate, toDate)
      : await getMyBookings(context.userId, fromDate, toDate);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-mobile-bookings",
      authUserId: context.authUserId,
      userId: context.userId,
      range: { fromDate, toDate },
      bookings,
      data: { bookings },
      counts: { bookings: bookings.length },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "예약 조회에 실패했습니다.";
    const status = text(message).includes("로그인") || text(message).includes("토큰") ? 401 : 500;
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-mobile-bookings",
        message,
        elapsedMs: Date.now() - startedAt,
      },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = (await request.json()) as JsonRecord;
    const action = text(body.action);
    const data = (body.data || body) as JsonRecord;
    const context = await getMobileAuthContext(request, data.userId || data.user_id);

    if (action === "requestBooking" || action === "addBooking") {
      const booking = await requestBooking(data, context);
      return NextResponse.json({
        ok: true,
        success: true,
        source: "supabase",
        service: "skynuri-mobile-bookings",
        message: "예약 요청이 접수되었습니다.",
        authUserId: context.authUserId,
        userId: context.userId,
        booking,
        data: booking,
        elapsedMs: Date.now() - startedAt,
      });
    }

    if (action === "cancelRequest" || action === "cancelBooking") {
      const booking = await cancelRequest(data, context);
      return NextResponse.json({
        ok: true,
        success: true,
        source: "supabase",
        service: "skynuri-mobile-bookings",
        message: "예약 취소 요청이 접수되었습니다.",
        authUserId: context.authUserId,
        userId: context.userId,
        booking,
        data: booking,
        elapsedMs: Date.now() - startedAt,
      });
    }

    throw new Error(`지원하지 않는 모바일 예약 action입니다: ${action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "예약 처리에 실패했습니다.";
    const status = text(message).includes("로그인") || text(message).includes("토큰") ? 401 : 500;
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-mobile-bookings",
        message,
        elapsedMs: Date.now() - startedAt,
      },
      { status }
    );
  }
}
