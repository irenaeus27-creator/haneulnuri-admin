import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { JsonRecord, buildId, nowIso, selectRows, text } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STUDENT_COLUMNS = [
  "student_id",
  "user_id",
  "name",
  "name_english",
  "email",
  "phone",
  "birth_date",
  "marital_status",
  "home_address",
  "address",
  "work_address",
  "home_phone",
  "work_phone",
  "height",
  "weight",
  "eyesight_left",
  "eyesight_right",
  "education_level",
  "major",
  "job",
  "workplace",
  "position",
  "military_service",
  "vehicle_type",
  "license_type",
  "health_status",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relation",
  "course",
  "training_start_date",
  "training_status",
  "assigned_instructor_id",
  "assigned_instructor_name",
  "assigned_aircraft_ids",
  "initial_charge_hours",
  "initial_charge_minutes",
  "initial_charge_memo",
  "initial_charged_at",
  "charged_training_minutes",
  "total_charged_minutes",
  "manual_flight_time",
  "manual_flight_count",
  "manual_training_minutes",
  "manual_training_count",
  "manual_adjustment_memo",
  "manual_adjusted_at",
  "manual_adjusted_by",
  "used_training_minutes",
  "used_minutes",
  "used_training_hours",
  "used_hours",
  "remaining_training_minutes",
  "remaining_minutes",
  "remaining_training_hours",
  "remaining_hours",
  "completed_training_count",
  "last_training_log_id",
  "last_training_date",
  "memo",
  "created_at",
  "updated_at",
] as const;

const DATE_COLUMNS = new Set([
  "birth_date",
  "training_start_date",
  "last_training_date",
]);

const TIMESTAMP_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "initial_charged_at",
  "manual_adjusted_at",
]);

const NUMBER_COLUMNS = new Set([
  "height",
  "weight",
  "initial_charge_hours",
  "initial_charge_minutes",
  "charged_training_minutes",
  "total_charged_minutes",
  "manual_flight_time",
  "manual_flight_count",
  "manual_training_minutes",
  "manual_training_count",
  "used_training_minutes",
  "used_minutes",
  "used_training_hours",
  "used_hours",
  "remaining_training_minutes",
  "remaining_minutes",
  "remaining_training_hours",
  "remaining_hours",
  "completed_training_count",
]);

const FIELD_ALIASES: Record<string, string[]> = {
  student_id: ["studentId", "student_id"],
  user_id: ["userId", "user_id"],
  name: ["name", "userName", "user_name", "studentName", "student_name"],
  name_english: ["nameEnglish", "name_english"],
  email: ["email"],
  phone: ["phone"],
  birth_date: ["birthDate", "birth_date"],
  marital_status: ["maritalStatus", "marital_status"],
  home_address: ["homeAddress", "home_address"],
  address: ["address"],
  work_address: ["workAddress", "work_address"],
  home_phone: ["homePhone", "home_phone"],
  work_phone: ["workPhone", "work_phone"],
  height: ["height"],
  weight: ["weight"],
  eyesight_left: ["eyesightLeft", "eyesight_left"],
  eyesight_right: ["eyesightRight", "eyesight_right"],
  education_level: ["educationLevel", "education_level"],
  major: ["major"],
  job: ["job"],
  workplace: ["workplace"],
  position: ["position"],
  military_service: ["militaryService", "military_service"],
  vehicle_type: ["vehicleType", "vehicle_type"],
  license_type: ["licenseType", "license_type"],
  health_status: ["healthStatus", "health_status"],
  emergency_contact_name: ["emergencyContactName", "emergency_contact_name"],
  emergency_contact_phone: ["emergencyContactPhone", "emergency_contact_phone"],
  emergency_contact_relation: ["emergencyContactRelation", "emergency_contact_relation"],
  course: ["course"],
  training_start_date: ["trainingStartDate", "training_start_date"],
  training_status: ["trainingStatus", "training_status"],
  assigned_instructor_id: ["assignedInstructorId", "assigned_instructor_id"],
  assigned_instructor_name: ["assignedInstructorName", "assigned_instructor_name"],
  assigned_aircraft_ids: ["assignedAircraftIds", "assigned_aircraft_ids"],
  initial_charge_hours: ["initialChargeHours", "initial_charge_hours"],
  initial_charge_minutes: ["initialChargeMinutes", "initial_charge_minutes"],
  initial_charge_memo: ["initialChargeMemo", "initial_charge_memo"],
  initial_charged_at: ["initialChargedAt", "initial_charged_at"],
  charged_training_minutes: ["chargedTrainingMinutes", "charged_training_minutes"],
  total_charged_minutes: ["totalChargedMinutes", "total_charged_minutes"],
  manual_flight_time: ["manualFlightTime", "manual_flight_time"],
  manual_flight_count: ["manualFlightCount", "manual_flight_count"],
  manual_training_minutes: ["manualTrainingMinutes", "manual_training_minutes"],
  manual_training_count: ["manualTrainingCount", "manual_training_count"],
  manual_adjustment_memo: ["manualAdjustmentMemo", "manual_adjustment_memo"],
  manual_adjusted_at: ["manualAdjustedAt", "manual_adjusted_at"],
  manual_adjusted_by: ["manualAdjustedBy", "manual_adjusted_by"],
  used_training_minutes: ["usedTrainingMinutes", "used_training_minutes"],
  used_minutes: ["usedMinutes", "used_minutes"],
  used_training_hours: ["usedTrainingHours", "used_training_hours"],
  used_hours: ["usedHours", "used_hours"],
  remaining_training_minutes: ["remainingTrainingMinutes", "remaining_training_minutes"],
  remaining_minutes: ["remainingMinutes", "remaining_minutes"],
  remaining_training_hours: ["remainingTrainingHours", "remaining_training_hours"],
  remaining_hours: ["remainingHours", "remaining_hours"],
  completed_training_count: ["completedTrainingCount", "completed_training_count"],
  last_training_log_id: ["lastTrainingLogId", "last_training_log_id"],
  last_training_date: ["lastTrainingDate", "last_training_date"],
  memo: ["memo"],
  created_at: ["createdAt", "created_at"],
  updated_at: ["updatedAt", "updated_at"],
};

