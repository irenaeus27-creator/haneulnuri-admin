import { NextRequest, NextResponse } from "next/server";
import { formatBookingDate as sharedFormatBookingDate, formatBookingTime as sharedFormatBookingTime } from "@/lib/formatDateTime";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";

type ApiObject = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function normalizeDate(value: unknown) {
  const valueText = sharedFormatBookingDate(value);
  return valueText === "-" ? "" : valueText;
}

function normalizeTime(value: unknown) {
  const valueText = sharedFormatBookingTime(value);
  return valueText === "-" ? "" : valueText;
}

async function readJsonResponse(response: Response, context: string) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    throw new Error(`${context} 응답이 비어 있습니다.`);
  }

  try {
    return JSON.parse(rawText) as ApiObject;
  } catch {
    throw new Error(`${context} 응답을 JSON으로 변환하지 못했습니다.`);
  }
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

  if (parsedData.success === false || parsedData.ok === false) {
    throw new Error(text(parsedData.message, "Apps Script 처리가 실패했습니다."));
  }

  return parsedData;
}

function pickResultObject(result: ApiObject) {
  const candidates = [
    result.booking,
    result.data,
    result.result,
    result.updatedBooking,
    result,
  ];

  return candidates.find((item) => item && typeof item === "object") as ApiObject | undefined;
}


export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ApiObject;
    const booking = ((body.booking as ApiObject | undefined) || {}) as ApiObject;
    const bookingId = text(body.bookingId || booking.bookingId);
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

    const oldStart = normalizeTime(body.oldStart || booking.startTime);
    const oldEnd = normalizeTime(body.oldEnd || booking.endTime);
    const result = await postToAppsScript("moveBookingTime", {
      bookingId,
      direction,
      booking,
      oldStart,
      oldEnd,
      skipLog: true,
    });
    const moved = pickResultObject(result) || {};
    const newStart = normalizeTime(result.startTime || moved.startTime);
    const newEnd = normalizeTime(result.endTime || moved.endTime);

    return NextResponse.json({
      ok: true,
      success: true,
      bookingId,
      direction,
      oldStart,
      oldEnd,
      startTime: newStart,
      endTime: newEnd,
      notificationStatus: "disabled",
      notificationSent: false,
      result,
    });
  } catch (error) {
    console.error("[bookings move-time POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "예약 시간을 이동하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
