import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  JsonRecord,
  buildId,
  insertRow,
  nowIso,
  numberOrNull,
  pickAllowed,
  selectRows,
  text,
  timeText,
  updateRow,
  toCamelObject,
} from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TRAINING_LOG_COLUMNS = [
  "training_log_id",
  "booking_id",
  "student_id",
  "student_name",
  "user_id",
  "instructor_id",
  "instructor_name",
  "aircraft_id",
  "aircraft_name",
  "training_date",
  "scheduled_start_time",
  "scheduled_end_time",
  "actual_start_time",
  "actual_end_time",
  "scheduled_minutes",
  "actual_flight_minutes",
  "ground_briefing_minutes",
  "training_type",
  "lesson_title",
  "training_items",
  "instructor_notes",
  "student_notes",
  "homework",
  "caution_notes",
  "next_training_plan",
  "student_visible",
  "time_deducted",
  "deducted_minutes",
  "status",
  "created_at",
  "updated_at",
];

function boolValue(value: unknown) {
  const raw = text(value).toUpperCase();
  return (
    raw === "TRUE" ||
    raw === "Y" ||
    raw === "YES" ||
    raw === "1" ||
    raw === "공개" ||
    raw === "완료"
  );
}

function nullableText(value: unknown) {
  const raw = text(value);
  return raw || null;
}

async function resolveStudentForTrainingLog(input: JsonRecord) {
  const requestedStudentId = text(input.studentId || input.student_id);
  const requestedUserId = text(input.userId || input.user_id);
  const requestedName = text(input.studentName || input.student_name);

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("students")
    .select("student_id,user_id,name");

  if (error) throw new Error(`교육생 연결 확인 실패: ${error.message}`);

  const rows = (data || []) as JsonRecord[];
  return (
    rows.find(
      (item) => text(item.student_id) === requestedStudentId && requestedStudentId,
    ) ||
    rows.find((item) => text(item.user_id) === requestedUserId && requestedUserId) ||
    rows.find(
      (item) => text(item.user_id) === requestedStudentId && requestedStudentId,
    ) ||
    rows.find((item) => text(item.name) === requestedName && requestedName) ||
    null
  );
}

function normalizeTrainingType(value: unknown) {
  const type = text(value, "교육비행");
  if (type.includes("교육")) return "교육비행";
  if (type.includes("체험")) return "체험비행";
  if (type.includes("동승")) return "동승비행";
  if (type.includes("렌탈") || type.includes("대여")) return "렌탈비행";
  return "기타";
}

function isEducationType(value: unknown) {
  return normalizeTrainingType(value) === "교육비행";
}

function requiresInstructorType(value: unknown) {
  const type = normalizeTrainingType(value);
  return type === "교육비행" || type === "체험비행" || type === "동승비행";
}

async function buildSafeTrainingLogInput(input: JsonRecord): Promise<JsonRecord> {
  const trainingType = normalizeTrainingType(input.trainingType || input.training_type || "교육비행");
  input.trainingType = trainingType;
  input.training_type = trainingType;
  const educationFlight = isEducationType(trainingType);

  if (!educationFlight) {
    const bookingId = text(input.bookingId || input.booking_id);
    const courseMinutesValue = trainingType === "체험비행" ? await resolveExperienceCourseMinutesByBookingId(bookingId) : 0;
    const baseRow = {
      ...input,
      studentId: "",
      student_id: null,
      userId: "",
      user_id: null,
      studentName: text(input.studentName || input.student_name || input.customerName || input.customer_name),
      student_name: text(input.studentName || input.student_name || input.customerName || input.customer_name),
      studentVisible: "FALSE",
      student_visible: false,
      timeDeducted: "FALSE",
      time_deducted: false,
      deductedMinutes: 0,
      deducted_minutes: 0,
    };
    return trainingType === "체험비행" ? applyExperienceCourseMinutes(baseRow, courseMinutesValue) : baseRow;
  }

  const student = await resolveStudentForTrainingLog(input);
  const studentId = text(student?.student_id);

  if (!studentId) {
    throw new Error(
      "교육비행은 교육생 선택이 필요합니다. 교육생 관리에서 해당 교육생의 user 연결 상태를 확인하세요.",
    );
  }

  return {
    ...input,
    studentId,
    student_id: studentId,
    userId: text(student?.user_id || input.userId || input.user_id),
    user_id: text(student?.user_id || input.userId || input.user_id),
    studentName: text(student?.name || input.studentName || input.student_name),
    student_name: text(student?.name || input.studentName || input.student_name),
  };
}

