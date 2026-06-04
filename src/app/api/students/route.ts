import { NextRequest, NextResponse } from "next/server";
import { JsonRecord, buildId, insertRow, nowIso, numberOrNull, pickAllowed, selectRows, text, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STUDENT_COLUMNS = [
  "student_id", "user_id", "name", "name_english", "email", "phone", "birth_date", "marital_status",
  "home_address", "address", "work_address", "home_phone", "work_phone", "height", "weight",
  "eyesight_left", "eyesight_right", "education_level", "major", "job", "workplace", "position",
  "military_service", "vehicle_type", "health_status", "emergency_contact_name", "emergency_contact_phone",
  "emergency_contact_relation", "course", "training_start_date", "training_status",
  "assigned_instructor_id", "assigned_instructor_name", "assigned_aircraft_ids", "initial_charge_hours",
  "initial_charge_minutes", "initial_charge_memo", "initial_charged_at", "charged_training_minutes",
  "total_charged_minutes", "manual_training_minutes", "manual_training_count", "manual_adjustment_memo",
  "manual_adjusted_at", "manual_adjusted_by", "used_training_minutes", "used_minutes", "used_training_hours",
  "used_hours", "remaining_training_minutes", "remaining_minutes", "remaining_training_hours", "remaining_hours",
  "completed_training_count", "last_training_log_id", "last_training_date", "memo", "created_at", "updated_at"
];

function normalizeStudent(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const studentId = text(input.studentId || input.student_id) || buildId("STU");
  return pickAllowed({
    student_id: studentId,
    user_id: text(input.userId || input.user_id),
    name: text(input.name || input.userName || input.user_name),
    name_english: text(input.nameEnglish || input.name_english),
    email: text(input.email),
    phone: text(input.phone),
    birth_date: text(input.birthDate || input.birth_date),
    marital_status: text(input.maritalStatus || input.marital_status),
    home_address: text(input.homeAddress || input.home_address || input.address),
    address: text(input.address || input.homeAddress || input.home_address),
    work_address: text(input.workAddress || input.work_address),
    home_phone: text(input.homePhone || input.home_phone),
    work_phone: text(input.workPhone || input.work_phone),
    height: numberOrNull(input.height),
    weight: numberOrNull(input.weight),
    eyesight_left: text(input.eyesightLeft || input.eyesight_left),
    eyesight_right: text(input.eyesightRight || input.eyesight_right),
    education_level: text(input.educationLevel || input.education_level),
    major: text(input.major),
    job: text(input.job),
    workplace: text(input.workplace),
    position: text(input.position),
    military_service: text(input.militaryService || input.military_service),
    vehicle_type: text(input.vehicleType || input.vehicle_type),
    health_status: text(input.healthStatus || input.health_status),
    emergency_contact_name: text(input.emergencyContactName || input.emergency_contact_name),
    emergency_contact_phone: text(input.emergencyContactPhone || input.emergency_contact_phone),
    emergency_contact_relation: text(input.emergencyContactRelation || input.emergency_contact_relation),
    course: text(input.course || "교육"),
    training_start_date: text(input.trainingStartDate || input.training_start_date),
    training_status: text(input.trainingStatus || input.training_status || "교육중"),
    assigned_instructor_id: text(input.assignedInstructorId || input.assigned_instructor_id),
    assigned_instructor_name: text(input.assignedInstructorName || input.assigned_instructor_name),
    assigned_aircraft_ids: text(input.assignedAircraftIds || input.assigned_aircraft_ids),
    initial_charge_hours: numberOrNull(input.initialChargeHours || input.initial_charge_hours),
    initial_charge_minutes: numberOrNull(input.initialChargeMinutes || input.initial_charge_minutes),
    initial_charge_memo: text(input.initialChargeMemo || input.initial_charge_memo),
    initial_charged_at: text(input.initialChargedAt || input.initial_charged_at),
    charged_training_minutes: numberOrNull(input.chargedTrainingMinutes || input.charged_training_minutes),
    total_charged_minutes: numberOrNull(input.totalChargedMinutes || input.total_charged_minutes),
    manual_training_minutes: numberOrNull(input.manualTrainingMinutes || input.manual_training_minutes),
    manual_training_count: numberOrNull(input.manualTrainingCount || input.manual_training_count),
    manual_adjustment_memo: text(input.manualAdjustmentMemo || input.manual_adjustment_memo),
    manual_adjusted_at: text(input.manualAdjustedAt || input.manual_adjusted_at),
    manual_adjusted_by: text(input.manualAdjustedBy || input.manual_adjusted_by),
    used_training_minutes: numberOrNull(input.usedTrainingMinutes || input.used_training_minutes),
    used_minutes: numberOrNull(input.usedMinutes || input.used_minutes),
    used_training_hours: numberOrNull(input.usedTrainingHours || input.used_training_hours),
    used_hours: numberOrNull(input.usedHours || input.used_hours),
    remaining_training_minutes: numberOrNull(input.remainingTrainingMinutes || input.remaining_training_minutes),
    remaining_minutes: numberOrNull(input.remainingMinutes || input.remaining_minutes),
    remaining_training_hours: numberOrNull(input.remainingTrainingHours || input.remaining_training_hours),
    remaining_hours: numberOrNull(input.remainingHours || input.remaining_hours),
    completed_training_count: numberOrNull(input.completedTrainingCount || input.completed_training_count),
    last_training_log_id: text(input.lastTrainingLogId || input.last_training_log_id),
    last_training_date: text(input.lastTrainingDate || input.last_training_date),
    memo: text(input.memo),
    created_at: text(input.createdAt || input.created_at) || (isCreate ? now : undefined),
    updated_at: now,
  }, STUDENT_COLUMNS);
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action === "addStudent" || action === "addRow") {
    const saved = await insertRow("students", normalizeStudent(data, true));
    return { message: "교육생을 등록했습니다.", student: saved, data: saved };
  }

  if (action === "updateStudent" || action === "updateRow") {
    const row = normalizeStudent(data, false);
    const studentId = text(data.studentId || data.student_id || row.student_id);
    const saved = await updateRow("students", "student_id", studentId, row);
    return { message: "교육생 정보를 수정했습니다.", student: saved, data: saved };
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
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: "skynuri-supabase-students", ...data, data, counts: { students: students.length, instructors: instructors.length, aircraft: aircraft.length, users: users.length, trainingLogs: trainingLogs.length }, elapsedMs: Date.now() - startedAt });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "교육생 조회에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const result = await handlePost(body);
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: "skynuri-supabase-students", elapsedMs: Date.now() - startedAt, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "교육생 처리에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}
