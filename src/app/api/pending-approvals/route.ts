import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type JsonRecord = Record<string, unknown>;

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

function mapRows(rows: JsonRecord[] | null | undefined) {
  return (rows || []).map((row) => toCamelObject(row));
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const supabase = getSupabaseServerClient();

    const [bookingResult, userResult] = await Promise.all([
      supabase
        .from("bookings")
        .select("*", { count: "exact" })
        .in("status", ["요청", "취소요청"])
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(8),
      supabase
        .from("users")
        .select("*", { count: "exact" })
        .in("status", ["대기", "요청", "pending", "승인대기"])
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (bookingResult.error) {
      throw new Error(`예약 승인 대기 조회 실패: ${bookingResult.error.message}`);
    }

    if (userResult.error) {
      throw new Error(`회원 승인 대기 조회 실패: ${userResult.error.message}`);
    }

    const bookings = mapRows(bookingResult.data as JsonRecord[]);
    const users = mapRows(userResult.data as JsonRecord[]);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-pending-approvals",
      bookings,
      users,
      pendingBookingCount: bookingResult.count ?? bookings.length,
      pendingUserCount: userResult.count ?? users.length,
      totalCount: (bookingResult.count ?? bookings.length) + (userResult.count ?? users.length),
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-pending-approvals",
        message: error instanceof Error ? error.message : "승인 대기 항목 조회에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
