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
];

const DATE_COLUMNS = new Set([
  "birth_date",
  "training_start_date",
  "initial_charged_at",
  "manual_adjusted_at",
  "last_training_date",
]);

const NUMBER_COLUMNS = new Set([
  "height",
  "weight",
  "initial_charge_hours",
  "initial_charge_minutes",
  "charged_training_minutes",
  "total_charged_minutes",
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

function readField(input: JsonRecord, column: string) {
  const aliases = FIELD_ALIASES[column] || [column];

  for (const alias of aliases) {
    if (hasOwn(input, alias)) {
      return {
        exists: true,
        value: input[alias],
      };
    }
  }

  return {
    exists: false,
    value: undefined,
  };
}

function normalizeDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

function normalizeNumber(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeValue(column: string, value: unknown) {
  if (DATE_COLUMNS.has(column)) return normalizeDate(value);
  if (NUMBER_COLUMNS.has(column)) return normalizeNumber(value);

  const raw = text(value);

  // 일반 텍스트 컬럼은 빈 문자열도 "지우기" 의도로 인정합니다.
  return raw;
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

    row[column] = normalizeValue(column, field.value);
  }

  if (options.isCreate) {
    if (!row.student_id) row.student_id = buildId("STU");
    if (!row.course) row.course = "교육";
    if (!row.training_status) row.training_status = "교육중";
    if (!row.created_at) row.created_at = now;
  }

  row.updated_at = now;

  return row;
}

function getStudentId(input: JsonRecord) {
  return text(
    input.studentId ||
      input.student_id ||
      input.id ||
      input.student?.studentId ||
      input.student?.student_id
  );
}

async function insertStudent(data: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const row = normalizeStudent(data, { isCreate: true });

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

  const row = normalizeStudent(data, { isCreate: false });

  // student_id 자체는 primary key라 수정 payload에서 제외합니다.
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

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body.student || body) as JsonRecord;

  if (
    action === "addStudent" ||
    action === "createStudent" ||
    action === "addRow"
  ) {
    const student = await insertStudent(data);
    return { message: "교육생을 등록했습니다.", student, data: student };
  }

  if (
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
