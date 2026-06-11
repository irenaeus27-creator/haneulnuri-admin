import { NextRequest, NextResponse } from "next/server";
import {
  buildId,
  getMobileAuthContext,
  mapRows,
  mobileSupabase,
  nowIso,
  text,
  type JsonRecord,
} from "@/lib/supabase/mobile-helpers";

export const dynamic = "force-dynamic";

type NotificationRow = JsonRecord;

type NotificationQueryTarget = {
  userIds: string[];
  bookingIds: string[];
  debugCandidates: string[];
};

const NOTIFICATION_RETENTION_DAYS = 14;

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "요청 처리에 실패했습니다.");
  return NextResponse.json({ ok: false, message }, { status });
}

function retentionCutoffIso() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NOTIFICATION_RETENTION_DAYS);
  return cutoff.toISOString();
}

async function pruneExpiredNotifications() {
  const supabase = mobileSupabase();
  const cutoff = retentionCutoffIso();

  // 예약 2시간 전 알림처럼 scheduled_at이 미래인 알림은 created_at이 오래되어도 지우면 안 됩니다.
  // 따라서 실제 표시/발송 기준일을 scheduled_at 우선, 없으면 created_at으로 보고 14일 보관합니다.
  const { error: unscheduledError } = await supabase
    .from("notifications")
    .delete()
    .is("scheduled_at", null)
    .lt("created_at", cutoff);

  if (unscheduledError) {
    console.warn("알림 14일 보관 정리 실패(일반 알림)", unscheduledError.message);
  }

  const { error: scheduledError } = await supabase
    .from("notifications")
    .delete()
    .not("scheduled_at", "is", null)
    .lt("scheduled_at", cutoff);

  if (scheduledError) {
    console.warn("알림 14일 보관 정리 실패(예약 알림)", scheduledError.message);
  }
}

function notificationEffectiveAt(row: JsonRecord) {
  return text(row.scheduledAt || row.scheduled_at || row.createdAt || row.created_at);
}

function isWithinRetention(row: JsonRecord) {
  const value = notificationEffectiveAt(row);
  if (!value) return true;
  const time = new Date(value).getTime();
  const cutoff = new Date(retentionCutoffIso()).getTime();
  return Number.isFinite(time) ? time >= cutoff : true;
}

function parseLimit(value: unknown) {
  const numberValue = Number(text(value));
  if (!Number.isFinite(numberValue)) return 50;
  return Math.min(Math.max(Math.floor(numberValue), 1), 100);
}

function normalizeFilter(value: unknown) {
  const raw = text(value).toLowerCase();
  if (!raw || raw === "all" || raw === "전체") return "all";
  if (raw.includes("예약") || raw.includes("booking")) return "booking";
  if (raw.includes("비행") || raw.includes("flight")) return "flight";
  if (raw.includes("공지") || raw.includes("notice")) return "notice";
  return raw;
}

function notificationTypeGroup(type: unknown, title: unknown, message: unknown) {
  const haystack = `${text(type)} ${text(title)} ${text(message)}`.toLowerCase();
  if (haystack.includes("booking") || haystack.includes("예약") || haystack.includes("취소") || haystack.includes("승인")) return "booking";
  if (haystack.includes("flight") || haystack.includes("비행") || haystack.includes("일지") || haystack.includes("잔여")) return "flight";
  if (haystack.includes("notice") || haystack.includes("공지") || haystack.includes("안내")) return "notice";
  return "general";
}

function enrichNotification(row: NotificationRow) {
  const camel = mapRows([row])[0] || {};

  camel.type = text(camel.type || camel.notificationType || camel.targetType || row.type || row.notification_type || row.target_type || "notice");
  camel.message = text(camel.message || camel.body || camel.content || row.message || row.body || row.content);
  camel.relatedTable = text(camel.relatedTable || camel.related_table || camel.targetType || row.related_table || row.target_type);
  camel.relatedId = text(camel.relatedId || camel.related_id || camel.memo || row.related_id || row.memo);
  camel.userId = text(camel.userId || camel.user_id || camel.targetUserId || camel.target_user_id || row.user_id || row.target_user_id);

  camel.group = notificationTypeGroup(camel.type, camel.title, camel.message);
  const status = text(camel.status).toLowerCase();
  camel.isUnread =
    !text(camel.readAt || camel.read_at) &&
    !["read", "읽음", "confirmed", "done", "완료"].includes(status);
  return camel;
}

function normalizePhone(value: unknown) {
  return text(value).replace(/[^0-9]/g, "");
}

function pushIfValid(set: Set<string>, value: unknown) {
  const item = text(value);
  if (item) set.add(item);
}

function getContextObject(context: unknown, key: string): JsonRecord {
  const record = (context || {}) as JsonRecord;
  const value = record[key];
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  return {};
}

