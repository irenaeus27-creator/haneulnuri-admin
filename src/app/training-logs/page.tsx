"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatKstDate as sharedFormatKstDate, formatKstTime as sharedFormatKstTime } from "@/lib/formatDateTime";

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
  actualFlightMinutes: "0",
  actualFlightHours: "",
  groundBriefingMinutes: "0",
  payableMinutes: "0",
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
  deductedMinutes: "0",
  status: "작성대기",
  createdAt: "",
  updatedAt: "",
};

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function formatKstDateTime(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) return "-";

  const isoUtc = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/);

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

  return raw.replace("T", " ").replace(/\.\d+Z$/, "").replace(/Z$/, "");
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
  return Number.isInteger(hours) ? String(hours) : String(hours);
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
    actualEndTime: addMinutesToTime(displayThirtyMinuteTime(row.actualStartTime), Number(row.actualFlightMinutes || 0)),
    scheduledMinutes: text(row.scheduledMinutes, "0"),
    actualFlightMinutes: text(row.actualFlightMinutes, "0"),
    actualFlightHours: minutesToHoursInput(row.actualFlightMinutes),
    groundBriefingMinutes: text(row.groundBriefingMinutes, "0"),
    payableMinutes: text(row.payableMinutes || row.actualFlightMinutes, "0"),
    payMonth: text(row.payMonth || payMonthFromDate(row.trainingDate)),
    sourceType: text(row.sourceType || (row.bookingId ? "booking" : "manual"), "manual"),
    noFlightReason: text(row.noFlightReason),
    trainingType: text(row.trainingType, "교육비행"),
    lessonTitle: text(row.lessonTitle),
    trainingItems: text(row.trainingItems),
    instructorNotes: text(row.instructorNotes),
    studentNotes: text(row.studentNotes),
    homework: text(row.homework),
    cautionNotes: text(row.cautionNotes),
    nextTrainingPlan: text(row.nextTrainingPlan),
    studentVisible: text(row.studentVisible, "FALSE").toUpperCase() === "TRUE" ? "TRUE" : "FALSE",
    timeDeducted: text(row.timeDeducted, "FALSE").toUpperCase() === "TRUE" ? "TRUE" : "FALSE",
    deductedMinutes: text(row.deductedMinutes, "0"),
    status: text(row.status, "작성대기"),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

function statusClass(status: unknown) {
  const value = text(status);

  if (value === "차감완료") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value === "작성완료") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value === "수정필요") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (value === "취소") return "bg-slate-100 text-slate-600 ring-slate-200";

  return "bg-[#eef4fb] text-[#33527a] ring-[#d7e3f2]";
}

function visibleLabel(value: unknown) {
  return text(value).toUpperCase() === "TRUE" ? "앱 공개" : "비공개";
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
  const instructorId = rowId(row, "assignedInstructorId", "instructorId", "primaryInstructorId");
  const instructorName = text(row.assignedInstructorName || row.instructorName || row.primaryInstructorName);

  return (
    instructors.find((item) => rowId(item, "instructorId", "id") === instructorId) ||
    instructors.find((item) => text(item.name || item.instructorName) === instructorName)
  );
}

function findAircraftByStudent(row: Row, aircraft: Row[]) {
  const ids = splitIds(row.assignedAircraftIds || row.assignedAircraftId || row.aircraftId);
  const name = text(row.assignedAircraftName || row.aircraftName || row.registrationNo);

  return (
    aircraft.find((item) => ids.includes(rowId(item, "aircraftId", "id")) || ids.includes(text(item.registrationNo))) ||
    aircraft.find((item) => [text(item.registrationNo), text(item.aircraftName), text(item.aircraftId)].includes(name))
  );
}

