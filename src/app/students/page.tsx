"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ContentCard from "@/components/ContentCard";
import PageContainer from "@/components/PageContainer";
import StudentTrainingLogDrawer from "@/components/StudentTrainingLogDrawer";

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

type StudentRow = {
  studentId?: string;
  userId?: string;
  name?: string;
  phone?: string;
  course?: string;
  trainingStartDate?: string;
  trainingStatus?: string;
  assignedInstructorId?: string;
  assignedInstructorName?: string;
  assignedAircraftIds?: string;
  chargedTrainingMinutes?: string | number;
  totalChargedMinutes?: string | number;
  initialChargeMinutes?: string | number;
  initialChargeHours?: string | number;
  manualTrainingMinutes?: string | number;
  manualTrainingCount?: string | number;
  usedTrainingMinutes?: string | number;
  usedMinutes?: string | number;
  usedTrainingHours?: string | number;
  usedHours?: string | number;
  remainingTrainingMinutes?: string | number;
  remainingMinutes?: string | number;
  remainingTrainingHours?: string | number;
  remainingHours?: string | number;
  completedTrainingCount?: string | number;
  lastTrainingLogId?: string;
  lastTrainingDate?: string;
  lastFlightDate?: string;
  recentFlightDate?: string;
  memo?: string;
  [key: string]: unknown;
};

type InstructorRow = { instructorId?: string; name?: string; [key: string]: unknown };
type AircraftRow = { aircraftId?: string; aircraftName?: string; registrationNo?: string; [key: string]: unknown };
type TrainingLogRow = { trainingLogId?: string; studentId?: string; userId?: string; studentName?: string; trainingDate?: string; [key: string]: unknown };

type StudentForm = {
  studentId: string;
  userId: string;
  name: string;
  phone: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  course: string;
  trainingStartDate: string;
  trainingStatus: string;
  assignedInstructorId: string;
  assignedInstructorName: string;
  assignedAircraftIds: string;
  chargeHours: string;
  chargeMemo: string;
  manualTrainingTime: string;
  manualTrainingCount: string;
  manualAdjustmentMemo: string;
  memo: string;
};

const emptyForm: StudentForm = {
  studentId: "",
  userId: "",
  name: "",
  phone: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  course: "교육",
  trainingStartDate: "",
  trainingStatus: "교육중",
  assignedInstructorId: "",
  assignedInstructorName: "",
  assignedAircraftIds: "",
  chargeHours: "0",
  chargeMemo: "",
  manualTrainingTime: "",
  manualTrainingCount: "",
  manualAdjustmentMemo: "",
  memo: "",
};

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function formValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function onlyPhoneDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatPhone(value: unknown, fallback = "-") {
  const digits = onlyPhoneDigits(value);
  if (!digits) return fallback;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith("02")) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return String(value ?? fallback);
}

function numberValue(value: unknown) {
  const n = Number(formValue(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function maxNumberValue(...values: unknown[]) {
  return values.reduce<number>((max, value) => Math.max(max, numberValue(value)), 0);
}

function minutesFromHours(value: unknown) {
  return Math.round(numberValue(value) * 60);
}

function hoursFromMinutes(value: unknown) {
  return Math.round((numberValue(value) / 60) * 10) / 10;
}

function loggedUsedMinutes(row: StudentRow) {
  return numberValue(row.usedTrainingMinutes || row.usedMinutes) || minutesFromHours(row.usedTrainingHours || row.usedHours);
}

function manualUsedMinutes(row: StudentRow) {
  return numberValue(row.manualTrainingMinutes);
}

function studentUsedMinutes(row: StudentRow) {
  return loggedUsedMinutes(row) + manualUsedMinutes(row);
}

function studentChargedMinutes(row: StudentRow) {
  const total = numberValue(row.totalChargedMinutes);
  if (total > 0) return total;

  const charged = numberValue(row.chargedTrainingMinutes);
  if (charged > 0) return charged;

  const initial = numberValue(row.initialChargeMinutes);
  if (initial > 0) return initial;

  return minutesFromHours(row.initialChargeHours);
}

function studentRemainingMinutes(row: StudentRow) {
  const charged = studentChargedMinutes(row);
  const used = studentUsedMinutes(row);

  if (charged || used) {
    return Math.max(charged - used, 0);
  }

  return (
    numberValue(row.remainingTrainingMinutes || row.remainingMinutes) ||
    minutesFromHours(row.remainingTrainingHours || row.remainingHours)
  );
}

function studentOverusedMinutes(row: StudentRow) {
  return Math.max(studentUsedMinutes(row) - studentChargedMinutes(row), 0);
}

function studentCompletedCount(row: StudentRow) {
  return numberValue(row.completedTrainingCount) || numberValue(row.manualTrainingCount);
}

function formatMinutes(value: unknown) {
  const hours = hoursFromMinutes(value);
  if (Number.isInteger(hours)) return `${hours}시간`;
  return `${hours.toFixed(1)}시간`;
}

function remainingTone(minutes: number, overusedMinutes = 0) {
  if (overusedMinutes > 0) {
    return {
      box: "border-rose-200 bg-rose-50",
      text: "text-rose-700",
      bar: "bg-rose-500",
      label: `초과 ${formatMinutes(overusedMinutes)}`,
    };
  }

  if (minutes <= 0) {
    return {
      box: "border-rose-200 bg-rose-50",
      text: "text-rose-700",
      bar: "bg-rose-500",
      label: "0시간",
    };
  }

  if (minutes < 180) {
    return {
      box: "border-orange-200 bg-orange-50",
      text: "text-orange-700",
      bar: "bg-orange-500",
      label: "3시간 미만",
    };
  }

  return {
    box: "border-transparent bg-transparent",
    text: "text-emerald-700",
    bar: "bg-[#1264f4]",
    label: "",
  };
}

const CHARGE_HOUR_OPTIONS = ["0", "5", "10", "15", "20", "25", "30", "35", "40"];

function chargeMinutesFromHours(value: unknown) {
  return Math.round(numberValue(value) * 60);
}

function formatDateOnly(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) return "-";

  const isoUtc = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoUtc) return isoUtc[1];

  const dateOnly = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (dateOnly) {
    return `${dateOnly[1]}-${String(Number(dateOnly[2])).padStart(2, "0")}-${String(Number(dateOnly[3])).padStart(2, "0")}`;
  }

  return raw;
}

function dateKey(value: unknown) {
  const formatted = formatDateOnly(value);
  return formatted === "-" ? "" : formatted;
}

function kstTodayDate() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

function parseDateOnlyToUtc(value: unknown) {
  const formatted = dateKey(value);
  const match = formatted.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function daysSinceDate(value: unknown) {
  const date = parseDateOnlyToUtc(value);

  if (!date) return null;

  return Math.max(0, Math.floor((kstTodayDate().getTime() - date.getTime()) / 86_400_000));
}

function formatDaysSince(value: unknown) {
  const days = daysSinceDate(value);

  if (days === null) return "비행기록 확인 필요";
  if (days === 0) return "오늘 비행";
  if (days === 1) return "1일 경과";
  return `${days}일 경과`;
}

function manualMinutesToDisplay(value: unknown) {
  const minutes = numberValue(value);

  if (!minutes) return "";

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;

  if (hours && remainMinutes) return `${hours}시간 ${remainMinutes}분`;
  if (hours) return `${hours}시간`;
  return `${remainMinutes}분`;
}

function manualTimeTextToMinutes(value: unknown) {
  const raw = formValue(value).trim();

  if (!raw) return 0;

  const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*시간/);
  const minuteMatch = raw.match(/(\d+)\s*분/);

  if (hourMatch || minuteMatch) {
    return Math.round(Number(hourMatch?.[1] || 0) * 60 + Number(minuteMatch?.[1] || 0));
  }

  const colonMatch = raw.match(/^(\d{1,3}):(\d{1,2})$/);
  if (colonMatch) {
    return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);
  }

  const numberOnly = Number(raw.replace(/[^\d.]/g, ""));

  if (!Number.isFinite(numberOnly)) return 0;

  return Math.round(numberOnly * 60);
}