function normalizeTrainingLog(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id =
    text(input.trainingLogId || input.training_log_id) || buildId("TL");
  const trainingType = normalizeTrainingType(input.trainingType || input.training_type);
  const instructorRequired = requiresInstructorType(trainingType);
  return pickAllowed(
    {
      training_log_id: id,
      booking_id: nullableText(input.bookingId || input.booking_id),
      student_id: nullableText(input.studentId || input.student_id),
      student_name: text(input.studentName || input.student_name),
      user_id: nullableText(input.userId || input.user_id),
      instructor_id: instructorRequired ? nullableText(input.instructorId || input.instructor_id) : null,
      instructor_name: instructorRequired ? text(input.instructorName || input.instructor_name) : "",
      aircraft_id: nullableText(input.aircraftId || input.aircraft_id),
      aircraft_name: text(input.aircraftName || input.aircraft_name),
      training_date: text(input.trainingDate || input.training_date),
      scheduled_start_time: timeText(
        input.scheduledStartTime || input.scheduled_start_time,
      ),
      scheduled_end_time: timeText(
        input.scheduledEndTime || input.scheduled_end_time,
      ),
      actual_start_time: timeText(
        input.actualStartTime || input.actual_start_time,
      ),
      actual_end_time: timeText(input.actualEndTime || input.actual_end_time),
      scheduled_minutes: numberOrNull(
        input.scheduledMinutes || input.scheduled_minutes,
      ),
      actual_flight_minutes: numberOrNull(
        input.actualFlightMinutes || input.actual_flight_minutes,
      ),
      ground_briefing_minutes: numberOrNull(
        input.groundBriefingMinutes || input.ground_briefing_minutes,
      ),
      training_type: trainingType,
      lesson_title: text(input.lessonTitle || input.lesson_title),
      training_items: text(input.trainingItems || input.training_items),
      instructor_notes: text(input.instructorNotes || input.instructor_notes),
      student_notes: text(input.studentNotes || input.student_notes),
      homework: text(input.homework),
      caution_notes: text(input.cautionNotes || input.caution_notes),
      next_training_plan: text(
        input.nextTrainingPlan || input.next_training_plan,
      ),
      student_visible: boolValue(input.studentVisible || input.student_visible),
      time_deducted: boolValue(input.timeDeducted || input.time_deducted),
      deducted_minutes: numberOrNull(
        input.deductedMinutes || input.deducted_minutes,
      ),
      status: text(input.status || "작성완료"),
      created_at:
        text(input.createdAt || input.created_at) ||
        (isCreate ? now : undefined),
      updated_at: now,
    },
    TRAINING_LOG_COLUMNS,
  );
}

function kstDateParts(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}

function dateText(date: Date) {
  const { year, month, day } = kstDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const { year, month, day } = kstDateParts(date);
  return new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0));
}

function minutesBetween(startTime: unknown, endTime: unknown) {
  const start = timeText(startTime);
  const end = timeText(endTime);
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);

  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(endMinute)
  )
    return 0;

  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return endTotal > startTotal ? endTotal - startTotal : 0;
}

function isFlightBooking(row: JsonRecord) {
  const type = text(
    row.bookingType ||
      row.booking_type ||
      row.reservationType ||
      row.reservation_type ||
      row.type,
  );
  if (!type) return true;
  return !type.includes("정비");
}

