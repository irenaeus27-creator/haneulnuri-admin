import { NextRequest, NextResponse } from "next/server";
import { JsonRecord, buildId, insertRow, nowIso, pickAllowed, selectRows, text, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "instructor_schedules";
const ID_COLUMN = "schedule_id";
const PREFIX = "SCH";
const RESPONSE_KEY = "instructorSchedules";
const SERVICE = "skynuri-supabase-instructor-schedules";
const ORDER_COLUMN = "schedule_id";
const ALLOWED_COLUMNS = ["schedule_id", "instructor_id", "instructor_name", "schedule_date", "day_of_week", "start_time", "end_time", "is_day_off", "lunch_unavailable", "status", "memo", "created_at", "updated_at"];

function normalize(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.scheduleId || input.schedule_id) || buildId(PREFIX);
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

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action.startsWith("add") || action === "addRow") {
    const saved = await insertRow(TABLE, normalize(data, true));
    return { message: "교관 스케줄을 등록했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  if (action.startsWith("update") || action === "updateRow") {
    const row = normalize(data, false);
    const id = text(data.scheduleId || data.schedule_id || row[ID_COLUMN]);
    const saved = await updateRow(TABLE, ID_COLUMN, id, row);
    return { message: "교관 스케줄을 수정했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  throw new Error(`지원하지 않는 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const rows = await selectRows(TABLE, { orderColumn: ORDER_COLUMN, ascending: true });

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
      { status: 500 }
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
      { status: 500 }
    );
  }
}
