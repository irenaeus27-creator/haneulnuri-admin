import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  JsonRecord,
  buildId,
  insertRow,
  mapRows,
  nowIso,
  numberOrNull,
  pickAllowed,
  selectRows,
  text,
  updateRow,
} from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "rental_pilots";
const ID_COLUMN = "pilot_id";
const PREFIX = "RP";
const RESPONSE_KEY = "rentalPilots";
const SERVICE = "skynuri-supabase-rental-pilots";
const ORDER_COLUMN = "pilot_id";
const ALLOWED_COLUMNS = [
  "pilot_id",
  "user_id",
  "name",
  "phone",
  "email",
  "license_type",
  "license_no",
  "assigned_aircraft_ids",
  "total_flight_minutes",
  "pic_flight_minutes",
  "status",
  "memo",
  "created_at",
  "updated_at",
];

function nullableText(value: unknown) {
  const raw = text(value);
  return raw || null;
}

function minutesValue(value: unknown) {
  const parsed = numberOrNull(value);
  if (parsed === null) return 0;
  return Math.max(0, Math.round(parsed));
}

function normalize(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.pilotId || input.pilot_id) || buildId(PREFIX);
  const row: JsonRecord = { [ID_COLUMN]: id };

  ALLOWED_COLUMNS.forEach((column) => {
    const camel = column.replace(/_([a-z0-9])/g, (_: string, char: string) => char.toUpperCase());
    const value = input[camel] ?? input[column];
    if (value !== undefined) row[column] = value;
  });

  row.user_id = nullableText(input.userId || input.user_id);
  row.license_type = text(input.licenseType || input.license_type);
  row.license_no = text(input.licenseNo || input.license_no || input.licenseNumber);
  row.assigned_aircraft_ids = text(input.assignedAircraftIds || input.assigned_aircraft_ids || input.aircraftIds);
  row.total_flight_minutes = minutesValue(input.totalFlightMinutes || input.total_flight_minutes);
  row.pic_flight_minutes = minutesValue(input.picFlightMinutes || input.pic_flight_minutes);
  row.status = text(input.status || "활성");
  row.memo = text(input.memo);

  if (ALLOWED_COLUMNS.includes("created_at") && isCreate && !row.created_at) row.created_at = now;
  if (ALLOWED_COLUMNS.includes("updated_at")) row.updated_at = now;

  return pickAllowed(row, ALLOWED_COLUMNS);
}

async function selectOptionalRows(table: string, orderColumn?: string) {
  const supabase = getSupabaseServerClient();
  let query = supabase.from(table).select("*");
  if (orderColumn) query = query.order(orderColumn, { ascending: true });
  const { data, error } = await query.limit(2000);
  if (error) {
    const message = error.message || "";
    if (message.includes("does not exist") || message.includes("Could not find") || message.includes("schema cache") || message.includes("42P01")) return [];
    throw new Error(`${table} 조회 실패: ${error.message}`);
  }
  return mapRows(data as JsonRecord[]);
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action || body.mode);
  const data = (body.data || body) as JsonRecord;

  if (action.startsWith("add") || action === "addRow") {
    const saved = await insertRow(TABLE, normalize(data, true));
    return { message: "렌탈기장을 등록했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  if (action.startsWith("update") || action === "updateRow") {
    const row = normalize(data, false);
    const id = text(data.pilotId || data.pilot_id || row[ID_COLUMN]);
    const saved = await updateRow(TABLE, ID_COLUMN, id, row);
    return { message: "렌탈기장을 수정했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  throw new Error(`지원하지 않는 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const [rows, users, aircraft, flightRecords] = await Promise.all([
      selectRows(TABLE, { orderColumn: ORDER_COLUMN, ascending: true }),
      selectOptionalRows("users", "name"),
      selectOptionalRows("aircraft", "aircraft_id"),
      selectOptionalRows("flight_records", "flight_date"),
    ]);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: SERVICE,
      [RESPONSE_KEY]: rows,
      users,
      aircraft,
      flightRecords,
      data: { [RESPONSE_KEY]: rows, users, aircraft, flightRecords },
      counts: {
        [RESPONSE_KEY]: rows.length,
        users: users.length,
        aircraft: aircraft.length,
        flightRecords: flightRecords.length,
      },
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