function isActiveBooking(row: JsonRecord) {
  const status = text(row.status);
  return !["취소", "기상취소", "노쇼", "반려"].includes(status);
}

function findStudentForBooking(booking: JsonRecord, students: JsonRecord[]) {
  const userId = text(booking.userId || booking.user_id);
  const userName = text(booking.userName || booking.user_name || booking.name);

  return (
    students.find(
      (item) => text(item.userId || item.user_id) === userId && userId,
    ) ||
    students.find(
      (item) => text(item.studentId || item.student_id) === userId && userId,
    ) ||
    students.find(
      (item) =>
        text(item.name || item.studentName || item.student_name) === userName &&
        userName,
    )
  );
}

function normalizedKey(value: unknown) {
  return text(value).replace(/\s/g, "").toLowerCase();
}

function courseMinutes(row: JsonRecord) {
  return (
    Number(row.durationMinutes || row.duration_minutes || 0) ||
    Number(row.defaultMinutes || row.default_minutes || 0) ||
    Number(row.minutes || row.minute || 0) ||
    0
  );
}

function findCourseForBooking(booking: JsonRecord, courseCatalog: JsonRecord[]) {
  const courseName = normalizedKey(booking.courseName || booking.course_name || booking.course || booking.course_id || booking.courseId);
  const bookingTypeName = normalizedKey(booking.bookingType || booking.booking_type || booking.reservationType || booking.reservation_type);

  if (!courseName && !bookingTypeName) return null;

  return (
    courseCatalog.find((course) => {
      const names = [course.courseName, course.course_name, course.name, course.courseId, course.course_id]
        .map(normalizedKey)
        .filter(Boolean);
      return courseName && names.includes(courseName);
    }) ||
    courseCatalog.find((course) => {
      const type = normalizedKey(course.courseType || course.course_type);
      return bookingTypeName && type && (type === bookingTypeName || bookingTypeName.includes(type) || type.includes(bookingTypeName));
    }) ||
    null
  );
}

function settlementMinutesForBooking(booking: JsonRecord, courseCatalog: JsonRecord[]) {
  const type = normalizeTrainingType(
    booking.bookingType ||
      booking.booking_type ||
      booking.reservationType ||
      booking.reservation_type,
  );
  const startTime = booking.startTime || booking.start_time;
  const endTime = booking.endTime || booking.end_time;
  const scheduledMinutes =
    Number(booking.durationMinutes || booking.duration_minutes || 0) ||
    minutesBetween(startTime, endTime);

  if (type === "체험비행") {
    const course = findCourseForBooking(booking, courseCatalog);
    const minutes = course ? courseMinutes(course) : 0;
    if (minutes > 0) return minutes;
  }

  if (type === "교육비행") return 60;

  return scheduledMinutes || 60;
}

async function resolveExperienceCourseMinutesByBookingId(bookingId: string) {
  if (!bookingId) return 0;

  const supabase = getSupabaseServerClient();
  const [{ data: bookingData }, { data: courseData }] = await Promise.all([
    supabase
      .from("bookings")
      .select("booking_id,course_name,booking_type,reservation_type,duration_minutes,start_time,end_time")
      .eq("booking_id", bookingId)
      .maybeSingle(),
    supabase.from("course_catalog").select("*"),
  ]);

  const booking = bookingData as JsonRecord | null;
  if (!booking) return 0;

  if (normalizeTrainingType(booking.booking_type || booking.reservation_type) !== "체험비행") {
    return 0;
  }

  return settlementMinutesForBooking(booking, (courseData || []) as JsonRecord[]);
}

function applyExperienceCourseMinutes(row: JsonRecord, courseMinutesValue: number) {
  if (courseMinutesValue <= 0) return row;
  return {
    ...row,
    actualFlightMinutes: courseMinutesValue,
    actual_flight_minutes: courseMinutesValue,
    payableMinutes: courseMinutesValue,
    payable_minutes: courseMinutesValue,
    deductedMinutes: 0,
    deducted_minutes: 0,
  };
}