function studentInitial(name: unknown) {
  const raw = text(name, "");
  return raw ? raw.slice(0, 1) : "?";
}

function progressPercent(row: StudentRow) {
  const charged = studentChargedMinutes(row);
  if (!charged) return 0;
  return Math.min(100, Math.round((studentUsedMinutes(row) / charged) * 100));
}

function lastFlightSummary(row: StudentRow) {
  const rawDate = text(row.lastTrainingDate || row.lastFlightDate || row.recentFlightDate, "");

  if (!rawDate || rawDate === "-") {
    return { title: "최근 비행 없음", subtitle: "비행일지 작성 필요", empty: true };
  }

  return {
    title: formatDateOnly(rawDate),
    subtitle: formatDaysSince(rawDate),
    empty: false,
  };
}

function toForm(row: StudentRow): StudentForm {
  return {
    studentId: formValue(row.studentId),
    userId: formValue(row.userId),
    name: formValue(row.name),
    phone: formValue(row.phone),
    email: formValue(row.email),
    emergencyContactName: formValue(row.emergencyContactName),
    emergencyContactPhone: formValue(row.emergencyContactPhone),
    emergencyContactRelation: formValue(row.emergencyContactRelation),
    course: formValue(row.course || "교육"),
    trainingStartDate: formValue(row.trainingStartDate),
    trainingStatus: formValue(row.trainingStatus || "교육중"),
    assignedInstructorId: formValue(row.assignedInstructorId),
    assignedInstructorName: formValue(row.assignedInstructorName),
    assignedAircraftIds: formValue(row.assignedAircraftIds),
    chargeHours: "0",
    chargeMemo: "",
    manualTrainingTime: manualMinutesToDisplay(row.manualTrainingMinutes),
    manualTrainingCount: formValue(row.manualTrainingCount),
    manualAdjustmentMemo: formValue(row.manualAdjustmentMemo),
    memo: formValue(row.memo),
  };
}

function statusBadgeClass(status: unknown) {
  const value = text(status, "");
  if (value === "교육중") return "bg-blue-50 text-blue-700 border-blue-200";
  if (value === "수료") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "보류") return "bg-amber-50 text-amber-700 border-amber-200";
  if (value === "중단") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function aircraftDisplay(item: AircraftRow) {
  return text(item.aircraftName, "") || text(item.registrationNo, "") || text(item.aircraftId, "");
}

