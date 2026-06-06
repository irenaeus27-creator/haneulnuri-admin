import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  JsonRecord,
  buildId,
  nowIso,
  text,
  timeText,
  toCamelObject,
} from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "instructor_schedules";
const ID_COLUMN = "schedule_id";
const PREFIX = "SCH";
const RESPONSE_KEY = "instructorSchedules";
const SERVICE = "skynuri-supabase-instructor-schedules";
const ORDER_COLUMN = "schedule_id";

const BASE_COLUMNS = [
  "schedule_id",
  "instructor_id",
  "instructor_name",
  "schedule_date",
  "start_time",
  "end_time",
  "is_day_off",
  "lunch_unavailable",
  "status",
  "memo",
  "created_at",
  "updated_at",
];

const OPTIONAL_COLUMNS = ["schedule_type", "weekly_off_days", "weekly_available_times"];

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

function splitDays(value: unknown) {
  return text(value)
    .split(/[,/\s]+/)
    .map((item) => item.trim())
    .filter((item) => WEEKDAYS.includes(item));
}

function normalizeTime(value: unknown, fallback = "") {
  const raw = text(value, fallback);
  const ampm = raw.match(/^(오전|오후)\s*(\d{1,2})(?::(\d{2}))?/);
  if (ampm) {
    const isPm = ampm[1] === "오후";
    let hour = Number(ampm[2]);
    const minute = ampm[3] || "00";
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }
  return timeText(raw || fallback);
}

function buildWeeklyConfig(data: JsonRecord) {
  const offDays = splitDays(data.dayOfWeek || data.day_of_week || data.weeklyOffDays || data.weekly_off_days);
  const startTime = normalizeTime(data.startTime || data.start_time, "07:00");
  const endTime = normalizeTime(data.endTime || data.end_time, "20:00");
  const lunchUnavailable = text(data.lunchUnavailable || data.lunch_unavailable, "Y") !== "N";

  const weeklyTimes = WEEKDAYS.reduce((acc, day) => {
    acc[day] = {
      state: offDays.includes(day) ? "휴일" : "근무",
      startTime,
      endTime,
      lunchUnavailable: offDays.includes(day) ? false : lunchUnavailable,
      lunchStartTime: "12:00",
      lunchEndTime: "13:00",
    };
    return acc;
  }, {} as Record<string, JsonRecord>);

  return {
    weeklyOffDays: offDays.join(","),
    weeklyAvailableTimes: JSON.stringify(weeklyTimes),
  };
}

function mergeWeeklyMemo(existingMemo: unknown, config: JsonRecord, plainMemo: unknown) {
  const marker = "WEEKLY_CONFIG:";
  const baseCandidate = text(plainMemo || existingMemo);
  const base = baseCandidate.includes(marker)
    ? baseCandidate.slice(0, baseCandidate.indexOf(marker)).trim()
    : baseCandidate.trim();
  const encoded = `${marker}${JSON.stringify(config)}`;
  return base ? `${base}\n${encoded}` : encoded;
}

function makeRow(data: JsonRecord, existing?: JsonRecord, isCreate = false) {
  const now = nowIso();
  const instructorId = text(data.instructorId || data.instructor_id);
  const id = text(data.scheduleId || data.schedule_id) || (instructorId ? `WEEKLY-${instructorId}` : buildId(PREFIX));
  const config = buildWeeklyConfig(data);
  const memo = mergeWeeklyMemo(existing?.memo, config, data.memo);

  const row: JsonRecord = {
    schedule_id: id,
    instructor_id: instructorId,
    instructor_name: text(data.instructorName || data.instructor_name),
    schedule_date: null,
    start_time: normalizeTime(data.startTime || data.start_time, "07:00"),
    end_time: normalizeTime(data.endTime || data.end_time, "20:00"),
    is_day_off: splitDays(data.dayOfWeek || data.day_of_week).length > 0 ? "Y" : "N",
    lunch_unavailable: text(data.lunchUnavailable || data.lunch_unavailable, "Y"),
    status: text(data.status, "기본"),
    memo,
    updated_at: now,
    schedule_type: "weeklyAvailability",
    weekly_off_days: config.weeklyOffDays,
    weekly_available_times: config.weeklyAvailableTimes,
  };

  if (isCreate) row.created_at = now;
  return row;
}

function missingColumn(errorMessage: string) {
  const patterns = [
    /Could not find the '([^']+)' column/,
    /column "([^"]+)" of relation .* does not exist/,
    /schema cache.*'([^']+)' column/i,
  ];
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function removeColumn(row: JsonRecord, column: string) {
  const next = { ...row };
  delete next[column];
  return next;
}

async function selectExisting(id: string) {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from(TABLE).select("*").eq(ID_COLUMN, id).maybeSingle();
  return data ? (data as JsonRecord) : null;
}

async function saveWithColumnFallback(row: JsonRecord, id: string, isCreate: boolean) {
  const supabase = getSupabaseServerClient();
  let candidate = { ...row };

  for (let attempt = 0; attempt < BASE_COLUMNS.length + OPTIONAL_COLUMNS.length + 6; attempt += 1) {
    const query = isCreate
      ? supabase.from(TABLE).insert(candidate)
      : supabase.from(TABLE).update(candidate).eq(ID_COLUMN, id);
    const { data, error } = await query.select("*").single();

    if (!error) return toCamelObject(data as JsonRecord);

    const column = missingColumn(error.message);
    if (column && candidate[column] !== undefined) {
      candidate = removeColumn(candidate, column);
      continue;
    }

    if (!isCreate && /0 rows|No rows|JSON object requested/i.test(error.message)) {
      return saveWithColumnFallback({ ...candidate, [ID_COLUMN]: id, created_at: candidate.created_at || nowIso() }, id, true);
    }

    throw new Error(error.message);
  }

  throw new Error("교관 스케줄 저장 중 사용할 수 있는 컬럼을 찾지 못했습니다.");
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action || body.mode);
  const data = (body.data || body) as JsonRecord;
  const instructorId = text(data.instructorId || data.instructor_id);
  const id = text(data.scheduleId || data.schedule_id) || (instructorId ? `WEEKLY-${instructorId}` : "");
  if (!instructorId) throw new Error("교관을 선택하세요.");

  const existing = id ? await selectExisting(id) : null;
  const isCreate = !existing && !(action.startsWith("update") && id);
  const row = makeRow(data, existing || undefined, isCreate);
  const saved = await saveWithColumnFallback(row, text(row.schedule_id), !existing);

  return {
    message: "교관 스케줄을 저장했습니다.",
    [RESPONSE_KEY]: saved,
    data: saved,
  };
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const supabase = getSupabaseServerClient();
    let query = supabase.from(TABLE).select("*");
    query = query.order(ORDER_COLUMN, { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(`${TABLE} 조회 실패: ${error.message}`);

    const rows = ((data || []) as JsonRecord[]).map((row) => toCamelObject(row));
    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: SERVICE,
      [RESPONSE_KEY]: rows,
      data: { [RESPONSE_KEY]: rows },
      counts: { [RESPONSE_KEY]: rows.length },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message: error instanceof Error ? error.message : "조회에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const result = await handlePost(body);
    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: SERVICE,
      elapsedMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message: error instanceof Error ? error.message : "처리에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