function buildPendingLogFromBooking(
  booking: JsonRecord,
  students: JsonRecord[],
  courseCatalog: JsonRecord[],
) {
  const student = findStudentForBooking(booking, students);
  const scheduledMinutes =
    Number(booking.durationMinutes || booking.duration_minutes || 0) ||
    minutesBetween(
      booking.startTime || booking.start_time,
      booking.endTime || booking.end_time,
    );
  const type = normalizeTrainingType(
    booking.bookingType ||
      booking.booking_type ||
      booking.reservationType ||
      booking.reservation_type,
  );
  const settlementMinutes = settlementMinutesForBooking(booking, courseCatalog);
  const studentName = text(
    booking.userName ||
      booking.user_name ||
      booking.name ||
      student?.name ||
      student?.studentName ||
      student?.student_name,
  );
  const studentId = text(
    student?.studentId ||
      student?.student_id ||
      booking.studentId ||
      booking.student_id,
  );
  const userId = text(
    booking.userId || booking.user_id || student?.userId || student?.user_id,
  );

  return {
    trainingLogId: "",
    bookingId: text(booking.bookingId || booking.booking_id || booking.id),
    studentId,
    studentName: studentName || text(booking.userName || booking.user_name || booking.name || booking.customerName || booking.customer_name),
    userId,
    instructorId: text(booking.instructorId || booking.instructor_id),
    instructorName: text(booking.instructorName || booking.instructor_name),
    aircraftId: text(booking.aircraftId || booking.aircraft_id),
    aircraftName: text(
      booking.aircraftName || booking.aircraft_name || booking.aircraft,
    ),
    trainingDate: text(booking.bookingDate || booking.booking_date),
    scheduledStartTime: timeText(booking.startTime || booking.start_time),
    scheduledEndTime: timeText(booking.endTime || booking.end_time),
    actualStartTime: timeText(booking.startTime || booking.start_time),
    actualEndTime: timeText(booking.endTime || booking.end_time),
    scheduledMinutes,
    actualFlightMinutes: settlementMinutes,
    groundBriefingMinutes: 0,
    payableMinutes: settlementMinutes,
    sourceType: "booking",
    trainingType: type,
    lessonTitle: "",
    trainingItems: "",
    instructorNotes: "",
    studentNotes: "",
    cautionNotes: "",
    nextTrainingPlan: "",
    studentVisible: isEducationType(
      booking.bookingType ||
        booking.booking_type ||
        booking.reservationType ||
        booking.reservation_type,
    ) ? "TRUE" : "FALSE",
    timeDeducted: isEducationType(
      booking.bookingType ||
        booking.booking_type ||
        booking.reservationType ||
        booking.reservation_type,
    ) ? "TRUE" : "FALSE",
    deductedMinutes: isEducationType(
      booking.bookingType ||
        booking.booking_type ||
        booking.reservationType ||
        booking.reservation_type,
    ) ? settlementMinutes : 0,
    status: "작성대기",
  };
}

