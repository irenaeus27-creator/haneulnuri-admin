import { getSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
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

export type AuditEventInput = {
  action: string;
  targetSheet?: string;
  targetId?: string;
  status?: string;
  message?: string;
  userId?: string | null;
  userName?: string | null;
};

export async function writeLog(input: AuditEventInput) {
  try {
    const supabase = getSupabaseServerClient();

    const { error } = await supabase.from("logs").insert({
      log_id: buildId("LOG"),
      created_at: new Date().toISOString(),
      user_id: text(input.userId),
      user_name: text(input.userName),
      action: text(input.action),
      target_sheet: text(input.targetSheet, "system"),
      target_id: text(input.targetId),
      status: text(input.status, "success"),
      message: text(input.message),
    });

    if (error) {
      console.error("[skynuri audit] log insert failed:", error.message);
    }
  } catch (error) {
    console.error("[skynuri audit] log insert exception:", error);
  }
}

export type NotificationInput = {
  title: string;
  body?: string;
  targetType?: string;
  targetUserId?: string | null;
  targetUserName?: string | null;
  relatedId?: string | null;
  userId?: string | null;
  status?: string;
  memo?: string;
};

export async function writeNotification(input: NotificationInput) {
  try {
    const supabase = getSupabaseServerClient();

    const now = new Date().toISOString();

    const targetUserId = text(input.targetUserId || input.userId);
    const userId = text(input.userId || input.targetUserId);

    if (!targetUserId || !userId) {
      return;
    }

    const { data: existingUser, error: userError } = await supabase
      .from("users")
      .select("user_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (userError || !existingUser) {
      console.warn("[skynuri audit] notification skipped: target user not found", userId);
      return;
    }

    const { error } = await supabase.from("notifications").insert({
      notification_id: buildId("NTF"),
      title: text(input.title),
      body: text(input.body),
      target_type: text(input.targetType, "user"),
      target_user_id: targetUserId,
      user_id: userId,
      target_user_name: text(input.targetUserName),
      related_id: text(input.relatedId || input.memo),
      status: text(input.status, "대기"),
      sent_at: null,
      memo: text(input.memo),
      created_at: now,
      updated_at: now,
    });

    if (error) {
      console.error("[skynuri audit] notification insert failed:", error.message);
    }
  } catch (error) {
    console.error("[skynuri audit] notification insert exception:", error);
  }
}

export function bookingAuditMessage(booking: JsonRecord, actionLabel: string) {
  const userName = text(booking.userName || booking.user_name || booking.name, "예약자 미입력");
  const bookingDate = text(booking.bookingDate || booking.booking_date);
  const startTime = text(booking.startTime || booking.start_time);
  const bookingType = text(booking.bookingType || booking.booking_type || booking.type, "예약");
  const aircraftName = text(booking.aircraftName || booking.aircraft_name || booking.aircraft);

  return [
    `${actionLabel} · ${userName}`,
    [bookingDate, startTime].filter(Boolean).join(" "),
    bookingType,
    aircraftName,
  ]
    .filter(Boolean)
    .join(" / ");
}

export function bookingActionLabel(statusOrAction: string) {
  const value = text(statusOrAction);

  if (value === "addBooking") return "예약 생성";
  if (value === "updateBooking") return "예약 수정";
  if (value === "approveBooking") return "예약 확정";
  if (value === "cancelBooking") return "예약 취소";
  if (value === "요청") return "예약 요청";
  if (value === "취소요청") return "예약 취소 요청";
  if (value === "확정") return "예약 확정";
  if (value === "취소") return "예약 취소";

  return value || "예약 변경";
}