async function buildNotificationTarget(context: unknown, explicit: JsonRecord = {}): Promise<NotificationQueryTarget> {
  const supabase = mobileSupabase();
  const contextRecord = (context || {}) as JsonRecord;
  const user = getContextObject(context, "user");
  const authUser = getContextObject(context, "authUser");
  const auth = getContextObject(context, "auth");

  const explicitUserId = text(explicit.userId || explicit.user_id);
  const explicitAuthUserId = text(explicit.authUserId || explicit.auth_user_id);
  const explicitEmail = text(explicit.email).toLowerCase();
  const explicitPhone = text(explicit.phone);
  const explicitPhoneDigits = normalizePhone(explicit.phoneDigits || explicit.phone_digits || explicitPhone);

  const primaryUserId = text(
    explicitUserId ||
      contextRecord.userId ||
      contextRecord.user_id ||
      user.userId ||
      user.user_id,
  );
  const authUserId = text(
    explicitAuthUserId ||
      contextRecord.authUserId ||
      contextRecord.auth_user_id ||
      user.authUserId ||
      user.auth_user_id ||
      authUser.id ||
      auth.id,
  );
  const email = text(
    explicitEmail ||
      contextRecord.email ||
      user.email ||
      authUser.email ||
      auth.email,
  ).toLowerCase();
  const rawPhone = text(explicitPhone || contextRecord.phone || user.phone || authUser.phone || auth.phone);
  const phone = normalizePhone(explicitPhoneDigits || rawPhone);

  const ids = new Set<string>();
  // 가장 중요한 값은 앱에 저장된 관리자 회원 ID(users.user_id)입니다.
  pushIfValid(ids, explicitUserId);
  pushIfValid(ids, primaryUserId);
  pushIfValid(ids, authUserId);

  const userFilters: string[] = [];
  if (explicitUserId) userFilters.push(`user_id.eq.${explicitUserId}`);
  if (primaryUserId && primaryUserId !== explicitUserId) userFilters.push(`user_id.eq.${primaryUserId}`);
  if (authUserId) userFilters.push(`auth_user_id.eq.${authUserId}`);
  if (email) userFilters.push(`email.eq.${email}`);
  if (rawPhone) userFilters.push(`phone.eq.${rawPhone}`);
  if (phone && phone !== rawPhone) userFilters.push(`phone.eq.${phone}`);

  if (userFilters.length > 0) {
    const { data, error } = await supabase
      .from("users")
      .select("user_id,email,phone,auth_user_id,status,updated_at,created_at")
      .or(userFilters.join(","));

    if (!error) {
      for (const row of ((data || []) as JsonRecord[])) {
        pushIfValid(ids, row.user_id || row.userId);
      }
    }
  }

  const bookingIds = new Set<string>();
  const resolvedIds = Array.from(ids).map((item) => item.trim()).filter(Boolean);
  if (resolvedIds.length > 0) {
    const { data, error } = await supabase
      .from("bookings")
      .select("booking_id")
      .in("user_id", resolvedIds)
      .gte("created_at", retentionCutoffIso());
    if (!error) {
      for (const row of ((data || []) as JsonRecord[])) {
        pushIfValid(bookingIds, row.booking_id || row.bookingId);
      }
    }
  }

  return {
    userIds: Array.from(ids),
    bookingIds: Array.from(bookingIds),
    debugCandidates: [
      `explicitUserId=${explicitUserId}`,
      `primaryUserId=${primaryUserId}`,
      `authUserId=${authUserId}`,
      `email=${email}`,
      `phone=${rawPhone}`,
      `phoneDigits=${phone}`,
    ].filter((item) => !item.endsWith("=")),
  };
}

function buildTargetOrCondition(target: NotificationQueryTarget) {
  const ids = target.userIds.map((item) => item.trim()).filter(Boolean);
  const bookingIds = target.bookingIds.map((item) => item.trim()).filter(Boolean);
  const conditions = [
    ...ids.flatMap((id) => [`target_user_id.eq.${id}`, `user_id.eq.${id}`]),
    ...bookingIds.map((id) => `memo.eq.${id}`),
  ];

  if (conditions.length === 0) return "notification_id.eq.__NO_TARGET__";
  return conditions.join(",");
}