function splitIds(value: unknown) {
  return text(value, "")
    .split(/[,/ ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function aircraftLookupRows(aircraft: AircraftRow[]) {
  const map = new Map<string, string>();

  aircraft.forEach((row) => {
    const label = aircraftDisplay(row);

    [row.aircraftId, row.aircraftName, row.registrationNo]
      .map((value) => text(value, ""))
      .filter(Boolean)
      .forEach((key) => {
        if (!map.has(key)) map.set(key, label);
      });
  });

  return map;
}

function assignedAircraftText(value: unknown, aircraft: AircraftRow[]) {
  const ids = splitIds(value);
  if (ids.length === 0) return "-";

  const lookup = aircraftLookupRows(aircraft);

  return ids.map((id) => lookup.get(id) || id).join(", ");
}

function SummaryIcon({ icon }: { icon: string }) {
  if (icon === "clock") return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>;
  if (icon === "alert") return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
  if (icon === "check") return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="8"/><path d="m8.5 12.2 2.2 2.2 4.8-5"/></svg>;
  if (icon === "pause") return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="8"/><path d="M10 8v8"/><path d="M14 8v8"/></svg>;
  if (icon === "cap") return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m3 9 9-4 9 4-9 4-9-4Z"/><path d="M7 11v4c3 2 7 2 10 0v-4"/><path d="M21 9v6"/></svg>;
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M17 21v-2a5 5 0 0 0-10 0v2"/><circle cx="12" cy="7" r="4"/></svg>;
}

function SummaryCard({ title, value, suffix = "", subtitle, tone, icon = "user" }: { title: string; value: number | string; suffix?: string; subtitle: string; tone: string; icon?: string }) {
  return (
    <ContentCard className="group min-h-[96px] overflow-hidden rounded-[18px] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(16,33,63,0.08)]">
      <div className="flex h-full items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] ${tone} ring-1 ring-white/80`}>
          <SummaryIcon icon={icon} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[#405875]">{title}</div>
          <div className="mt-1.5 flex items-baseline gap-1 text-[#07172f]">
            <span className="text-[25px] font-semibold leading-none tracking-[-0.035em]">{value}</span>
            {suffix ? <span className="text-[12px] font-semibold">{suffix}</span> : null}
          </div>
          <div className="mt-1.5 truncate text-[11px] font-semibold text-[#6f8199]">{subtitle}</div>
        </div>
      </div>
    </ContentCard>
  );
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRow[]>([]);
  const [trainingLogs, setTrainingLogs] = useState<TrainingLogRow[]>([]);
  const [selectedLogStudent, setSelectedLogStudent] = useState<StudentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTargetStudent, setDeleteTargetStudent] = useState<StudentRow | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [courseFilter, setCourseFilter] = useState("전체");
  const [quickFilter, setQuickFilter] = useState("전체");
  const [error, setError] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [sortMode, setSortMode] = useState("recent");

  const loadData = useCallback(async (showLoading = true, forceFresh = false) => {
    try {
      if (showLoading) setLoading(true);
      setError("");
      const response = await fetch(`/api/students?${forceFresh ? "noCache=1&" : ""}_ts=${Date.now()}`, { method: "GET", cache: "no-store" });
      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");
      const data = JSON.parse(rawText) as { ok?: boolean; message?: string; students?: StudentRow[]; instructors?: InstructorRow[]; aircraft?: AircraftRow[]; trainingLogs?: TrainingLogRow[] };
      if (!response.ok || !data.ok) throw new Error(data.message || "교육생 데이터를 불러오지 못했습니다.");
      setStudents(Array.isArray(data.students) ? data.students : []);
      setInstructors(Array.isArray(data.instructors) ? data.instructors : []);
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
      setTrainingLogs(Array.isArray(data.trainingLogs) ? data.trainingLogs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "교육생 데이터를 불러오지 못했습니다.");
      setStudents([]);
      setInstructors([]);
      setAircraft([]);
      setTrainingLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(false, false), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const courses = useMemo(() => ["전체", ...Array.from(new Set(students.map((item) => text(item.course, "")).filter(Boolean)))], [students]);
  const statuses = useMemo(() => ["전체", ...Array.from(new Set(students.map((item) => text(item.trainingStatus, "")).filter(Boolean)))], [students]);

  const filteredStudents = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return students.filter((item) => {
      if (statusFilter !== "전체" && text(item.trainingStatus, "") !== statusFilter) return false;
      if (courseFilter !== "전체" && text(item.course, "") !== courseFilter) return false;

      if (quickFilter === "잔여 0시간" && studentRemainingMinutes(item) !== 0) return false;
      if (quickFilter === "잔여 3시간 미만" && (studentRemainingMinutes(item) <= 0 || studentRemainingMinutes(item) >= 180)) return false;
      if (quickFilter === "잔여 5시간 이하" && studentRemainingMinutes(item) > 300) return false;
      if (quickFilter === "교관 미배정" && text(item.assignedInstructorName, "") && text(item.assignedInstructorName, "") !== "-") return false;
      if (quickFilter === "항공기 미배정" && splitIds(item.assignedAircraftIds).length > 0) return false;
      if (quickFilter === "최근 비행 없음" && text(item.lastTrainingDate || item.lastFlightDate || item.recentFlightDate, "")) return false;

      if (!q) return true;
      const searchText = [item.studentId, item.userId, item.name, item.phone, item.course, item.trainingStartDate, item.trainingStatus, item.assignedInstructorName, item.assignedAircraftIds, item.memo].map((v) => text(v, "")).join(" ").toLowerCase();
      return searchText.includes(q);
    });
  }, [students, keyword, statusFilter, courseFilter, quickFilter]);

  const sortedStudents = useMemo(() => {
    const rows = [...filteredStudents];

    if (sortMode === "name") {
      return rows.sort((a, b) => text(a.name, "").localeCompare(text(b.name, ""), "ko"));
    }

    if (sortMode === "remaining") {
      return rows.sort((a, b) => studentRemainingMinutes(a) - studentRemainingMinutes(b));
    }

    if (sortMode === "lastFlight") {
      return rows.sort((a, b) => dateKey(b.lastTrainingDate || b.lastFlightDate || b.recentFlightDate).localeCompare(dateKey(a.lastTrainingDate || a.lastFlightDate || a.recentFlightDate)));
    }

    return rows.sort((a, b) => text(b.trainingStartDate, "").localeCompare(text(a.trainingStartDate, "")));
  }, [filteredStudents, sortMode]);

  const activeStudents = students.filter((item) => text(item.trainingStatus, "") === "교육중").length;
  const completedStudents = students.filter((item) => text(item.trainingStatus, "") === "수료").length;
  const pausedStudents = students.filter((item) => ["보류", "중단"].includes(text(item.trainingStatus, ""))).length;
  const totalRemainingMinutes = students.reduce((sum, item) => sum + studentRemainingMinutes(item), 0);
  const lowRemainingStudents = students.filter((item) => studentRemainingMinutes(item) <= 300).length;
  const quickFilters = ["전체", "잔여 0시간", "잔여 3시간 미만", "잔여 5시간 이하", "교관 미배정", "항공기 미배정", "최근 비행 없음"];
  const unassignedInstructorCount = students.filter((item) => !text(item.assignedInstructorName, "") || text(item.assignedInstructorName, "") === "-").length;
  const unassignedAircraftCount = students.filter((item) => splitIds(item.assignedAircraftIds).length === 0).length;
  const assignedInstructorCount = Math.max(students.length - unassignedInstructorCount, 0);
  const assignedAircraftCount = Math.max(students.length - unassignedAircraftCount, 0);
  const activeStatusPercent = students.length ? Math.round((activeStudents / students.length) * 100) : 0;
  const completedStatusPercent = students.length ? Math.round((completedStudents / students.length) * 100) : 0;
  const pausedStatusPercent = students.length ? Math.round((pausedStudents / students.length) * 100) : 0;
  const cautionStudents = useMemo(() => students
    .filter((item) => studentRemainingMinutes(item) > 0 && studentRemainingMinutes(item) <= 300)
    .sort((a, b) => studentRemainingMinutes(a) - studentRemainingMinutes(b))
    .slice(0, 3), [students]);
  const recentFlightRows = useMemo(() => [...students]
    .filter((item) => text(item.lastTrainingDate || item.lastFlightDate || item.recentFlightDate, ""))
    .sort((a, b) => dateKey(b.lastTrainingDate || b.lastFlightDate || b.recentFlightDate).localeCompare(dateKey(a.lastTrainingDate || a.lastFlightDate || a.recentFlightDate)))
    .slice(0, 5), [students]);

  function updateForm(key: keyof StudentForm, value: string) {
    const nextValue = key === "phone" || key === "emergencyContactPhone" ? onlyPhoneDigits(value) : value;
    setForm((prev) => ({ ...prev, [key]: nextValue }));
  }

  function startCreate() {
    setForm(emptyForm);
    setEditing(false);
    setFormOpen(true);
  }

  function startEdit(row: StudentRow) {
    setForm(toForm(row));
    setEditing(true);
    setFormOpen(true);
  }

  function openDeleteStudent(row: StudentRow) {
    setDeleteTargetStudent(row);
    setDeleteConfirmName("");
    setOperationMessage("");
  }

  function closeDeleteStudent() {
    if (deleting) return;
    setDeleteTargetStudent(null);
    setDeleteConfirmName("");
  }

  async function handleDeleteStudent() {
    if (!deleteTargetStudent || deleting) return;

    const studentId = text(deleteTargetStudent.studentId || deleteTargetStudent.student_id);
    const studentName = text(deleteTargetStudent.name);

    if (!studentId) {
      alert("삭제할 교육생 ID를 찾지 못했습니다.");
      return;
    }

    if (!studentName) {
      alert("삭제 확인에 사용할 교육생 이름을 찾지 못했습니다.");
      return;
    }

    if (deleteConfirmName.trim() !== studentName) {
      alert("삭제 확인 이름이 일치하지 않습니다.");
      return;
    }

    setDeleting(true);
    setOperationMessage("교육생을 삭제하는 중입니다...");

    try {
      const response = await fetch("/api/students?noCache=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deleteStudent",
          data: {
            studentId,
            name: studentName,
            confirmName: deleteConfirmName.trim(),
          },
        }),
      });

      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");

      const data = JSON.parse(rawText) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.message || "교육생 삭제에 실패했습니다.");

      setDeleteTargetStudent(null);
      setDeleteConfirmName("");
      await loadData(true, true);
      alert("교육생을 삭제했습니다.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "교육생 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
      setOperationMessage("");
    }
  }


  function closeFormPanel() {
    setFormOpen(false);
    setEditing(false);
    setForm(emptyForm);
  }

  function selectInstructor(instructorId: string) {
    const selected = instructors.find((item) => text(item.instructorId, "") === instructorId);
    setForm((prev) => ({ ...prev, assignedInstructorId: instructorId, assignedInstructorName: selected ? text(selected.name, "") : "" }));
  }

  function toggleAircraft(aircraftId: string) {
    const current = form.assignedAircraftIds.split(",").map((item) => item.trim()).filter(Boolean);
    const exists = current.includes(aircraftId);
    const next = exists ? current.filter((item) => item !== aircraftId) : [...current, aircraftId];
    updateForm("assignedAircraftIds", next.join(", "));
  }

  async function saveStudent() {
    try {
      if (!form.name.trim()) {
        alert("이름을 입력하세요.");
        return;
      }
      setSaving(true);
      setOperationMessage(editing ? "교육생 수정 내용을 저장하는 중입니다..." : "교육생을 등록하는 중입니다...");
      const manualMinutes = editing ? manualTimeTextToMinutes(form.manualTrainingTime) : 0;
      const manualCount = editing ? Number(form.manualTrainingCount || 0) : 0;
      const addChargeMinutes = chargeMinutesFromHours(form.chargeHours);
      const payload = {
        ...form,
        course: form.course || "교육",
        trainingStatus: form.trainingStatus || "교육중",
        assignedAircraftIds: selectedAircraftIds.join(","),
        chargeMode: editing ? "append" : "initial",
        addChargeMinutes,
        addChargeHours: Number(form.chargeHours || 0),
        chargeMemo: form.chargeMemo,
initialChargeHours: editing ? undefined : Number(form.chargeHours || 0),
        initialChargeMinutes: editing ? undefined : addChargeMinutes,
        initialChargeMemo: editing ? undefined : form.chargeMemo,
        manualTrainingMinutes: manualMinutes,
        manualTrainingCount: manualCount,
        manualAdjustmentMemo: editing ? form.manualAdjustmentMemo : "",
      };

      const response = await fetch("/api/students?noCache=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: editing ? "updateStudent" : "addStudent", data: payload }),
      });
      const rawText = await response.text();
      if (!rawText.trim()) throw new Error("서버 응답이 비어 있습니다.");
      const data = JSON.parse(rawText) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.message || "교육생 저장에 실패했습니다.");
      await loadData(true, true);
      setKeyword("");
      setStatusFilter("전체");
      setCourseFilter("전체");
      setQuickFilter("전체");
      setForm(emptyForm);
      setEditing(false);
      setFormOpen(false);
      alert(editing ? "교육생 정보가 수정되었습니다." : "교육생이 등록되었습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "교육생 저장에 실패했습니다.");
    } finally {
      setSaving(false);
      setOperationMessage("");
    }
  }

  const selectedAircraftIds = form.assignedAircraftIds.split(",").map((value) => value.trim()).filter(Boolean);
  const previewAircraftText = selectedAircraftIds.length
    ? selectedAircraftIds
        .map((aircraftId) => {
          const row = aircraft.find((item) => text(item.aircraftId, "") === aircraftId || text(item.registrationNo, "") === aircraftId);
          return row ? aircraftDisplay(row) : aircraftId;
        })
        .join(", ")
    : "미배정";
  const previewChargeMinutes = chargeMinutesFromHours(form.chargeHours);
  const previewChargeText = previewChargeMinutes ? formatMinutes(previewChargeMinutes) : "충전 안 함";
  const registrationChecklist = [
    { label: "기본정보", done: Boolean(form.name.trim() && form.phone.trim()) },
    { label: "교육 배정", done: Boolean(form.assignedInstructorId || selectedAircraftIds.length || form.course.trim()) },
    { label: "비행시간 충전", done: previewChargeMinutes > 0 },
    { label: "비상연락처", done: Boolean(form.emergencyContactName.trim() && form.emergencyContactPhone.trim()) },
  ];
  const completedChecklistCount = registrationChecklist.filter((item) => item.done).length;

  return (
    <PageContainer title="교육생 관리" description="교육생 목록 중심으로 검색, 필터, 수정, 신규 등록을 관리합니다.">
      {saving || operationMessage ? (
        <ContentCard className="border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-700">
          {operationMessage || "교육생 정보를 저장하는 중입니다..."}
        </ContentCard>
      ) : null}

      <ContentCard className="overflow-hidden rounded-[22px] p-0 shadow-sm">
        <div className="border-b border-[#e8eef7] bg-gradient-to-br from-white via-white to-[#f6faff] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#07172f]">교육생 검색 및 필터</h2>
              <p className="mt-1 text-[13px] font-medium text-[#6f8199]">목록을 기본으로 보고, 신규 등록과 수정은 우측 패널에서 처리합니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { setKeyword(""); setStatusFilter("전체"); setCourseFilter("전체"); setQuickFilter("전체"); }} className="ui-btn ui-btn-outline h-10">필터 초기화</button>
              <button type="button" onClick={startCreate} disabled={saving} className="ui-btn ui-btn-primary h-10 px-5 disabled:cursor-not-allowed disabled:opacity-50">+ 신규 교육생 등록</button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(320px,1.5fr)_170px_170px_180px_180px] md:grid-cols-2">
            <div className="relative md:col-span-2 xl:col-span-1">
              <input className="ui-input w-full pr-11" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="이름, 전화번호, 교육생ID, 이메일, 교관, 항공기 검색" />
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b8da7]" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            </div>
            <select className="ui-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{statuses.map((item) => <option key={item} value={item}>{item === "전체" ? "상태 전체" : item}</option>)}</select>
            <select className="ui-input" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>{courses.map((item) => <option key={item} value={item}>{item === "전체" ? "과정 전체" : item}</option>)}</select>
            <select className="ui-input" value={quickFilter} onChange={(e) => setQuickFilter(e.target.value)}>
              {quickFilters.map((item) => <option key={item} value={item}>{item === "전체" ? "빠른 필터 전체" : item}</option>)}
            </select>
            <select className="ui-input" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
              <option value="recent">정렬: 최근 등록순</option>
              <option value="lastFlight">정렬: 최근 비행순</option>
              <option value="name">이름순</option>
              <option value="remaining">잔여시간 적은순</option>
            </select>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#536985]">
            <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[#dbe5f1]">전체 {students.length}명</span>
            <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[#dbe5f1]">검색 결과 {sortedStudents.length}명</span>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[#1264f4] ring-1 ring-blue-100">교육중 {activeStudents}명</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-100">수료 {completedStudents}명</span>
            <span className="rounded-full bg-orange-50 px-3 py-1.5 text-orange-700 ring-1 ring-orange-100">잔여 5시간 이하 {lowRemainingStudents}명</span>
            <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600 ring-1 ring-slate-200">총 잔여 {formatMinutes(totalRemainingMinutes)}</span>
          </div>
        </div>
      </ContentCard>

      {error ? (
        <ContentCard className="flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => void loadData(true, true)} className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
            다시 시도
          </button>
        </ContentCard>
      ) : null}

      <ContentCard className="overflow-hidden rounded-[18px] p-0 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#07172f]">교육생 목록</h2>
            <p className="mt-1 text-[13px] font-medium text-[#6f8199]">수정 버튼을 누르면 우측 등록/수정 패널이 열립니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[#6f8199]">총 {sortedStudents.length}명</span>
            <button type="button" onClick={() => void loadData(true, true)} disabled={loading} className="ui-btn ui-btn-outline h-10 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "불러오는 중" : "새로고침"}</button>
            <button type="button" onClick={() => alert("엑셀 내보내기는 추후 연결 예정입니다.")} className="ui-btn ui-btn-outline h-10">엑셀 내보내기</button>
          </div>
        </div>
        {loading ? (
          <div className="px-6 pb-6 text-sm font-semibold text-[#6f8199]">교육생 데이터를 불러오는 중입니다.</div>
        ) : sortedStudents.length === 0 ? (
          <div className="px-6 pb-6 text-sm font-semibold text-[#6f8199]">표시할 교육생이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto px-6 pb-6">
            <table className="ui-table min-w-[1180px] overflow-hidden rounded-2xl border border-[#e5edf7]">
              <thead>
                <tr>
                  <th className="text-[12px]">교육생 정보</th>
                  <th className="text-[12px]">상태</th>
                  <th className="text-[12px]">담당 교관</th>
                  <th className="text-[12px]">배정 항공기</th>
                  <th className="text-[12px]">비행시간</th>
                  <th className="text-[12px]">최근 비행날짜</th>
                  <th className="text-right text-[12px]">관리</th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.map((item, index) => {
                  const progress = progressPercent(item);
                  const lastFlight = lastFlightSummary(item);
                  const remainingMinutes = studentRemainingMinutes(item);
                  const overusedMinutes = studentOverusedMinutes(item);
                  const tone = remainingTone(remainingMinutes, overusedMinutes);

                  return (
                    <tr key={`${text(item.studentId, "student")}-${index}`} className="align-middle hover:bg-[#fbfdff]">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1264f4] text-[14px] font-semibold text-white shadow-sm">
                            {studentInitial(item.name)}
                          </div>
                          <div>
                            <div className="text-[14px] font-semibold text-[#07172f]">{text(item.name)}</div>
                            <div className="mt-1 text-[12px] font-medium leading-5 text-[#6f8199]">{formatPhone(item.phone)}<br />교육 시작일 {formatDateOnly(item.trainingStartDate)}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`ui-badge ${statusBadgeClass(item.trainingStatus)}`}>{text(item.trainingStatus)}</span></td>
                      <td><div className="text-[13px] font-semibold text-[#07172f]">{text(item.assignedInstructorName)}</div></td>
                      <td><div className="text-[13px] font-semibold leading-5 text-[#07172f]">{assignedAircraftText(item.assignedAircraftIds, aircraft)}</div></td>
                      <td className="min-w-[300px]">
                        <div className={`rounded-xl border px-3 py-2 ${tone.box}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[13px] font-semibold text-[#07172f]">비행 {formatMinutes(studentUsedMinutes(item))} <span className="text-[#6f8199]">/ 총 {formatMinutes(studentChargedMinutes(item))}</span></div>
                            <div className="flex items-center gap-2">
                              {tone.label ? <span className={`rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-semibold ${tone.text}`}>{tone.label}</span> : null}
                              <span className="text-[11px] font-semibold text-[#6f8199]">{progress}%</span>
                            </div>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#e8eef7]">
                            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${progress}%` }} />
                          </div>
                          <div className={`mt-1.5 text-[14px] font-semibold ${tone.text}`}>잔여 {formatMinutes(remainingMinutes)}</div>
                        </div>
                      </td>
                      <td>
                        <div className="text-[13px] font-semibold text-[#07172f]">{lastFlight.title}</div>
                        <div className={`mt-1 max-w-[180px] truncate text-xs font-medium ${lastFlight.empty ? "text-orange-500" : "text-[#6f8199]"}`}>{lastFlight.subtitle}</div>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setSelectedLogStudent(item)} className="ui-btn ui-btn-primary h-9 min-w-[104px] px-3 text-[12px]">비행일지 보기</button>
                          <button type="button" onClick={() => startEdit(item)} className="ui-btn ui-btn-outline h-9 min-w-[64px] px-3 text-[12px]">수정</button>
                          <button type="button" onClick={() => openDeleteStudent(item)} className="h-9 min-w-[64px] rounded-[12px] border border-red-100 bg-red-50 px-3 text-[12px] font-semibold text-red-600 transition hover:bg-red-100">삭제</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ContentCard>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
          <button type="button" aria-label="교육생 등록/수정 패널 닫기" className="hidden flex-1 cursor-default bg-transparent lg:block" onClick={closeFormPanel} />
          <aside className="flex h-full w-full max-w-[920px] flex-col bg-white shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e5edf7] px-6 py-5">
              <div>
                <p className="text-[12px] font-semibold text-[#1264f4]">{editing ? "교육생 정보 수정" : "신규 교육생 등록"}</p>
                <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#07172f]">{editing ? `${form.name || "교육생"} 정보 수정` : "신규 교육생 등록"}</h2>
                <p className="mt-1 text-[13px] font-medium text-[#6f8199]">목록은 유지한 상태에서 필요한 정보만 등록하거나 수정합니다.</p>
              </div>
              <button type="button" onClick={closeFormPanel} className="rounded-full border border-[#dbe5f1] bg-white px-4 py-2 text-[13px] font-semibold text-[#405875] hover:bg-[#f8fbff]">닫기</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-3">
            <details open className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-[#fbfdff]">
              <summary className="flex min-h-[58px] cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center justify-between px-5 py-4 text-[15px] font-semibold text-[#10213f]">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1264f4] shadow-sm">⌾</span>
                  <span>기본정보</span>
                  <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-500">필수</span>
                </div>
                <span className="text-lg text-[#07172f]">⌄</span>
              </summary>
              <div className="grid gap-4 border-t border-[#e5edf7] bg-white p-5 xl:grid-cols-2">
                <label className="ui-label"><span>이름</span><input className="ui-input" value={form.name} onChange={(e) => updateForm("name", e.target.value)} /></label>
                <label className="ui-label"><span>전화번호</span><input className="ui-input" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} inputMode="numeric" placeholder="01012345678" /><span className="text-[11px] font-medium text-[#7f91aa]">하이픈(-) 없이 숫자만 입력하세요.</span></label>
                <label className="ui-label"><span>e-mail</span><input className="ui-input" value={form.email} onChange={(e) => updateForm("email", e.target.value)} placeholder="example@email.com" /></label>
                <label className="ui-label"><span>비상 연락처</span><input className="ui-input" value={form.emergencyContactPhone} onChange={(e) => updateForm("emergencyContactPhone", e.target.value)} inputMode="numeric" placeholder="01012345678" /><span className="text-[11px] font-medium text-[#7f91aa]">하이픈(-) 없이 숫자만 입력하세요.</span></label>
                <label className="ui-label"><span>비상 연락처 이름</span><input className="ui-input" value={form.emergencyContactName} onChange={(e) => updateForm("emergencyContactName", e.target.value)} /></label>
                <label className="ui-label"><span>관계</span><input className="ui-input" value={form.emergencyContactRelation} onChange={(e) => updateForm("emergencyContactRelation", e.target.value)} /></label>
                <label className="ui-label"><span>교육 시작일</span><input type="date" className="ui-input" value={form.trainingStartDate} onChange={(e) => updateForm("trainingStartDate", e.target.value)} /></label>
                <label className="ui-label"><span>교육 상태</span><select className="ui-input" value={form.trainingStatus} onChange={(e) => updateForm("trainingStatus", e.target.value)}><option value="교육중">교육중</option><option value="수료">수료</option><option value="보류">보류</option><option value="중단">중단</option></select></label>
              </div>
            </details>

            <details className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-[#fbfdff]">
              <summary className="flex min-h-[58px] cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center justify-between px-5 py-4 text-[15px] font-semibold text-[#10213f]">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1264f4] shadow-sm">⌾</span>
                  <span>교육 배정 정보</span>
                </div>
                <span className="text-lg text-[#07172f]">⌄</span>
              </summary>
              <div className="grid gap-4 border-t border-[#e5edf7] bg-white p-5 xl:grid-cols-2">
                <label className="ui-label"><span>담당 교관</span><select className="ui-input" value={form.assignedInstructorId} onChange={(e) => selectInstructor(e.target.value)}><option value="">선택 안 함</option>{instructors.map((item, index) => { const instructorId = text(item.instructorId, ""); const name = text(item.name, ""); return <option key={`${instructorId}-${index}`} value={instructorId}>{name} / {instructorId}</option>; })}</select></label>
                <label className="ui-label"><span>과정</span><input className="ui-input" value={form.course} onChange={(e) => updateForm("course", e.target.value)} placeholder="교육" /></label>
                <div className="xl:col-span-2">
                  <label className="ui-label"><span>배정 항공기</span></label>
                  <div className="rounded-2xl border border-[#dbe5f1] bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                      {aircraft.map((item, index) => {
                        const aircraftId = text(item.aircraftId, "");
                        const selected = selectedAircraftIds.includes(aircraftId);
                        return (
                          <button key={`${aircraftId}-${index}`} type="button" onClick={() => toggleAircraft(aircraftId)} className={`rounded-xl border px-3 py-1.5 text-[11px] font-medium ${selected ? "border-[#1264f4] bg-[#edf4ff] text-[#1264f4]" : "border-[#dbe5f1] bg-[#f8fbff] text-[#536985]"}`}>
                            {aircraftDisplay(item)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <details open className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-[#fbfdff]">
              <summary className="flex min-h-[58px] cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center justify-between px-5 py-4 text-[15px] font-semibold text-[#10213f]">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1264f4] shadow-sm">⌾</span>
                  <span>비행시간 충전</span>
                </div>
                <span className="text-lg text-[#07172f]">⌄</span>
              </summary>
              <div className="grid gap-4 border-t border-[#e5edf7] bg-white p-5 xl:grid-cols-2">
                <label className="ui-label">
                  <span>{editing ? "추가 충전 시간" : "초기 충전 시간"}</span>
                  <select className="ui-input" value={form.chargeHours} onChange={(e) => updateForm("chargeHours", e.target.value)}>
                    {CHARGE_HOUR_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>{hour === "0" ? "충전 안 함" : `${hour}시간`}</option>
                    ))}
                  </select>
                </label>
                <label className="ui-label">
                  <span>충전 메모</span>
                  <input className="ui-input" value={form.chargeMemo} onChange={(e) => updateForm("chargeMemo", e.target.value)} placeholder={editing ? "예: 추가 5시간 충전" : "예: 신규 등록 기본 충전"} />
                </label>
                <div className="xl:col-span-2 rounded-2xl border border-[#dbe5f1] bg-[#f8fbff] p-4 text-[13px] font-medium leading-6 text-[#516982]">
                  신규 등록과 기존 교육생 수정 모두 5시간 단위로 충전할 수 있습니다. 충전 시간은 총 충전시간(totalChargedMinutes)에만 누적되고, 잔여시간은 교육일지 기준으로 자동 계산됩니다.
                </div>
              </div>
            </details>

            <details className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-[#fbfdff]">
              <summary className="flex min-h-[58px] cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center justify-between px-5 py-4 text-[15px] font-semibold text-[#10213f]">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1264f4] shadow-sm">⌾</span>
                  <span>비행시간 정보</span>
                </div>
                <span className="text-lg text-[#07172f]">⌄</span>
              </summary>
              <div className="grid gap-4 border-t border-[#e5edf7] bg-white p-5 xl:grid-cols-3">
                <label className="ui-label">
                  <span>기존 비행시간 직접 입력</span>
                  <input
                    className="ui-input"
                    placeholder="예: 12시간 30분 또는 12.5"
                    value={form.manualTrainingTime}
                    disabled={!editing}
                    onChange={(e) => updateForm("manualTrainingTime", e.target.value)}
                  />
                </label>
                <label className="ui-label">
                  <span>기존 비행 횟수</span>
                  <input
                    type="number"
                    min="0"
                    className="ui-input"
                    placeholder="예: 3"
                    value={form.manualTrainingCount}
                    disabled={!editing}
                    onChange={(e) => updateForm("manualTrainingCount", e.target.value)}
                  />
                </label>
                <label className="ui-label">
                  <span>입력 사유</span>
                  <input
                    className="ui-input"
                    placeholder="예: 기존 서류 기준 이관"
                    value={form.manualAdjustmentMemo}
                    disabled={!editing}
                    onChange={(e) => updateForm("manualAdjustmentMemo", e.target.value)}
                  />
                </label>
                <div className="xl:col-span-3 rounded-2xl border border-[#dbe5f1] bg-[#f8fbff] p-4">
                  <div className="text-xs font-semibold text-[#6f8199]">입력 기준</div>
                  <div className="mt-2 text-[14px] font-semibold leading-6 text-[#10213f]">
                    기존 비행시간 직접 입력은 이미 비행했지만 교육일지에 남지 않은 기록을 보정할 때만 사용합니다. 충전시간이 아니라 비행시간으로 계산됩니다.
                  </div>
                </div>
              </div>
            </details>

            <details className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-[#fbfdff]">
              <summary className="flex min-h-[58px] cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center justify-between px-5 py-4 text-[15px] font-semibold text-[#10213f]">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1264f4] shadow-sm">⌾</span>
                  <span>상세 정보(선택)</span>
                </div>
                <span className="text-lg text-[#07172f]">⌄</span>
              </summary>
              <div className="border-t border-[#e5edf7] bg-white p-5">
                <label className="ui-label"><span>메모</span><textarea className="min-h-[96px] rounded-[12px] border border-[#dbe5f1] bg-white px-[14px] py-3 text-[14px] font-[600] text-[#243b63] outline-none focus:border-[#8bb8ff] focus:shadow-[0_0_0_4px_rgba(18,100,244,.08)]" value={form.memo} onChange={(e) => updateForm("memo", e.target.value)} /></label>
              </div>
            </details>
          </div>


            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e5edf7] bg-[#fbfdff] px-6 py-4">
              <button type="button" onClick={startCreate} className="ui-btn ui-btn-outline">초기화</button>
              <button type="button" onClick={closeFormPanel} className="ui-btn ui-btn-outline">닫기</button>
              <button type="button" onClick={() => void saveStudent()} disabled={saving} className="ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-50">{saving ? "저장 중" : editing ? "수정 저장" : "신규 등록"}</button>
            </div>
          </aside>
        </div>
      ) : null}

      {deleteTargetStudent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-red-600">교육생 삭제</p>
                <h2 className="mt-1 text-xl font-bold text-[#10213f]">{text(deleteTargetStudent.name)} 교육생을 삭제할까요?</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-[#61758f]">
                  이 작업은 교육생 목록에서 해당 교육생 정보를 삭제합니다. 연결된 회원 계정은 삭제하지 않습니다.
                </p>
              </div>
              <button type="button" onClick={closeDeleteStudent} disabled={deleting} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">
                닫기
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/70 p-4">
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-[#7a8ca3]">교육생</span>
                  <span className="font-semibold text-[#10213f]">{text(deleteTargetStudent.name)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-[#7a8ca3]">연락처</span>
                  <span className="font-semibold text-[#10213f]">{formatPhone(deleteTargetStudent.phone)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-[#7a8ca3]">과정</span>
                  <span className="font-semibold text-[#10213f]">{text(deleteTargetStudent.course) || "-"}</span>
                </div>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-semibold text-[#10213f]">삭제 확인</span>
              <span className="mt-1 block text-xs font-medium text-[#61758f]">
                삭제하려면 교육생 이름 <b>{text(deleteTargetStudent.name)}</b> 을 그대로 입력하세요.
              </span>
              <input
                value={deleteConfirmName}
                onChange={(event) => setDeleteConfirmName(event.target.value)}
                disabled={deleting}
                className="mt-2 w-full rounded-2xl border border-[#d9e6f5] px-4 py-3 text-sm font-semibold text-[#10213f] outline-none transition focus:border-[#1264f4] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
                placeholder={text(deleteTargetStudent.name)}
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteStudent}
                disabled={deleting}
                className="rounded-full border border-[#d9e6f5] px-4 py-2 text-sm font-semibold text-[#61758f] disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteStudent}
                disabled={deleting || deleteConfirmName.trim() !== text(deleteTargetStudent.name)}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <StudentTrainingLogDrawer
        student={selectedLogStudent}
        trainingLogs={trainingLogs}
        onClose={() => setSelectedLogStudent(null)}
      />
    </PageContainer>
  );
}
