import { NextRequest, NextResponse } from "next/server";
import {
  JsonRecord,
  MobileAuthContext,
  addDaysText,
  buildId,
  getAssignedAircraftIds,
  getMobileAuthContext,
  isAircraftAssignedToContext,
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

function nullableText(value: unknown) {
  const result = text(value);
  if (!result) return null;

  const normalized = result.toLowerCase().replaceAll(" ", "");
  if (
    normalized === "none" ||
    normalized === "null" ||
    normalized === "undefined" ||
    result === "없음" ||
    result === "미선택" ||
    result === "선택안함" ||
    result === "미배정" ||
    result === "미정" ||
    result === "미지정"
  ) {
    return null;
  }

  return result;
}

function isPlaceholderName(value: unknown) {
  const raw = text(value).replace(/\s+/g, "");
  if (!raw) return true;
  return ["미배정", "미정", "없음", "미지정", "선택안함", "교관미배정"].includes(raw);
}

async function resolveInstructorName(instructorId: unknown) {
  const id = nullableText(instructorId);
  if (!id) return "";

  const supabase = mobileSupabase();
  const { data, error } = await supabase
    .from("instructors")
    .select("*")
    .eq("instructor_id", id)
    .maybeSingle();

  if (error) throw new Error(`교관 조회 실패: ${error.message}`);

  return text((data as JsonRecord | null)?.name || (data as JsonRecord | null)?.instructor_name);
}

function sameAircraftText(a: unknown, b: unknown) {
  const left = text(a).toLowerCase().replace(/[\s_\-()]/g, "");
  const right = text(b).toLowerCase().replace(/[\s_\-()]/g, "");
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

async function resolveAssignedAircraft(input: JsonRecord, context: MobileAuthContext) {
  const requestedAircraftId = nullableText(input.aircraftId || input.aircraft_id);
  const requestedAircraftName = nullableText(input.aircraftName || input.aircraft_name || input.aircraft);
  const assignedIds = getAssignedAircraftIds(context);

  if (assignedIds.length === 0) {
    throw new Error("예약 가능한 배정 항공기가 없습니다. 관리자에서 회원에게 항공기를 먼저 배정해주세요.");
  }

  const supabase = mobileSupabase();
  const { data, error } = await supabase.from("aircraft").select("*").order("aircraft_id", { ascending: true });
  if (error) throw new Error(`항공기 조회 실패: ${error.message}`);

  const aircraftRows = mapRows(data as JsonRecord[]);
  const assignedAircraft = aircraftRows.filter((row) => isAircraftAssignedToContext(context, row));

  if (assignedAircraft.length === 0) {
    throw new Error("배정된 항공기가 항공기 목록에 없습니다. 관리자에서 배정 항공기 ID를 확인해주세요.");
  }

  if (!requestedAircraftId && !requestedAircraftName && assignedAircraft.length === 1) {
    return assignedAircraft[0];
  }

  const matched = assignedAircraft.find((row) => {
    return (
      sameAircraftText(row.aircraftId, requestedAircraftId) ||
      sameAircraftText(row.registrationNo, requestedAircraftId) ||
      sameAircraftText(row.aircraftName, requestedAircraftId) ||
      sameAircraftText(row.aircraftId, requestedAircraftName) ||
      sameAircraftText(row.registrationNo, requestedAircraftName) ||
      sameAircraftText(row.aircraftName, requestedAircraftName)
    );
  });

  if (!matched) {
    throw new Error("배정되지 않은 항공기는 예약할 수 없습니다. 관리자에서 배정 항공기를 확인해주세요.");
  }

  return matched;
}

async function normalizeMobileBooking(input: JsonRecord, context: MobileAuthContext) {
  const now = nowIso();
  const bookingDate = text(input.bookingDate || input.booking_date || input.requestDate || input.request_date);
  const startTime = timeText(input.startTime || input.start_time);
  const endTime = timeText(input.endTime || input.end_time);
  const bookingType = text(input.bookingType || input.booking_type || input.type || "교육비행");
  const userName = text(input.userName || input.user_name || input.name || context.user?.name || context.student?.name || context.rentalPilot?.name);
  const phone = text(input.phone || context.user?.phone || context.student?.phone || context.rentalPilot?.phone);
  const assignedInstructorId = nullableText(
    context.student?.assignedInstructorId || context.student?.assigned_instructor_id,
  );
  const assignedInstructorName = text(
    context.student?.assignedInstructorName || context.student?.assigned_instructor_name,
  );
  const instructorId = nullableText(input.instructorId || input.instructor_id) || assignedInstructorId;
  const inputInstructorName = text(input.instructorName || input.instructor_name);
  const instructorNameById = await resolveInstructorName(instructorId);
  const instructorName = isPlaceholderName(inputInstructorName)
    ? instructorNameById || assignedInstructorName
    : inputInstructorName;
  const studentId = nullableText(context.student?.studentId || context.student?.student_id);
  const pilotId = nullableText(context.rentalPilot?.pilotId || context.rentalPilot?.pilot_id);
  const aircraft = await resolveAssignedAircraft(input, context);

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
    student_id: studentId,
    pilot_id: pilotId,
    user_name: userName,
    phone,
    instructor_id: instructorId,
    instructor_name: instructorName,
    aircraft_id: text(aircraft.aircraftId || aircraft.aircraft_id),
    aircraft_name: text(aircraft.aircraftName || aircraft.aircraft_name || aircraft.registrationNo || aircraft.registration_no),
    status: text(input.status || "요청"),
    payment_status: text(input.paymentStatus || input.payment_status),
    memo: text(input.memo),
    request_date: bookingDate,
    duration_minutes: Number(input.durationMinutes || input.duration_minutes || 0) || null,
    buffer_end_time: timeText(input.bufferEndTime || input.buffer_end_time) || null,
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
  const row = await normalizeMobileBooking(data, context);
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
