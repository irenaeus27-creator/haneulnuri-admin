import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";

type ApiObject = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRows(data: unknown): ApiObject[] {
  if (Array.isArray(data)) return data as ApiObject[];

  if (data && typeof data === "object") {
    const obj = data as ApiObject;

    if (Array.isArray(obj.notifications)) return obj.notifications as ApiObject[];
    if (Array.isArray(obj.data)) return obj.data as ApiObject[];
    if (Array.isArray(obj.rows)) return obj.rows as ApiObject[];
    if (Array.isArray(obj.values)) return obj.values as ApiObject[];
  }

  return [];
}

async function readJsonResponse(response: Response, context: string) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    throw new Error(`${context} 응답이 비어 있습니다.`);
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(`${context} 응답을 JSON으로 변환하지 못했습니다.`);
  }
}

async function fetchNotifications() {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "getSheet");
  url.searchParams.set("sheet", "notifications");

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  const parsedData = await readJsonResponse(response, "notifications 시트");

  if (
    parsedData &&
    typeof parsedData === "object" &&
    "success" in parsedData &&
    (parsedData as ApiObject).success === false
  ) {
    throw new Error(
      String((parsedData as ApiObject).message || "") ||
        "notifications 시트를 불러오지 못했습니다."
    );
  }

  return normalizeRows(parsedData);
}

async function postToAppsScript(action: string, data: ApiObject) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ action, data }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  const parsedData = await readJsonResponse(response, "Apps Script");

  if (
    parsedData &&
    typeof parsedData === "object" &&
    "success" in parsedData &&
    (parsedData as ApiObject).success === false
  ) {
    throw new Error(
      String((parsedData as ApiObject).message || "") ||
        "Apps Script 처리에 실패했습니다."
    );
  }

  return parsedData;
}

function nowIso() {
  return new Date().toISOString();
}

function buildNotificationId() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  return `NTF-${date}-${time}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function GET() {
  try {
    const notifications = await fetchNotifications();

    return NextResponse.json({
      ok: true,
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("[notifications GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "알림 데이터를 불러오지 못했습니다.",
        notifications: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ApiObject;
    const rawAction = text(body.action);
    const notificationId = text(body.notificationId || body.id || (body.data as ApiObject | undefined)?.notificationId);
    const data = ((body.data as ApiObject | undefined) || {}) as ApiObject;

    if (rawAction === "markRead" || rawAction === "markNotificationRead") {
      if (!notificationId) {
        return NextResponse.json(
          {
            ok: false,
            success: false,
            message: "notificationId가 필요합니다.",
          },
          { status: 400 }
        );
      }

      const result = await postToAppsScript("markNotificationRead", {
        ...data,
        notificationId,
        read: "Y",
        isRead: "Y",
        readAt: nowIso(),
      });

      return NextResponse.json({
        ok: true,
        success: true,
        result,
      });
    }

    if (rawAction === "add" || rawAction === "addNotification") {
      const payload: ApiObject = {
        notificationId: text(data.notificationId) || buildNotificationId(),
        type: text(data.type) || "예약변경",
        title: text(data.title) || "예약 변경 알림",
        message: text(data.message) || text(data.content) || "",
        content: text(data.content) || text(data.message) || "",
        userId: text(data.userId),
        userName: text(data.userName),
        phone: text(data.phone),
        bookingId: text(data.bookingId),
        status: text(data.status) || "미발송",
        read: text(data.read) || "N",
        isRead: text(data.isRead) || "N",
        createdAt: text(data.createdAt) || nowIso(),
        sentAt: text(data.sentAt),
        memo: text(data.memo),
        ...data,
      };

      const result = await postToAppsScript("addNotification", payload);

      return NextResponse.json({
        ok: true,
        success: true,
        result,
        notification: payload,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: `지원하지 않는 action입니다: ${rawAction}`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("[notifications POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "알림 처리 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
