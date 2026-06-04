import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { bookingActionLabel, bookingAuditMessage, writeLog, writeNotification } from "@/lib/supabase/audit";
import { formatBookingTime as sharedFormatBookingTime } from "@/lib/formatDateTime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type JsonRecord = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function normalizeTime(value: unknown) {
  const valueText = sharedFormatBookingTime(value);
  return valueText === "-" ? "" : valueText;
}

function timeToMinutes(value: unknown) {
  const normalized = normalizeTime(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return -1;

  return Number(match[1]) * 60 + Number(match[2]);
}

function addMinutes(time: string, minutes: number) {
  const total = timeToMinutes(time);

  if (total < 0) return "";

  const next = total + minutes;
  const hour = Math.floor(next / 60);
  const minute = next % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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

function withBookingAliases(row: JsonRecord) {
  const next = { ...row };

  if (next.bookingId && !next.id) next.id = next.bookingId;
  if (next.aircraftName && !next.aircraft) next.aircraft = next.aircraftName;
  if (next.userName && !next.name) next.name = next.userName;
  if (next.instructorName && !next.instructor) next.instructor = next.instructorName;

  return next;
}

async function recordMoveAudit(booking: JsonRecord, oldStart: string, oldEnd: string, newStart: string, newEnd: string) {
  const bookingId = text(booking.bookingId || booking.booking_id || booking.id);
  const userId = text(booking.userId || booking.user_id);
  const userName = text(booking.userName || booking.user_name || booking.name);
  const label = bookingActionLabel("updateBooking");
  const message = `${bookingAuditMessage(booking, "예약 시간 이동")} / ${oldStart}~${oldEnd} → ${newStart}~${newEnd}`;

  await writeLog({
    action: label,
    targetSheet: "bookings",
    targetId: bookingId,
    status: "success",
    message,
    userId,
    userName,
  });

  await writeNotification({
    title: "예약 시간 변경",
    body: message,
    targetType: "booking",
    targetUserId: userId,
    targetUserName: userName,
    status: "대기",
    memo: bookingId,
  });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = (await request.json()) as JsonRecord;
    const sentBooking = ((body.booking as JsonRecord | undefined) || {}) as JsonRecord;
    const bookingId = text(body.bookingId || sentBooking.bookingId || sentBooking.booking_id);
    const direction = Number(body.direction || 0) > 0 ? 1 : Number(body.direction || 0) < 0 ? -1 : 0;

    if (!bookingId) {
      return NextResponse.json(
        { ok: false, success: false, message: "bookingId 값이 필요합니다." },
        { status: 400 }
      );
    }

    if (!direction) {
      return NextResponse.json(
        { ok: false, success: false, message: "direction 값이 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const { data: existing, error: existingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing) {
      throw new Error(`이동할 예약을 찾을 수 없습니다: ${bookingId}`);
    }

    const existingRow = existing as JsonRecord;
    const oldStart = normalizeTime(body.oldStart || sentBooking.startTime || existingRow.start_time);
    const oldEnd = normalizeTime(body.oldEnd || sentBooking.endTime || existingRow.end_time);

    if (!oldStart || !oldEnd) {
      throw new Error("기존 예약 시간이 올바르지 않습니다.");
    }

    const stepMinutes = direction * 30;
    const newStart = addMinutes(oldStart, stepMinutes);
    const newEnd = addMinutes(oldEnd, stepMinutes);

    const newStartMinutes = timeToMinutes(newStart);
    const newEndMinutes = timeToMinutes(newEnd);
    const dayStart = 7 * 60;
    const dayEnd = 20 * 60;

    if (newStartMinutes < dayStart || newEndMinutes > dayEnd || newEndMinutes <= newStartMinutes) {
      throw new Error("이동 가능한 시간은 07:00~20:00 사이입니다.");
    }

    const { data: updated, error } = await supabase
      .from("bookings")
      .update({
        start_time: newStart,
        end_time: newEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const booking = withBookingAliases(toCamelObject(updated as JsonRecord));

    await recordMoveAudit(booking, oldStart, oldEnd, newStart, newEnd);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-bookings-move-time",
      bookingId,
      direction,
      oldStart,
      oldEnd,
      startTime: newStart,
      endTime: newEnd,
      booking,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[bookings move-time POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-bookings-move-time",
        message:
          error instanceof Error
            ? error.message
            : "예약 시간을 이동하지 못했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