function hasOwn(input: JsonRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function readField(input: JsonRecord, column: string) {
  const aliases = FIELD_ALIASES[column] || [column];

  for (const alias of aliases) {
    if (hasOwn(input, alias)) {
      return { exists: true, value: input[alias] };
    }
  }

  return { exists: false, value: undefined };
}

function toNumber(value: unknown) {
  const raw = text(value);
  if (!raw) return 0;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

function normalizeTimestamp(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function normalizeNumber(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function minutesFromHours(value: unknown) {
  return Math.round(toNumber(value) * 60);
}

function normalizeValue(column: string, value: unknown) {
  if (DATE_COLUMNS.has(column)) return normalizeDate(value);
  if (TIMESTAMP_COLUMNS.has(column)) return normalizeTimestamp(value);
  if (NUMBER_COLUMNS.has(column)) return normalizeNumber(value);
  return text(value);
}

function removeEmptyDatabaseValues(row: JsonRecord) {
  Object.entries(row).forEach(([key, value]) => {
    if (value === undefined) {
      delete row[key];
      return;
    }

    if (value === "" && (DATE_COLUMNS.has(key) || TIMESTAMP_COLUMNS.has(key) || NUMBER_COLUMNS.has(key))) {
      delete row[key];
      return;
    }

    if (value === null && (key === "student_id" || key === "name")) {
      delete row[key];
    }
  });

  return row;
}

function toCamelKey(key: string) {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function toCamelObject(row: JsonRecord) {
  const result: JsonRecord = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    result[toCamelKey(key)] = value ?? "";
  });

  return result;
}

function normalizeStudent(input: JsonRecord, options: { isCreate: boolean }) {
  const now = nowIso();
  const row: JsonRecord = {};

  for (const column of STUDENT_COLUMNS) {
    if (column === "updated_at") continue;

    const field = readField(input, column);
    if (!field.exists) continue;

    const normalized = normalizeValue(column, field.value);
    if (normalized !== null || !options.isCreate) {
      row[column] = normalized;
    }
  }

  if (options.isCreate) {
    if (!row.student_id) row.student_id = buildId("STU");
    if (!row.course) row.course = "교육";
    if (!row.training_status) row.training_status = "교육중";
    if (!row.created_at) row.created_at = now;
  }

  row.updated_at = now;

  return removeEmptyDatabaseValues(row);
}

function getStudentId(input: JsonRecord) {
  const nestedStudent = asRecord(input.student);

  return text(
    input.studentId ||
      input.student_id ||
      input.id ||
      nestedStudent.studentId ||
      nestedStudent.student_id
  );
}

function getAddChargeMinutes(input: JsonRecord, row?: JsonRecord) {
  const explicitMinutes = toNumber(
    input.addChargeMinutes ||
      input.add_charge_minutes ||
      input.chargeMinutes ||
      input.charge_minutes ||
      row?.initial_charge_minutes ||
      input.initialChargeMinutes ||
      input.initial_charge_minutes
  );

  if (explicitMinutes > 0) return Math.round(explicitMinutes);

  return minutesFromHours(
    input.addChargeHours ||
      input.add_charge_hours ||
      input.chargeHours ||
      input.charge_hours ||
      row?.initial_charge_hours ||
      input.initialChargeHours ||
      input.initial_charge_hours
  );
}

function currentChargedMinutes(row: JsonRecord) {
  const total = toNumber(row.total_charged_minutes || row.totalChargedMinutes);
  if (total > 0) return Math.round(total);

  const charged = toNumber(row.charged_training_minutes || row.chargedTrainingMinutes);
  if (charged > 0) return Math.round(charged);

  const initial = toNumber(row.initial_charge_minutes || row.initialChargeMinutes);
  if (initial > 0) return Math.round(initial);

  return minutesFromHours(row.initial_charge_hours || row.initialChargeHours);
}

function currentUsedMinutes(row: JsonRecord) {
  const usedTraining = toNumber(row.used_training_minutes || row.usedTrainingMinutes);
  const used = toNumber(row.used_minutes || row.usedMinutes);
  const usedHours = minutesFromHours(row.used_training_hours || row.usedTrainingHours || row.used_hours || row.usedHours);

  return Math.round(Math.max(usedTraining, used, usedHours, 0));
}

function applyTrainingCharge(row: JsonRecord, totalMinutes: number, usedMinutes = 0) {
  const normalizedTotal = Math.max(Math.round(totalMinutes), 0);
  const normalizedUsed = Math.max(Math.round(usedMinutes), 0);
  const remaining = Math.max(normalizedTotal - normalizedUsed, 0);
  const remainingHours = Number((remaining / 60).toFixed(2));

  row.charged_training_minutes = normalizedTotal;
  row.total_charged_minutes = normalizedTotal;
  row.remaining_training_minutes = remaining;
  row.remaining_minutes = remaining;
  row.remaining_training_hours = remainingHours;
  row.remaining_hours = remainingHours;

  return row;
}

function applyInitialCharge(row: JsonRecord, input: JsonRecord) {
  const addMinutes = getAddChargeMinutes(input, row);
  if (addMinutes <= 0) return row;

  const now = nowIso();

  if (!toNumber(row.initial_charge_minutes)) row.initial_charge_minutes = addMinutes;
  if (!toNumber(row.initial_charge_hours)) row.initial_charge_hours = Number((addMinutes / 60).toFixed(2));
  if (!row.initial_charged_at) row.initial_charged_at = now;
  if (!row.initial_charge_memo && text(input.chargeMemo || input.charge_memo)) {
    row.initial_charge_memo = text(input.chargeMemo || input.charge_memo);
  }

  return applyTrainingCharge(row, addMinutes, currentUsedMinutes(row));
}

function applyAppendCharge(row: JsonRecord, input: JsonRecord, existing: JsonRecord) {
  const addMinutes = getAddChargeMinutes(input);
  if (addMinutes <= 0) return row;

  const existingTotal = currentChargedMinutes(existing);
  const nextTotal = existingTotal + addMinutes;

  const usedMinutes = Math.max(
    currentUsedMinutes(existing),
    currentUsedMinutes(row)
  );

  return applyTrainingCharge(row, nextTotal, usedMinutes);
}

function buildLinkedUserId(row: JsonRecord, input: JsonRecord) {
  const explicitUserId = text(
    row.user_id ||
      input.userId ||
      input.user_id ||
      asRecord(input.user).userId ||
      asRecord(input.user).user_id
  );

  if (explicitUserId) return explicitUserId;

  const studentId = text(row.student_id || input.studentId || input.student_id);
  if (studentId) return studentId;

  return buildId("U");
}

function cleanUserRow(row: JsonRecord) {
  Object.entries(row).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      delete row[key];
    }
  });
  return row;
}

