"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatKstDate as sharedFormatKstDate,
  formatKstTime as sharedFormatKstTime,
} from "@/lib/formatDateTime";

type Row = Record<string, unknown>;

type TrainingLogRow = {
  trainingLogId?: string;
  bookingId?: string;
  studentId?: string;
  studentName?: string;
  userId?: string;
  instructorId?: string;
  instructorName?: string;
  aircraftId?: string;
  aircraftName?: string;
  trainingDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  scheduledMinutes?: string | number;
  actualFlightMinutes?: string | number;
  groundBriefingMinutes?: string | number;
  payableMinutes?: string | number;
  payMonth?: string;
  sourceType?: string;
  noFlightReason?: string;
  trainingType?: string;
  lessonTitle?: string;
  trainingItems?: string;
  instructorNotes?: string;
  studentNotes?: string;
  homework?: string;
  cautionNotes?: string;
  nextTrainingPlan?: string;
  studentVisible?: string;
  timeDeducted?: string;
  deductedMinutes?: string | number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type TrainingLogForm = {
  trainingLogId: string;
  bookingId: string;
  studentId: string;
  studentName: string;
  userId: string;
  instructorId: string;
  instructorName: string;
  aircraftId: string;
  aircraftName: string;
  trainingDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  actualStartTime: string;
  actualEndTime: string;
  scheduledMinutes: string;
  actualFlightMinutes: string;
  actualFlightHours: string;
  groundBriefingMinutes: string;
  payableMinutes: string;
  payMonth: string;
  sourceType: string;
  noFlightReason: string;
  trainingType: string;
  lessonTitle: string;
  trainingItems: string;
  instructorNotes: string;
  studentNotes: string;
  homework: string;
  cautionNotes: string;
  nextTrainingPlan: string;
  studentVisible: string;
  timeDeducted: string;
  deductedMinutes: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};


type FlightRecordRow = {
  flightRecordId?: string;
  bookingId?: string;
  flightDate?: string;
  flightType?: string;
  instructorId?: string;
  instructorName?: string;
  aircraftId?: string;
  aircraftName?: string;
  customerName?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  actualFlightMinutes?: string | number;
  settlementMinutes?: string | number;
  status?: string;
  sourceType?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type FlightRecordForm = {
  flightRecordId: string;
  bookingId: string;
  flightDate: string;
  flightType: string;
  instructorId: string;
  instructorName: string;
  aircraftId: string;
  aircraftName: string;
  customerName: string;
  actualStartTime: string;
  actualEndTime: string;
  actualFlightHours: string;
  actualFlightMinutes: string;
  settlementHours: string;
  settlementMinutes: string;
  status: string;
  sourceType: string;
  memo: string;
};

const emptyForm: TrainingLogForm = {
  trainingLogId: "",
  bookingId: "",
  studentId: "",
  studentName: "",
  userId: "",
  instructorId: "",
  instructorName: "",
  aircraftId: "",
  aircraftName: "",
  trainingDate: "",
  scheduledStartTime: "",
  scheduledEndTime: "",
  actualStartTime: "",
  actualEndTime: "",
  scheduledMinutes: "0",
  actualFlightMinutes: "60",
  actualFlightHours: "1.0",
  groundBriefingMinutes: "0",
  payableMinutes: "60",
  payMonth: "",
  sourceType: "manual",
  noFlightReason: "",
  trainingType: "교육비행",
  lessonTitle: "",
  trainingItems: "",
  instructorNotes: "",
  studentNotes: "",
  homework: "",
  cautionNotes: "",
  nextTrainingPlan: "",
  studentVisible: "TRUE",
  timeDeducted: "TRUE",
  deductedMinutes: "60",
  status: "작성대기",
  createdAt: "",
  updatedAt: "",
};

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function dateInputText(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIsoText() {
  return dateInputText(new Date());
}

function parseDateInput(value: string) {
  const matched = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day };
}

function addDaysToDateInput(value: string, days: number) {
  const parsed = parseDateInput(value);
  if (!parsed) return todayIsoText();

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatKstDateTime(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) return "-";

  const isoUtc = raw.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/,
  );

  if (isoUtc) {
    const date = new Date(raw);
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);

    const year = kst.getUTCFullYear();
    const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kst.getUTCDate()).padStart(2, "0");
    const hour = String(kst.getUTCHours()).padStart(2, "0");
    const minute = String(kst.getUTCMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  const localLike = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
  if (localLike) return `${localLike[1]} ${localLike[2]}`;

  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return raw;

  return raw
    .replace("T", " ")
    .replace(/\.\d+Z$/, "")
    .replace(/Z$/, "");
}

function normalizeDate(value: unknown) {
  const valueText = sharedFormatKstDate(value);
  return valueText === "-" ? "" : valueText;
}

function payMonthFromDate(value: unknown) {
  const date = normalizeDate(value);
  return date ? date.slice(0, 7) : "";
}

function normalizeTime(value: unknown) {
  const valueText = sharedFormatKstTime(value);
  return valueText === "-" ? "" : valueText;
}

function timeToMinutes(value: unknown) {
  const normalized = normalizeTime(value);
  const [hour, minute] = normalized.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return -1;
  return hour * 60 + minute;
}

function displayThirtyMinuteTime(value: unknown) {
  const normalized = normalizeTime(value);
  const [hour, minute] = normalized.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return normalized;

  const snappedMinute = minute < 15 ? 0 : minute < 45 ? 30 : 0;
  const snappedHour = minute >= 45 ? hour + 1 : hour;

  return `${String(snappedHour).padStart(2, "0")}:${String(snappedMinute).padStart(2, "0")}`;
}

function minutesBetween(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start < 0 || end < 0 || end <= start) return 0;
  return end - start;
}

function minutesToTime(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 0) return "";

  const normalized = minutes % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addMinutesToTime(startTime: unknown, minutesToAdd: number) {
  const start = timeToMinutes(startTime);

  if (start < 0 || !Number.isFinite(minutesToAdd)) return "";

  return minutesToTime(start + minutesToAdd);
}

function hoursTextToMinutes(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) return 0;

  const cleaned = raw.replace("시간", "").replace(/[^\d.]/g, "");
  const hours = Number(cleaned);

  if (!Number.isFinite(hours)) return 0;

  return Math.max(0, Math.round(hours * 60));
}

function minutesToHoursInput(value: unknown) {
  const minutes = Number(value || 0);

  if (!Number.isFinite(minutes) || minutes <= 0) return "";

  const hours = Math.round((minutes / 60) * 10) / 10;
  return hours.toFixed(1);
}

function buildThirtyMinuteOptions() {
  const options: string[] = [];

  for (let hour = 7; hour <= 20; hour += 1) {
    options.push(`${String(hour).padStart(2, "0")}:00`);

    if (hour < 20) {
      options.push(`${String(hour).padStart(2, "0")}:30`);
    }
  }

  return options;
}

const THIRTY_MINUTE_TIME_OPTIONS = buildThirtyMinuteOptions();

function toForm(row: TrainingLogRow): TrainingLogForm {
  const isSavedLog = Boolean(text(row.trainingLogId));
  const trainingType = normalizeFlightType(row.trainingType || row.bookingType || row.booking_type);
  const savedActualMinutes = Number(row.actualFlightMinutes || 0) || 0;
  const actualMinutes = savedActualMinutes || (isSavedLog ? 60 : isExperienceFlightType(trainingType) ? 20 : 60);
  const educationFlight = isEducationFlightType(trainingType);

  return {
    trainingLogId: text(row.trainingLogId),
    bookingId: text(row.bookingId),
    studentId: text(row.studentId),
    studentName: text(row.studentName),
    userId: text(row.userId),
    instructorId: text(row.instructorId),
    instructorName: text(row.instructorName),
    aircraftId: text(row.aircraftId),
    aircraftName: text(row.aircraftName),
    trainingDate: normalizeDate(row.trainingDate),
    scheduledStartTime: displayThirtyMinuteTime(row.scheduledStartTime),
    scheduledEndTime: displayThirtyMinuteTime(row.scheduledEndTime),
    actualStartTime: displayThirtyMinuteTime(row.actualStartTime),
    actualEndTime: addMinutesToTime(
      displayThirtyMinuteTime(row.actualStartTime),
      actualMinutes,
    ),
    scheduledMinutes: text(row.scheduledMinutes, "0"),
    actualFlightMinutes: String(actualMinutes),
    actualFlightHours: minutesToHoursInput(actualMinutes),
    groundBriefingMinutes: text(row.groundBriefingMinutes, "0"),
    payableMinutes: text(row.payableMinutes || actualMinutes, "60"),
    payMonth: text(row.payMonth || payMonthFromDate(row.trainingDate)),
    sourceType: text(
      row.sourceType || (row.bookingId ? "booking" : "manual"),
      "manual",
    ),
    noFlightReason: text(row.noFlightReason),
    trainingType,
    lessonTitle: text(row.lessonTitle),
    trainingItems: text(row.trainingItems),
    instructorNotes: text(row.instructorNotes),
    studentNotes: text(row.studentNotes),
    homework: text(row.homework),
    cautionNotes: text(row.cautionNotes),
    nextTrainingPlan: text(row.nextTrainingPlan),
    studentVisible: educationFlight ? "TRUE" : "FALSE",
    timeDeducted: educationFlight ? "TRUE" : "FALSE",
    deductedMinutes: educationFlight ? text(row.deductedMinutes || actualMinutes, "60") : "0",
    status: text(row.status, "작성대기"),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

function statusClass(status: unknown) {
  const value = text(status);

  if (value === "차감완료")
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value === "작성완료") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value === "수정필요") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (value === "취소") return "bg-slate-100 text-slate-600 ring-slate-200";

  return "bg-[#eef4fb] text-[#33527a] ring-[#d7e3f2]";
}

