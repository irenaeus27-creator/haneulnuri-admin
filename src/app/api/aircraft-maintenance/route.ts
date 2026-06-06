import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { JsonRecord, buildId, insertRow, nowIso, pickAllowed, selectRows, text, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "aircraft_maintenance";
const AIRCRAFT_TABLE = "aircraft";
const ID_COLUMN = "maintenance_id";
const PREFIX = "AM";
const RESPONSE_KEY = "aircraftMaintenance";
const SERVICE = "skynuri-supabase-aircraft-maintenance";
const ORDER_COLUMN = "inspection_date";
const ALLOWED_COLUMNS = [
  "maintenance_id",
  "aircraft_id",
  "aircraft_name",
  "registration_no",
  "inspection_date",
  "maintenance_type",
  "status",
  "next_inspection_date",
  "mechanic",
  "cost",
  "memo",
  "created_at",
  "updated_at",
];

type DetailInput = JsonRecord & {
  recordKind?: unknown;
  currentAirframeTime?: unknown;
  currentEngineTime?: unknown;
  provider?: unknown;
  content?: unknown;
  defect?: unknown;
  actionTaken?: unknown;
  riskLevel?: unknown;
  operationDecision?: unknown;
  closeYn?: unknown;
  attachmentUrl?: unknown;
  nextDueBasis?: unknown;
  nextDueHours?: unknown;
  checkStage?: unknown;
  flightAvailable?: unknown;
  oilStatus?: unknown;
  oilAddedAmount?: unknown;
  fuelStatus?: unknown;
  tireStatus?: unknown;
  brakeStatus?: unknown;
  propellerStatus?: unknown;
  pitotStatus?: unknown;
  controlSurfaceStatus?: unknown;
  exteriorDamage?: unknown;
};

function toSnakeValue(input: JsonRecord, column: string) {
  const camel = column.replace(/_([a-z0-9])/g, (_: string, char: string) => char.toUpperCase());
  return input[camel] ?? input[column];
}

const DATE_COLUMNS = new Set(["inspection_date", "next_inspection_date", "created_at", "updated_at"]);
const OPTIONAL_DATE_COLUMNS = new Set(["next_inspection_date"]);
const NUMERIC_COLUMNS = new Set(["cost"]);

function normalizeColumnValue(column: string, value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (DATE_COLUMNS.has(column)) {
    const raw = text(value);
    if (!raw) return OPTIONAL_DATE_COLUMNS.has(column) ? null : undefined;
    return raw;
  }

  if (NUMERIC_COLUMNS.has(column)) {
    const raw = text(value);
    if (!raw) return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return value;
}

function normalizeActiveStatus(value: unknown) {
  const raw = text(value);
  if (raw.replace(/\s/g, "") === "운항가능") return "운항 가능";
  if (raw.replace(/\s/g, "") === "점검중") return "점검 중";
  if (raw.replace(/\s/g, "") === "정비중") return "정비 대기";
  return raw || "운항 가능";
}

function detailLine(label: string, value: unknown) {
  const raw = text(value);
  return raw ? `${label}: ${raw}` : "";
}

function normalizeRecordKind(input: JsonRecord) {
  const raw = text(input.recordKind || input.record_kind || input.maintenanceType || input.maintenance_type);
  if (raw.includes("일상") || raw.includes("비행 전") || raw.includes("비행 후") || raw.includes("엔진오일량")) return "일상 점검";
  if (raw.includes("결함") || raw.includes("Squawk")) return "결함/Squawk";
  return "정기 정비/점검";
}

function buildMemo(input: DetailInput) {
  const baseMemo = text(input.memo);
  const recordKind = normalizeRecordKind(input);
  const lines = [
    detailLine("기록구분", recordKind),
    detailLine("현재 기체시간", input.currentAirframeTime),
    detailLine("현재 엔진시간", input.currentEngineTime),
    detailLine("정비업체", input.provider),
    detailLine("다음 예정 기준", input.nextDueBasis),
    detailLine("다음 예정 시간", input.nextDueHours),
    detailLine("점검 단계", input.checkStage),
    detailLine("다음 비행 가능 여부", input.flightAvailable),
    detailLine("엔진오일량", input.oilStatus),
    detailLine("오일 보충량", input.oilAddedAmount),
    detailLine("연료 상태", input.fuelStatus),
    detailLine("타이어 상태", input.tireStatus),
    detailLine("브레이크 상태", input.brakeStatus),
    detailLine("프로펠러 상태", input.propellerStatus),
    detailLine("피토관 상태", input.pitotStatus),
    detailLine("조종면 상태", input.controlSurfaceStatus),
    detailLine("외부 손상", input.exteriorDamage),
    detailLine("정비/점검 내용", input.content),
    detailLine("발견 결함", input.defect),
    detailLine("조치 내용", input.actionTaken),
    detailLine("위험도", input.riskLevel),
    detailLine("운항판단", input.operationDecision),
    detailLine("Close 여부", input.closeYn),
    detailLine("첨부", input.attachmentUrl),
    baseMemo ? `메모: ${baseMemo}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function normalize(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.maintenanceId || input.maintenance_id) || buildId(PREFIX);
  const recordKind = normalizeRecordKind(input);
  const maintenanceType = text(input.maintenanceType || input.maintenance_type || input.recordKind, recordKind);
  const aircraftId = text(input.aircraftId || input.aircraft_id);
  const inspectionDate = text(input.inspectionDate || input.inspection_date || input.recordDate, "");
  const status = text(input.status, recordKind === "결함/Squawk" ? "미해결" : recordKind === "일상 점검" ? "정상" : "완료");

  if (!aircraftId) throw new Error("항공기를 선택하세요.");
  if (!inspectionDate) throw new Error("날짜를 입력하세요.");
  if (!maintenanceType) throw new Error("점검종류를 선택하세요.");
  if (!status) throw new Error("상태를 선택하세요.");

  const row: JsonRecord = { [ID_COLUMN]: id };

  ALLOWED_COLUMNS.forEach((column) => {
    const value = normalizeColumnValue(column, toSnakeValue(input, column));
    if (value !== undefined) row[column] = value;
  });

  row.maintenance_type = maintenanceType;
  row.inspection_date = inspectionDate;
  row.next_inspection_date = recordKind === "정기 정비/점검" ? normalizeColumnValue("next_inspection_date", input.nextInspectionDate || input.next_inspection_date) : null;
  row.status = status;
  row.memo = buildMemo(input as DetailInput);

  if (isCreate && !row.created_at) row.created_at = now;
  row.updated_at = now;

  return pickAllowed(row, ALLOWED_COLUMNS);
}

async function updateAircraftSummary(row: JsonRecord, input: JsonRecord) {
  const aircraftId = text(input.aircraftId || input.aircraft_id || row.aircraft_id);
  if (!aircraftId) return;

  const recordKind = normalizeRecordKind(input);
  const status = text(row.status);
  const operationDecision = text(input.operationDecision);
  const flightAvailable = text(input.flightAvailable);
  const nextInspectionDate = text(row.next_inspection_date);
  const updateData: JsonRecord = { updated_at: nowIso() };

  if (recordKind === "정기 정비/점검") {
    if (nextInspectionDate) updateData.next_inspection_date = nextInspectionDate;
    if (status === "진행중") updateData.status = "점검 중";
    if (status === "예정") updateData.status = "정비 대기";
    if (status === "완료") updateData.status = "운항 가능";
  }

  if (recordKind === "일상 점검") {
    if (flightAvailable === "불가") updateData.status = "예약 불가";
    if (flightAvailable === "제한") updateData.status = "정비 대기";
  }

  if (recordKind === "결함/Squawk") {
    if (operationDecision === "운항 불가") updateData.status = "예약 불가";
    if (operationDecision === "운항 제한") updateData.status = "정비 대기";
    if ((status === "완료" || text(input.closeYn) === "Y") && operationDecision === "운항 가능") updateData.status = "운항 가능";
  }

  if (Object.keys(updateData).length <= 1) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from(AIRCRAFT_TABLE).update(updateData).eq("aircraft_id", aircraftId);
  if (error) throw new Error(`항공기 요약 업데이트 실패: ${error.message}`);
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action || body.mode);
  const data = (body.data || body) as JsonRecord;

  if (action.startsWith("add") || action === "addRow" || action === "add") {
    const row = normalize(data, true);
    const saved = await insertRow(TABLE, row);
    await updateAircraftSummary(row, data);
    return { message: "정비/결함 기록을 등록했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  if (action.startsWith("update") || action === "updateRow" || action === "update") {
    const row = normalize(data, false);
    const id = text(data.maintenanceId || data.maintenance_id || row[ID_COLUMN]);
    const saved = await updateRow(TABLE, ID_COLUMN, id, row);
    await updateAircraftSummary(row, data);
    return { message: "정비/결함 기록을 수정했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  throw new Error(`지원하지 않는 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const [maintenanceRows, aircraftRows] = await Promise.all([
      selectRows(TABLE, { orderColumn: ORDER_COLUMN, ascending: false }),
      selectRows(AIRCRAFT_TABLE, { orderColumn: "aircraft_id", ascending: true }),
    ]);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: SERVICE,
      [RESPONSE_KEY]: maintenanceRows,
      aircraft: aircraftRows,
      data: { [RESPONSE_KEY]: maintenanceRows, aircraft: aircraftRows },
      counts: { [RESPONSE_KEY]: maintenanceRows.length, aircraft: aircraftRows.length },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message: error instanceof Error ? error.message : "항공기 정비관리 데이터를 불러오지 못했습니다.",
        aircraftMaintenance: [],
        aircraft: [],
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
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: SERVICE, elapsedMs: Date.now() - startedAt, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message: error instanceof Error ? error.message : "정비/결함 기록 저장에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
