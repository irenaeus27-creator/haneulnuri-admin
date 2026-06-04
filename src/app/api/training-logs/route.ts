import { NextRequest, NextResponse } from "next/server";
import { JsonRecord, buildId, insertRow, nowIso, numberOrNull, pickAllowed, selectRows, text, timeText, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TRAINING_LOG_COLUMNS = [
  "training_log_id", "booking_id", "student_id", "student_name", "user_id", "instructor_id", "instructor_name",
  "aircraft_id", "aircraft_name", "training_date", "scheduled_start_time", "scheduled_end_time", "actual_start_time",
  "actual_end_time", "scheduled_minutes", "actual_flight_minutes", "ground_briefing_minutes", "training_type",
  "lesson_title", "training_items", "instructor_notes", "student_notes", "homework", "caution_notes", "next_training_plan",
  "student_visible", "time_deducted", "deducted_minutes", "status", "created_at", "updated_at"
];

function boolValue(value: unknown) {
  const raw = text(value).toUpperCase();
  return raw === "TRUE" || raw === "Y" || raw === "YES" || raw === "1" || raw === "공개" || raw === "완료";
}

function normalizeTrainingLog(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.trainingLogId || input.training_log_id) || buildId("TL");
  return pickAllowed({
    training_log_id: id,
    booking_id: text(input.bookingId || input.booking_id),
    student_id: text(input.studentId || input.student_id),
    student_name: text(input.studentName || input.student_name),
    user_id: text(input.userId || input.user_id),
    instructor_id: text(input.instructorId || input.instructor_id),
    instructor_name: text(input.instructorName || input.instructor_name),
    aircraft_id: text(input.aircraftId || input.aircraft_id),
    aircraft_name: text(input.aircraftName || input.aircraft_name),
    training_date: text(input.trainingDate || input.training_date),
    scheduled_start_time: timeText(input.scheduledStartTime || input.scheduled_start_time),
    scheduled_end_time: timeText(input.scheduledEndTime || input.scheduled_end_time),
    actual_start_time: timeText(input.actualStartTime || input.actual_start_time),
    actual_end_time: timeText(input.actualEndTime || input.actual_end_time),
    scheduled_minutes: numberOrNull(input.scheduledMinutes || input.scheduled_minutes),
    actual_flight_minutes: numberOrNull(input.actualFlightMinutes || input.actual_flight_minutes),
    ground_briefing_minutes: numberOrNull(input.groundBriefingMinutes || input.ground_briefing_minutes),
    training_type: text(input.trainingType || input.training_type),
    lesson_title: text(input.lessonTitle || input.lesson_title),
    training_items: text(input.trainingItems || input.training_items),
    instructor_notes: text(input.instructorNotes || input.instructor_notes),
    student_notes: text(input.studentNotes || input.student_notes),
    homework: text(input.homework),
    caution_notes: text(input.cautionNotes || input.caution_notes),
    next_training_plan: text(input.nextTrainingPlan || input.next_training_plan),
    student_visible: boolValue(input.studentVisible || input.student_visible),
    time_deducted: boolValue(input.timeDeducted || input.time_deducted),
    deducted_minutes: numberOrNull(input.deductedMinutes || input.deducted_minutes),
    status: text(input.status || "작성완료"),
    created_at: text(input.createdAt || input.created_at) || (isCreate ? now : undefined),
    updated_at: now,
  }, TRAINING_LOG_COLUMNS);
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action === "addTrainingLog" || action === "addRow") {
    const saved = await insertRow("training_logs", normalizeTrainingLog(data, true));
    return { message: "교육일지를 등록했습니다.", trainingLog: saved, data: saved };
  }

  if (action === "updateTrainingLog" || action === "updateRow") {
    const row = normalizeTrainingLog(data, false);
    const id = text(data.trainingLogId || data.training_log_id || row.training_log_id);
    const saved = await updateRow("training_logs", "training_log_id", id, row);
    return { message: "교육일지를 수정했습니다.", trainingLog: saved, data: saved };
  }

  throw new Error(`지원하지 않는 교육일지 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const [trainingLogs, students, instructors, aircraft] = await Promise.all([
      selectRows("training_logs", { orderColumn: "training_date", ascending: false, limit: 1000 }),
      selectRows("students", { orderColumn: "student_id", ascending: true }),
      selectRows("instructors", { orderColumn: "instructor_id", ascending: true }),
      selectRows("aircraft", { orderColumn: "aircraft_id", ascending: true }),
    ]);
    const data = { trainingLogs, students, instructors, aircraft };
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: "skynuri-supabase-training-logs", ...data, data, counts: { trainingLogs: trainingLogs.length, students: students.length, instructors: instructors.length, aircraft: aircraft.length }, elapsedMs: Date.now() - startedAt });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "교육일지 조회에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const result = await handlePost(body);
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: "skynuri-supabase-training-logs", elapsedMs: Date.now() - startedAt, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "교육일지 처리에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}
