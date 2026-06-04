import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;

function toCamelKey(key: string) {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function toCamelObject(row: Row) {
  const result: Row = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    result[toCamelKey(key)] = value ?? "";
  });
  return result;
}

function withBookingAliases(row: Row) {
  const next = { ...row };
  if (next.aircraftName && !next.aircraft) next.aircraft = next.aircraftName;
  if (next.userName && !next.name) next.name = next.userName;
  if (next.instructorName && !next.instructor) next.instructor = next.instructorName;
  if (next.bookingId && !next.id) next.id = next.bookingId;
  return next;
}

function mapRows(rows: Row[] | null | undefined, options?: { bookingAlias?: boolean }) {
  return (rows || []).map((row) => {
    const camel = toCamelObject(row);
    return options?.bookingAlias ? withBookingAliases(camel) : camel;
  });
}

function todayText() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysText(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);

  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-");
}

async function selectTable(table: string, options?: {
  orderColumn?: string;
  ascending?: boolean;
  limit?: number;
}) {
  const supabase = getSupabaseServerClient();

  let query = supabase.from(table).select("*");

  if (options?.orderColumn) {
    query = query.order(options.orderColumn, { ascending: options.ascending ?? true });
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) throw new Error(`${table} 조회 실패: ${error.message}`);

  return mapRows(data as Row[]);
}

async function selectBookings(fromDate: string, toDate: string) {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw new Error(`bookings 조회 실패: ${error.message}`);

  return mapRows(data as Row[], { bookingAlias: true });
}

async function selectPendingUsers() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .or("status.eq.승인대기,status.eq.요청,status.eq.대기,status.eq.pending")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`users 조회 실패: ${error.message}`);

  return mapRows(data as Row[]);
}

async function selectInstructorSchedules(today: string) {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("instructor_schedules")
    .select("*")
    .or(`schedule_date.is.null,schedule_date.eq.${today}`)
    .order("instructor_name", { ascending: true })
    .limit(80);

  if (error) throw new Error(`instructor_schedules 조회 실패: ${error.message}`);

  return mapRows(data as Row[]);
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const today = todayText();
    const fromDate = addDaysText(today, -2);
    const toDate = addDaysText(today, 30);

    const [
      bookings,
      users,
      aircraft,
      instructors,
      instructorSchedules,
      notifications,
      logs,
      trainingCharges,
    ] = await Promise.all([
      selectBookings(fromDate, toDate),
      selectPendingUsers(),
      selectTable("aircraft", { orderColumn: "aircraft_id", ascending: true }),
      selectTable("instructors", { orderColumn: "instructor_id", ascending: true }),
      selectInstructorSchedules(today),
      selectTable("notifications", { orderColumn: "created_at", ascending: false, limit: 8 }),
      selectTable("logs", { orderColumn: "created_at", ascending: false, limit: 20 }),
      selectTable("training_charges", { orderColumn: "charge_date", ascending: false, limit: 12 }),
    ]);

    const data = {
      bookings,
      users,
      aircraft,
      instructors,
      students: [],
      notifications,
      instructorSchedules,
      trainingCharges,
      logs,
    };

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-dashboard-fast",
      range: { today, fromDate, toDate },
      elapsedMs: Date.now() - startedAt,
      ...data,
      data,
      counts: {
        bookings: bookings.length,
        users: users.length,
        aircraft: aircraft.length,
        instructors: instructors.length,
        instructorSchedules: instructorSchedules.length,
        notifications: notifications.length,
        logs: logs.length,
        trainingCharges: trainingCharges.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-dashboard-fast",
        message: error instanceof Error ? error.message : "대시보드 조회에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
