import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLES = [
  "users",
  "aircraft",
  "instructors",
  "rental_pilots",
  "course_catalog",
  "settings",
  "students",
  "bookings",
  "instructor_schedules",
  "training_charges",
  "training_logs",
  "aircraft_maintenance",
  "notifications",
  "logs",
  "device_tokens",
  "push_logs",
];

async function countRows(tableName: string) {
  const supabase = getSupabaseServerClient();

  const { count, error } = await supabase
    .from(tableName)
    .select("*", { count: "exact", head: true });

  if (error) {
    return {
      table: tableName,
      ok: false,
      count: null,
      message: error.message,
    };
  }

  return {
    table: tableName,
    ok: true,
    count: count ?? 0,
    message: "ok",
  };
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const results = await Promise.all(TABLES.map((tableName) => countRows(tableName)));
    const failed = results.filter((item) => !item.ok);

    return NextResponse.json({
      ok: failed.length === 0,
      service: "skynuri-supabase",
      now: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      tableCount: TABLES.length,
      failedCount: failed.length,
      tables: results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "skynuri-supabase",
        message: error instanceof Error ? error.message : "Supabase 연결 확인에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
