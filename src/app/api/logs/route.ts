import { NextRequest, NextResponse } from "next/server";
import { JsonRecord, buildId, insertRow, nowIso, pickAllowed, selectRows, text, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "logs";
const ID_COLUMN = "log_id";
const PREFIX = "LOG";
const RESPONSE_KEY = "logs";
const SERVICE = "skynuri-supabase-logs";
const ORDER_COLUMN = "created_at";
const ALLOWED_COLUMNS = ["log_id", "created_at", "user_id", "user_name", "action", "target_sheet", "target_id", "status", "message"];

function normalize(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.logId || input.log_id) || buildId(PREFIX);
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
    return { message: "로그를 등록했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  if (action.startsWith("update") || action === "updateRow") {
    const row = normalize(data, false);
    const id = text(data.logId || data.log_id || row[ID_COLUMN]);
    const saved = await updateRow(TABLE, ID_COLUMN, id, row);
    return { message: "로그를 수정했습니다.", [RESPONSE_KEY]: saved, data: saved };
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
