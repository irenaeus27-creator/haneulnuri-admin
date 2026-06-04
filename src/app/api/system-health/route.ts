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
  "document_agreements",
  "managed_files",
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
    const tables = await Promise.all(TABLES.map((tableName) => countRows(tableName)));
    const failed = tables.filter((table) => !table.ok);

    return NextResponse.json({
      ok: failed.length === 0,
      success: failed.length === 0,
      source: "supabase",
      service: "skynuri-system-health",
      now: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      failedCount: failed.length,
      tableCount: tables.length,
      tables,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-system-health",
        message: error instanceof Error ? error.message : "시스템 점검에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