function mergeExplicitUserId(target: NotificationQueryTarget, explicitUserId: unknown) {
  const userId = text(explicitUserId);
  if (!userId) return target;

  return {
    ...target,
    userIds: Array.from(new Set([userId, ...target.userIds])),
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const explicit = {
      userId: searchParams.get("userId"),
      authUserId: searchParams.get("authUserId"),
      email: searchParams.get("email"),
      phone: searchParams.get("phone"),
      phoneDigits: searchParams.get("phoneDigits"),
    };
    const explicitUserId = text(explicit.userId);
    const context = await getMobileAuthContext(request, explicitUserId);
    const target = mergeExplicitUserId(await buildNotificationTarget(context, explicit), explicitUserId);
    await pruneExpiredNotifications();
    const supabase = mobileSupabase();
    const limit = parseLimit(searchParams.get("limit"));
    const filter = normalizeFilter(searchParams.get("filter"));
    const unreadOnly = ["1", "true", "yes", "unread", "미확인"].includes(text(searchParams.get("unread")).toLowerCase());

    let query = supabase
      .from("notifications")
      .select("*")
      .or(buildTargetOrCondition(target))
      .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso()}`)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit * 3, 300));

    if (unreadOnly) {
      query = query.or("read_at.is.null,status.eq.unread,status.eq.미확인,status.eq.대기,status.eq.pending,status.eq.queued,status.is.null");
    }

    const { data, error } = await query;
    if (error) throw new Error(`알림 조회 실패: ${error.message}`);

    let notifications = ((data || []) as NotificationRow[])
      .filter(isWithinRetention)
      .map(enrichNotification);

    if (filter !== "all") {
      notifications = notifications.filter((item) => text(item.group) === filter);
    }

    notifications = notifications.slice(0, limit);

    const unreadCount = notifications.filter((item) => item.isUnread === true).length;

    return NextResponse.json({
      ok: true,
      notifications,
      unreadCount,
      targetUserIds: target.userIds,
      targetBookingIds: target.bookingIds,
      debugCandidates: target.debugCandidates,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as JsonRecord;
    const explicit = {
      userId: body.userId || body.user_id,
      authUserId: body.authUserId || body.auth_user_id,
      email: body.email,
      phone: body.phone,
      phoneDigits: body.phoneDigits || body.phone_digits,
    };
    const explicitUserId = text(explicit.userId);
    const context = await getMobileAuthContext(request, explicitUserId);
    const target = mergeExplicitUserId(await buildNotificationTarget(context, explicit), explicitUserId);
    await pruneExpiredNotifications();
    const supabase = mobileSupabase();
    const action = text(body.action || body.type, "markRead");
    const now = nowIso();
    const targetOr = buildTargetOrCondition(target);
    const primaryUserId = target.userIds[0] || text(((context || {}) as JsonRecord).userId);

    if (["list", "fetch", "get", "notifications"].includes(action)) {
      const limit = parseLimit(body.limit || body.pageSize);
      const filter = normalizeFilter(body.filter);
      const unreadOnly = ["1", "true", "yes", "unread", "미확인"].includes(text(body.unread).toLowerCase());

      let query = supabase
        .from("notifications")
        .select("*")
        .or(targetOr)
        .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
        .order("created_at", { ascending: false })
        .limit(Math.min(limit * 3, 300));

      if (unreadOnly) {
        query = query.or("read_at.is.null,status.eq.unread,status.eq.미확인,status.eq.대기,status.eq.pending,status.eq.queued,status.is.null");
      }

      const { data, error } = await query;
      if (error) throw new Error(`알림 조회 실패: ${error.message}`);

      let notifications = ((data || []) as NotificationRow[])
        .map(enrichNotification)
        .filter(isWithinRetention);

      if (filter !== "all") {
        notifications = notifications.filter((item) => text(item.group) === filter || notificationTypeGroup(item.type, item.title, item.message) === filter);
      }

      if (unreadOnly) {
        notifications = notifications.filter((item) => item.isUnread === true);
      }

      return NextResponse.json({
        ok: true,
        notifications: notifications.slice(0, limit),
        count: notifications.length,
      });
    }

    if (action === "markAllRead") {
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read", read_at: now, updated_at: now })
        .or(targetOr)
        .is("read_at", null);

      if (error) throw new Error(`알림 전체 읽음 처리 실패: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    if (["deleteAllVisible", "clearAll", "deleteAll"].includes(action)) {
      // 앱 알림함에서 현재 보이는 알림만 삭제합니다.
      // scheduled_at이 미래인 예약 2시간 전 알림은 아직 보일 시점이 아니므로 보존합니다.
      const { error } = await supabase
        .from("notifications")
        .delete()
        .or(targetOr)
        .or(`scheduled_at.is.null,scheduled_at.lte.${now}`);

      if (error) throw new Error(`알림 삭제 실패: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "createTest") {
      const row = {
        notification_id: buildId("N"),
        target_user_id: primaryUserId,
        user_id: primaryUserId,
        type: text(body.notificationType || body.notification_type || "notice"),
        title: text(body.title, "테스트 알림"),
        message: text(body.message, "알림 기능 테스트입니다."),
        related_table: text(body.relatedTable || body.related_table),
        related_id: text(body.relatedId || body.related_id),
        status: "unread",
        channel: "app",
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await supabase.from("notifications").insert(row).select("*").single();
      if (error) throw new Error(`테스트 알림 생성 실패: ${error.message}`);
      return NextResponse.json({ ok: true, notification: enrichNotification(data as NotificationRow) });
    }

    const notificationId = text(body.notificationId || body.notification_id || body.id);
    if (!notificationId) throw new Error("notificationId가 필요합니다.");

    const { data, error } = await supabase
      .from("notifications")
      .update({ status: "read", read_at: now, updated_at: now })
      .eq("notification_id", notificationId)
      .or(targetOr)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(`알림 읽음 처리 실패: ${error.message}`);
    if (!data) throw new Error("읽음 처리할 알림을 찾지 못했습니다.");

    return NextResponse.json({ ok: true, notification: enrichNotification(data as NotificationRow) });
  } catch (error) {
    return errorResponse(error);
  }
}
