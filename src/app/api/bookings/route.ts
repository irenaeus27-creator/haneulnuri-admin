import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { bookingActionLabel, bookingAuditMessage, writeLog, writeNotification } from "@/lib/supabase/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type JsonRecord = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function normalizePhoneText(value: unknown) {
  return text(value).replace(/[^0-9]/g, "");
}

async function resolveBookingNotificationUserId(booking: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const candidates = new Set<string>();

  const directUserId = text(booking.userId || booking.user_id);
  if (directUserId) candidates.add(directUserId);

  const studentId = text(booking.studentId || booking.student_id);
  if (studentId) {
    const { data } = await supabase
      .from("students")
      .select("user_id")
      .eq("student_id", studentId)
      .maybeSingle();
    const value = text((data as JsonRecord | null)?.user_id);
    if (value) candidates.add(value);
  }

  const rentalPilotId = text(booking.rentalPilotId || booking.rental_pilot_id || booking.pilotId || booking.pilot_id);
  if (rentalPilotId) {
    const { data } = await supabase
      .from("rental_pilots")
      .select("user_id")
      .eq("rental_pilot_id", rentalPilotId)
      .maybeSingle();
    const value = text((data as JsonRecord | null)?.user_id);
    if (value) candidates.add(value);
  }

  const email = text(booking.email).toLowerCase();
  const rawPhone = text(booking.phone || booking.userPhone || booking.user_phone);
  const phone = normalizePhoneText(rawPhone);
  const userName = text(booking.userName || booking.user_name || booking.name);

  const filters: string[] = [];
  if (email) filters.push(`email.eq.${email}`);
  if (rawPhone) filters.push(`phone.eq.${rawPhone}`);
  if (phone && phone !== rawPhone) filters.push(`phone.eq.${phone}`);
  if (userName) filters.push(`name.eq.${userName}`);

  if (filters.length > 0) {
    const { data } = await supabase
      .from("users")
      .select("user_id,status,approved_at,updated_at,created_at")
      .or(filters.join(","));

    const rows = ((data || []) as JsonRecord[]).filter((row) => text(row.user_id));
    rows.sort((a, b) => {
      const approvedA = text(a.approved_at) ? 1 : 0;
      const approvedB = text(b.approved_at) ? 1 : 0;
      const timeA = Date.parse(text(a.updated_at || a.created_at)) || 0;
      const timeB = Date.parse(text(b.updated_at || b.created_at)) || 0;
      return approvedB - approvedA || timeB - timeA;
    });
    const value = text(rows[0]?.user_id);
    if (value) candidates.add(value);
  }

  for (const candidate of Array.from(candidates).filter(Boolean)) {
    const { data, error } = await supabase
      .from("users")
      .select("user_id")
      .eq("user_id", candidate)
      .limit(1)
      .maybeSingle();

    if (!error && data && text((data as JsonRecord).user_id)) {
      return candidate;
    }
  }

  return "";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateText(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeText(value: unknown) {
  const raw = text(value);
  const match = raw.match(/(\d{1,2}):(\d{1,2})/);
  if (!match) return raw ? raw.slice(0, 5) : "";
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}

function nullIfEmpty(value: unknown) {
  const raw = text(value);
  return raw ? raw : null;
}

function timeOrNull(value: unknown) {
  const valueText = timeText(value);
  return valueText ? valueText : null;
}

function dateOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

function numberOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function numberValue(value: unknown) {
  const raw = text(value).replace(/,/g, "").trim();
  if (!raw) return 0;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function minutesBetweenTimes(startTime: unknown, endTime: unknown) {
  const start = timeText(startTime);
  const end = timeText(endTime);
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);

  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(endMinute)
  ) {
    return 0;
  }

  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;

  return endTotal > startTotal ? endTotal - startTotal : 0;
}

function trainingLogMinutesForStudent(row: JsonRecord) {
  const status = text(row.status).replaceAll(" ", "");
  if (["작성대기", "대기", "취소", "기상취소", "노쇼", "반려", "삭제"].some((item) => status.includes(item))) return 0;

  const type = text(row.training_type || row.trainingType);
  if (!type.includes("교육")) return 0;

  const deducted = numberValue(row.deducted_minutes || row.deductedMinutes);
  if (deducted > 0) return Math.round(deducted);

  const actual = numberValue(row.actual_flight_minutes || row.actualFlightMinutes);
  if (actual > 0) return Math.round(actual);

  return minutesBetweenTimes(row.actual_start_time || row.actualStartTime, row.actual_end_time || row.actualEndTime);
}

function chargedTrainingMinutes(row: JsonRecord) {
  const candidates = [
    row.total_charged_minutes,
    row.charged_training_minutes,
    row.initial_charge_minutes,
  ];

  for (const value of candidates) {
    const minutes = numberValue(value);
    if (minutes > 0) return Math.round(minutes);
  }

  const hours = numberValue(row.initial_charge_hours);
  return hours > 0 ? Math.round(hours * 60) : 0;
}

async function selectStudentForBooking(booking: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const studentId = text(booking.studentId || booking.student_id);
  const userId = text(booking.userId || booking.user_id);
  const userName = text(booking.userName || booking.user_name || booking.name);

  if (studentId) {
    const { data, error } = await supabase.from("students").select("*").eq("student_id", studentId).maybeSingle();
    if (error) throw new Error(`교육생 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (userId) {
    const { data, error } = await supabase.from("students").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`교육생 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (userName) {
    const { data, error } = await supabase.from("students").select("*").eq("name", userName).limit(1).maybeSingle();
    if (!error && data) return data as JsonRecord;
  }

  return null;
}

async function refreshStudentTrainingSummary(student: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const studentId = text(student.student_id || student.studentId);
  const userId = text(student.user_id || student.userId);
  const name = text(student.name || student.student_name || student.studentName);
  const rows: JsonRecord[] = [];
  const seen = new Set<string>();

  async function append(query: unknown) {
    const result = (await query) as { data?: unknown[] | null; error?: { message?: string } | null };
    if (result.error) throw new Error(`교육생 교육시간 집계 실패: ${result.error.message || "unknown"}`);
    for (const row of (result.data || []) as JsonRecord[]) {
      const record = row as JsonRecord;
      const id = text(record.training_log_id || record.trainingLogId || `${record.training_date}-${record.actual_start_time}-${record.student_name}`);
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      rows.push(record);
    }
  }

  if (studentId) await append(supabase.from("training_logs").select("*").eq("student_id", studentId));
  if (userId) await append(supabase.from("training_logs").select("*").eq("user_id", userId));
  if (name) await append(supabase.from("training_logs").select("*").eq("student_name", name));

  const completed = rows
    .map((row) => ({ row, minutes: trainingLogMinutesForStudent(row) }))
    .filter((item) => item.minutes > 0);

  const usedMinutes = completed.reduce((sum, item) => sum + item.minutes, 0);
  const chargedMinutes = chargedTrainingMinutes(student);
  const manualMinutes = numberValue(student.manual_training_minutes || student.manualTrainingMinutes);
  const remainingMinutes = chargedMinutes > 0 ? Math.max(chargedMinutes - usedMinutes - manualMinutes, 0) : 0;
  const latestDate = completed
    .map((item) => text(item.row.training_date || item.row.trainingDate).slice(0, 10))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || null;

  const { error } = await supabase
    .from("students")
    .update({
      used_training_minutes: usedMinutes,
      used_minutes: usedMinutes,
      used_training_hours: Number((usedMinutes / 60).toFixed(2)),
      used_hours: Number((usedMinutes / 60).toFixed(2)),
      completed_training_count: completed.length,
      remaining_training_minutes: remainingMinutes,
      remaining_minutes: remainingMinutes,
      remaining_training_hours: Number((remainingMinutes / 60).toFixed(2)),
      remaining_hours: Number((remainingMinutes / 60).toFixed(2)),
      last_flight_date: latestDate,
      recent_flight_date: latestDate,
      updated_at: new Date().toISOString(),
    })
    .eq("student_id", studentId);

  if (error) throw new Error(`교육생 교육시간 반영 실패: ${error.message}`);
}

async function applyEducationNoShowDeduction(booking: JsonRecord) {
  if (!isEducationBooking(booking)) return;

  const supabase = getSupabaseServerClient();
  const bookingId = text(booking.bookingId || booking.booking_id);
  const student = await selectStudentForBooking(booking);

  if (!bookingId || !student) return;

  const studentId = text(student.student_id || student.studentId);
  const userId = text(student.user_id || student.userId || booking.userId || booking.user_id);
  const studentName = text(student.name || booking.userName || booking.user_name);
  const startTime = timeText(booking.startTime || booking.start_time);
  const endTime = timeText(booking.endTime || booking.end_time);
  const scheduledMinutes = numberValue(booking.durationMinutes || booking.duration_minutes) || minutesBetweenTimes(startTime, endTime);

  if (scheduledMinutes <= 0) return;

  const noShowRow: JsonRecord = {
    booking_id: bookingId,
    student_id: studentId,
    student_name: studentName,
    user_id: userId || null,
    instructor_id: nullIfEmpty(booking.instructorId || booking.instructor_id),
    instructor_name: text(booking.instructorName || booking.instructor_name),
    aircraft_id: nullIfEmpty(booking.aircraftId || booking.aircraft_id),
    aircraft_name: text(booking.aircraftName || booking.aircraft_name || booking.aircraft),
    training_date: dateOrNull(booking.bookingDate || booking.booking_date),
    scheduled_start_time: startTime,
    scheduled_end_time: endTime,
    actual_start_time: startTime,
    actual_end_time: endTime,
    scheduled_minutes: scheduledMinutes,
    actual_flight_minutes: 0,
    ground_briefing_minutes: 0,
    training_type: "교육비행",
    lesson_title: "노쇼 교육시간 차감",
    training_items: "노쇼 처리에 따른 교육시간 차감",
    instructor_notes: "예약관리에서 노쇼 처리되어 실제 교육을 진행한 것으로 교육시간을 차감했습니다.",
    student_notes: "노쇼 처리로 예약 시간만큼 교육시간이 차감되었습니다.",
    homework: "",
    caution_notes: "",
    next_training_plan: "",
    student_visible: true,
    time_deducted: true,
    deducted_minutes: scheduledMinutes,
    status: "작성완료",
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await supabase
    .from("training_logs")
    .select("training_log_id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (existingError) throw new Error(`노쇼 교육기록 확인 실패: ${existingError.message}`);

  if (existing) {
    const { error } = await supabase
      .from("training_logs")
      .update(noShowRow)
      .eq("training_log_id", text((existing as JsonRecord).training_log_id));

    if (error) throw new Error(`노쇼 교육시간 차감 기록 수정 실패: ${error.message}`);
  } else {
    const { error } = await supabase.from("training_logs").insert({
      training_log_id: buildId("TL"),
      ...noShowRow,
      created_at: new Date().toISOString(),
    });

    if (error) throw new Error(`노쇼 교육시간 차감 기록 생성 실패: ${error.message}`);
  }

  await refreshStudentTrainingSummary(student);
}

function looksLikeRentalPilotId(value: unknown) {
  const raw = text(value).toUpperCase();
  return raw.startsWith("RP-") || raw.startsWith("RTP-") || raw.startsWith("PILOT-");
}

function isRentalBookingType(value: unknown) {
  return text(value).includes("렌탈");
}

function normalizeBookingUserIdForDb(input: JsonRecord, bookingType: string, existing?: JsonRecord) {
  const userId = text(input.userId || input.user_id || existing?.user_id);
  if (!userId) return null;

  // 렌탈회원 명단용 RP-* 값은 public.users.user_id가 아닐 수 있습니다.
  // 이 값을 bookings.user_id에 넣으면 DB 트리거가 notifications.user_id FK에서 막힐 수 있으므로
  // 렌탈 예약에서는 pilot_id/student_id 쪽에만 보존하고 user_id는 비웁니다.
  if (isRentalBookingType(bookingType) && looksLikeRentalPilotId(userId)) return null;

  return userId;
}

function normalizeBookingRentalPilotIdForDb(input: JsonRecord, bookingType: string, existing?: JsonRecord) {
  const explicit = text(input.rentalPilotId || input.rental_pilot_id || input.pilotId || input.pilot_id || existing?.pilot_id || existing?.student_id);
  if (explicit) return explicit;

  const userId = text(input.userId || input.user_id);
  if (isRentalBookingType(bookingType) && userId) return userId;

  return "";
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

function removeUndefined(row: JsonRecord) {
  const result: JsonRecord = {};

  Object.entries(row).forEach(([key, value]) => {
    if (value === undefined) return;
    result[key] = value;
  });

  return result;
}

function withBookingAliases(row: JsonRecord) {
  const next = { ...row };

  if (next.aircraftName && !next.aircraft) next.aircraft = next.aircraftName;
  if (next.userName && !next.name) next.name = next.userName;
  if (next.instructorName && !next.instructor) next.instructor = next.instructorName;

  if (next.bookingId && !next.id) next.id = next.bookingId;
  if (next.bookingType && !next.type) next.type = next.bookingType;
  if (next.reservationType && !next.bookingType) next.bookingType = next.reservationType;

  return next;
}

function mapRows(rows: JsonRecord[] | null | undefined, alias = false) {
  return (rows || []).map((row) => {
    const camel = toCamelObject(row);
    return alias ? withBookingAliases(camel) : camel;
  });
}

function parseDateParam(value: string | null, fallback: string) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
}

function buildId(prefix: string) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

function normalizeBookingPayload(input: JsonRecord, existing?: JsonRecord) {
  const now = new Date().toISOString();
  const bookingId = text(input.bookingId || input.id || existing?.booking_id || existing?.bookingId) || buildId("BKG");

  const bookingDate = dateOrNull(input.bookingDate || input.booking_date || existing?.booking_date);
  const startTime = timeOrNull(input.startTime || input.start_time || existing?.start_time);
  const endTime = timeOrNull(input.endTime || input.end_time || existing?.end_time);

  if (!bookingDate) throw new Error("예약일을 선택하세요.");
  if (!startTime) throw new Error("시작시간을 선택하세요.");
  if (!endTime) throw new Error("종료시간을 선택하세요.");

  const bookingType = text(input.bookingType || input.booking_type || input.type || existing?.booking_type || "기타");
  const reservationType = text(input.reservationType || input.reservation_type || existing?.reservation_type || bookingType);

  const raw: JsonRecord = {
    booking_id: bookingId,
    booking_date: bookingDate,
    start_time: startTime,
    end_time: endTime,
    booking_type: bookingType,
    reservation_type: reservationType || bookingType,
    course_name: nullIfEmpty(input.courseName || input.course_name || existing?.course_name),
    user_id: nullIfEmpty(normalizeBookingUserIdForDb(input, bookingType, existing)),
    student_id: nullIfEmpty(input.studentId || input.student_id || normalizeBookingRentalPilotIdForDb(input, bookingType, existing) || existing?.student_id),
    pilot_id: nullIfEmpty(normalizeBookingRentalPilotIdForDb(input, bookingType, existing) || existing?.pilot_id),
    user_name: nullIfEmpty(input.userName || input.user_name || input.name || existing?.user_name),
    phone: nullIfEmpty(input.phone || existing?.phone),
    instructor_id: nullIfEmpty(input.instructorId || input.instructor_id || existing?.instructor_id),
    instructor_name: nullIfEmpty(input.instructorName || input.instructor_name || existing?.instructor_name),
    aircraft_id: nullIfEmpty(input.aircraftId || input.aircraft_id || existing?.aircraft_id),
    aircraft_name: nullIfEmpty(input.aircraftName || input.aircraft_name || input.aircraft || existing?.aircraft_name),
    status: text(input.status || existing?.status || "확정"),
    payment_status: nullIfEmpty(input.paymentStatus || input.payment_status || existing?.payment_status),
    memo: nullIfEmpty(input.memo || existing?.memo),
    request_date: dateOrNull(input.requestDate || input.request_date || existing?.request_date || bookingDate),
    duration_minutes: numberOrNull(input.durationMinutes || input.duration_minutes || existing?.duration_minutes),
    buffer_end_time: timeOrNull(input.bufferEndTime || input.buffer_end_time || existing?.buffer_end_time),
    updated_at: now,
  };

  if (!existing?.created_at && !existing?.createdAt) {
    raw.created_at = text(input.createdAt || input.created_at) || now;
  }

  return removeUndefined(raw);
}

async function selectTable(table: string, options?: {
  orderColumn?: string;
  ascending?: boolean;
  limit?: number;
}) {
  const supabase = getSupabaseServerClient();

  let query = supabase.from(table).select("*");

  if (options?.orderColumn) {
    query = query.order(options.orderColumn, { ascending: options.ascending ?? true });
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`${table} 조회 실패: ${error.message}`);
  }

  return mapRows(data as JsonRecord[]);
}

async function selectBookings(fromDate: string, toDate: string) {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`bookings 조회 실패: ${error.message}`);
  }

  return mapRows(data as JsonRecord[], true);
}


function normalizeKey(value: unknown) {
  return text(value).replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
}

function isEducationBooking(row: JsonRecord) {
  const type = text(row.bookingType || row.booking_type || row.reservationType || row.reservation_type);
  return type.includes("교육");
}

function firstAssignedAircraftText(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  return raw.split(/[,\n\/|;]+/).map((item) => item.trim()).filter(Boolean)[0] || raw;
}

function isPlaceholderName(value: unknown) {
  const raw = text(value).replace(/\s+/g, "");
  if (!raw) return true;
  return ["미배정", "미정", "없음", "미지정", "선택안함", "교관미배정"].includes(raw);
}

function findInstructorName(instructorId: unknown, instructors: JsonRecord[]) {
  const id = text(instructorId);
  if (!id) return "";

  const instructor = instructors.find((row) => {
    const rowId = text(row.instructorId || row.instructor_id || row.id);
    return rowId && rowId === id;
  });

  return text(instructor?.name || instructor?.instructorName || instructor?.instructor_name);
}

function findStudentForBooking(booking: JsonRecord, students: JsonRecord[]) {
  const studentId = text(booking.studentId || booking.student_id || booking.rentalPilotId || booking.rental_pilot_id);
  const userId = text(booking.userId || booking.user_id);
  const phone = normalizeKey(booking.phone);
  const name = normalizeKey(booking.userName || booking.user_name || booking.name);

  return students.find((student) => {
    const rowStudentId = text(student.studentId || student.student_id);
    const rowUserId = text(student.userId || student.user_id);
    const rowPhone = normalizeKey(student.phone);
    const rowName = normalizeKey(student.name || student.studentName || student.student_name);

    return Boolean(
      (studentId && rowStudentId && studentId === rowStudentId) ||
        (studentId && rowUserId && studentId === rowUserId) ||
        (userId && rowUserId && userId === rowUserId) ||
        (userId && rowStudentId && userId === rowStudentId) ||
        (phone && rowPhone && phone === rowPhone) ||
        (name && rowName && name === rowName)
    );
  });
}

function enrichBookingWithAssignedStudent(
  booking: JsonRecord,
  students: JsonRecord[],
  instructors: JsonRecord[],
) {
  if (!isEducationBooking(booking)) return booking;

  const student = findStudentForBooking(booking, students);

  const assignedInstructorId = text(student?.assignedInstructorId || student?.assigned_instructor_id);
  const assignedInstructorName = text(student?.assignedInstructorName || student?.assigned_instructor_name);
  const currentInstructorId = text(booking.instructorId || booking.instructor_id) || assignedInstructorId;
  const instructorNameById = findInstructorName(currentInstructorId, instructors);
  const currentInstructorName = text(booking.instructorName || booking.instructor_name || booking.instructor);
  const finalInstructorName = isPlaceholderName(currentInstructorName)
    ? instructorNameById || assignedInstructorName || ""
    : currentInstructorName;

  const assignedAircraft = firstAssignedAircraftText(
    student?.assignedAircraftIds || student?.assigned_aircraft_ids || student?.assignedAircraftId || student?.aircraftId,
  );
  const assignedAircraftName = text(student?.assignedAircraftName || student?.aircraftName);

  return {
    ...booking,
    studentId: text(booking.studentId || booking.student_id || student?.studentId || student?.student_id),
    instructorId: currentInstructorId,
    instructorName: finalInstructorName,
    instructor: finalInstructorName,
    aircraftId: text(booking.aircraftId || booking.aircraft_id) || assignedAircraft,
    aircraftName: text(booking.aircraftName || booking.aircraft_name) || assignedAircraftName || assignedAircraft,
    aircraft: text(booking.aircraft || booking.aircraftName) || assignedAircraftName || assignedAircraft,
  };
}

function enrichBookingsWithAssignments(bookings: JsonRecord[], students: JsonRecord[], instructors: JsonRecord[]) {
  return bookings.map((booking) => enrichBookingWithAssignedStudent(booking, students, instructors));
}

async function loadBookingsPageData(fromDate: string, toDate: string) {
  const [
    bookings,
    students,
    instructors,
    aircraft,
    settings,
    courseCatalog,
    rentalPilots,
  ] = await Promise.all([
    selectBookings(fromDate, toDate),
    selectTable("students", { orderColumn: "student_id", ascending: true }),
    selectTable("instructors", { orderColumn: "instructor_id", ascending: true }),
    selectTable("aircraft", { orderColumn: "aircraft_id", ascending: true }),
    selectTable("settings", { orderColumn: "id", ascending: true }),
    selectTable("course_catalog", { orderColumn: "course_id", ascending: true }),
    selectTable("rental_pilots", { orderColumn: "pilot_id", ascending: true }),
  ]);

  const enrichedBookings = enrichBookingsWithAssignments(bookings, students, instructors);

  return {
    bookings: enrichedBookings,
    students,
    instructors,
    aircraft,
    settings,
    courseCatalog,
    rentalPilots,
  };
}

async function recordBookingAudit(action: string, booking: JsonRecord) {
  const label = bookingActionLabel(action);
  const bookingId = text(booking.bookingId || booking.booking_id || booking.id);
  const userId = await resolveBookingNotificationUserId(booking);
  const userName = text(booking.userName || booking.user_name || booking.name);
  const status = text(booking.status);

  const message = bookingAuditMessage(booking, label);

  await writeLog({
    action: label,
    targetSheet: "bookings",
    targetId: bookingId,
    status: "success",
    message,
    userId,
    userName,
  });

  const shouldCreateNotification =
    action === "addBooking" ||
    action === "approveBooking" ||
    action === "cancelBooking" ||
    status === "요청" ||
    status === "취소요청" ||
    status === "확정" ||
    status === "노쇼" ||
    status === "취소";

  if (shouldCreateNotification && userId) {
    await writeNotification({
      title: label,
      body: message,
      targetType: "booking",
      targetUserId: userId,
      userId,
      targetUserName: userName,
      relatedId: bookingId,
      status: "대기",
      memo: bookingId,
    });
  }
}

async function insertBooking(data: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const row = normalizeBookingPayload(data);

  const { data: inserted, error } = await supabase
    .from("bookings")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const booking = withBookingAliases(toCamelObject(inserted as JsonRecord));
  await recordBookingAudit("addBooking", booking);

  return booking;
}

async function updateBooking(data: JsonRecord, auditAction = "updateBooking") {
  const supabase = getSupabaseServerClient();
  const bookingId = text(data.bookingId || data.booking_id || data.id);

  if (!bookingId) {
    throw new Error("bookingId가 필요합니다.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    throw new Error(`수정할 예약을 찾을 수 없습니다: ${bookingId}`);
  }

  const row = normalizeBookingPayload(data, existing as JsonRecord);

  const { data: updated, error } = await supabase
    .from("bookings")
    .update(row)
    .eq("booking_id", bookingId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const booking = withBookingAliases(toCamelObject(updated as JsonRecord));

  if (text(booking.status) === "노쇼" && isEducationBooking(booking)) {
    await applyEducationNoShowDeduction(booking);
    booking.noShowDeducted = true;
  }

  await recordBookingAudit(auditAction, booking);

  return booking;
}

async function updateBookingStatus(data: JsonRecord, status: string, auditAction: string) {
  return updateBooking(
    {
      ...data,
      status,
    },
    auditAction
  );
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (!action) {
    throw new Error("action 값이 필요합니다.");
  }

  if (action === "addBooking") {
    const booking = await insertBooking(data);
    return { message: "예약을 등록했습니다.", booking, data: booking };
  }

  if (action === "updateBooking") {
    const booking = await updateBooking(data, "updateBooking");
    return { message: "예약을 수정했습니다.", booking, data: booking };
  }

  if (action === "approveBooking") {
    const booking = await updateBookingStatus(data, "확정", "approveBooking");
    return { message: "예약을 확정했습니다.", booking, data: booking };
  }

  if (action === "cancelBooking") {
    const booking = await updateBookingStatus(data, "취소", "cancelBooking");
    return { message: "예약을 취소했습니다.", booking, data: booking };
  }

  if (action === "addRow" && text(data.sheetName) === "bookings") {
    const booking = await insertBooking(data);
    return { message: "예약을 등록했습니다.", booking, data: booking };
  }

  if (action === "updateRow" && text(data.sheetName) === "bookings") {
    const booking = await updateBooking(data, "updateBooking");
    return { message: "예약을 수정했습니다.", booking, data: booking };
  }

  throw new Error(`지원하지 않는 예약 action입니다: ${action}`);
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const now = new Date();
    const defaultFromDate = dateText(addDays(now, -7));
    const defaultToDate = dateText(addDays(now, 90));

    const { searchParams } = new URL(request.url);
    const fromDate = parseDateParam(searchParams.get("fromDate"), defaultFromDate);
    const toDate = parseDateParam(searchParams.get("toDate"), defaultToDate);

    const pageData = await loadBookingsPageData(fromDate, toDate);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-supabase-bookings",
      range: { fromDate, toDate },
      elapsedMs: Date.now() - startedAt,

      ...pageData,

      data: pageData,

      counts: {
        bookings: pageData.bookings.length,
        students: pageData.students.length,
        instructors: pageData.instructors.length,
        aircraft: pageData.aircraft.length,
        settings: pageData.settings.length,
        courseCatalog: pageData.courseCatalog.length,
        rentalPilots: pageData.rentalPilots.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-supabase-bookings",
        message: error instanceof Error ? error.message : "Supabase 예약관리 조회에 실패했습니다.",
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
      service: "skynuri-supabase-bookings",
      elapsedMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        source: "supabase",
        service: "skynuri-supabase-bookings",
        message: error instanceof Error ? error.message : "Supabase 예약 처리에 실패했습니다.",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
