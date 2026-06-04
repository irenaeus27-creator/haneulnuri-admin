import { NextRequest, NextResponse } from "next/server";
import { JsonRecord, buildId, insertRow, nowIso, pickAllowed, selectRows, text, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "push_logs";
const ID_COLUMN = "push_id";
const PREFIX = "PUSH";
const RESPONSE_KEY = "pushLogs";
const SERVICE = "skynuri-supabase-push-logs";
const ORDER_COLUMN = "created_at";
const ALLOWED_COLUMNS = ["push_id", "created_at", "user_id", "user_name", "type", "title", "body", "target_token", "status", "error_message", "booking_id"];

function normalize(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.pushId || input.push_id) || buildId(PREFIX);
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
    return { message: "푸시 로그를 등록했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  if (action.startsWith("update") || action === "updateRow") {
    const row = normalize(data, false);
    const id = text(data.pushId || data.push_id || row[ID_COLUMN]);
    const saved = await updateRow(TABLE, ID_COLUMN, id, row);
    return { message: "푸시 로그를 수정했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  throw new Error(`지원하지 않는 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const rows = await selectRows(TABLE, { orderColumn: ORDER_COLUMN, ascending: false });

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