async function selectFlightBookings() {
  const supabase = getSupabaseServerClient();
  const today = new Date();
  const fromDate = dateText(addDays(today, -14));
  const toDate = dateText(addDays(today, 14));

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: false })
    .order("start_time", { ascending: true });

  if (error) throw new Error(`bookings 조회 실패: ${error.message}`);

  return (data || [])
    .map((row) => toCamelObject(row as JsonRecord))
    .filter((row) => isFlightBooking(row) && isActiveBooking(row));
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action === "addTrainingLog" || action === "addRow") {
    const safeData: JsonRecord = await buildSafeTrainingLogInput(data);
    const explicitId = text(safeData.trainingLogId || safeData.training_log_id);

    if (explicitId) {
      const row = normalizeTrainingLog(safeData, false);
      const saved = await updateRow(
        "training_logs",
        "training_log_id",
        explicitId,
        row,
      );
      return {
        message: "교육일지를 수정했습니다.",
        trainingLog: saved,
        data: saved,
      };
    }

    const bookingId = text(safeData.bookingId || safeData.booking_id);

    if (bookingId) {
      const supabase = getSupabaseServerClient();
      const { data: existing, error } = await supabase
        .from("training_logs")
        .select("training_log_id")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`기존 교육일지 확인 실패: ${error.message}`);
      }

      const existingRow = (existing || {}) as JsonRecord;
      const existingId = text(existingRow.training_log_id);

      if (existingId) {
        const row = normalizeTrainingLog(
          {
            ...safeData,
            trainingLogId: existingId,
          },
          false,
        );
        const saved = await updateRow(
          "training_logs",
          "training_log_id",
          existingId,
          row,
        );
        return {
          message: "기존 예약 교육일지를 수정했습니다.",
          trainingLog: saved,
          data: saved,
        };
      }
    }

    const saved = await insertRow(
      "training_logs",
      normalizeTrainingLog(safeData, true),
    );
    return {
      message: "교육일지를 등록했습니다.",
      trainingLog: saved,
      data: saved,
    };
  }

  if (action === "updateTrainingLog" || action === "updateRow") {
    const safeData: JsonRecord = await buildSafeTrainingLogInput(data);
    const row = normalizeTrainingLog(safeData, false);
    const id = text(
      safeData.trainingLogId || safeData.training_log_id || row.training_log_id,
    );
    const saved = await updateRow("training_logs", "training_log_id", id, row);
    return {
      message: "교육일지를 수정했습니다.",
      trainingLog: saved,
      data: saved,
    };
  }

  throw new Error(`지원하지 않는 교육일지 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const [trainingLogs, students, instructors, aircraft, bookings, courseCatalog] =
      await Promise.all([
        selectRows("training_logs", {
          orderColumn: "training_date",
          ascending: false,
          limit: 1000,
        }),
        selectRows("students", { orderColumn: "student_id", ascending: true }),
        selectRows("instructors", {
          orderColumn: "instructor_id",
          ascending: true,
        }),
        selectRows("aircraft", { orderColumn: "aircraft_id", ascending: true }),
        selectFlightBookings(),
        selectRows("course_catalog", { orderColumn: "course_id", ascending: true }),
      ]);
    const bookingMap = new Map<string, JsonRecord>();
    bookings.forEach((booking) => {
      const id = text(booking.bookingId || booking.booking_id || booking.id);
      if (id) bookingMap.set(id, booking as JsonRecord);
    });

    const normalizedTrainingLogs = trainingLogs.map((item) => {
      const trainingType = normalizeTrainingType(item.trainingType || item.training_type);
      const bookingId = text(item.bookingId || item.booking_id);
      if (trainingType !== "체험비행" || !bookingId) return item;

      const booking = bookingMap.get(bookingId);
      const minutes = booking ? settlementMinutesForBooking(booking, courseCatalog) : 0;
      return minutes > 0 ? { ...item, actualFlightMinutes: minutes, payableMinutes: minutes } : item;
    });

    const savedBookingIds = new Set(
      normalizedTrainingLogs.map((item) => text(item.bookingId)).filter(Boolean),
    );
    const pendingLogs = bookings
      .filter(
        (booking) =>
          !savedBookingIds.has(text(booking.bookingId || booking.id)),
      )
      .map((booking) => buildPendingLogFromBooking(booking, students, courseCatalog));
    const data = { trainingLogs: normalizedTrainingLogs, pendingLogs, students, instructors, aircraft, courseCatalog };
    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-supabase-training-logs",
      ...data,
      data,
      counts: {
        trainingLogs: normalizedTrainingLogs.length,
        pendingLogs: pendingLogs.length,
        students: students.length,
        instructors: instructors.length,
        aircraft: aircraft.length,
        courseCatalog: courseCatalog.length,
      },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message:
          error instanceof Error
            ? error.message
            : "교육일지 조회에 실패했습니다.",
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
      service: "skynuri-supabase-training-logs",
      elapsedMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        message:
          error instanceof Error
            ? error.message
            : "교육일지 처리에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
