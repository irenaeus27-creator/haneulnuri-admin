import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  JsonRecord,
  buildId,
  insertRow,
  nowIso,
  pickAllowed,
  selectRows,
  text,
  updateRow,
  toCamelObject,
} from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "instructors";
const ID_COLUMN = "instructor_id";
const PREFIX = "INS";
const RESPONSE_KEY = "instructors";
const SERVICE = "skynuri-supabase-instructors";
const ORDER_COLUMN = "instructor_id";
const ALLOWED_COLUMNS = [
  "instructor_id",
  "name",
  "phone",
  "email",
  "status",
  "license_no",
  "photo_url",
  "memo",
  "active",
  "created_at",
  "updated_at",
];

type MonthlyStats = {
  instructorId: string;
  educationCount: number;
  educationMinutes: number;
  experienceCount: number;
  experienceMinutes: number;
  rideCount: number;
  rideMinutes: number;
  otherCount: number;
  otherMinutes: number;
  totalCount: number;
  totalMinutes: number;
  studentCount: number;
  recentLogDate: string;
};

function normalize(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.instructorId || input.instructor_id) || buildId(PREFIX);
  const row: JsonRecord = { [ID_COLUMN]: id };

  ALLOWED_COLUMNS.forEach((column) => {
    const camel = column.replace(/_([a-z0-9])/g, (_: string, char: string) => char.toUpperCase());
    const value = input[camel] ?? input[column];
    if (value !== undefined) row[column] = value;
  });

  if (ALLOWED_COLUMNS.includes("created_at") && isCreate && !row.created_at) row.created_at = now;
  if (ALLOWED_COLUMNS.includes("updated_at")) row.updated_at = now;

  return pickAllowed(row, ALLOWED_COLUMNS);
}

function monthRange(monthInput: string) {
  const fallback = new Date();
  const fallbackMonth = `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-\d{2}$/.test(monthInput) ? monthInput : fallbackMonth;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return { month, startDate, endDate };
}

function normalizeFlightType(value: unknown) {
  const raw = text(value, "기타");
  if (raw.includes("교육")) return "교육비행";
  if (raw.includes("체험")) return "체험비행";
  if (raw.includes("동승")) return "동승비행";
  if (raw.includes("렌탈")) return "렌탈비행";
  return "기타";
}

function numberValue(value: unknown) {
  const raw = text(value);
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyStats(instructorId: string): MonthlyStats {
  return {
    instructorId,
    educationCount: 0,
    educationMinutes: 0,
    experienceCount: 0,
    experienceMinutes: 0,
    rideCount: 0,
    rideMinutes: 0,
    otherCount: 0,
    otherMinutes: 0,
    totalCount: 0,
    totalMinutes: 0,
    studentCount: 0,
    recentLogDate: "",
  };
}

async function loadInstructorSchedules() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("instructor_schedules")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return [] as JsonRecord[];
  return ((data || []) as JsonRecord[]).map((row) => toCamelObject(row));
}

async function loadMonthlyStats(monthInput: string, instructors: JsonRecord[]) {
  const { month, startDate, endDate } = monthRange(monthInput);
  const supabase = getSupabaseServerClient();
  const stats: Record<string, MonthlyStats> = {};
  const studentSet: Record<string, Set<string>> = {};

  instructors.forEach((row) => {
    const instructorId = text(row.instructorId || row.instructor_id);
    if (!instructorId) return;
    stats[instructorId] = emptyStats(instructorId);
    studentSet[instructorId] = new Set<string>();
  });

  const { data, error } = await supabase
    .from("training_logs")
    .select("instructor_id,instructor_name,training_date,training_type,actual_flight_minutes,deducted_minutes,status,student_id,student_name")
    .gte("training_date", startDate)
    .lte("training_date", endDate);

  if (error) return { month, stats };

  ((data || []) as JsonRecord[]).forEach((row) => {
    const instructorId = text(row.instructor_id);
    if (!instructorId) return;

    const status = text(row.status).replace(/\s/g, "");
    if (["취소", "삭제", "반려"].includes(status)) return;

    const type = normalizeFlightType(row.training_type);
    if (type === "렌탈비행") return;

    if (!stats[instructorId]) {
      stats[instructorId] = emptyStats(instructorId);
      studentSet[instructorId] = new Set<string>();
    }

    const minutes = numberValue(row.actual_flight_minutes || row.deducted_minutes);
    const target = stats[instructorId];

    if (type === "교육비행") {
      target.educationCount += 1;
      target.educationMinutes += minutes;
    } else if (type === "체험비행") {
      target.experienceCount += 1;
      target.experienceMinutes += minutes;
    } else if (type === "동승비행") {
      target.rideCount += 1;
      target.rideMinutes += minutes;
    } else {
      target.otherCount += 1;
      target.otherMinutes += minutes;
    }

    target.totalCount += 1;
    target.totalMinutes += minutes;

    const studentKey = text(row.student_id || row.student_name);
    if (studentKey) studentSet[instructorId].add(studentKey);

    const logDate = text(row.training_date);
    if (logDate && (!target.recentLogDate || logDate > target.recentLogDate)) {
      target.recentLogDate = logDate;
    }
  });

  Object.keys(stats).forEach((instructorId) => {
    stats[instructorId].studentCount = studentSet[instructorId]?.size || 0;
  });

  return { month, stats };
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action.startsWith("add") || action === "addRow") {
    const saved = await insertRow(TABLE, normalize(data, true));
    return { message: "등록했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  if (action.startsWith("update") || action === "updateRow") {
    const row = normalize(data, false);
    const id = text(data.instructorId || data.instructor_id || row[ID_COLUMN]);
    const saved = await updateRow(TABLE, ID_COLUMN, id, row);
    return { message: "수정했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  throw new Error(`지원하지 않는 action입니다: ${action}`);
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const monthParam = request.nextUrl.searchParams.get("month") || "";
    const rows = await selectRows(TABLE, { orderColumn: ORDER_COLUMN, ascending: true });
    const schedules = await loadInstructorSchedules();
    const monthly = await loadMonthlyStats(monthParam, rows);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: SERVICE,
      [RESPONSE_KEY]: rows,
      instructorSchedules: schedules,
      monthlyStats: monthly.stats,
      month: monthly.month,
      data: { [RESPONSE_KEY]: rows, instructorSchedules: schedules, monthlyStats: monthly.stats },
      counts: { [RESPONSE_KEY]: rows.length, instructorSchedules: schedules.length },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "조회에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const result = await handlePost(body);
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: SERVICE, elapsedMs: Date.now() - startedAt, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "처리에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}