async function ensureLinkedUser(row: JsonRecord, input: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const now = nowIso();
  const userId = buildLinkedUserId(row, input);

  row.user_id = userId;

  const userRow = cleanUserRow({
    user_id: userId,
    name: text(row.name || input.name || input.userName || input.studentName) || "교육생",
    phone: text(row.phone || input.phone),
    email: text(row.email || input.email),
    role: "student",
    status: "승인완료",
    created_at: now,
    approved_at: now,
    memo: text(input.memo || row.memo),
    notification_enabled: true,
  });

  const { error } = await supabase
    .from("users")
    .upsert(userRow, { onConflict: "user_id" });

  if (error) {
    throw new Error(`교육생 연결 회원 생성/확인에 실패했습니다: ${error.message}`);
  }

  return userId;
}

async function findExistingStudent(studentId: string) {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("students")
    .select("*")
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || {}) as JsonRecord;
}

async function insertStudent(data: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const row = normalizeStudent(data, { isCreate: true });

  applyInitialCharge(row, data);

  await ensureLinkedUser(row, data);

  const { data: saved, error } = await supabase
    .from("students")
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return toCamelObject(saved as JsonRecord);
}

async function updateStudent(data: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const studentId = getStudentId(data);

  if (!studentId) {
    throw new Error("studentId가 필요합니다.");
  }

  const existing = await findExistingStudent(studentId);
  const row = normalizeStudent(data, { isCreate: false });

  if (hasOwn(row, "user_id")) {
    if (text(row.user_id)) {
      await ensureLinkedUser(row, data);
    } else {
      delete row.user_id;
    }
  }

  const chargeMode = text(data.chargeMode || data.charge_mode);
  const addChargeMinutes = getAddChargeMinutes(data);
  if (chargeMode === "append" && addChargeMinutes > 0) {
    applyAppendCharge(row, data, existing);
  }

  delete row.student_id;
  delete row.created_at;

  if (Object.keys(row).length === 1 && row.updated_at) {
    throw new Error("수정할 내용이 없습니다.");
  }

  const { data: saved, error } = await supabase
    .from("students")
    .update(row)
    .eq("student_id", studentId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return toCamelObject(saved as JsonRecord);
}


async function deleteStudent(data: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const studentId = getStudentId(data);

  if (!studentId) {
    throw new Error("studentId가 필요합니다.");
  }

  const confirmName = text(data.confirmName || data.confirm_name);
  const requestedName = text(data.name || data.studentName || data.student_name);

  const { data: existing, error: findError } = await supabase
    .from("students")
    .select("student_id,name,user_id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (!existing) throw new Error("삭제할 교육생을 찾지 못했습니다.");

  const existingRow = existing as JsonRecord;
  const existingName = text(existingRow.name);

  if (!confirmName) {
    throw new Error("삭제 확인을 위해 교육생 이름을 입력해야 합니다.");
  }

  if (confirmName !== existingName) {
    throw new Error("입력한 이름이 교육생 이름과 일치하지 않습니다.");
  }

  if (requestedName && requestedName !== existingName) {
    throw new Error("삭제 요청 정보가 현재 교육생 정보와 일치하지 않습니다. 새로고침 후 다시 시도하세요.");
  }

  const { error } = await supabase
    .from("students")
    .delete()
    .eq("student_id", studentId);

  if (error) throw new Error(error.message);

  return {
    studentId,
    name: existingName,
    userId: text(existingRow.user_id),
  };
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action || body.mode);
  const data = asRecord(body.data || body.student || body);

  if (
    action === "add" ||
    action === "addStudent" ||
    action === "createStudent" ||
    action === "addRow"
  ) {
    const student = await insertStudent(data);
    return { message: "교육생을 등록했습니다.", student, data: student };
  }

  if (
    action === "delete" ||
    action === "deleteStudent" ||
    action === "removeStudent" ||
    action === "deleteRow"
  ) {
    const deleted = await deleteStudent(data);
    return { message: "교육생을 삭제했습니다.", deleted, data: deleted };
  }

  if (
    action === "update" ||
    action === "updateStudent" ||
    action === "saveStudent" ||
    action === "editStudent" ||
    action === "updateStudentMemo" ||
    action === "updateRow" ||
    !action
  ) {
    const student = await updateStudent(data);
    return { message: "교육생 정보를 수정했습니다.", student, data: student };
  }

  throw new Error(`지원하지 않는 교육생 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const [students, instructors, aircraft, users, trainingLogs] = await Promise.all([
      selectRows("students", { orderColumn: "student_id", ascending: true }),
      selectRows("instructors", { orderColumn: "instructor_id", ascending: true }),
      selectRows("aircraft", { orderColumn: "aircraft_id", ascending: true }),
      selectRows("users", { orderColumn: "created_at", ascending: false }),
      selectRows("training_logs", { orderColumn: "training_date", ascending: false, limit: 300 }),
    ]);

    const data = { students, instructors, aircraft, users, trainingLogs };

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-supabase-students",
      ...data,
      data,
      counts: {
        students: students.length,
        instructors: instructors.length,
        aircraft: aircraft.length,
        users: users.length,
        trainingLogs: trainingLogs.length,
      },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message: error instanceof Error ? error.message : "교육생 조회에 실패했습니다.",
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
      service: "skynuri-supabase-students",
      elapsedMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message: error instanceof Error ? error.message : "교육생 처리에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