function isCompletedLog(row: TrainingLogRow) {
  const status = text(row.status);
  return (
    Boolean(text(row.trainingLogId)) ||
    status === "작성완료" ||
    status === "차감완료"
  );
}

function completionLabel(row: TrainingLogRow) {
  return isCompletedLog(row) ? "작성완료" : "작성필요";
}

function completionClass(row: TrainingLogRow) {
  return isCompletedLog(row)
    ? "bg-slate-100 text-slate-500 ring-slate-200"
    : "bg-amber-50 text-amber-700 ring-amber-200";
}

function rowId(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }

  return "";
}

function aircraftLabel(row: Row) {
  const registrationNo = text(row.registrationNo);
  const aircraftName = text(row.aircraftName);
  const aircraftId = text(row.aircraftId);

  if (registrationNo && aircraftId) return `${registrationNo} / ${aircraftId}`;
  return registrationNo || aircraftName || aircraftId || "-";
}

function splitIds(value: unknown) {
  return text(value)
    .split(/[,.\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function findInstructorByStudent(row: Row, instructors: Row[]) {
  const instructorId = rowId(
    row,
    "assignedInstructorId",
    "instructorId",
    "primaryInstructorId",
  );
  const instructorName = text(
    row.assignedInstructorName ||
      row.instructorName ||
      row.primaryInstructorName,
  );

  return (
    instructors.find(
      (item) => rowId(item, "instructorId", "id") === instructorId,
    ) ||
    instructors.find(
      (item) => text(item.name || item.instructorName) === instructorName,
    )
  );
}

function findAircraftByStudent(row: Row, aircraft: Row[]) {
  const ids = splitIds(
    row.assignedAircraftIds || row.assignedAircraftId || row.aircraftId,
  );
  const name = text(
    row.assignedAircraftName || row.aircraftName || row.registrationNo,
  );

  return (
    aircraft.find(
      (item) =>
        ids.includes(rowId(item, "aircraftId", "id")) ||
        ids.includes(text(item.registrationNo)),
    ) ||
    aircraft.find((item) =>
      [
        text(item.registrationNo),
        text(item.aircraftName),
        text(item.aircraftId),
      ].includes(name),
    )
  );
}

function assignedInstructorId(row: Row) {
  return rowId(
    row,
    "assignedInstructorId",
    "instructorId",
    "primaryInstructorId",
  );
}

function assignedInstructorName(row: Row) {
  return text(
    row.assignedInstructorName ||
      row.instructorName ||
      row.primaryInstructorName,
  );
}

function studentMatchesInstructor(
  row: Row,
  instructorId: string,
  instructorName = "",
) {
  if (!instructorId) return true;
  const rowInstructorId = assignedInstructorId(row);
  const rowInstructorName = assignedInstructorName(row);
  return (
    rowInstructorId === instructorId ||
    (!!instructorName && rowInstructorName === instructorName)
  );
}

function logMatchesInstructor(
  row: TrainingLogRow,
  instructorId: string,
  instructorName = "",
) {
  if (!instructorId) return true;
  return (
    text(row.instructorId) === instructorId ||
    (!!instructorName && text(row.instructorName) === instructorName)
  );
}

function normalizeFlightType(value: unknown) {
  const type = text(value, "교육비행");
  if (type.includes("교육")) return "교육비행";
  if (type.includes("체험")) return "체험비행";
  if (type.includes("동승")) return "동승비행";
  if (type.includes("렌탈") || type.includes("대여")) return "렌탈비행";
  return "기타";
}

function logFlightType(row: TrainingLogRow) {
  return normalizeFlightType(
    row.trainingType || row.training_type || row.bookingType || row.booking_type,
  );
}

function isEducationFlightType(value: unknown) {
  return normalizeFlightType(value) === "교육비행";
}

function isExperienceFlightType(value: unknown) {
  return normalizeFlightType(value) === "체험비행";
}

function isRentalSoloFlightType(value: unknown) {
  return normalizeFlightType(value) === "렌탈비행";
}

function requiresInstructorByType(value: unknown) {
  const type = normalizeFlightType(value);
  return type === "교육비행" || type === "체험비행" || type === "동승비행";
}

function targetLabelByType(value: unknown) {
  const type = normalizeFlightType(value);
  if (type === "교육비행") return "교육생";
  if (type === "렌탈비행" || type === "동승비행") return "렌탈회원";
  if (type === "체험비행") return "체험객";
  return "대상자";
}

function noteLabelByType(value: unknown) {
  const type = normalizeFlightType(value);
  if (type === "교육비행") return "교관 내부 메모";
  if (type === "렌탈비행") return "렌탈비행 메모";
  if (type === "체험비행") return "체험비행 메모";
  if (type === "동승비행") return "동승비행 메모";
  return "비행 메모";
}

function sourceLabel(row: TrainingLogRow) {
  return text(row.bookingId) ? "예약 기반" : "수동 작성";
}

function sourceClass(row: TrainingLogRow) {
  return text(row.bookingId)
    ? "bg-blue-50 text-blue-700 ring-blue-200"
    : "bg-slate-100 text-slate-700 ring-slate-200";
}

function timeRangeLabel(row: TrainingLogRow) {
  const actualStart = displayThirtyMinuteTime(row.actualStartTime);
  const actualEnd = displayThirtyMinuteTime(row.actualEndTime);
  const scheduledStart = displayThirtyMinuteTime(row.scheduledStartTime);
  const scheduledEnd = displayThirtyMinuteTime(row.scheduledEndTime);
  const actual = actualStart
    ? `${actualStart}${actualEnd ? `~${actualEnd}` : ""}`
    : "";
  const scheduled = scheduledStart
    ? `${scheduledStart}${scheduledEnd ? `~${scheduledEnd}` : ""}`
    : "";
  return actual || scheduled || "-";
}

const EDUCATION_HOUR_OPTIONS = Array.from({ length: 16 }, (_, index) =>
  (0.5 + index / 10).toFixed(1),
);

const EXPERIENCE_FLIGHT_MINUTE_OPTIONS = Array.from(
  { length: 11 },
  (_, index) => 20 + index * 10,
);

export default function TrainingLogsPage() {
  const [bookingIdFromQuery, setBookingIdFromQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [trainingLogs, setTrainingLogs] = useState<TrainingLogRow[]>([]);
  const [pendingLogs, setPendingLogs] = useState<TrainingLogRow[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [instructors, setInstructors] = useState<Row[]>([]);
  const [aircraft, setAircraft] = useState<Row[]>([]);
  const [instructorFilter, setInstructorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [dateFilter, setDateFilter] = useState(todayIsoText());
  const [keyword, setKeyword] = useState("");
  const [form, setForm] = useState<TrainingLogForm>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBookingIdFromQuery(params.get("bookingId") || "");
  }, []);

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const response = await fetch("/api/training-logs", {
        method: "GET",
        cache: "no-store",
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let data: {
        ok?: boolean;
        message?: string;
        trainingLogs?: TrainingLogRow[];
        pendingLogs?: TrainingLogRow[];
        students?: Row[];
        instructors?: Row[];
        aircraft?: Row[];
      };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || !data.ok) {
        throw new Error(
          data.message || "교육일지 데이터를 불러오지 못했습니다.",
        );
      }

      setTrainingLogs(
        Array.isArray(data.trainingLogs) ? data.trainingLogs : [],
      );
      setPendingLogs(Array.isArray(data.pendingLogs) ? data.pendingLogs : []);
      setStudents(Array.isArray(data.students) ? data.students : []);
      setInstructors(Array.isArray(data.instructors) ? data.instructors : []);
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "교육일지 데이터를 불러오지 못했습니다.",
      );
      setTrainingLogs([]);
      setPendingLogs([]);
      setStudents([]);
      setInstructors([]);
      setAircraft([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  const allLogs = useMemo(() => {
    const savedBookingIds = new Set(
      trainingLogs.map((item) => text(item.bookingId)).filter(Boolean),
    );

    const uniqueSavedLogs = new Map<string, TrainingLogRow>();
    trainingLogs.forEach((item) => {
      const bookingId = text(item.bookingId);
      const trainingLogId = text(item.trainingLogId);
      const key = bookingId
        ? `booking:${bookingId}`
        : trainingLogId
          ? `log:${trainingLogId}`
          : `manual:${normalizeDate(item.trainingDate)}:${normalizeTime(
              item.actualStartTime || item.scheduledStartTime,
            )}:${text(item.studentId || item.studentName)}:${text(
              item.instructorId || item.instructorName,
            )}:${text(item.aircraftId || item.aircraftName)}`;

      uniqueSavedLogs.set(key, item);
    });

    const uniquePendingLogs = new Map<string, TrainingLogRow>();
    pendingLogs.forEach((item) => {
      const bookingId = text(item.bookingId);
      if (!bookingId || savedBookingIds.has(bookingId)) return;
      uniquePendingLogs.set(`booking:${bookingId}`, item);
    });

    return [...uniquePendingLogs.values(), ...uniqueSavedLogs.values()];
  }, [pendingLogs, trainingLogs]);

  useEffect(() => {
    if (!bookingIdFromQuery) return;
    if (loading) return;
    if (form.bookingId === bookingIdFromQuery) return;

    const target = allLogs.find(
      (item) => text(item.bookingId) === bookingIdFromQuery,
    );

    if (target) {
      const next = toForm(target);
      setForm(next);
      setEditing(Boolean(text(target.trainingLogId)));
      setManualMode(!text(next.bookingId));
      window.setTimeout(
        () =>
          document
            .getElementById("training-log-form")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        0,
      );
    }
  }, [allLogs, bookingIdFromQuery, form.bookingId, loading]);

  const selectedInstructor = useMemo(
    () =>
      instructors.find(
        (item) => rowId(item, "instructorId", "id") === instructorFilter,
      ),
    [instructors, instructorFilter],
  );
  const selectedInstructorName = text(
    selectedInstructor?.name || selectedInstructor?.instructorName,
  );

  const manualStudentOptions = useMemo(() => {
    const instructorId = form.instructorId || instructorFilter;
    const instructorName = form.instructorName || selectedInstructorName;
    return students.filter((item) =>
      studentMatchesInstructor(item, instructorId, instructorName),
    );
  }, [
    form.instructorId,
    form.instructorName,
    instructorFilter,
    selectedInstructorName,
    students,
  ]);

  function resolveStudentFromForm(source: TrainingLogForm) {
    const studentId = text(source.studentId);
    const userId = text(source.userId);
    const studentName = text(source.studentName);

    return (
      students.find((item) => text(item.studentId) === studentId && studentId) ||
      students.find((item) => text(item.userId) === userId && userId) ||
      students.find((item) => text(item.userId) === studentId && studentId) ||
      students.find(
        (item) =>
          text(item.name || item.studentName) === studentName && studentName,
      )
    );
  }


  const filteredLogs = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return allLogs
      .filter((item) => {
        const status = text(item.status);
        const date = normalizeDate(item.trainingDate);

        if (statusFilter !== "전체" && status !== statusFilter) return false;
        if (dateFilter && date !== dateFilter) return false;
        if (
          !logMatchesInstructor(item, instructorFilter, selectedInstructorName)
        )
          return false;

        if (!q) return true;

        const haystack = [
          item.trainingLogId,
          item.bookingId,
          item.studentName,
          item.instructorName,
          item.aircraftName,
          item.lessonTitle,
          item.trainingItems,
          item.studentNotes,
          item.cautionNotes,
          item.nextTrainingPlan,
          item.status,
        ]
          .map((value) => text(value))
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      })
      .sort((a, b) => {
        const aDate = normalizeDate(a.trainingDate);
        const bDate = normalizeDate(b.trainingDate);
        if (aDate === bDate) {
          return normalizeTime(
            a.scheduledStartTime || a.actualStartTime,
          ).localeCompare(
            normalizeTime(b.scheduledStartTime || b.actualStartTime),
            "ko",
          );
        }
        return bDate.localeCompare(aDate, "ko");
      });
  }, [
    allLogs,
    keyword,
    statusFilter,
    dateFilter,
    instructorFilter,
    selectedInstructorName,
  ]);

  const pendingLogCount = useMemo(
    () => filteredLogs.filter((item) => !isCompletedLog(item)).length,
    [filteredLogs],
  );

  const completedLogCount = useMemo(
    () => filteredLogs.filter((item) => isCompletedLog(item)).length,
    [filteredLogs],
  );

  const visibleLogs = filteredLogs;

  function updateForm(key: keyof TrainingLogForm, value: string) {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      if (key === "actualStartTime" || key === "actualFlightHours") {
        const startTime =
          key === "actualStartTime" ? value : next.actualStartTime;
        const flightHours =
          key === "actualFlightHours" ? value : next.actualFlightHours;
        const minutes = hoursTextToMinutes(flightHours);

        next.actualFlightMinutes = String(minutes);
        next.payableMinutes = String(minutes);
        next.actualEndTime = addMinutesToTime(startTime, minutes);
      }

      if (key === "payableMinutes") {
        next.payableMinutes = value;
      }

      if (key === "trainingDate") {
        next.payMonth = payMonthFromDate(value);
      }

      if (key === "trainingType") {
        const normalizedType = normalizeFlightType(value);
        const educationFlight = isEducationFlightType(normalizedType);
        const experienceFlight = isExperienceFlightType(normalizedType);
        const instructorRequired = requiresInstructorByType(normalizedType);
        const currentMinutes = Number(next.actualFlightMinutes || 0) || hoursTextToMinutes(next.actualFlightHours || "1.0");
        const nextMinutes = experienceFlight
          ? currentMinutes >= 20 && currentMinutes % 10 === 0
            ? currentMinutes
            : 20
          : currentMinutes >= 30
            ? currentMinutes
            : 60;

        next.trainingType = normalizedType;
        next.actualFlightMinutes = String(nextMinutes);
        next.actualFlightHours = minutesToHoursInput(nextMinutes);
        next.actualEndTime = addMinutesToTime(next.actualStartTime, nextMinutes);
        next.payableMinutes = String(nextMinutes);
        next.studentVisible = educationFlight ? "TRUE" : "FALSE";
        next.timeDeducted = educationFlight ? "TRUE" : "FALSE";
        next.deductedMinutes = educationFlight ? String(nextMinutes) : "0";
        if (!educationFlight) {
          next.studentId = "";
          next.userId = "";
          next.studentNotes = "";
          next.cautionNotes = "";
          next.nextTrainingPlan = "";
        }
        if (!instructorRequired) {
          next.instructorId = "";
          next.instructorName = "";
        }
      }

      return next;
    });
  }

  function startCreateFrom(row: TrainingLogRow) {
    const next = toForm(row);
    const actualMinutes = Number(next.actualFlightMinutes || 60) || 60;
    next.actualFlightHours = minutesToHoursInput(actualMinutes) || "1.0";
    next.actualFlightMinutes = String(actualMinutes);
    next.actualEndTime = addMinutesToTime(next.actualStartTime, actualMinutes);
    next.payableMinutes = String(actualMinutes);
    next.payMonth = next.payMonth || payMonthFromDate(next.trainingDate);
    next.trainingType = normalizeFlightType(next.trainingType || logFlightType(row));
    const educationFlight = isEducationFlightType(next.trainingType);
    next.sourceType = next.bookingId ? "booking" : "manual";
    next.studentVisible = educationFlight ? "TRUE" : "FALSE";
    next.timeDeducted = educationFlight ? "TRUE" : "FALSE";
    next.deductedMinutes = educationFlight ? String(actualMinutes) : "0";
    if (!requiresInstructorByType(next.trainingType)) {
      next.instructorId = "";
      next.instructorName = "";
    }
    setForm(next);
    setEditing(Boolean(text(row.trainingLogId)));
    setManualMode(!text(next.bookingId));
    window.setTimeout(
      () =>
        document
          .getElementById("training-log-form")
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      0,
    );
  }

  function startManualLog() {
    const selected = instructors.find(
      (item) => rowId(item, "instructorId", "id") === instructorFilter,
    );
    const activeDate = dateFilter || todayIsoText();

    setForm({
      ...emptyForm,
      instructorId: selected ? rowId(selected, "instructorId", "id") : "",
      instructorName: selected
        ? text(selected.name || selected.instructorName)
        : "",
      trainingDate: activeDate,
      actualStartTime: "07:00",
      actualFlightHours: "1.0",
      actualFlightMinutes: "60",
      actualEndTime: addMinutesToTime("07:00", 60),
      payMonth: activeDate.slice(0, 7),
      sourceType: "manual",
      trainingType: "교육비행",
      studentVisible: "TRUE",
      timeDeducted: "TRUE",
      deductedMinutes: "60",
      payableMinutes: "60",
      status: "작성대기",
    });
    setEditing(false);
    setManualMode(true);
    window.setTimeout(
      () =>
        document
          .getElementById("training-log-form")
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      0,
    );
  }

  function resetForm() {
    setForm({
      ...emptyForm,
      studentVisible: "TRUE",
      timeDeducted: "TRUE",
    });
    setEditing(false);
    setManualMode(false);
  }

  function selectStudent(studentId: string) {
    const selected = students.find(
      (item) =>
        text(item.studentId) === studentId || text(item.userId) === studentId,
    );

    if (!selected) {
      setForm((prev) => ({
        ...prev,
        studentId: "",
        userId: "",
        studentName: "",
        instructorId: "",
        instructorName: "",
        aircraftId: "",
        aircraftName: "",
      }));
      return;
    }

    const matchedInstructor = findInstructorByStudent(selected, instructors);
    const matchedAircraft = findAircraftByStudent(selected, aircraft);

    setForm((prev) => ({
      ...prev,
      studentId: text(selected.studentId),
      userId: text(selected.userId),
      studentName: text(selected.name || selected.studentName),
      instructorId: matchedInstructor
        ? rowId(matchedInstructor, "instructorId", "id")
        : text(selected.assignedInstructorId || selected.instructorId),
      instructorName: matchedInstructor
        ? text(matchedInstructor.name || matchedInstructor.instructorName)
        : text(selected.assignedInstructorName || selected.instructorName),
      aircraftId: matchedAircraft
        ? rowId(matchedAircraft, "aircraftId", "id")
        : text(selected.assignedAircraftId || selected.aircraftId),
      aircraftName: matchedAircraft
        ? text(
            matchedAircraft.registrationNo ||
              matchedAircraft.aircraftName ||
              matchedAircraft.aircraftId,
          )
        : text(
            selected.assignedAircraftName ||
              selected.aircraftName ||
              selected.registrationNo,
          ),
    }));
  }

  function selectInstructor(instructorId: string) {
    const selected = instructors.find(
      (item) => rowId(item, "instructorId", "id") === instructorId,
    );

    if (!selected) {
      setForm((prev) => ({ ...prev, instructorId: "", instructorName: "" }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      instructorId: rowId(selected, "instructorId", "id"),
      instructorName: text(selected.name || selected.instructorName),
      ...(manualMode
        ? {
            studentId: "",
            userId: "",
            studentName: "",
            aircraftId: "",
            aircraftName: "",
          }
        : {}),
    }));
  }

  function selectAircraft(aircraftId: string) {
    const selected = aircraft.find(
      (item) => rowId(item, "aircraftId", "id") === aircraftId,
    );

    if (!selected) {
      setForm((prev) => ({ ...prev, aircraftId: "", aircraftName: "" }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      aircraftId: rowId(selected, "aircraftId", "id"),
      aircraftName: text(
        selected.registrationNo || selected.aircraftName || selected.aircraftId,
      ),
    }));
  }

  function updateActualFlightMinutes(minutesText: string) {
    const minutes = Math.max(0, Number(minutesText || 0) || 0);

    setForm((prev) => ({
      ...prev,
      actualFlightMinutes: String(minutes),
      actualFlightHours: minutesToHoursInput(minutes),
      payableMinutes: String(minutes),
      actualEndTime: addMinutesToTime(prev.actualStartTime, minutes),
      deductedMinutes: isEducationFlightType(prev.trainingType)
        ? String(minutes)
        : "0",
    }));
  }

  async function saveTrainingLog() {
    if (saving) return;

    const keepDateFilter = dateFilter;
    const keepInstructorFilter = instructorFilter;
    const keepStatusFilter = statusFilter;
    const keepKeyword = keyword;

    try {
      const actualMinutesFromField = Number(form.actualFlightMinutes || 0) || 0;
      const actualMinutes = actualMinutesFromField > 0
        ? actualMinutesFromField
        : hoursTextToMinutes(form.actualFlightHours || "1.0");
      const existingLogForBooking = form.bookingId
        ? trainingLogs.find((item) => text(item.bookingId) === form.bookingId)
        : undefined;
      const currentType = normalizeFlightType(form.trainingType || "교육비행");
      const educationFlight = isEducationFlightType(currentType);
      const instructorRequired = requiresInstructorByType(currentType);
      const matchedStudent = educationFlight ? resolveStudentFromForm(form) : undefined;
      const resolvedStudentId = educationFlight ? text(matchedStudent?.studentId) : "";

      if (educationFlight && !resolvedStudentId) {
        alert(
          "교육비행은 교육생 선택이 필요합니다. 교육생 관리에서 해당 교육생의 user 연결 상태를 먼저 확인하세요.",
        );
        return;
      }

      const payload: TrainingLogForm = {
        ...form,
        trainingLogId:
          form.trainingLogId || text(existingLogForBooking?.trainingLogId),
        studentId: educationFlight ? resolvedStudentId : "",
        userId: educationFlight ? text(matchedStudent?.userId || form.userId) : "",
        studentName: educationFlight ? text(matchedStudent?.name || matchedStudent?.studentName || form.studentName) : text(form.studentName),
        instructorId: instructorRequired ? form.instructorId : "",
        instructorName: instructorRequired ? form.instructorName : "",
        trainingType: currentType,
        actualFlightMinutes: String(actualMinutes),
        actualEndTime:
          form.actualEndTime ||
          addMinutesToTime(form.actualStartTime, actualMinutes),
        groundBriefingMinutes: "0",
        payableMinutes: String(actualMinutes),
        payMonth: form.payMonth || payMonthFromDate(form.trainingDate),
        sourceType: form.bookingId ? "booking" : "manual",
        studentVisible: educationFlight ? "TRUE" : "FALSE",
        timeDeducted: educationFlight ? "TRUE" : "FALSE",
        deductedMinutes: educationFlight ? String(actualMinutes) : "0",
        status: educationFlight ? "차감완료" : "작성완료",
      };

      if (!payload.trainingDate) {
        alert("비행일자를 입력하세요.");
        return;
      }

      if (educationFlight && !payload.studentName) {
        alert("교육생을 선택하세요.");
        return;
      }

      if (instructorRequired && !payload.instructorName) {
        alert(`${currentType}은 담당 교관을 선택하세요.`);
        return;
      }

      if (!payload.aircraftName) {
        alert("항공기를 선택하세요.");
        return;
      }

      if (!payload.actualStartTime) {
        alert("실제 시작시간을 선택하세요.");
        return;
      }

      if (!actualMinutes) {
        alert("비행시간을 선택하세요.");
        return;
      }

      setSaving(true);

      const response = await fetch("/api/training-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: payload.trainingLogId ? "updateTrainingLog" : "addTrainingLog",
          data: payload,
        }),
      });

      const rawText = await response.text();

      if (!rawText.trim()) {
        throw new Error("서버 응답이 비어 있습니다.");
      }

      let data: { ok?: boolean; success?: boolean; message?: string };

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("서버 응답을 JSON으로 변환하지 못했습니다.");
      }

      if (!response.ok || (!data.ok && !data.success)) {
        throw new Error(data.message || "비행기록 저장에 실패했습니다.");
      }

      await loadData(true);

      // 저장 후 목록이 갑자기 줄어드는 원인은 저장한 예약의 교관으로
      // 필터가 자동 변경되던 동작이었다. 사용자가 보고 있던 필터를 그대로 유지한다.
      setDateFilter(keepDateFilter || payload.trainingDate || todayIsoText());
      setInstructorFilter(keepInstructorFilter);
      setStatusFilter(keepStatusFilter === "작성대기" ? "전체" : keepStatusFilter);
      setKeyword(keepKeyword);
      resetForm();
      alert(educationFlight ? "교육비행 기록이 저장되고 학생 앱에 바로 공개됩니다." : "비행기록이 저장되었습니다.");
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "비행기록 저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }


  function moveDate(days: number) {
    setDateFilter((current) => addDaysToDateInput(current || todayIsoText(), days));
  }

  function compactDateLabel(value: string) {
    if (!value) return "날짜 선택";
    const parsed = parseDateInput(value);
    if (!parsed) return value;

    const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
    const week = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
    return `${value} (${week})`;
  }

  return (
    <div className="min-h-screen w-full bg-[#f4f7fb]">
      <div className="flex w-full flex-col gap-4 p-5">
        <section className="rounded-[24px] border border-[#d9e2ef] bg-white px-6 py-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a8ba3]">
                Training Log
              </p>
              <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em] text-[#102544]">
                비행기록
              </h1>
              <p className="mt-1.5 text-[13px] font-medium text-[#6d7f96]">
                예약된 비행을 기준으로 교육·체험·렌탈·동승 비행기록을 한 화면에서 빠르게 작성합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                  type="button"
                  onClick={startManualLog}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1264f4] px-4 text-[13px] font-medium text-white shadow-[0_8px_16px_rgba(18,100,244,0.22)] hover:bg-[#0f56d8]"
                >
                  <span className="text-[17px] leading-none">+</span>
                  예약 없이 작성
                </button>
              <button
                type="button"
                onClick={() => void loadData(true)}
                disabled={loading}
                className="inline-flex h-10 items-center rounded-xl border border-[#cfdbea] bg-white px-4 text-[13px] font-medium text-[#28486d] hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {loading ? "불러오는 중" : "새로고침"}
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[20px] border border-rose-200 bg-rose-50 p-4 text-[13px] font-semibold text-rose-700">
            {error}
          </section>
        ) : null}

        <section className="rounded-[22px] border border-[#d9e2ef] bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[240px_430px_230px_minmax(280px,1fr)]">
            <label className="filter-card">
              <span className="filter-label">교관 선택</span>
              <select
                value={instructorFilter}
                onChange={(event) => {
                  setInstructorFilter(event.target.value);
                  const selected = instructors.find(
                    (item) =>
                      rowId(item, "instructorId", "id") === event.target.value,
                  );
                  if (manualMode) {
                    setForm((prev) => ({
                      ...prev,
                      instructorId: selected
                        ? rowId(selected, "instructorId", "id")
                        : "",
                      instructorName: selected
                        ? text(selected.name || selected.instructorName)
                        : "",
                      studentId: "",
                      userId: "",
                      studentName: "",
                      aircraftId: "",
                      aircraftName: "",
                    }));
                  }
                }}
                className="filter-field"
              >
                <option value="">전체 교관</option>
                {instructors.map((item, index) => {
                  const id = rowId(item, "instructorId", "id");
                  return (
                    <option key={`${id}-${index}`} value={id}>
                      {text(item.name || item.instructorName)} / {id}
                    </option>
                  );
                })}
              </select>
            </label>

            <div className="filter-card">
              <span className="filter-label">날짜</span>
              <div className="grid grid-cols-[minmax(0,1fr)_44px_44px_60px] gap-2">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                  className="filter-field min-w-0"
                  title={compactDateLabel(dateFilter)}
                />
                <button
                  type="button"
                  onClick={() => moveDate(-1)}
                  className="date-nav-button"
                  aria-label="이전 날짜"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => moveDate(1)}
                  className="date-nav-button"
                  aria-label="다음 날짜"
                >
                  ›
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter(todayIsoText())}
                  className="today-button"
                >
                  오늘
                </button>
              </div>
            </div>

            <label className="filter-card">
              <span className="filter-label">상태</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="filter-field"
              >
                <option value="전체">전체</option>
                <option value="작성대기">작성대기</option>
                <option value="작성완료">작성완료</option>
                <option value="차감완료">차감완료</option>
                <option value="비행없음">비행없음</option>
                <option value="수정필요">수정필요</option>
                <option value="취소">취소</option>
              </select>
            </label>

            <label className="filter-card">
              <span className="filter-label sr-only">검색</span>
              <div className="relative">
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="대상자, 항공기 검색"
                  className="filter-field pr-10"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#60738d]">
                  ⌕
                </span>
              </div>
            </label>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(420px,0.72fr)_minmax(620px,1.28fr)]">
          <div className="overflow-hidden rounded-[22px] border border-[#d9e2ef] bg-white shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
            <div className="border-b border-[#e7eef7] px-5 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[17px] font-semibold text-[#102544]">
                      오늘의 비행 예약
                    </h2>
                    <span className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[12px] font-medium text-[#1264f4]">
                      {visibleLogs.length}건
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-medium text-[#6d7f96]">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      작성 필요 {pendingLogCount}건
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-medium text-slate-500 ring-1 ring-slate-200">
                      작성 완료 {completedLogCount}건
                    </span>
                    <span>교육·체험·렌탈·동승 비행을 한 목록에서 작성합니다.</span>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-[13px] font-medium text-[#6d7f96]">
                비행기록 데이터를 불러오는 중입니다.
              </div>
            ) : (
              <div className="max-h-[780px] space-y-2.5 overflow-y-auto p-3">
                {visibleLogs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#cfdbea] bg-[#f8fbfe] p-8 text-center">
                    <div className="text-[14px] font-medium text-[#33527a]">
                      표시할 비행 예약 또는 비행기록이 없습니다.
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium text-[#8a9ab0]">
                      날짜, 교관, 상태 필터를 확인하거나 예약 없이 작성할 수 있습니다.
                    </div>
                  </div>
                ) : (
                  visibleLogs.map((item, index) => {
                    const completed = isCompletedLog(item);
                    const isSelected =
                      (text(form.trainingLogId) &&
                        text(form.trainingLogId) === text(item.trainingLogId)) ||
                      (text(form.bookingId) &&
                        text(form.bookingId) === text(item.bookingId));
                    const status = text(item.status, "작성대기");
                    const start = displayThirtyMinuteTime(item.actualStartTime || item.scheduledStartTime) || "-";
                    const end = displayThirtyMinuteTime(item.actualEndTime || item.scheduledEndTime) || "-";
                    const flightType = logFlightType(item);
                    const educationFlight = isEducationFlightType(flightType);
                    const hourText = minutesToHoursInput(item.actualFlightMinutes) || "1.0";
                    const summary = text(
                      educationFlight
                        ? item.trainingItems || item.lessonTitle || item.studentNotes || item.cautionNotes || item.nextTrainingPlan
                        : item.trainingItems || item.lessonTitle || item.instructorNotes,
                      completed
                        ? "저장된 비행기록이 없습니다."
                        : "아직 작성된 비행기록이 없습니다.",
                    );

                    return (
                      <button
                        key={`${text(item.trainingLogId || item.bookingId, "training-log")}-${index}`}
                        type="button"
                        onClick={() => startCreateFrom(item)}
                        className={`group w-full rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] ${
                          isSelected
                            ? "border-[#1264f4] bg-[#f4f8ff] shadow-[0_8px_22px_rgba(18,100,244,0.12)]"
                            : completed
                              ? "border-[#e3e9f2] bg-[#f8fafc] opacity-80 hover:opacity-100"
                              : "border-[#1264f4]/70 bg-white"
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className={`flex min-h-[76px] w-[70px] shrink-0 flex-col items-center justify-center rounded-xl text-center ${
                            completed
                              ? "bg-[#f1f5f9] text-[#8a9ab0] ring-1 ring-[#e2e8f0]"
                              : "bg-[#eef4ff] text-[#1264f4]"
                          }`}>
                            <span className="text-[15px] font-semibold leading-none">{start}</span>
                            <span className="my-0.5 text-[13px] font-semibold leading-none">-</span>
                            <span className="text-[15px] font-semibold leading-none">{end}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${sourceClass(item)}`}>
                                {sourceLabel(item)}
                              </span>
                              <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                                {flightType}
                              </span>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${completionClass(item)}`}>
                                {completionLabel(item)}
                              </span>
                              {completed && status === "차감완료" ? (
                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                                  차감완료
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1.5 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`truncate text-[15px] font-semibold ${completed ? "text-[#526173]" : "text-[#102544]"}`}>
                                  {text(item.studentName, `${targetLabelByType(flightType)} 미지정`)}
                                </div>
                                <div className={`mt-1 text-[12px] font-medium ${completed ? "text-[#8a9ab0]" : "text-[#6d7f96]"}`}>
                                  {text(item.aircraftName, "항공기 미지정")}
                                  {requiresInstructorByType(flightType) ? ` · ${text(item.instructorName, "교관 미지정")}` : " · 단독비행"}
                                </div>
                                <div className="mt-0.5 text-[11px] font-medium text-[#8a9ab0]">
                                  {normalizeDate(item.trainingDate) || "-"}
                                </div>
                              </div>
                              <div className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-medium ring-1 ${completed ? "bg-[#f8fafc] text-[#8a9ab0] ring-[#e2e8f0]" : "bg-white/80 text-[#102544] ring-[#dfe8f2]"}`}>
                                {flightType === "교육비행" ? "교육" : flightType === "렌탈비행" ? "렌탈" : "비행"} {hourText}시간
                              </div>
                            </div>
                            <div className={`mt-3 rounded-xl px-2.5 py-1.5 text-[11px] font-medium ${
                              completed
                                ? "bg-[#f1f5f9] text-[#8a9ab0]"
                                : "bg-[#f7faff] text-[#5d728e]"
                            }`}>
                              {summary}
                            </div>
                          </div>
                          <div className="flex items-center text-[24px] font-light text-[#60738d] opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100">
                            ›
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}

                <button
                  type="button"
                  onClick={startManualLog}
                  className="w-full rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[22px] font-medium text-amber-600 ring-1 ring-amber-200">
                      +
                    </span>
                    <div>
                      <div className="text-[14px] font-semibold text-amber-800">
                        예약 없이 비행일지 작성
                      </div>
                      <div className="mt-0.5 text-[12px] font-medium text-amber-700">
                        교육비행은 교육생, 렌탈비행은 렌탈회원 기준으로 작성하고, 체험/기타는 대상자명을 직접 입력합니다.
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <section
            id="training-log-form"
            className="rounded-[22px] border border-[#d9e2ef] bg-white p-5 shadow-[0_8px_26px_rgba(15,23,42,0.045)]"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-semibold text-[#102544]">
                    {editing
                      ? "비행일지 수정"
                      : manualMode
                        ? "예약 없이 비행일지 작성"
                        : "비행일지 작성"}
                  </h2>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                    {form.bookingId ? "예약 기반" : "수동 작성"}
                  </span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                    {form.trainingType || "교육비행"}
                  </span>
                </div>
                <p className="mt-1 text-[13px] font-medium text-[#6d7f96]">
                  좌측 정보를 참고해서 실제 작성에 필요한 항목만 입력합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-9 items-center rounded-xl border border-[#d3ddeb] bg-white px-3 text-[12px] font-semibold text-[#28486d] hover:bg-[#f7faff]"
              >
                초기화
              </button>
            </div>

            {!form.trainingDate && !manualMode ? (
              <div className="rounded-2xl border border-dashed border-[#cfdbea] bg-[#f8fbfe] px-5 py-12 text-center text-[13px] font-semibold text-[#60738d]">
                왼쪽 비행 예약을 선택하거나 상단의 ‘예약 없이 작성’을 누르세요.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 rounded-2xl border border-[#dfe8f2] bg-[#f8fbff] p-4 md:grid-cols-4">
                  <InfoTile label="예약 시간" value={form.bookingId ? `${form.scheduledStartTime || "-"} ~ ${form.scheduledEndTime || "-"}` : "수동 작성"} />
                  <InfoTile label="비행 구분" value={form.trainingType || "교육비행"} />
                  <InfoTile label={targetLabelByType(form.trainingType)} value={form.studentName || (isEducationFlightType(form.trainingType) ? "선택 필요" : "선택 사항")} />
                  <InfoTile
                    label={requiresInstructorByType(form.trainingType) ? "항공기/교관" : "항공기"}
                    value={requiresInstructorByType(form.trainingType) ? `${form.aircraftName || "항공기 미지정"} · ${form.instructorName || "교관 미지정"}` : `${form.aircraftName || "항공기 미지정"} · 단독비행`}
                  />
                </div>

                <Field label="비행 구분">
                  <select
                    value={form.trainingType || "교육비행"}
                    onChange={(event) => updateForm("trainingType", event.target.value)}
                    className="input-base"
                  >
                    <option value="교육비행">교육비행</option>
                    <option value="체험비행">체험비행</option>
                    <option value="렌탈비행">렌탈비행</option>
                    <option value="동승비행">동승비행</option>
                    <option value="기타">기타</option>
                  </select>
                </Field>

                {manualMode ? (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-[12px] font-medium text-[#33527a]">
                    교육/체험/동승은 담당 교관을 선택하고, 렌탈 단독비행은 교관 없이 항공기와 렌탈회원명만으로 저장할 수 있습니다.
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                  {requiresInstructorByType(form.trainingType) ? (
                    <Field label={manualMode ? "1. 교관 선택" : "교관"}>
                      <select
                        value={form.instructorId}
                        onChange={(event) => selectInstructor(event.target.value)}
                        className="input-base"
                      >
                        <option value="">교관 선택</option>
                        {instructors.map((item, index) => {
                          const id = rowId(item, "instructorId", "id");
                          return (
                            <option key={`${id}-${index}`} value={id}>
                              {text(item.name || item.instructorName)} / {id}
                            </option>
                          );
                        })}
                      </select>
                    </Field>
                  ) : (
                    <Field label="운항 형태">
                      <div className="mt-1 flex h-[2.65rem] items-center rounded-[0.85rem] border border-[#d4deeb] bg-[#f8fbfe] px-3 text-[12px] font-medium text-[#60738d]">
                        렌탈 단독비행은 담당 교관 없이 저장됩니다.
                      </div>
                    </Field>
                  )}
                  {isEducationFlightType(form.trainingType) ? (
                    <Field label={manualMode ? "2. 담당 교육생 선택" : "교육생"}>
                      <select
                        value={form.studentId}
                        onChange={(event) => selectStudent(event.target.value)}
                        className="input-base"
                        disabled={manualMode && !form.instructorId}
                      >
                        <option value="">
                          {manualMode && !form.instructorId
                            ? "교관 먼저 선택"
                            : "교육생 선택"}
                        </option>
                        {(manualMode ? manualStudentOptions : students).map(
                          (item, index) => {
                            const id = text(item.studentId);
                            if (!id) return null;
                            return (
                              <option key={`${id}-${index}`} value={id}>
                                {text(item.name || item.studentName)} / {text(item.phone)}
                              </option>
                            );
                          },
                        )}
                      </select>
                    </Field>
                  ) : (
                    <Field label={targetLabelByType(form.trainingType)}>
                      <input
                        value={form.studentName}
                        onChange={(event) => updateForm("studentName", event.target.value)}
                        placeholder={normalizeFlightType(form.trainingType) === "렌탈비행" || normalizeFlightType(form.trainingType) === "동승비행" ? "렌탈회원명 또는 기장명" : `${targetLabelByType(form.trainingType)}명`}
                        className="input-base"
                      />
                    </Field>
                  )}
                  <Field label="항공기">
                    <select
                      value={form.aircraftId}
                      onChange={(event) => selectAircraft(event.target.value)}
                      className="input-base"
                    >
                      <option value="">항공기 선택</option>
                      {aircraft.map((item, index) => {
                        const id = rowId(item, "aircraftId", "id");
                        return (
                          <option key={`${id}-${index}`} value={id}>
                            {aircraftLabel(item)}
                          </option>
                        );
                      })}
                    </select>
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="비행일자">
                    <input
                      type="date"
                      value={form.trainingDate}
                      onChange={(event) => updateForm("trainingDate", event.target.value)}
                      className="input-base"
                    />
                  </Field>
                  <Field label="실제 시작시간">
                    <select
                      value={form.actualStartTime}
                      onChange={(event) => updateForm("actualStartTime", event.target.value)}
                      className="input-base"
                    >
                      <option value="">시작시간 선택</option>
                      {THIRTY_MINUTE_TIME_OPTIONS.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="실제 비행시간">
                    {isExperienceFlightType(form.trainingType) ? (
                      <select
                        value={form.actualFlightMinutes || "20"}
                        onChange={(event) => updateActualFlightMinutes(event.target.value)}
                        className="input-base"
                      >
                        {EXPERIENCE_FLIGHT_MINUTE_OPTIONS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {minutes}분
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={form.actualFlightHours || "1.0"}
                        onChange={(event) => updateForm("actualFlightHours", event.target.value)}
                        className="input-base"
                      >
                        {EDUCATION_HOUR_OPTIONS.map((hour) => (
                          <option key={hour} value={hour}>
                            {hour}시간
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>

                <Field label={isEducationFlightType(form.trainingType) ? "교육 항목" : "비행 내용"}>
                  <textarea
                    value={form.trainingItems}
                    onChange={(event) => updateForm("trainingItems", event.target.value)}
                    rows={3}
                    placeholder={isEducationFlightType(form.trainingType) ? "실시한 교육 항목을 입력하세요." : "비행 내용 또는 정산 참고 내용을 입력하세요."}
                    className="textarea-base"
                  />
                </Field>

                {isEducationFlightType(form.trainingType) ? (
                  <>
                    <Field label="학생 앱 공개 내용">
                      <textarea
                        value={form.studentNotes}
                        onChange={(event) => updateForm("studentNotes", event.target.value)}
                        rows={3}
                        placeholder="학생에게 보여줄 오늘 교육 요약입니다."
                        className="textarea-base"
                      />
                    </Field>

                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="유의사항">
                        <textarea
                          value={form.cautionNotes}
                          onChange={(event) => updateForm("cautionNotes", event.target.value)}
                          rows={3}
                          placeholder="다음 비행 전 주의할 점"
                          className="textarea-base"
                        />
                      </Field>
                      <Field label="다음 계획">
                        <textarea
                          value={form.nextTrainingPlan}
                          onChange={(event) => updateForm("nextTrainingPlan", event.target.value)}
                          rows={3}
                          placeholder="다음 교육 목표"
                          className="textarea-base"
                        />
                      </Field>
                    </div>
                  </>
                ) : null}

                <Field label={noteLabelByType(form.trainingType)}>
                  <textarea
                    value={form.instructorNotes}
                    onChange={(event) => updateForm("instructorNotes", event.target.value)}
                    rows={isEducationFlightType(form.trainingType) ? 3 : 4}
                    placeholder={isEducationFlightType(form.trainingType) ? "관리자/교관만 보는 메모입니다." : "정산 참고사항, 특이사항 등을 입력하세요."}
                    className="textarea-base"
                  />
                </Field>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dfe8f2] bg-[#f8fbfe] px-4 py-3">
                  <p className="text-[12px] font-medium text-[#60738d]">
                    교육비행은 학생 앱 공개와 교육시간 차감이 적용됩니다. 체험비행은 20분부터 10분 단위로 기록하며, 동승은 교관 정산용, 렌탈 단독비행은 운항/정산 참고 기록으로 저장됩니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => void saveTrainingLog()}
                    disabled={saving}
                    className="inline-flex h-10 items-center rounded-xl bg-[#1264f4] px-6 text-[13px] font-medium text-white hover:bg-[#0f56d8] disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "저장 중" : "저장"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>

      <style jsx global>{`
        .filter-card {
          display: flex;
          min-height: 4.25rem;
          flex-direction: column;
          justify-content: center;
          gap: 0.25rem;
          border-radius: 1rem;
          border: 1px solid rgb(212 222 235);
          background: white;
          padding: 0.55rem 0.95rem;
        }
        .filter-label {
          font-size: 0.72rem;
          font-weight: 600;
          color: rgb(106 128 157);
        }
        .filter-field {
          height: 2.05rem;
          width: 100%;
          border: 0;
          background: transparent;
          font-size: 0.9rem;
          font-weight: 600;
          color: rgb(16 37 68);
          outline: none;
        }
        .date-nav-button,
        .today-button {
          height: 2.05rem;
          border-radius: 0.75rem;
          border: 1px solid rgb(212 222 235);
          background: white;
          font-weight: 600;
          color: rgb(40 72 109);
          transition: all 0.15s ease;
        }
        .date-nav-button:hover,
        .today-button:hover {
          background: rgb(247 250 255);
          border-color: rgb(164 190 226);
        }
        .today-button {
          color: rgb(18 100 244);
        }
        .input-base {
          margin-top: 0.4rem;
          height: 2.65rem;
          width: 100%;
          border-radius: 0.85rem;
          border: 1px solid rgb(212 222 235);
          background: white;
          padding: 0 0.9rem;
          font-size: 0.85rem;
          font-weight: 500;
          color: rgb(32 55 86);
          outline: none;
          transition: all 0.15s ease;
        }
        .input-base:focus,
        .textarea-base:focus,
        .filter-card:focus-within {
          border-color: rgb(31 111 255);
          box-shadow: 0 0 0 4px rgba(191, 219, 254, 0.65);
        }
        .textarea-base {
          margin-top: 0.4rem;
          width: 100%;
          resize: vertical;
          border-radius: 1rem;
          border: 1px solid rgb(212 222 235);
          background: white;
          padding: 0.75rem 0.9rem;
          font-size: 0.85rem;
          font-weight: 500;
          color: rgb(32 55 86);
          outline: none;
          transition: all 0.15s ease;
        }
      `}</style>
    </div>
  );
}

function emptyFlightRecordForm(dateFilter = todayIsoText()): FlightRecordForm {
  return {
    flightRecordId: "",
    bookingId: "",
    flightDate: dateFilter || todayIsoText(),
    flightType: "체험비행",
    instructorId: "",
    instructorName: "",
    aircraftId: "",
    aircraftName: "",
    customerName: "",
    actualStartTime: "07:00",
    actualEndTime: addMinutesToTime("07:00", 30),
    actualFlightHours: "0.5",
    actualFlightMinutes: "30",
    settlementHours: "0.5",
    settlementMinutes: "30",
    status: "정산대상",
    sourceType: "manual",
    memo: "",
  };
}

const FLIGHT_SETTLEMENT_HOUR_OPTIONS = Array.from({ length: 26 }, (_, index) =>
  (0.5 + index / 10).toFixed(1),
);

function flightRecordFromRow(row: FlightRecordRow): FlightRecordForm {
  const actualMinutes = Number(row.actualFlightMinutes || 30) || 30;
  const settlementMinutes = Number(row.settlementMinutes || actualMinutes) || actualMinutes;
  const startTime = displayThirtyMinuteTime(row.actualStartTime) || "07:00";

  return {
    flightRecordId: text(row.flightRecordId),
    bookingId: text(row.bookingId),
    flightDate: normalizeDate(row.flightDate) || todayIsoText(),
    flightType: text(row.flightType, "체험비행"),
    instructorId: text(row.instructorId),
    instructorName: text(row.instructorName),
    aircraftId: text(row.aircraftId),
    aircraftName: text(row.aircraftName),
    customerName: text(row.customerName),
    actualStartTime: startTime,
    actualEndTime: displayThirtyMinuteTime(row.actualEndTime) || addMinutesToTime(startTime, actualMinutes),
    actualFlightHours: minutesToHoursInput(actualMinutes) || "0.5",
    actualFlightMinutes: String(actualMinutes),
    settlementHours: minutesToHoursInput(settlementMinutes) || "0.5",
    settlementMinutes: String(settlementMinutes),
    status: text(row.status, "정산대상"),
    sourceType: text(row.sourceType || (row.bookingId ? "booking" : "manual"), "manual"),
    memo: text(row.memo),
  };
}

function FlightRecordsPanel({
  aircraft,
  instructors,
  dateFilter,
  instructorFilter,
}: {
  aircraft: Row[];
  instructors: Row[];
  dateFilter: string;
  instructorFilter: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tableReady, setTableReady] = useState(true);
  const [flightRecords, setFlightRecords] = useState<FlightRecordRow[]>([]);
  const [pendingFlightRecords, setPendingFlightRecords] = useState<FlightRecordRow[]>([]);
  const [keyword, setKeyword] = useState("");
  const [form, setForm] = useState<FlightRecordForm>(() => emptyFlightRecordForm(dateFilter));

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/flight-records", { method: "GET", cache: "no-store" });
      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");
      const data = JSON.parse(rawText) as {
        ok?: boolean;
        message?: string;
        tableReady?: boolean;
        flightRecords?: FlightRecordRow[];
        pendingFlightRecords?: FlightRecordRow[];
      };
      if (!response.ok || !data.ok) throw new Error(data.message || "체험/기타 실적을 불러오지 못했습니다.");
      setTableReady(data.tableReady !== false);
      setFlightRecords(Array.isArray(data.flightRecords) ? data.flightRecords : []);
      setPendingFlightRecords(Array.isArray(data.pendingFlightRecords) ? data.pendingFlightRecords : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "체험/기타 실적을 불러오지 못했습니다.");
      setFlightRecords([]);
      setPendingFlightRecords([]);
      setTableReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const allFlightRecords = useMemo(() => {
    const savedBookingIds = new Set(flightRecords.map((item) => text(item.bookingId)).filter(Boolean));
    const savedMap = new Map<string, FlightRecordRow>();
    flightRecords.forEach((item) => {
      const bookingId = text(item.bookingId);
      const id = text(item.flightRecordId);
      const key = bookingId
        ? `booking:${bookingId}`
        : id
          ? `record:${id}`
          : `manual:${normalizeDate(item.flightDate)}:${normalizeTime(item.actualStartTime)}:${text(item.instructorId || item.instructorName)}:${text(item.aircraftId || item.aircraftName)}:${text(item.customerName)}`;
      savedMap.set(key, item);
    });

    const pendingMap = new Map<string, FlightRecordRow>();
    pendingFlightRecords.forEach((item) => {
      const bookingId = text(item.bookingId);
      if (!bookingId || savedBookingIds.has(bookingId)) return;
      pendingMap.set(`booking:${bookingId}`, item);
    });

    return [...pendingMap.values(), ...savedMap.values()];
  }, [flightRecords, pendingFlightRecords]);

  const selectedInstructor = useMemo(
    () => instructors.find((item) => rowId(item, "instructorId", "id") === instructorFilter),
    [instructors, instructorFilter],
  );
  const selectedInstructorName = text(selectedInstructor?.name || selectedInstructor?.instructorName);

  const visibleRecords = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return allFlightRecords
      .filter((item) => {
        const date = normalizeDate(item.flightDate);
        if (dateFilter && date !== dateFilter) return false;
        if (!logMatchesInstructor(item as TrainingLogRow, instructorFilter, selectedInstructorName)) return false;
        if (!q) return true;
        return [
          item.flightRecordId,
          item.bookingId,
          item.flightType,
          item.instructorName,
          item.aircraftName,
          item.customerName,
          item.status,
          item.memo,
        ]
          .map((value) => text(value))
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const aDate = normalizeDate(a.flightDate);
        const bDate = normalizeDate(b.flightDate);
        if (aDate === bDate) {
          return normalizeTime(a.actualStartTime).localeCompare(normalizeTime(b.actualStartTime), "ko");
        }
        return bDate.localeCompare(aDate, "ko");
      });
  }, [allFlightRecords, dateFilter, instructorFilter, keyword, selectedInstructorName]);

  function updateRecordForm(key: keyof FlightRecordForm, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "actualStartTime" || key === "actualFlightHours") {
        const minutes = hoursTextToMinutes(key === "actualFlightHours" ? value : next.actualFlightHours);
        const start = key === "actualStartTime" ? value : next.actualStartTime;
        next.actualFlightMinutes = String(minutes);
        next.actualEndTime = addMinutesToTime(start, minutes);
        if (!next.settlementHours) {
          next.settlementHours = minutesToHoursInput(minutes) || "0.5";
          next.settlementMinutes = String(minutes);
        }
      }
      if (key === "settlementHours") {
        next.settlementMinutes = String(hoursTextToMinutes(value));
      }
      return next;
    });
  }

  function selectFlightInstructor(instructorId: string) {
    const selected = instructors.find((item) => rowId(item, "instructorId", "id") === instructorId);
    setForm((prev) => ({
      ...prev,
      instructorId: selected ? rowId(selected, "instructorId", "id") : "",
      instructorName: selected ? text(selected.name || selected.instructorName) : "",
    }));
  }

  function selectFlightAircraft(aircraftId: string) {
    const selected = aircraft.find((item) => rowId(item, "aircraftId", "id") === aircraftId);
    setForm((prev) => ({
      ...prev,
      aircraftId: selected ? rowId(selected, "aircraftId", "id") : "",
      aircraftName: selected
        ? text(selected.registrationNo || selected.aircraftName || selected.aircraftId)
        : "",
    }));
  }

  function startFlightRecord(row?: FlightRecordRow) {
    if (row) {
      setForm(flightRecordFromRow(row));
    } else {
      const selected = instructors.find((item) => rowId(item, "instructorId", "id") === instructorFilter);
      setForm({
        ...emptyFlightRecordForm(dateFilter || todayIsoText()),
        instructorId: selected ? rowId(selected, "instructorId", "id") : "",
        instructorName: selected ? text(selected.name || selected.instructorName) : "",
      });
    }
    window.setTimeout(
      () => document.getElementById("flight-record-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      0,
    );
  }

  async function saveFlightRecord() {
    if (saving) return;
    const actualMinutes = hoursTextToMinutes(form.actualFlightHours);
    const settlementMinutes = hoursTextToMinutes(form.settlementHours);

    if (!tableReady) {
      alert("체험/기타 실적 저장 테이블이 아직 준비되지 않았습니다. Supabase에 flight_records 테이블을 먼저 생성해야 합니다.");
      return;
    }
    if (!form.flightDate) {
      alert("비행일을 입력하세요.");
      return;
    }
    if (!form.flightType) {
      alert("비행유형을 선택하세요.");
      return;
    }
    if (!form.instructorName) {
      alert("교관을 선택하세요.");
      return;
    }
    if (!form.aircraftName) {
      alert("항공기를 선택하세요.");
      return;
    }
    if (!actualMinutes) {
      alert("실제 비행시간을 선택하세요.");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        ...form,
        actualFlightMinutes: String(actualMinutes),
        settlementMinutes: String(settlementMinutes || actualMinutes),
        actualEndTime: form.actualEndTime || addMinutesToTime(form.actualStartTime, actualMinutes),
        status: form.status || "정산대상",
        sourceType: form.bookingId ? "booking" : "manual",
      };
      const response = await fetch("/api/flight-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: payload.flightRecordId ? "updateFlightRecord" : "addFlightRecord",
          data: payload,
        }),
      });
      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");
      const data = JSON.parse(rawText) as { ok?: boolean; success?: boolean; message?: string };
      if (!response.ok || (!data.ok && !data.success)) throw new Error(data.message || "체험/기타 실적 저장에 실패했습니다.");
      await loadRecords();
      setForm(emptyFlightRecordForm(dateFilter || todayIsoText()));
      alert("체험/기타 실적을 저장했습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "체험/기타 실적 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(420px,0.72fr)_minmax(620px,1.28fr)]">
      <div className="overflow-hidden rounded-[22px] border border-[#d9e2ef] bg-white shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
        <div className="border-b border-[#e7eef7] px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-[#102544]">체험/기타 실적</h2>
                <span className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[12px] font-medium text-[#1264f4]">
                  {visibleRecords.length}건
                </span>
              </div>
              <p className="mt-1 text-[12px] font-medium text-[#6d7f96]">
                비행시간 차감과 학생 앱 공개 없이 교관 정산용 실적으로만 저장합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => startFlightRecord()}
              className="inline-flex h-10 items-center rounded-xl bg-[#1264f4] px-4 text-[13px] font-medium text-white hover:bg-[#0f56d8]"
            >
              + 실적 직접 입력
            </button>
          </div>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="대상자, 교관, 항공기, 메모 검색"
            className="mt-3 h-10 w-full rounded-xl border border-[#d9e2ef] bg-[#f8fbfe] px-3 text-[13px] font-medium text-[#102544] outline-none focus:border-[#1264f4]"
          />
        </div>

        {!tableReady ? (
          <div className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[12px] font-medium text-amber-800">
            체험/기타 실적 저장 테이블이 아직 없습니다. 목록은 예약 기반 작성 대기만 표시될 수 있습니다.
          </div>
        ) : null}

        {loading ? (
          <div className="p-10 text-center text-[13px] font-medium text-[#6d7f96]">체험/기타 실적을 불러오는 중입니다.</div>
        ) : error ? (
          <div className="m-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[13px] font-medium text-rose-700">{error}</div>
        ) : (
          <div className="max-h-[780px] space-y-2.5 overflow-y-auto p-3">
            {visibleRecords.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfdbea] bg-[#f8fbfe] p-8 text-center">
                <div className="text-[14px] font-medium text-[#33527a]">표시할 체험/기타 실적이 없습니다.</div>
                <div className="mt-0.5 text-[11px] font-medium text-[#8a9ab0]">체험비행 예약이 있거나 직접 입력하면 여기에 표시됩니다.</div>
              </div>
            ) : (
              visibleRecords.map((item, index) => {
                const completed = Boolean(text(item.flightRecordId));
                const start = displayThirtyMinuteTime(item.actualStartTime) || "-";
                const end = displayThirtyMinuteTime(item.actualEndTime) || "-";
                const actualHours = minutesToHoursInput(item.actualFlightMinutes) || "0.5";
                const settleHours = minutesToHoursInput(item.settlementMinutes || item.actualFlightMinutes) || actualHours;
                return (
                  <button
                    key={`${text(item.flightRecordId || item.bookingId, "flight-record")}-${index}`}
                    type="button"
                    onClick={() => startFlightRecord(item)}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] ${
                      completed ? "border-[#e3e9f2] bg-[#f8fafc]" : "border-amber-200 bg-amber-50/60"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex min-h-[82px] w-[86px] shrink-0 flex-col items-center justify-center rounded-2xl bg-white text-center text-[#1264f4] ring-1 ring-[#dfe8f2]">
                        <span className="text-[17px] font-semibold leading-none">{start}</span>
                        <span className="my-1 text-[14px] font-semibold leading-none">-</span>
                        <span className="text-[17px] font-semibold leading-none">{end}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
                            {text(item.flightType, "체험비행")}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${completed ? "bg-slate-100 text-slate-500 ring-slate-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
                            {completed ? text(item.status, "정산대상") : "작성 필요"}
                          </span>
                        </div>
                        <div className="mt-2 truncate text-[16px] font-semibold text-[#102544]">{text(item.customerName, "대상자 미입력")}</div>
                        <div className="mt-1 text-[12px] font-medium text-[#6d7f96]">
                          {text(item.aircraftName, "항공기 미지정")} · {text(item.instructorName, "교관 미지정")} · {normalizeDate(item.flightDate) || "-"}
                        </div>
                        <div className="mt-3 text-[12px] font-medium text-[#60738d]">
                          실제 {actualHours}시간 · 정산 {settleHours }시간
                        </div>
                      </div>
                      <div className="text-[24px] font-light text-[#60738d] opacity-60">›</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <section id="flight-record-form" className="rounded-[22px] border border-[#d9e2ef] bg-white p-5 shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-[#102544]">
              {form.flightRecordId ? "체험/기타 실적 수정" : form.bookingId ? "체험비행 예약 실적 작성" : "체험/기타 실적 작성"}
            </h2>
            <p className="mt-1 text-[13px] font-medium text-[#6d7f96]">
              학생 비행시간 차감 없이 교관 월말 정산에 사용할 실비행/정산 시간을 기록합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => startFlightRecord()}
            className="inline-flex h-9 items-center rounded-xl border border-[#d3ddeb] bg-white px-3 text-[12px] font-semibold text-[#28486d] hover:bg-[#f7faff]"
          >
            초기화
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="비행유형">
              <select value={form.flightType} onChange={(event) => updateRecordForm("flightType", event.target.value)} className="input-base">
                <option value="체험비행">체험비행</option>
                <option value="동승비행">동승비행</option>
                <option value="기타">기타</option>
              </select>
            </Field>
            <Field label="비행일">
              <input type="date" value={form.flightDate} onChange={(event) => updateRecordForm("flightDate", event.target.value)} className="input-base" />
            </Field>
            <Field label="상태">
              <select value={form.status} onChange={(event) => updateRecordForm("status", event.target.value)} className="input-base">
                <option value="정산대상">정산대상</option>
                <option value="정산완료">정산완료</option>
                <option value="정산제외">정산제외</option>
                <option value="수정필요">수정필요</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="교관">
              <select value={form.instructorId} onChange={(event) => selectFlightInstructor(event.target.value)} className="input-base">
                <option value="">교관 선택</option>
                {instructors.map((item, index) => {
                  const id = rowId(item, "instructorId", "id");
                  return <option key={`${id}-${index}`} value={id}>{text(item.name || item.instructorName)} / {id}</option>;
                })}
              </select>
            </Field>
            <Field label="항공기">
              <select value={form.aircraftId} onChange={(event) => selectFlightAircraft(event.target.value)} className="input-base">
                <option value="">항공기 선택</option>
                {aircraft.map((item, index) => {
                  const id = rowId(item, "aircraftId", "id");
                  return <option key={`${id}-${index}`} value={id}>{aircraftLabel(item)}</option>;
                })}
              </select>
            </Field>
            <Field label="대상자명">
              <input value={form.customerName} onChange={(event) => updateRecordForm("customerName", event.target.value)} placeholder="체험객 또는 대상자명" className="input-base" />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="실제 시작시간">
              <select value={form.actualStartTime} onChange={(event) => updateRecordForm("actualStartTime", event.target.value)} className="input-base">
                <option value="">시작시간 선택</option>
                {THIRTY_MINUTE_TIME_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}
              </select>
            </Field>
            <Field label="실제 비행시간">
              <select value={form.actualFlightHours || "0.5"} onChange={(event) => updateRecordForm("actualFlightHours", event.target.value)} className="input-base">
                {FLIGHT_SETTLEMENT_HOUR_OPTIONS.map((hour) => <option key={hour} value={hour}>{hour}시간</option>)}
              </select>
            </Field>
            <Field label="정산 시간">
              <select value={form.settlementHours || form.actualFlightHours || "0.5"} onChange={(event) => updateRecordForm("settlementHours", event.target.value)} className="input-base">
                {FLIGHT_SETTLEMENT_HOUR_OPTIONS.map((hour) => <option key={hour} value={hour}>{hour}시간</option>)}
              </select>
            </Field>
          </div>

          <Field label="메모">
            <textarea value={form.memo} onChange={(event) => updateRecordForm("memo", event.target.value)} rows={5} placeholder="정산 참고사항, 체험코스, 특이사항 등을 입력하세요." className="textarea-base" />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dfe8f2] bg-[#f8fbfe] px-4 py-3">
            <p className="text-[12px] font-medium text-[#60738d]">
              저장된 체험/기타 실적은 학생 앱에 공개되지 않고, 교관 정산용 데이터로만 사용됩니다.
            </p>
            <button
              type="button"
              onClick={() => void saveFlightRecord()}
              disabled={saving}
              className="inline-flex h-10 items-center rounded-xl bg-[#1264f4] px-6 text-[13px] font-medium text-white hover:bg-[#0f56d8] disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? "저장 중" : "저장"}
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}


function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-[#60738d]">{label}</label>
      {children}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold text-[#60738d]">{label}</div>
      <div className="mt-1 truncate text-[13px] font-semibold text-[#102544]">
        {value}
      </div>
    </div>
  );
}
