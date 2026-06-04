import { NextRequest, NextResponse } from "next/server";
import {
  JsonRecord,
  addDaysText,
  getUserBundleByUserId,
  mapRows,
  mobileSupabase,
  requireUserId,
  text,
  todayText,
} from "@/lib/supabase/mobile-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function selectRows(table: string, orderColumn: string) {
  const supabase = mobileSupabase();

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order(orderColumn, { ascending: true });

  if (error) throw new Error(`${table} 조회 실패: ${error.message}`);

  return mapRows(data as JsonRecord[]);
}

async function selectMyBookings(userId: string) {
  const supabase = mobileSupabase();
  const today = todayText();

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("user_id", userId)
    .gte("booking_date", addDaysText(today, -30))
    .lte("booking_date", addDaysText(today, 90))
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw new Error(`내 예약 조회 실패: ${error.message}`);

  return mapRows(data as JsonRecord[]);
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const userId = requireUserId(searchParams.get("userId"));

    const [
      userBundle,
      bookings,
      aircraft,
      instructors,
      settings,
      courseCatalog,
    ] = await Promise.all([
      getUserBundleByUserId(userId),
      selectMyBookings(userId),
      selectRows("aircraft", "aircraft_id"),
      selectRows("instructors", "instructor_id"),
      selectRows("settings", "id"),
      selectRows("course_catalog", "course_id"),
    ]);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-mobile-bootstrap",
      userId,
      ...userBundle,
      bookings,
      aircraft,
      instructors,
      settings,
      courseCatalog,
      data: {
        ...userBundle,
        bookings,
        aircraft,
        instructors,
        settings,
        courseCatalog,
      },
      counts: {
        bookings: bookings.length,
        aircraft: aircraft.length,
        instructors: instructors.length,
        settings: settings.length,
        courseCatalog: courseCatalog.length,
      },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-mobile-bootstrap",
        message: error instanceof Error ? error.message : "앱 초기 데이터 조회에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