const EDUCATION_HOUR_OPTIONS = Array.from({ length: 41 }, (_, index) => (1 + index / 10).toFixed(1));

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
  const [statusFilter, setStatusFilter] = useState("전체");
  const [dateFilter, setDateFilter] = useState("");
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
        throw new Error(data.message || "교육일지 데이터를 불러오지 못했습니다.");
      }

      setTrainingLogs(Array.isArray(data.trainingLogs) ? data.trainingLogs : []);
      setPendingLogs(Array.isArray(data.pendingLogs) ? data.pendingLogs : []);
      setStudents(Array.isArray(data.students) ? data.students : []);
      setInstructors(Array.isArray(data.instructors) ? data.instructors : []);
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "교육일지 데이터를 불러오지 못했습니다.");
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
    const realIds = new Set(trainingLogs.map((item) => text(item.bookingId)).filter(Boolean));
    const pending = pendingLogs.filter((item) => !realIds.has(text(item.bookingId)));
    return [...pending, ...trainingLogs];
  }, [pendingLogs, trainingLogs]);

  useEffect(() => {
    if (!bookingIdFromQuery) return;
    if (loading) return;
    if (form.bookingId === bookingIdFromQuery) return;

    const target = allLogs.find((item) => text(item.bookingId) === bookingIdFromQuery);

    if (target) {
      const next = toForm(target);
      setForm(next);
      setEditing(Boolean(text(target.trainingLogId)));
      setManualMode(!text(next.bookingId));
      window.setTimeout(() => document.getElementById("training-log-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
    }
  }, [allLogs, bookingIdFromQuery, form.bookingId, loading]);

  const summary = useMemo(() => {
    return {
      pending: allLogs.filter((item) => text(item.status) === "작성대기").length,
      done: allLogs.filter((item) => text(item.status) === "작성완료").length,
      deducted: allLogs.filter((item) => text(item.status) === "차감완료").length,
      visible: allLogs.filter((item) => text(item.studentVisible).toUpperCase() === "TRUE").length,
    };
  }, [allLogs]);

  const filteredLogs = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return allLogs
      .filter((item) => {
        const status = text(item.status);
        const date = normalizeDate(item.trainingDate);

        if (statusFilter !== "전체" && status !== statusFilter) return false;
        if (dateFilter && date !== dateFilter) return false;

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
        const aKey = `${normalizeDate(a.trainingDate)} ${normalizeTime(a.scheduledStartTime)}`;
        const bKey = `${normalizeDate(b.trainingDate)} ${normalizeTime(b.scheduledStartTime)}`;
        return bKey.localeCompare(aKey, "ko");
      });
  }, [allLogs, keyword, statusFilter, dateFilter]);

  function updateForm(key: keyof TrainingLogForm, value: string) {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      if (key === "actualStartTime" || key === "actualFlightHours") {
        const startTime = key === "actualStartTime" ? value : next.actualStartTime;
        const flightHours = key === "actualFlightHours" ? value : next.actualFlightHours;
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

      return next;
    });
  }

  function startCreateFrom(row: TrainingLogRow) {
    const next = toForm(row);
    const actualMinutes = Number(next.actualFlightMinutes || 0);
    next.actualFlightHours = minutesToHoursInput(actualMinutes);
    next.actualEndTime = next.actualEndTime || addMinutesToTime(next.actualStartTime, actualMinutes);
    next.payableMinutes = String(Number(next.payableMinutes || actualMinutes || 0));
    next.payMonth = next.payMonth || payMonthFromDate(next.trainingDate);
    next.sourceType = next.bookingId ? "booking" : "manual";
    next.studentVisible = next.studentVisible === "FALSE" ? "FALSE" : "TRUE";
    next.timeDeducted = next.timeDeducted === "FALSE" ? "FALSE" : "TRUE";
    setForm(next);
    setEditing(Boolean(text(row.trainingLogId)));
    setManualMode(!text(next.bookingId));
    window.setTimeout(() => document.getElementById("training-log-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }

  function startManualLog() {
    setForm({
      ...emptyForm,
      trainingDate: new Date().toISOString().slice(0, 10),
      actualStartTime: "07:00",
      actualFlightHours: "",
      actualFlightMinutes: "0",
      actualEndTime: "",
      payMonth: new Date().toISOString().slice(0, 7),
      sourceType: "manual",
      studentVisible: "TRUE",
      timeDeducted: "TRUE",
      status: "작성대기",
    });
    setEditing(false);
    setManualMode(true);
    window.setTimeout(() => document.getElementById("training-log-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
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
    const selected = students.find((item) => rowId(item, "studentId", "userId") === studentId);

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
      studentId: rowId(selected, "studentId", "userId"),
      userId: text(selected.userId),
      studentName: text(selected.name || selected.studentName),
      instructorId: matchedInstructor ? rowId(matchedInstructor, "instructorId", "id") : text(selected.assignedInstructorId || selected.instructorId),
      instructorName: matchedInstructor ? text(matchedInstructor.name || matchedInstructor.instructorName) : text(selected.assignedInstructorName || selected.instructorName),
      aircraftId: matchedAircraft ? rowId(matchedAircraft, "aircraftId", "id") : text(selected.assignedAircraftId || selected.aircraftId),
      aircraftName: matchedAircraft ? text(matchedAircraft.registrationNo || matchedAircraft.aircraftName || matchedAircraft.aircraftId) : text(selected.assignedAircraftName || selected.aircraftName || selected.registrationNo),
    }));
  }

  function selectInstructor(instructorId: string) {
    const selected = instructors.find((item) => rowId(item, "instructorId", "id") === instructorId);

    if (!selected) {
      setForm((prev) => ({ ...prev, instructorId: "", instructorName: "" }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      instructorId: rowId(selected, "instructorId", "id"),
      instructorName: text(selected.name || selected.instructorName),
    }));
  }

  function selectAircraft(aircraftId: string) {
    const selected = aircraft.find((item) => rowId(item, "aircraftId", "id") === aircraftId);

    if (!selected) {
      setForm((prev) => ({ ...prev, aircraftId: "", aircraftName: "" }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      aircraftId: rowId(selected, "aircraftId", "id"),
      aircraftName: text(selected.registrationNo || selected.aircraftName || selected.aircraftId),
    }));
  }

  async function saveTrainingLogWithOptions(options?: { publish?: boolean }) {
    try {
      const actualMinutes = hoursTextToMinutes(form.actualFlightHours || minutesToHoursInput(form.actualFlightMinutes));
      const payload: TrainingLogForm = {
        ...form,
        actualFlightMinutes: String(actualMinutes),
        actualEndTime: form.actualEndTime || addMinutesToTime(form.actualStartTime, actualMinutes),
        groundBriefingMinutes: "0",
        payableMinutes: String(actualMinutes),
        payMonth: form.payMonth || payMonthFromDate(form.trainingDate),
        sourceType: form.bookingId ? "booking" : "manual",
        studentVisible: "TRUE",
        timeDeducted: "TRUE",
        deductedMinutes: String(actualMinutes),
        status: "차감완료",
      };

      if (!payload.trainingDate) {
        alert("교육일자를 입력하세요.");
        return;
      }

      if (!payload.studentName) {
        alert("교육생을 선택하세요.");
        return;
      }

      if (!payload.instructorName) {
        alert("교관을 선택하세요.");
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
        alert("교육시간을 선택하세요.");
        return;
      }

      setSaving(true);

      const response = await fetch("/api/training-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editing ? "updateTrainingLog" : "addTrainingLog",
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
        throw new Error(data.message || "교육일지 저장에 실패했습니다.");
      }

      await loadData(true);
      setStatusFilter("전체");
      setDateFilter("");
      setKeyword("");
      resetForm();
      alert(options?.publish ? "교육일지가 저장되고 학생에게 공개되었습니다. 왼쪽 교육일지 목록에서 확인할 수 있습니다." : "교육일지가 저장되었습니다. 왼쪽 교육일지 목록에서 확인할 수 있습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "교육일지 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }


  async function saveTrainingLog() {
    await saveTrainingLogWithOptions();
  }


  return (
    <div className="min-h-screen w-full bg-[#f4f7fb]">
      <div className="flex w-full flex-col gap-4 p-5">
        <section className="rounded-[24px] border border-[#d9e2ef] bg-white px-6 py-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7a8ba3]">Training Log</p>
              <h1 className="mt-1 text-[26px] font-black tracking-[-0.03em] text-[#102544]">교육일지</h1>
              <p className="mt-1.5 text-[13px] font-medium text-[#6d7f96]">
                교육비행 완료 후 실제 비행시간, 교육내용, 학생 유의사항을 기록합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startManualLog}
                className="inline-flex h-10 items-center rounded-xl bg-[#1264f4] px-4 text-[13px] font-bold text-white hover:bg-[#0f56d8]"
              >
                + 예약 없이 작성
              </button>
              <button
                type="button"
                onClick={() => void loadData(true)}
                disabled={loading}
                className="inline-flex h-10 items-center rounded-xl bg-[#102544] px-4 text-[13px] font-bold text-white hover:bg-[#17355e] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {loading ? "불러오는 중" : "새로고침"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="작성 대기" value={summary.pending} />
          <SummaryCard title="작성 완료" value={summary.done} />
          <SummaryCard title="차감 완료" value={summary.deducted} />
          <SummaryCard title="앱 공개" value={summary.visible} />
        </section>

        <section className="rounded-[20px] border border-[#d9e2ef] bg-white px-5 py-4 text-[13px] font-semibold text-[#5c718c] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          학생 앱 공개 기준: <span className="font-black text-[#102544]">학생 앱 공개 체크 + 작성완료/차감완료 상태</span>인 교육일지만 조회됩니다.
          교관 내부 메모는 학생 앱 API에서 제외됩니다.
        </section>

        {error ? (
          <section className="rounded-[20px] border border-rose-200 bg-rose-50 p-4 text-[13px] font-semibold text-rose-700">
            {error}
          </section>
        ) : null}

        <section className="rounded-[22px] border border-[#d9e2ef] bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[160px_160px_minmax(0,1fr)]">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="filter-base">
              <option value="전체">전체 상태</option>
              <option value="작성대기">작성대기</option>
              <option value="작성완료">작성완료</option>
              <option value="차감완료">차감완료</option>
              <option value="비행없음">비행없음</option>
              <option value="수정필요">수정필요</option>
              <option value="취소">취소</option>
            </select>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="filter-base" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="교육생, 교관, 항공기, 교육내용, 유의사항 검색"
              className="filter-base"
            />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
          <div className="overflow-hidden rounded-[22px] border border-[#d9e2ef] bg-white shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
            <div className="flex items-center justify-between border-b border-[#e7eef7] px-5 py-4">
              <div>
                <h2 className="text-[17px] font-black text-[#102544]">교육일지 목록</h2>
                <p className="mt-1 text-[13px] font-medium text-[#6d7f96]">저장한 교육일지는 이 목록에 바로 표시됩니다. 예약 없이 작성한 일지는 bookingId 없이 교육일자로 표시됩니다.</p>
              </div>
              <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-[12px] font-bold text-[#33527a]">표시 {filteredLogs.length}건</span>
            </div>

            {loading ? (
              <div className="p-10 text-center text-[13px] font-medium text-[#6d7f96]">교육일지 데이터를 불러오는 중입니다.</div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-10 text-center text-[13px] font-medium text-[#6d7f96]">표시할 교육일지가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1020px] border-collapse text-left text-[13px]">
                  <thead className="bg-[#f6f9fd] text-[12px] font-black text-[#6f8097]">
                    <tr>
                      <th className="px-4 py-3">일자</th>
                      <th className="px-4 py-3">교육생</th>
                      <th className="px-4 py-3">교관/항공기</th>
                      <th className="px-4 py-3">시간</th>
                      <th className="px-4 py-3">교육내용</th>
                      <th className="px-4 py-3">상태</th>
                      <th className="px-4 py-3 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f8]">
                    {filteredLogs.map((item, index) => (
                      <tr key={`${text(item.trainingLogId || item.bookingId, "training-log")}-${index}`} className="hover:bg-[#fbfdff]">
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-black text-[#102544]">{normalizeDate(item.trainingDate) || "-"}</div>
                          <div className="mt-1 text-[11px] font-semibold text-[#8ca0b7]">{text(item.bookingId) || "-"}</div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-black text-[#102544]">{text(item.studentName, "-")}</div>
                          <div className="mt-1 text-[11px] font-semibold text-[#8ca0b7]">{text(item.studentId || item.userId, "-")}</div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-semibold text-[#23415f]">{text(item.instructorName, "-")}</div>
                          <div className="mt-1 text-[11px] font-semibold text-[#8ca0b7]">{text(item.aircraftName, "-")}</div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-semibold text-[#23415f]">시작 {displayThirtyMinuteTime(item.actualStartTime) || "-"}</div>
                          <div className="mt-1 text-[11px] font-semibold text-[#8ca0b7]">교육 {minutesToHoursInput(item.actualFlightMinutes) || "0"}시간</div>
                        </td>
                        <td className="max-w-[240px] px-4 py-3.5 align-top">
                          <div className="truncate font-black text-[#102544]">{text(item.lessonTitle, "-")}</div>
                          <div className="mt-1 truncate text-[11px] font-semibold text-[#8ca0b7]">{text(item.cautionNotes || item.nextTrainingPlan || item.studentNotes, "-")}</div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black ring-1 ${statusClass(item.status)}`}>
                            {text(item.status, "작성대기")}
                          </span>
                          <div className="mt-1 text-[11px] font-bold text-[#8ca0b7]">{visibleLabel(item.studentVisible)}</div>
                        </td>
                        <td className="px-4 py-3.5 text-right align-top">
                          <button
                            type="button"
                            onClick={() => startCreateFrom(item)}
                            className="inline-flex h-9 items-center rounded-xl border border-[#d3ddeb] bg-white px-3 text-[12px] font-black text-[#28486d] hover:bg-[#f7faff]"
                          >
                            {text(item.trainingLogId) ? "수정" : "작성"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <section id="training-log-form" className="rounded-[22px] border border-[#d9e2ef] bg-white p-5 shadow-[0_8px_26px_rgba(15,23,42,0.045)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-black text-[#102544]">{editing ? "교육일지 수정" : manualMode ? "예약 없이 교육일지 작성" : "교육일지 작성"}</h2>
                <p className="mt-1 text-[13px] font-medium text-[#6d7f96]">실제 비행시간과 학생에게 보여줄 내용을 작성합니다.</p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-9 items-center rounded-xl border border-[#d3ddeb] bg-white px-3 text-[12px] font-black text-[#28486d] hover:bg-[#f7faff]"
              >
                초기화
              </button>
            </div>

            {!form.bookingId && !manualMode ? (
              <div className="rounded-2xl border border-dashed border-[#d7e1ed] bg-[#f8fbfe] px-5 py-8 text-center text-[13px] font-semibold text-[#7c8da4]">
                왼쪽 목록에서 작성할 교육비행을 선택하거나 상단의 “예약 없이 작성”을 누르세요.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl bg-[#f8fbfe] px-4 py-3 text-[13px] font-bold text-[#48617e]">
                  <div className="grid gap-2 md:grid-cols-2">
                    <Info label="교육생" value={form.studentName} />
                    <Info label="교관" value={form.instructorName} />
                    <Info label="항공기" value={form.aircraftName} />
                    <Info label="예약시간" value={form.bookingId ? `${form.scheduledStartTime}~${form.scheduledEndTime}` : "예약 없이 작성"} />
                    <Info label="작성구분" value={form.bookingId ? "예약 기반" : "수기 작성"} />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="교육생">
                    <select value={form.studentId || form.userId} onChange={(event) => selectStudent(event.target.value)} className="input-base">
                      <option value="">교육생 선택</option>
                      {students.map((item, index) => {
                        const id = rowId(item, "studentId", "userId");
                        return <option key={`${id}-${index}`} value={id}>{text(item.name || item.studentName)} / {text(item.phone)}</option>;
                      })}
                    </select>
                  </Field>
                  <Field label="교관(자동 선택)">
                    <select value={form.instructorId} onChange={(event) => selectInstructor(event.target.value)} className="input-base">
                      <option value="">교관 선택</option>
                      {instructors.map((item, index) => {
                        const id = rowId(item, "instructorId", "id");
                        return <option key={`${id}-${index}`} value={id}>{text(item.name || item.instructorName)} / {id}</option>;
                      })}
                    </select>
                  </Field>
                  <Field label="항공기(자동 선택)">
                    <select value={form.aircraftId} onChange={(event) => selectAircraft(event.target.value)} className="input-base">
                      <option value="">항공기 선택</option>
                      {aircraft.map((item, index) => {
                        const id = rowId(item, "aircraftId", "id");
                        return <option key={`${id}-${index}`} value={id}>{aircraftLabel(item)}</option>;
                      })}
                    </select>
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="교육일자">
                    <input type="date" value={form.trainingDate} onChange={(event) => updateForm("trainingDate", event.target.value)} className="input-base" />
                  </Field>
                  <Field label="실제 시작시간">
                    <select value={form.actualStartTime} onChange={(event) => updateForm("actualStartTime", event.target.value)} className="input-base">
                      <option value="">시작시간 선택</option>
                      {THIRTY_MINUTE_TIME_OPTIONS.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="교육시간(시간)">
                    <select value={form.actualFlightHours} onChange={(event) => updateForm("actualFlightHours", event.target.value)} className="input-base">
                      <option value="">교육시간 선택</option>
                      {EDUCATION_HOUR_OPTIONS.map((hour) => (
                        <option key={hour} value={hour}>{hour}시간</option>
                      ))}
                    </select>
                  </Field>

                </div>

                <Field label="교육 항목">
                  <textarea value={form.trainingItems} onChange={(event) => updateForm("trainingItems", event.target.value)} rows={3} placeholder="실시한 교육 항목을 입력하세요." className="textarea-base" />
                </Field>

                <Field label="교관 내부 메모">
                  <textarea value={form.instructorNotes} onChange={(event) => updateForm("instructorNotes", event.target.value)} rows={3} placeholder="관리자/교관만 보는 메모입니다." className="textarea-base" />
                </Field>

                <Field label="학생 앱 공개 내용">
                  <textarea value={form.studentNotes} onChange={(event) => updateForm("studentNotes", event.target.value)} rows={3} placeholder="학생에게 보여줄 오늘 교육 요약입니다." className="textarea-base" />
                </Field>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="유의사항">
                    <textarea value={form.cautionNotes} onChange={(event) => updateForm("cautionNotes", event.target.value)} rows={3} placeholder="다음 비행 전 주의할 점" className="textarea-base" />
                  </Field>
                  <Field label="다음 교육 계획">
                    <textarea value={form.nextTrainingPlan} onChange={(event) => updateForm("nextTrainingPlan", event.target.value)} rows={3} placeholder="다음 교육 목표" className="textarea-base" />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between rounded-2xl border border-[#dfe8f2] bg-[#f8fbfe] px-4 py-3 text-[13px] font-black text-[#48617e]">
                    학생 앱 공개
                    <input
                      type="checkbox"
                      checked={form.studentVisible === "TRUE"}
                      onChange={(event) => updateForm("studentVisible", event.target.checked ? "TRUE" : "FALSE")}
                      className="h-4 w-4"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-[#dfe8f2] bg-[#f8fbfe] px-4 py-3 text-[13px] font-black text-[#48617e]">
                    <span>
                      교육시간 차감
                      <span className="mt-1 block text-[11px] font-semibold text-[#8292a8]">교육시간 기준으로 잔여시간 차감</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={form.timeDeducted === "TRUE"}
                      onChange={(event) => updateForm("timeDeducted", event.target.checked ? "TRUE" : "FALSE")}
                      className="h-4 w-4"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void saveTrainingLog()}
                    disabled={saving}
                    className="inline-flex h-10 items-center rounded-xl bg-[#102544] px-4 text-[13px] font-bold text-white hover:bg-[#17355e] disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "저장 중" : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveTrainingLogWithOptions({ publish: true })}
                    disabled={saving}
                    className="inline-flex h-10 items-center rounded-xl bg-[#1264f4] px-4 text-[13px] font-bold text-white hover:bg-[#0f56d8] disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    저장 + 학생공개
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>

      <style jsx global>{`
        .input-base {
          margin-top: 0.4rem;
          height: 2.65rem;
          width: 100%;
          border-radius: 0.85rem;
          border: 1px solid rgb(212 222 235);
          background: white;
          padding: 0 0.9rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: rgb(32 55 86);
          outline: none;
          transition: all 0.15s ease;
        }
        .input-base:focus,
        .textarea-base:focus,
        .filter-base:focus {
          border-color: rgb(31 111 255);
          box-shadow: 0 0 0 4px rgba(191, 219, 254, 0.65);
        }
        .filter-base {
          height: 2.65rem;
          border-radius: 0.85rem;
          border: 1px solid rgb(212 222 235);
          background: white;
          padding: 0 0.9rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: rgb(51 78 110);
          outline: none;
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
          font-weight: 600;
          color: rgb(32 55 86);
          outline: none;
          transition: all 0.15s ease;
        }
      `}</style>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-[20px] border border-[#d9e2ef] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <p className="text-[13px] font-bold text-[#71829a]">{title}</p>
      <p className="mt-1 text-[26px] leading-none font-black text-[#102544]">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[12px] font-black text-[#60738d]">{label}</label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[#8292a8]">{label}</span>
      <div className="mt-1 text-[#102544]">{value || "-"}</div>
    </div>
  );
}
