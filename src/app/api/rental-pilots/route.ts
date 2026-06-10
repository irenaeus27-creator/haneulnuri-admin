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
  const suppliedId = text(input.pilotId || input.pilot_id);
  const row: JsonRecord = {};
  if (suppliedId) row[ID_COLUMN] = suppliedId;

  ALLOWED_COLUMNS.forEach((column) => {
    const camel = column.replace(/_([a-z0-9])/g, (_: string, char: string) => char.toUpperCase());
    const value = input[camel] ?? input[column];
    if (value !== undefined) row[column] = value;
  });

  const finalSuppliedId = text(input.pilotId || input.pilot_id || row[ID_COLUMN]);
  if (finalSuppliedId) row[ID_COLUMN] = finalSuppliedId;

  row.user_id = nullableText(input.userId || input.user_id || row.user_id);
  row.name = text(input.name || row.name);
  row.phone = text(input.phone || row.phone);
  row.email = text(input.email || row.email).toLowerCase();
  row.license_type = text(input.licenseType || input.license_type || row.license_type);
  row.license_no = text(input.licenseNo || input.license_no || input.licenseNumber || row.license_no);
  row.assigned_aircraft_ids = text(input.assignedAircraftIds || input.assigned_aircraft_ids || input.aircraftIds || row.assigned_aircraft_ids);
  row.total_flight_minutes = minutesValue(input.totalFlightMinutes ?? input.total_flight_minutes ?? row.total_flight_minutes);
  row.pic_flight_minutes = minutesValue(input.picFlightMinutes ?? input.pic_flight_minutes ?? row.pic_flight_minutes);
  row.status = text(input.status || row.status || "활성");
  row.memo = text(input.memo || row.memo);

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

async function findExistingRentalPilot(row: JsonRecord, input?: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const pilotId = text(row[ID_COLUMN] || input?.pilotId || input?.pilot_id);
  const userId = text(row.user_id || input?.userId || input?.user_id);
  const email = text(row.email || input?.email).toLowerCase();
  const phone = text(row.phone || input?.phone);

  if (pilotId) {
    const { data, error } = await supabase.from(TABLE).select("*").eq(ID_COLUMN, pilotId).maybeSingle();
    if (error) throw new Error(`렌탈회원 중복 확인 실패: ${error.message}`);
    if (data) return mapRows([data as JsonRecord])[0];
  }

  if (userId) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`렌탈회원 연결 확인 실패: ${error.message}`);
    if (data) return mapRows([data as JsonRecord])[0];
  }

  if (email) {
    const { data, error } = await supabase.from(TABLE).select("*").ilike("email", email).maybeSingle();
    if (error) throw new Error(`렌탈회원 이메일 확인 실패: ${error.message}`);
    if (data) return mapRows([data as JsonRecord])[0];
  }

  if (phone) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("phone", phone).limit(1);
    if (error) throw new Error(`렌탈회원 연락처 확인 실패: ${error.message}`);
    const first = Array.isArray(data) ? data[0] : null;
    if (first) return mapRows([first as JsonRecord])[0];
  }

  return null;
}

async function updateRentalPilotByKnownKey(existing: JsonRecord, row: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const existingPilotId = text(existing.pilotId || existing.pilot_id || existing[ID_COLUMN]);
  const existingUserId = text(existing.userId || existing.user_id || row.user_id);

  const updatePayload = { ...row };
  delete updatePayload.created_at;

  if (existingPilotId) {
    updatePayload[ID_COLUMN] = existingPilotId;
    return updateRow(TABLE, ID_COLUMN, existingPilotId, updatePayload);
  }

  // 일부 초기 DB에서 pilot_id 값이 비어 있거나, 화면에서 pilotId 없이 user_id만 넘어오는 경우 방어.
  if (existingUserId) {
    const { data, error } = await supabase.from(TABLE).update(updatePayload).eq("user_id", existingUserId).select("*").single();
    if (error) throw new Error(error.message);
    return mapRows([data as JsonRecord])[0];
  }

  throw new Error("렌탈회원 수정 기준값을 찾지 못했습니다. 기존 회원 연결을 다시 선택한 뒤 저장해주세요.");
}

function isDuplicateKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("duplicate key") || message.includes("23505") || message.includes("unique constraint");
}

async function saveNewRentalPilot(row: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const insertPayload = { ...row };
  if (!text(insertPayload[ID_COLUMN])) insertPayload[ID_COLUMN] = buildId(PREFIX);
  if (!insertPayload.created_at) insertPayload.created_at = nowIso();
  insertPayload.updated_at = nowIso();

  // primary key가 이미 존재하는 경우에는 insert가 아니라 같은 pilot_id row를 update한다.
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(insertPayload, { onConflict: ID_COLUMN })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapRows([data as JsonRecord])[0];
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action || body.mode);
  const data = (body.data || body) as JsonRecord;
  const isUpdateAction = action.startsWith("update") || action === "updateRow";
  const isAddAction = action.startsWith("add") || action === "addRow";

  if (!isAddAction && !isUpdateAction) {
    throw new Error(`지원하지 않는 action입니다: ${action}`);
  }

  const row = normalize(data, !isUpdateAction);
  const existing = await findExistingRentalPilot(row, data);

  if (existing) {
    const saved = await updateRentalPilotByKnownKey(existing, row);
    return {
      message: isUpdateAction ? "렌탈회원을 수정했습니다." : "이미 연결된 렌탈회원 정보가 있어 기존 정보를 수정했습니다.",
      [RESPONSE_KEY]: saved,
      data: saved,
    };
  }

  try {
    const saved = await saveNewRentalPilot(row);
    return {
      message: isUpdateAction ? "연결된 렌탈회원 정보가 없어 새로 등록했습니다." : "렌탈회원을 등록했습니다.",
      [RESPONSE_KEY]: saved,
      data: saved,
    };
  } catch (error) {
    // 구버전 화면/캐시에서 같은 pilot_id로 insert가 다시 들어오는 경우 최종 방어.
    if (isDuplicateKeyError(error)) {
      const retryExisting = await findExistingRentalPilot(row, data);
      if (retryExisting) {
        const saved = await updateRentalPilotByKnownKey(retryExisting, row);
        return {
          message: "이미 등록된 렌탈회원 정보가 있어 기존 정보를 수정했습니다.",
          [RESPONSE_KEY]: saved,
          data: saved,
        };
      }
    }
    throw error;
  }
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const [rows, users, aircraft, flightRecords, trainingLogs] = await Promise.all([
      selectRows(TABLE, { orderColumn: ORDER_COLUMN, ascending: true }),
      selectOptionalRows("users", "name"),
      selectOptionalRows("aircraft", "aircraft_id"),
      selectOptionalRows("flight_records", "flight_date"),
      selectOptionalRows("training_logs", "training_date"),
    ]);

    const normalizedTrainingLogRecords = trainingLogs
      .filter((row) => {
        const type = text(row.trainingType || row.training_type);
        return type.includes("렌탈") || type.includes("동승");
      })
      .map((row) => ({
        ...row,
        sourceTable: "training_logs",
        flightDate: row.trainingDate || row.training_date,
        flightType: row.trainingType || row.training_type,
        bookingDate: row.trainingDate || row.training_date,
        customerName: row.studentName || row.student_name,
        userName: row.studentName || row.student_name,
        actualFlightMinutes: row.actualFlightMinutes || row.actual_flight_minutes,
        settlementMinutes: row.deductedMinutes || row.deducted_minutes,
      }));

    const combinedFlightRecords = [...flightRecords, ...normalizedTrainingLogRecords];

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: SERVICE,
      [RESPONSE_KEY]: rows,
      users,
      aircraft,
      flightRecords: combinedFlightRecords,
      data: { [RESPONSE_KEY]: rows, users, aircraft, flightRecords: combinedFlightRecords },
      counts: {
        [RESPONSE_KEY]: rows.length,
        users: users.length,
        aircraft: aircraft.length,
        flightRecords: combinedFlightRecords.length,
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
