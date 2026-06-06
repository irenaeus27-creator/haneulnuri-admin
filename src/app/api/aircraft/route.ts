import { NextRequest, NextResponse } from "next/server";
import { JsonRecord, buildId, insertRow, nowIso, pickAllowed, selectRows, text, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "aircraft";
const ID_COLUMN = "aircraft_id";
const PREFIX = "A";
const RESPONSE_KEY = "aircraft";
const SERVICE = "skynuri-supabase-aircraft";
const ORDER_COLUMN = "aircraft_id";
const ALLOWED_COLUMNS = ["aircraft_id", "aircraft_name", "model", "registration_no", "status", "next_inspection_date", "active", "photo_url", "memo", "created_at", "updated_at"];

function normalizeDateOrNull(value: unknown) {
  const raw = text(value);
  return raw || null;
}

function normalize(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.aircraftId || input.aircraft_id) || buildId(PREFIX);
  const row: JsonRecord = { [ID_COLUMN]: id };

  ALLOWED_COLUMNS.forEach((column) => {
    const camel = column.replace(/_([a-z0-9])/g, (_: string, char: string) => char.toUpperCase());
    let value = input[camel] ?? input[column];
    if (column === "next_inspection_date" && value !== undefined) value = normalizeDateOrNull(value);
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
    return { message: "등록했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  if (action.startsWith("update") || action === "updateRow") {
    const row = normalize(data, false);
    const id = text(data.aircraftId || data.aircraft_id || row[ID_COLUMN]);
    const saved = await updateRow(TABLE, ID_COLUMN, id, row);
    return { message: "수정했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  throw new Error(`지원하지 않는 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const rows = await selectRows(TABLE, { orderColumn: ORDER_COLUMN, ascending: true });
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: SERVICE, [RESPONSE_KEY]: rows, data: { [RESPONSE_KEY]: rows }, counts: { [RESPONSE_KEY]: rows.length }, elapsedMs: Date.now() - startedAt });
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
